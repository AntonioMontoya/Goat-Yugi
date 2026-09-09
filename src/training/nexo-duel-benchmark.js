import { confidenceInterval95 } from "../analytics/statistics.js";
import { UNIVERSAL_BOT_ID, createBotForDeck } from "../bots/bot-system.js";
import { NEXO2_BOT_ID } from "../bots/nexo2-contract.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { createActionQualityCollector, mergeActionQualityAudits } from "./action-quality-audit.js";
import { inspectOcgcoreRun } from "./ocgcore-run-validity.js";

export const BENCHMARK_META_DECKS = Object.freeze([
  "goat-control",
  "chaos-turbo",
  "flip-control",
  "warrior",
  "panda-burn",
]);

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

function percent(value) {
  return `${(Number(value) * 100).toFixed(1)} %`;
}

function emptySideStats() {
  return { games: 0, validGames: 0, wins: 0, losses: 0, draws: 0, invalid: 0, turns: 0, decisions: 0 };
}

function finalizeSideStats(stats) {
  const played = Math.max(1, stats.validGames);
  return {
    ...stats,
    winRate: stats.wins / played,
    scoreRate: (stats.wins + stats.draws * 0.5) / played,
    confidence95: confidenceInterval95(stats.wins, stats.validGames),
    averageTurns: stats.turns / Math.max(1, stats.games),
    averageDecisions: stats.decisions / Math.max(1, stats.games),
  };
}

export async function runNexoDuelBenchmark({
  botAId = NEXO2_BOT_ID,
  botBId = UNIVERSAL_BOT_ID,
  botAManifest = null,
  botBManifest = null,
  games = 100,
  deckIds = BENCHMARK_META_DECKS,
  seed = 8_500_000,
  workers = 4,
  maxSteps = 6_000,
  sampleLimit = 20,
  onProgress = null,
} = {}) {
  const ids = [...new Set(deckIds)].map((deckId) => getDeck(deckId).id);
  const requested = Math.max(1, Number(games) || 1);

  const jobs = Array.from({ length: requested }, (_, index) => {
    const deckIndex = index % ids.length;
    const deckId = ids[deckIndex];
    const botASeat = index % 2; // 0 or 1
    const round = Math.floor(index / ids.length);
    const startingPlayer = Math.floor(index / 2) % 2;
    const botAStarts = startingPlayer === botASeat;
    const gameSeed = Number(seed) + deckIndex * 100_003 + round * 1_009 + (index % 7);
    return {
      index,
      game: index + 1,
      deckId,
      botASeat,
      botAStarts,
      startingPlayer,
      seed: gameSeed,
    };
  });

  const parallel = Math.max(1, Math.min(6, Math.floor(Number(workers) || 1)));
  const results = [];

  for (let cursor = 0; cursor < jobs.length; cursor += parallel) {
    const batch = await Promise.all(jobs.slice(cursor, cursor + parallel).map(async (job) => {
      const deck = getDeck(job.deckId);
      const collectorA = createActionQualityCollector({
        metadata: { game: job.game, deckId: job.deckId, seed: job.seed },
        sampleLimit,
        targetPlayer: job.botASeat,
      });
      const collectorB = createActionQualityCollector({
        metadata: { game: job.game, deckId: job.deckId, seed: job.seed },
        sampleLimit,
        targetPlayer: 1 - job.botASeat,
      });

      const instanceA = createBotForDeck({
        botId: botAId,
        manifest: botAManifest,
        deckId: job.deckId,
        deck,
        seed: job.seed ^ 0x9e3779b9,
      });
      const instanceB = createBotForDeck({
        botId: botBId,
        manifest: botBManifest,
        deckId: job.deckId,
        deck,
        seed: job.seed ^ 0x51ed270b,
      });

      const bot0 = job.botASeat === 0 ? instanceA : instanceB;
      const bot1 = job.botASeat === 1 ? instanceA : instanceB;

      const run = await runOcgcoreHeadless({
        decks: [cardNames(deck.main), cardNames(deck.main)],
        extraDecks: [cardNames(deck.fusion), cardNames(deck.fusion)],
        seed: job.seed,
        startingPlayer: job.startingPlayer,
        maxSteps,
        botA: bot0,
        botB: bot1,
        profileA: job.deckId,
        profileB: job.deckId,
        onDecision: (trace, context) => {
          if (context.player === job.botASeat) collectorA.capture(trace, context);
          else collectorB.capture(trace, context);
        },
      });

      const validity = inspectOcgcoreRun(run);
      return {
        ...job,
        run,
        validity,
        actionAuditA: collectorA.result(),
        actionAuditB: collectorB.result(),
      };
    }));

    results.push(...batch);
    onProgress?.({ completed: Math.min(requested, cursor + batch.length), total: requested });
  }

  results.sort((left, right) => left.index - right.index);

  const aggregate = emptySideStats();
  const perDeckRaw = Object.fromEntries(ids.map((id) => [id, emptySideStats()]));
  const whenStartingRaw = emptySideStats();
  const whenSecondRaw = emptySideStats();

  for (const row of results) {
    aggregate.games += 1;
    aggregate.turns += Number(row.run.turns) || 0;
    aggregate.decisions += Number(row.run.decisions) || 0;

    const deckStats = perDeckRaw[row.deckId];
    deckStats.games += 1;
    deckStats.turns += Number(row.run.turns) || 0;
    deckStats.decisions += Number(row.run.decisions) || 0;

    const turnStats = row.botAStarts ? whenStartingRaw : whenSecondRaw;
    turnStats.games += 1;
    turnStats.turns += Number(row.run.turns) || 0;
    turnStats.decisions += Number(row.run.decisions) || 0;

    if (!row.validity.valid) {
      aggregate.invalid += 1;
      deckStats.invalid += 1;
      turnStats.invalid += 1;
      continue;
    }

    aggregate.validGames += 1;
    deckStats.validGames += 1;
    turnStats.validGames += 1;

    const botAWon = row.run.winner === row.botASeat;
    const botBWon = row.run.winner === (1 - row.botASeat);

    if (botAWon) {
      aggregate.wins += 1;
      deckStats.wins += 1;
      turnStats.wins += 1;
    } else if (botBWon) {
      aggregate.losses += 1;
      deckStats.losses += 1;
      turnStats.losses += 1;
    } else {
      aggregate.draws += 1;
      deckStats.draws += 1;
      turnStats.draws += 1;
    }
  }

  const matches = finalizeSideStats(aggregate);
  const byDeck = Object.fromEntries(Object.entries(perDeckRaw).map(([deckId, stats]) => [deckId, finalizeSideStats(stats)]));
  const whenStarting = finalizeSideStats(whenStartingRaw);
  const whenSecond = finalizeSideStats(whenSecondRaw);

  const auditA = mergeActionQualityAudits(results.map((row) => row.actionAuditA), { sampleLimit });
  const auditB = mergeActionQualityAudits(results.map((row) => row.actionAuditB), { sampleLimit });

  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    matchup: {
      botA: { id: botAId, name: botAManifest?.name ?? "Nexo 2", algorithm: botAManifest?.algorithm ?? "ocgcore-public-belief-policy-value-v1" },
      botB: { id: botBId, name: botBManifest?.name ?? "Nexo 1", algorithm: botBManifest?.algorithm ?? "ocgcore-public-strategic-v4" },
    },
    configuration: { games: requested, deckIds: ids, seed: Number(seed), workers: parallel, maxSteps },
    aggregate: matches,
    byDeck,
    byTurnOrder: {
      botAStartingFirst: whenStarting,
      botAStartingSecond: whenSecond,
    },
    actionQuality: {
      botA: auditA,
      botB: auditB,
    },
    fights: results.map((row) => ({
      game: row.game,
      deckId: row.deckId,
      botASeat: row.botASeat,
      botAStarts: row.botAStarts,
      startingPlayer: row.startingPlayer,
      winner: row.run.winner,
      botAWon: row.validity.valid && row.run.winner === row.botASeat,
      valid: row.validity.valid,
      validityReasons: row.validity.reasons,
      turns: row.run.turns,
      decisions: row.run.decisions,
      terminationReason: row.run.terminationReason,
    })),
  };
}

export function formatNexoDuelBenchmarkMarkdown(report) {
  const a = report.matchup.botA;
  const b = report.matchup.botB;
  const agg = report.aggregate;

  const deckRows = Object.entries(report.byDeck).map(([deckId, stats]) => (
    `| ${deckId} | ${stats.wins}-${stats.losses}-${stats.draws} | ${percent(stats.winRate)} | ${percent(stats.scoreRate)} | ${stats.invalid} | ${stats.averageTurns.toFixed(1)} |`
  )).join("\n");

  const startFirst = report.byTurnOrder.botAStartingFirst;
  const startSecond = report.byTurnOrder.botAStartingSecond;

  return `# Duelo 50/50: ${a.name} vs ${b.name}

Generado: ${report.createdAt}

- Total de partidas: ${agg.games}
- Mazos evaluados (espejos 50/50): ${report.configuration.deckIds.join(", ")}
- Semilla base: ${report.configuration.seed}

## Resultado Global de ${a.name} frente a ${b.name}

- **Victorias / Derrotas / Empates**: **${agg.wins} - ${agg.losses} - ${agg.draws}**
- **Win rate puro**: **${percent(agg.winRate)}**
- **Puntuación con empates**: **${percent(agg.scoreRate)}**
- **Intervalo de confianza 95%**: ${percent(agg.confidence95.low)} – ${percent(agg.confidence95.high)}
- **Partidas inválidas (OCGCore)**: ${agg.invalid} (${percent(agg.invalid / agg.games)})
- **Turnos medios por duelo**: ${agg.averageTurns.toFixed(2)}

## Rendimiento por Turno Inicial (Equilibrio 50/50)

| Condición | Partidas | V-D-E | Win Rate | Puntuación |
|:---|---:|---:|---:|---:|
| ${a.name} saliendo primero (Turno 1) | ${startFirst.games} | ${startFirst.wins}-${startFirst.losses}-${startFirst.draws} | ${percent(startFirst.winRate)} | ${percent(startFirst.scoreRate)} |
| ${a.name} saliendo segundo (Turno 2) | ${startSecond.games} | ${startSecond.wins}-${startSecond.losses}-${startSecond.draws} | ${percent(startSecond.winRate)} | ${percent(startSecond.scoreRate)} |

## Desglose por Mazo en Espejo

| Mazo | V-D-E de ${a.name} | Win Rate | Puntuación | Inválidos | Turnos medios |
|:---|---:|---:|---:|---:|---:|
${deckRows}

## Auditoría Independiente de Calidad de Acciones

| Bot | Decisiones analizadas | Sospechosas / Críticas | En revisión | Tasa sospechosa | Tasa revisión |
|:---|---:|---:|---:|---:|---:|
| **${a.name}** | ${report.actionQuality.botA.decisions} | ${report.actionQuality.botA.quality.suspicious} | ${report.actionQuality.botA.quality.review} | ${percent(report.actionQuality.botA.rates.suspicious)} | ${percent(report.actionQuality.botA.rates.review)} |
| **${b.name}** | ${report.actionQuality.botB.decisions} | ${report.actionQuality.botB.quality.suspicious} | ${report.actionQuality.botB.quality.review} | ${percent(report.actionQuality.botB.rates.suspicious)} | ${percent(report.actionQuality.botB.rates.review)} |
`;
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { createBotForDeck, UNIVERSAL_BOT_ID } from "../bots/bot-system.js";
import { NEXO2_BOT_ID } from "../bots/nexo2-contract.js";
import { createActionQualityCollector, mergeActionQualityAudits } from "../training/action-quality-audit.js";
import { inspectOcgcoreRun } from "../training/ocgcore-run-validity.js";
import { confidenceInterval95 } from "../analytics/statistics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

const games = positiveInteger("games", 50);
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 8_500_000);
const maxSteps = positiveInteger("max-steps", 6_000);
const deckIds = String(option("decks", "goat-control,chaos-turbo,flip-control,warrior,panda-burn"))
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const outputDir = path.resolve(root, option("out", path.join("artifacts", `nexo-audit-${games}`)));

fs.mkdirSync(outputDir, { recursive: true });

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

function formatDuelBreakdownMarkdown(runsWithDecisions, aggregate) {
  const lines = [
    `# Nexo 2: Auditoría Detallada Jugada a Jugada (${runsWithDecisions.length} Duelos)`,
    "",
    `Generado: ${new Date().toISOString()}`,
    "",
    "## Resumen Global",
    "",
    `- **Duelos Evaluados**: ${aggregate.games}`,
    `- **Victorias Nexo 2**: ${aggregate.wins} (${(aggregate.winRate * 100).toFixed(1)} %)`,
    `- **Derrotas**: ${aggregate.losses}`,
    `- **Empates**: ${aggregate.draws}`,
    `- **Decisiones Analizadas**: ${aggregate.decisions}`,
    `- **Decisiones Sospechosas / Críticas**: ${aggregate.suspicious} (${(aggregate.suspiciousRate * 100).toFixed(2)} %)`,
    `- **Decisiones en Revisión**: ${aggregate.review} (${(aggregate.reviewRate * 100).toFixed(2)} %)`,
    "",
    "---",
    "",
    "## Desglose Turno por Turno (Primeras Partidas y Partidas con Incidencias)",
    "",
  ];

  // Include all duels in the move-by-move audit breakdown
  const interestingDuelos = runsWithDecisions;

  for (const duel of interestingDuelos) {
    const outcome = duel.winner === 0 ? "VICTORIA NEXO 2" : duel.winner === 1 ? "DERROTA (Ganó Nexo 1)" : "EMPATE";
    lines.push(`### Duelo #${duel.game}: Mazo ${duel.deckId} — ${outcome}`);
    lines.push(`- **Condición**: Nexo 2 ${duel.botAStarts ? "salió primero (Turno 1)" : "salió segundo (Turno 2)"}`);
    lines.push(`- **Duración**: ${duel.turns} turnos, ${duel.decisions.length} decisiones tomadas por Nexo 2`);
    lines.push("");

    let currentTurn = -1;
    for (const d of duel.decisions) {
      if (d.turn !== currentTurn) {
        currentTurn = d.turn;
        lines.push(`#### ─── Turno ${currentTurn} ───`);
      }

      const handStr = d.nexoHand?.length ? d.nexoHand.join(", ") : "(Mano vacía)";
      const statusIcon = d.quality === "suspicious" ? "🔴 [SOSPECHOSA]" : d.quality === "review" ? "🟡 [REVISIÓN]" : "🟢 [CORRECTA]";
      
      lines.push(`* **[${d.phaseName}]** Decisión #${d.decision} ${statusIcon}:`);
      lines.push(`  - **Mano Nexo 2**: \`[${handStr}]\``);
      lines.push(`  - **Mesa**: Nexo LP ${d.publicState.ownLp} (${d.publicState.ownMonsters} mon, ${d.publicState.ownBackrow} set) vs Rival LP ${d.publicState.opponentLp} (${d.publicState.opponentMonsters} mon, ${d.publicState.opponentBackrow} set)`);
      lines.push(`  - **Acción elegida**: **${d.selected.role}** ${d.selected.cards?.length ? `(${d.selected.cards.join(", ")})` : ""}`);
      lines.push(`  - **Explicación**: ${d.explanation}`);

      if (d.guardrailsAvoided?.length) {
        lines.push(`  - **Guardrails aplicados**: \`${d.guardrailsAvoided.join(", ")}\``);
      }

      if (d.alternatives?.length) {
        const altStrs = d.alternatives.map((a) => `${a.role}${a.cards?.length ? ` (${a.cards.join(", ")})` : ""} [score: ${(Number(a.score) || 0).toFixed(2)}]`);
        lines.push(`  - **Alternativas descartadas**: ${altStrs.join(" | ")}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  process.stderr.write(`Iniciando auditoría quirúrgica de ${games} partidas en paralelo...\n`);
  
  const jobs = Array.from({ length: games }, (_, index) => {
    const deckIndex = index % deckIds.length;
    const deckId = deckIds[deckIndex];
    const botASeat = index % 2;
    const round = Math.floor(index / deckIds.length);
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

  const parallel = Math.max(1, Math.min(6, workers));
  const runsWithDecisions = [];
  const allDecisionRecords = [];
  const actionQualityCollectors = [];

  let completedCount = 0;

  for (let cursor = 0; cursor < jobs.length; cursor += parallel) {
    const batch = await Promise.all(
      jobs.slice(cursor, cursor + parallel).map(async (job) => {
        const deck = getDeck(job.deckId);
        const gameDecisions = [];
        
        const collectorA = createActionQualityCollector({
          metadata: { game: job.game, deckId: job.deckId, seed: job.seed },
          sampleLimit: 30,
          targetPlayer: job.botASeat,
          onRecord: (record) => {
            gameDecisions.push(record);
            allDecisionRecords.push(record);
          },
        });

        const instanceA = createBotForDeck({
          botId: NEXO2_BOT_ID,
          deckId: job.deckId,
          deck,
          seed: job.seed ^ 0x9e3779b9,
        });

        const instanceB = createBotForDeck({
          botId: UNIVERSAL_BOT_ID,
          deckId: job.deckId,
          deck,
          seed: job.seed ^ 0x51ed270b,
        });

        const run = await runOcgcoreHeadless({
          decks: [cardNames(deck.main), cardNames(deck.main)],
          extraDecks: [cardNames(deck.fusion), cardNames(deck.fusion)],
          seed: job.seed,
          startingPlayer: job.startingPlayer,
          maxSteps,
          botA: job.botASeat === 0 ? instanceA : instanceB,
          botB: job.botASeat === 0 ? instanceB : instanceA,
          profileA: job.deckId,
          profileB: job.deckId,
          onDecision: (trace, context) => {
            collectorA.capture(trace, context);
          },
        });

        completedCount += 1;
        process.stderr.write(`\rProgreso: ${completedCount}/${games} partidas auditadas`);

        return {
          ...job,
          run,
          winner: run.winner === null ? null : (run.winner === job.botASeat ? 0 : 1),
          turns: Number(run.turns) || 0,
          validity: inspectOcgcoreRun(run),
          actionAudit: collectorA.result(),
          decisions: gameDecisions,
        };
      })
    );
    runsWithDecisions.push(...batch);
  }

  process.stderr.write("\nGenerando informes y secuencias de decisión...\n");

  runsWithDecisions.sort((a, b) => a.game - b.game);

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalTurns = 0;

  for (const r of runsWithDecisions) {
    if (r.winner === 0) wins += 1;
    else if (r.winner === 1) losses += 1;
    else draws += 1;
    totalTurns += r.turns;
  }

  const mergedQuality = mergeActionQualityAudits(runsWithDecisions.map((r) => r.actionAudit));
  const played = Math.max(1, runsWithDecisions.length);
  const winRate = wins / played;

  const aggregate = {
    games,
    wins,
    losses,
    draws,
    winRate,
    confidence95: confidenceInterval95(wins, played),
    averageTurns: totalTurns / played,
    decisions: mergedQuality.decisions,
    sound: mergedQuality.quality.sound,
    review: mergedQuality.quality.review,
    suspicious: mergedQuality.quality.suspicious,
    suspiciousRate: mergedQuality.rates.suspicious ?? (mergedQuality.quality.suspicious / Math.max(1, mergedQuality.reasoned)),
    reviewRate: mergedQuality.rates.review ?? (mergedQuality.quality.review / Math.max(1, mergedQuality.reasoned)),
  };

  const summary = {
    schema: 1,
    createdAt: new Date().toISOString(),
    config: { games, workers, seed, deckIds },
    aggregate,
    actionQuality: mergedQuality,
  };

  // 1. Write summary.json
  fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  // 2. Write decision-stream.jsonl (complete decision by decision stream)
  const decisionStreamPath = path.join(outputDir, "decision-stream.jsonl");
  const streamLines = allDecisionRecords.map((r) => JSON.stringify(r));
  fs.writeFileSync(decisionStreamPath, `${streamLines.join("\n")}\n`, "utf8");

  // 3. Write fights.jsonl
  const fightsPath = path.join(outputDir, "fights.jsonl");
  const fightsLines = runsWithDecisions.map((r) => JSON.stringify({
    game: r.game,
    deckId: r.deckId,
    winner: r.winner === 0 ? "Nexo2" : r.winner === 1 ? "Nexo1" : "Draw",
    botAStarts: r.botAStarts,
    turns: r.turns,
    decisionsCount: r.decisions.length,
  }));
  fs.writeFileSync(fightsPath, `${fightsLines.join("\n")}\n`, "utf8");

  // 4. Write duel-breakdown.md
  const markdownPath = path.join(outputDir, "duel-breakdown.md");
  fs.writeFileSync(markdownPath, formatDuelBreakdownMarkdown(runsWithDecisions, aggregate), "utf8");

  console.log(JSON.stringify({
    outputDir,
    summaryFile: path.join(outputDir, "summary.json"),
    decisionStream: decisionStreamPath,
    duelBreakdown: markdownPath,
    games,
    winRate: `${(winRate * 100).toFixed(1)} %`,
    suspiciousDecisions: aggregate.suspicious,
    reviewDecisions: aggregate.review,
  }, null, 2));
}

main().catch((err) => {
  console.error("Error ejecutando nexo-match-audit:", err);
  process.exit(1);
});

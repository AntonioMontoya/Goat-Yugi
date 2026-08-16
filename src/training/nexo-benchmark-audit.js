import { confidenceInterval95 } from "../analytics/statistics.js";
import { UNIVERSAL_BOT_ID, createBotForDeck } from "../bots/bot-system.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { createActionQualityCollector, mergeActionQualityAudits } from "./action-quality-audit.js";
import { FrozenIa500BenchmarkBot } from "./frozen-ia500-benchmark.js";
import { inspectOcgcoreRun } from "./ocgcore-run-validity.js";

export const NEXO_AUDIT_DECKS = Object.freeze(["chaos-turbo", "goat-control", "flip-control", "warrior", "panda-burn"]);

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }
function increment(target, key) { target[key] = (Number(target[key]) || 0) + 1; }
function percent(value) { return `${(Number(value) * 100).toFixed(1)} %`; }

function emptyMatchStats() {
  return { games: 0, validGames: 0, wins: 0, losses: 0, draws: 0, invalid: 0, turns: 0, decisions: 0, termination: {}, engineErrors: {} };
}

function addRun(stats, row) {
  stats.games += 1;
  stats.turns += Number(row.run.turns) || 0;
  stats.decisions += Number(row.run.decisions) || 0;
  increment(stats.termination, row.run.terminationReason ?? "UNKNOWN");
  for (const error of row.run.errors ?? []) increment(stats.engineErrors, error.text ?? error.type ?? "unknown");
  if (!row.validity.valid) { stats.invalid += 1; return; }
  stats.validGames += 1;
  if (row.run.winner === 0) stats.wins += 1;
  else if (row.run.winner === 1) stats.losses += 1;
  else stats.draws += 1;
}

function finalizeMatchStats(stats) {
  const played = Math.max(1, stats.validGames);
  return {
    ...stats,
    winRate: stats.wins / played,
    confidence95: confidenceInterval95(stats.wins, stats.validGames),
    averageTurns: stats.turns / Math.max(1, stats.games),
    averageDecisions: stats.decisions / Math.max(1, stats.games),
  };
}

/** Runs reproducible Nexo mirrors against the preserved frozen IA-500. */
export async function runNexoBenchmarkAudit({ games = 50, deckIds = NEXO_AUDIT_DECKS, seed = 8_150_000, workers = 4, maxSteps = 5_000, sampleLimit = 30, onProgress = null } = {}) {
  const ids = [...new Set(deckIds)].map((deckId) => getDeck(deckId).id);
  const requested = Math.max(1, Number(games) || 1);
  const jobs = Array.from({ length: requested }, (_, index) => {
    const deckIndex = index % ids.length;
    const deckId = ids[deckIndex];
    const round = Math.floor(index / ids.length);
    return { index, deckId, seed: Number(seed) + deckIndex * 100_003 + round, startingPlayer: index % 2 };
  });
  const results = [];
  const parallel = Math.max(1, Math.min(6, Math.floor(Number(workers) || 1)));
  for (let cursor = 0; cursor < jobs.length; cursor += parallel) {
    const batch = await Promise.all(jobs.slice(cursor, cursor + parallel).map(async (job) => {
      const deck = getDeck(job.deckId);
      const collector = createActionQualityCollector({ metadata: { game: job.index + 1, deckId: job.deckId, seed: job.seed }, sampleLimit, targetPlayer: 0 });
      const nexo = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: job.deckId, seed: job.seed ^ 0x9e3779b9 });
      const benchmark = new FrozenIa500BenchmarkBot({ deckId: job.deckId, seed: job.seed ^ 0x51ed270b });
      const run = await runOcgcoreHeadless({
        decks: [cardNames(deck.main), cardNames(deck.main)],
        extraDecks: [cardNames(deck.fusion), cardNames(deck.fusion)],
        seed: job.seed,
        startingPlayer: job.startingPlayer,
        maxSteps,
        botA: nexo,
        botB: benchmark,
        profileA: job.deckId,
        profileB: job.deckId,
        onDecision: (trace, context) => collector.capture(trace, context),
      });
      return { ...job, run, validity: inspectOcgcoreRun(run), actionAudit: collector.result() };
    }));
    results.push(...batch);
    onProgress?.({ completed: Math.min(requested, cursor + batch.length), total: requested });
  }
  results.sort((left, right) => left.index - right.index);
  const aggregate = emptyMatchStats();
  const perDeckRaw = Object.fromEntries(ids.map((deckId) => [deckId, emptyMatchStats()]));
  for (const row of results) { addRun(aggregate, row); addRun(perDeckRaw[row.deckId], row); }
  const actionQuality = mergeActionQualityAudits(results.map((row) => row.actionAudit), { sampleLimit });
  const matches = finalizeMatchStats(aggregate);
  const perDeck = Object.fromEntries(Object.entries(perDeckRaw).map(([deckId, stats]) => [deckId, finalizeMatchStats(stats)]));
  const benchmark = new FrozenIa500BenchmarkBot({ deckId: ids[0], seed }).manifest();
  const actionGate = actionQuality.quality.suspicious === 0 && actionQuality.rates.review <= 0.1;
  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    subject: { id: UNIVERSAL_BOT_ID, name: "Nexo", algorithm: "ocgcore-public-strategic-v4" },
    benchmark,
    configuration: { games: requested, deckIds: ids, seed: Number(seed), workers: parallel, maxSteps },
    matches,
    perDeck,
    actionQuality,
    gates: {
      runtimeClean: matches.invalid === 0,
      actionReviewClean: actionGate,
      performanceSmoke: matches.validGames >= 40 && matches.winRate >= 0.55 && Number(matches.confidence95.low) >= 0.5,
    },
    runs: results.map((row) => ({ game: row.index + 1, deckId: row.deckId, seed: row.seed, startingPlayer: row.startingPlayer, winner: row.run.winner, valid: row.validity.valid, validityReasons: row.validity.reasons, terminationReason: row.run.terminationReason, turns: row.run.turns, decisions: row.run.decisions, nexoActions: row.actionAudit.decisions })),
    caveat: "La clasificación de acciones detecta incoherencias y compara alternativas públicas; no demuestra que cada jugada sea óptima bajo todas las cartas ocultas o rulings posibles.",
  };
}

function mapRows(values = {}, limit = 12) {
  return Object.entries(values).sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, limit).map(([key, value]) => `- ${key}: ${value}`).join("\n") || "- Ninguno";
}

function deckRows(values = {}) {
  const rows = Object.entries(values).map(([deckId, stats]) => `| ${deckId} | ${stats.wins}-${stats.losses}-${stats.draws} | ${percent(stats.winRate)} | ${stats.invalid} | ${stats.averageTurns.toFixed(2)} |`);
  return ["| Mazo espejo | V-D-E de Nexo | Win rate | Inválidos | Turnos medios |", "|---|---:|---:|---:|---:|", ...rows].join("\n");
}

function exampleRows(values = [], limit = 10) {
  return values.slice(0, limit).map((entry) => {
    const state = entry.publicState ?? {};
    const alternative = entry.alternatives?.[0];
    const alternativeText = alternative ? ` Alternativa principal: ${alternative.role}${alternative.cards?.length ? ` con ${alternative.cards.join(", ")}` : ""} (puntuación ${Number(alternative.score).toFixed(2)}).` : "";
    return `- Duelo ${entry.game}, ${entry.deckId}, seed ${entry.seed}, decisión ${entry.decision}, turno ${entry.turn}/fase ${entry.phase}. Estado público: LP ${state.ownLp}-${state.opponentLp}, monstruos ${state.ownMonsters}-${state.opponentMonsters}, backrow ${state.ownBackrow}-${state.opponentBackrow}, cadena ${state.publicChainLinks}. ${entry.explanation}${alternativeText}`;
  }).join("\n") || "- Ninguno";
}

export function formatNexoBenchmarkAuditMarkdown(report) {
  const match = report.matches;
  const actions = report.actionQuality;
  return `# Auditoría Nexo contra IA-500 congelada

Generada: ${report.createdAt}

## Resultado de los ${report.configuration.games} duelos

- Ejecutados: ${match.games}
- Válidos: ${match.validGames}
- Nexo: ${match.wins} victorias, ${match.losses} derrotas, ${match.draws} empates
- Inválidos: ${match.invalid}
- Win rate válido: ${percent(match.winRate)}
- Confianza 95 %: ${percent(match.confidence95.low)} – ${percent(match.confidence95.high)}
- Turnos medios: ${match.averageTurns.toFixed(2)}
- Seed base: ${report.configuration.seed}

### Resultado por mazo

${deckRows(report.perDeck)}

## Auditoría de acciones de Nexo

- Decisiones examinadas: ${actions.decisions}
- Forzadas por OCGCore: ${actions.quality.forced}
- Razonadas: ${actions.reasoned}
- Sólidas según el evaluador: ${actions.quality.sound} (${percent(actions.rates.sound)})
- Para revisión: ${actions.quality.review} (${percent(actions.rates.review)})
- Sospechosas: ${actions.quality.suspicious} (${percent(actions.rates.suspicious)})
- Valor público medio: ${actions.averages.projectedValue.toFixed(3)}
- Arrepentimiento estratégico medio: ${actions.averages.plannedRegret.toFixed(3)}

## Errores evitados por las guardas

${mapRows(actions.guardrailsAvoided)}

## Acciones por tipo

${mapRows(actions.byRole)}

## Ejemplos sospechosos

${exampleRows(actions.examples.suspicious)}

## Ejemplos que requieren revisión

${exampleRows(actions.examples.review)}

## Resultado de las puertas

- Runtime limpio: ${report.gates.runtimeClean ? "PASS" : "FAIL"}
- Revisión de acciones limpia: ${report.gates.actionReviewClean ? "PASS" : "FAIL"}
- Rendimiento smoke: ${report.gates.performanceSmoke ? "PASS" : "FAIL"}

## Límite de la conclusión

${report.caveat}
`;
}

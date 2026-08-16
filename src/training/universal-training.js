import { confidenceInterval95 } from "../analytics/statistics.js";
import { auditBotReasoning } from "../bots/reasoning-audit.js";
import { StrategicBot } from "../bots/strategic.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { FrozenIa100BenchmarkBot } from "./frozen-ia100-benchmark.js";
import { inspectOcgcoreRun } from "./ocgcore-run-validity.js";
import { trainStrategicPolicy } from "./specialist-training.js";

export const UNIVERSAL_TRAINING_DECKS = Object.freeze([
  "goat-control", "chaos-turbo", "warrior", "panda-burn", "reasoning-gate", "empty-jar", "chaos-recruiter", "flip-control", "earth-aggro",
]);

export const UNIVERSAL_HIDDEN_EVALUATION_DECKS = Object.freeze([
  "chaos-control", "goatformat-burn", "goatformat-zombie", "goatformat-beastdown",
]);

function names(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

function uniqueDecks(values = []) {
  return [...new Set(values)].filter((deckId) => {
    try { getDeck(deckId); return true; } catch { return false; }
  });
}

function aggregate(total, batch) {
  total.games += Number(batch.games) || 0;
  total.wins += Number(batch.wins) || 0;
  total.losses += Number(batch.losses) || 0;
  total.draws += Number(batch.draws) || 0;
  total.invalid += Number(batch.invalid) || 0;
  total.winRate = total.wins / Math.max(1, total.games);
  total.validWinRate = total.wins / Math.max(1, total.wins + total.losses + total.draws);
  return total;
}

export function universalQualityGate({ training = {}, evaluation = {}, reasoningAudit = null } = {}) {
  const confidence = evaluation.confidence95 ?? confidenceInterval95(Number(evaluation.wins) || 0, Number(evaluation.games) || 0);
  const cleanTraining = Number(training.invalid) === 0;
  const cleanEvaluation = Number(evaluation.invalid) === 0;
  const crossDeck = Number(evaluation.deckCount) >= 3;
  const enoughEvidence = Number(evaluation.games) >= 24;
  const competitive = Number(confidence.low) >= 0.45;
  const reasoning = reasoningAudit?.passed === true && Number(reasoningAudit.score) >= 0.98;
  const passed = cleanTraining && cleanEvaluation && crossDeck && enoughEvidence && competitive && reasoning;
  const reason = !cleanTraining ? "INVALID_TRAINING_RUN"
    : !cleanEvaluation ? "INVALID_EVALUATION_RUN"
      : !reasoning ? "REASONING_REGRESSION"
        : !crossDeck ? "INSUFFICIENT_DECK_COVERAGE"
          : !enoughEvidence ? "EVALUATION_UNCERTAIN"
            : !competitive ? "PERFORMANCE_NOT_CONFIRMED"
              : "QUALIFIED";
  const nextAction = reason === "REASONING_REGRESSION" || reason.startsWith("INVALID_")
    ? "Corregir la base; jugar más partidas no soluciona este fallo."
    : reason === "EVALUATION_UNCERTAIN" || reason === "INSUFFICIENT_DECK_COVERAGE"
      ? "Ampliar sólo la evaluación separada hasta estrechar la confianza."
      : reason === "PERFORMANCE_NOT_CONFIRMED"
        ? "Entrenar sobre las decisiones perdedoras y volver a evaluar con semillas nuevas."
        : "Promoción permitida.";
  return { schema: 1, passed, reason, nextAction, confidence95: confidence, gates: { cleanTraining, cleanEvaluation, crossDeck, enoughEvidence, competitive, reasoning } };
}

export async function evaluateUniversalPolicy({ candidate, deckIds = UNIVERSAL_HIDDEN_EVALUATION_DECKS, gamesPerDeck = 6, seed = 6_100_000, workers = 4, maxSteps = 5_000 } = {}) {
  const manifest = candidate?.manifest ? candidate.manifest() : structuredClone(candidate ?? {});
  const ids = uniqueDecks(deckIds);
  const jobs = [];
  for (const deckId of ids) for (let game = 0; game < Math.max(1, Number(gamesPerDeck) || 1); game += 1) jobs.push({ deckId, game });
  const totals = { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0, deckCount: ids.length, byDeck: {} };
  const parallel = Math.max(1, Math.min(6, Number(workers) || 1));
  for (let cursor = 0; cursor < jobs.length; cursor += parallel) {
    const batch = await Promise.all(jobs.slice(cursor, cursor + parallel).map(async ({ deckId, game }) => {
      const deck = getDeck(deckId);
      const gameSeed = seed + cursor * 997 + game;
      const bot = new StrategicBot({ ...manifest, id: "universal-evaluation", botId: "universal-base", deckId, profile: deckId, deck, training: false, seed: gameSeed ^ 0x9e3779b9 });
      const rival = new FrozenIa100BenchmarkBot({ deckId, deck, seed: gameSeed ^ 0x6d2b79f5 });
      const run = await runOcgcoreHeadless({ decks: [names(deck.main), names(deck.main)], extraDecks: [names(deck.fusion), names(deck.fusion)], seed: gameSeed, startingPlayer: game % 2, maxSteps, botA: bot, botB: rival, profileA: deckId, profileB: deckId });
      return { deckId, run, validity: inspectOcgcoreRun(run) };
    }));
    for (const item of batch) {
      const row = totals.byDeck[item.deckId] ??= { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0 };
      row.games += 1; totals.games += 1;
      if (!item.validity.valid) { row.invalid += 1; totals.invalid += 1; continue; }
      if (item.run.winner === 0) { row.wins += 1; totals.wins += 1; }
      else if (item.run.winner === 1) { row.losses += 1; totals.losses += 1; }
      else { row.draws += 1; totals.draws += 1; }
    }
  }
  totals.winRate = totals.wins / Math.max(1, totals.games);
  totals.confidence95 = confidenceInterval95(totals.wins, totals.games);
  return totals;
}

/**
 * Trains one shared policy over several decks. The budget is a ceiling, not a
 * rank: promotion depends on clean reasoning and a separate cross-deck test.
 */
export async function trainUniversalBot({ selectedDeckId = "goat-control", deckIds = UNIVERSAL_TRAINING_DECKS, games = 100, seed = 6_000_000, workers = 4, initialModel = null, abortSignal = null, checkpointEvery = 25, onProgress = null, onCheckpoint = null, evaluate = true } = {}) {
  const curriculum = uniqueDecks([selectedDeckId, ...deckIds]);
  const requested = Math.max(1, Number(games) || 1);
  const chunkSize = Math.max(1, Math.min(Number(checkpointEvery) || 25, Math.max(1, Number(workers) || 1) * 2));
  const training = { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0, winRate: 0, validWinRate: 0, deckCount: curriculum.length };
  let model = initialModel ? structuredClone(initialModel?.manifest ? initialModel.manifest() : initialModel) : null;
  let completed = 0;
  while (completed < requested && !abortSignal?.aborted) {
    const size = Math.min(chunkSize, requested - completed);
    const batch = await trainStrategicPolicy({ deckIds: curriculum, games: size, workers, seed: seed + completed * 100_003, personaId: "oracle", initialModel: model });
    model = { ...batch.model, id: "universal-base", botId: "universal-base", name: "Nexo", style: "IA universal adaptativa", profile: "generic", deckId: selectedDeckId, training: false };
    aggregate(training, batch);
    completed += size;
    onProgress?.({ completed, total: requested, stats: structuredClone(training), candidate: structuredClone(model) });
    if (completed % Math.max(1, Number(checkpointEvery) || 25) === 0 || completed === requested || abortSignal?.aborted) onCheckpoint?.({ schema: 1, completed, total: requested, candidate: structuredClone(model), trainingStats: structuredClone(training), savedAt: new Date().toISOString() });
  }
  const reasoningAudit = auditBotReasoning(model);
  const evaluation = evaluate && !abortSignal?.aborted ? await evaluateUniversalPolicy({ candidate: model, seed: seed + 900_000, workers }) : { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0, deckCount: 0, confidence95: confidenceInterval95(0, 0) };
  const quality = universalQualityGate({ training, evaluation, reasoningAudit });
  model = { ...model, trainingState: { ...(model?.trainingState ?? {}), episodes: Number(model?.trainingState?.episodes) || completed }, quality, reasoningAudit };
  return { model, bot: model, completed, total: requested, cancelled: abortSignal?.aborted === true, trainingStats: training, evaluation, reasoningAudit, quality };
}

import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "../engine/constants.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { CoreHeuristicBot, CoreRandomBot, hydrateCoreBot } from "../bots/ocgcore.js";
import { getDeck } from "../decks/decks.js";
import { duelStats, compactStats } from "../analytics/statistics.js";
import { compareEvaluations } from "../evaluation/evaluation.js";
import { createModelManifest } from "../persistence/model-registry.js";
import { encodeDuelPack } from "../storage/duelpack.js";
import { getCard } from "../engine/cards.js";

export const DEFAULT_CORE_OPPONENT_DECKS = Object.freeze([
  "goat-control", "chaos-control", "warrior", "panda-burn", "reasoning-gate",
  "earth-aggro", "empty-jar", "chaos-recruiter", "flip-control"
]);
export const DEFAULT_CORE_VALIDATION_DECKS = Object.freeze(["warrior", "earth-aggro"]);
export const DEFAULT_CORE_HIDDEN_DECKS = Object.freeze(["panda-burn", "reasoning-gate", "empty-jar", "chaos-recruiter", "flip-control"]);

function outcomeFor(result) {
  return result.winner === 0 ? 1 : result.winner === 1 ? -1 : 0;
}

function profileForDeck(deckId) {
  return deckId;
}

function makeRival(deckId, index, { difficulty = "normal", seed = 1 } = {}) {
  const deck = getDeck(deckId);
  if (difficulty === "random") return new CoreRandomBot({ id: `core-random-${deckId}-${index}`, name: `Random ${deck.name}`, seed: seed + index, profile: deckId });
  return new CoreHeuristicBot({
    id: `core-rival-${deckId}-${index}`,
    name: `Rival ${deck.name}`,
    profile: profileForDeck(deckId),
    difficulty,
    brave: difficulty !== "easy",
    version: 1,
  });
}

function workerCount(value) {
  return Math.max(1, Math.min(6, Math.floor(Number(value) || 1)));
}

export function readRuntimeResources() {
  const memory = globalThis.performance?.memory;
  return memory
    ? { source: "performance.memory", usedBytes: Number(memory.usedJSHeapSize) || 0, limitBytes: Number(memory.jsHeapSizeLimit) || 0 }
    : { source: "unavailable", usedBytes: null, limitBytes: null };
}

async function runJobs(jobs, workers = 1) {
  const results = [];
  const count = workerCount(workers);
  for (let index = 0; index < jobs.length; index += count) {
    const batch = await Promise.all(jobs.slice(index, index + count).map((job) => job()));
    results.push(...batch);
  }
  return results;
}

async function playCoreGame({ candidate, deckId, opponentDeckId, opponentKind = "heuristic", seed, index, suite = "training", maxSteps = 5000 } = {}) {
  const candidateDeck = getDeck(deckId);
  const opponentDeck = getDeck(opponentDeckId);
  const rival = makeRival(opponentDeckId, index, { difficulty: opponentKind === "random" ? "random" : "normal", seed });
  const result = await runOcgcoreHeadless({
    decks: [candidateDeck.main.map((id) => getDeckCardName(id)), opponentDeck.main.map((id) => getDeckCardName(id))],
    extraDecks: [candidateDeck.fusion.map((id) => getDeckCardName(id)), opponentDeck.fusion.map((id) => getDeckCardName(id))],
    seed,
    maxSteps,
    botA: candidate,
    botB: rival,
    profileA: candidate.profile ?? profileForDeck(deckId),
    profileB: rival.profile,
    startingPlayer: index % 2,
  });
  const replay = {
    ...result.replay,
    opponentDeckId,
    opponentBotId: rival.id,
    candidateBotId: candidate.id,
    suite,
    startingPlayer: index % 2,
  };
  return { ...result, replay, opponentDeckId, opponentBotId: rival.id, startingPlayer: index % 2, suite, decisionCount: result.decisions };
}

function getDeckCardName(cardId) {
  // The deck module stores stable numeric IDs; OCGCore accepts the same
  // passcodes, but names keep the generated replays readable and portable.
  return getCard(cardId)?.name ?? String(cardId);
}

export async function evaluateCoreCandidate({
  candidate,
  deckId = "chaos-turbo",
  deckIds = DEFAULT_CORE_HIDDEN_DECKS,
  gamesPerDeck = 5,
  seed = 1000,
  includeRandom = true,
  includeHeuristic = true,
  suite = "hidden-evaluation",
  maxSteps = 5000,
  workers = 1,
} = {}) {
  if (!candidate) throw new Error("evaluateCoreCandidate necesita un bot candidato.");
  const results = [];
  let index = 0;
  const kinds = [];
  if (includeRandom) kinds.push("random");
  if (includeHeuristic) kinds.push("heuristic");
  if (!kinds.length) kinds.push("heuristic");
  const evaluationBot = hydrateCoreBot(candidate.manifest());
  const jobs = [];
  for (const opponentDeckId of deckIds) {
    for (const kind of kinds) {
      for (let game = 0; game < gamesPerDeck; game += 1) {
        const jobIndex = index;
        jobs.push(() => playCoreGame({ candidate: evaluationBot, deckId, opponentDeckId, opponentKind: kind, seed: seed + jobIndex, index: jobIndex, suite, maxSteps }));
        index += 1;
      }
    }
  }
  results.push(...await runJobs(jobs, workers));
  const stats = duelStats(results, { sampleSeed: seed });
  return { suite, engine: "ocgcore", deckId, deckIds: [...deckIds], gamesPerDeck, results, stats, bySuite: { [suite]: stats } };
}

export async function runCoreBatch({ deckAId = "chaos-turbo", deckBId = "goat-control", games = 100, seed = 1, maxSteps = 5000, workers = 1 } = {}) {
  const deckA = getDeck(deckAId);
  const deckB = getDeck(deckBId);
  const replays = [];
  const jobs = Array.from({ length: Math.max(0, Number(games) || 0) }, (_, i) => async () => {
    const botA = new CoreHeuristicBot({ id: `batch-a-${i}`, name: "Astra A", profile: deckAId });
    const botB = new CoreHeuristicBot({ id: `batch-b-${i}`, name: "Astra B", profile: deckBId });
    const result = await runOcgcoreHeadless({
      decks: [[...deckA.main].map(getDeckCardName), [...deckB.main].map(getDeckCardName)],
      extraDecks: [[...deckA.fusion].map(getDeckCardName), [...deckB.fusion].map(getDeckCardName)],
      seed: seed + i,
      maxSteps,
      botA,
      botB,
      profileA: deckAId,
      profileB: deckBId,
      startingPlayer: i % 2,
    });
    return { ...result.replay, deckAId, deckBId };
  });
  replays.push(...await runJobs(jobs, workers));
  return { engine: "ocgcore", stats: duelStats(replays, { sampleSeed: seed }), replays };
}

export async function trainCoreCandidate({
  botName = "Pepito",
  deckId = "chaos-turbo",
  opponentDeckIds = DEFAULT_CORE_OPPONENT_DECKS,
  validationDeckIds = DEFAULT_CORE_VALIDATION_DECKS,
  hiddenEvaluationDeckIds = DEFAULT_CORE_HIDDEN_DECKS,
  games = 1000,
  seed = 5000,
  checkpointEvery = 100,
  onProgress = null,
  onCheckpoint = null,
  onGame = null,
  initialBot = null,
  startIndex = 0,
  abortSignal = null,
  parentModelId = null,
  maxSteps = 5000,
  workers = 1,
  resourceProfile = "custom",
} = {}) {
  const candidate = initialBot ?? new CoreHeuristicBot({ name: botName, id: `${botName.toLowerCase().replace(/\s+/g, "-")}-candidate`, profile: deckId });
  candidate.state = "En entrenamiento";
  const results = [];
  const totalGames = Math.max(0, Number(games) || 0);
  const parallelWorkers = workerCount(workers);
  const firstIndex = Math.max(0, Number(startIndex) || 0);
  let completed = firstIndex;
  let cancelled = false;
  for (let i = firstIndex; i < totalGames; i += parallelWorkers) {
    if (abortSignal?.aborted) { cancelled = true; break; }
    const indexes = Array.from({ length: Math.min(parallelWorkers, totalGames - i) }, (_, offset) => i + offset);
    const batch = await Promise.all(indexes.map((index) => playCoreGame({ candidate, deckId, opponentDeckId: opponentDeckIds[index % opponentDeckIds.length], seed: seed + index, index, suite: "training", maxSteps })));
    for (const result of batch) {
      results.push(result);
      candidate.updateFromOutcome(outcomeFor(result));
      completed = Math.max(completed, Number(result.replay?.gameIndex ?? 0) + 1, i + batch.indexOf(result) + 1);
      onGame?.(result, { completed, total: totalGames, candidate: candidate.manifest(), workers: parallelWorkers, resources: readRuntimeResources() });
    }
    const trainingStats = duelStats(results, { sampleSeed: seed });
    if (completed % Math.max(1, checkpointEvery) === 0 || completed === totalGames) {
      onProgress?.({ completed, total: totalGames, stats: trainingStats, manifest: candidate.manifest(), workers: parallelWorkers, resources: readRuntimeResources() });
      onCheckpoint?.({
        schema: 1,
        engine: "ocgcore",
        completed,
        total: totalGames,
        seed,
        deckId,
        opponentDeckIds: [...opponentDeckIds],
        candidate: candidate.manifest(),
        trainingStats: compactStats(trainingStats),
        workers: parallelWorkers,
        resources: readRuntimeResources(),
        createdAt: new Date().toISOString(),
      });
    }
  }

  const trainingStats = duelStats(results, { sampleSeed: seed });
  const baseTrainingPlan = {
    engine: "ocgcore",
    deckId,
    opponentDeckIds: [...opponentDeckIds],
    validationDeckIds: [...validationDeckIds],
    hiddenEvaluationDeckIds: [...hiddenEvaluationDeckIds],
    games: totalGames,
    seed,
    checkpointEvery,
    workers: parallelWorkers,
    resourceProfile,
    maxSteps,
    resources: readRuntimeResources(),
    status: cancelled ? "CANCELLED" : completed >= totalGames ? "COMPLETED" : "IN_PROGRESS",
  };
  if (cancelled && completed < totalGames) {
    candidate.state = "Candidato";
    const emptyStats = duelStats([]);
    const model = createModelManifest({ bot: candidate.manifest(), deckId, trainingPlan: baseTrainingPlan, trainingStats, evaluation: emptyStats, parentModelId });
    const pack = encodeDuelPack(results.map((result) => result.replay), {
      runId: `${candidate.id}-run-${seed}`,
      mode: "training",
      engine: "ocgcore",
      engineVersion: ENGINE_VERSION,
      formatVersion: FORMAT_VERSION,
      cardDatabaseVersion: CARD_DATABASE_VERSION,
    });
    return {
      engine: "ocgcore",
      bot: candidate.manifest(),
      model,
      trainingPlan: baseTrainingPlan,
      trainingStats,
      validation: emptyStats,
      hiddenEvaluation: emptyStats,
      evaluation: emptyStats,
      evaluationDetails: null,
      results,
      pack,
      completed,
      cancelled,
    };
  }
  const evaluationGamesPerDeck = Math.max(1, Math.min(25, Math.floor(Math.max(1, totalGames) / 20)));
  const validation = await evaluateCoreCandidate({ candidate, deckId, deckIds: validationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 100, suite: "validation", includeRandom: false, includeHeuristic: true, maxSteps, workers: parallelWorkers });
  const hiddenEvaluation = await evaluateCoreCandidate({ candidate, deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 1000, suite: "hidden-evaluation", includeRandom: true, includeHeuristic: true, maxSteps, workers: parallelWorkers });
  const baseline = await evaluateCoreCandidate({ candidate: new CoreHeuristicBot({ id: "core-baseline", name: "Baseline", profile: deckId, difficulty: "normal" }), deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 2000, suite: "baseline", includeRandom: false, includeHeuristic: true, maxSteps, workers: parallelWorkers });
  const comparison = compareEvaluations(hiddenEvaluation.stats, baseline.stats);
  candidate.state = "Candidato";
  const trainingPlan = baseTrainingPlan;
  const model = createModelManifest({ bot: candidate.manifest(), deckId, trainingPlan, trainingStats, evaluation: hiddenEvaluation.stats, parentModelId });
  const pack = encodeDuelPack(results.map((result) => result.replay), {
    runId: `${candidate.id}-run-${seed}`,
    mode: "training",
    engine: "ocgcore",
    engineVersion: ENGINE_VERSION,
    formatVersion: FORMAT_VERSION,
    cardDatabaseVersion: CARD_DATABASE_VERSION,
  });
  return {
    engine: "ocgcore",
    bot: candidate.manifest(),
    model,
    trainingPlan,
    trainingStats,
    validation: validation.stats,
    hiddenEvaluation: hiddenEvaluation.stats,
    evaluation: hiddenEvaluation.stats,
    evaluationDetails: { validation, hiddenEvaluation, baseline, comparison },
    results,
    pack,
    completed,
    cancelled,
  };
}

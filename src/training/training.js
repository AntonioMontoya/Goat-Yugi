import { runDuel } from "../engine/game.js";
import { getDeck } from "../decks/decks.js";
import { AdaptiveHeuristicBot, HeuristicBot } from "../bots/heuristic.js";
import { encodeDuelPack } from "../storage/duelpack.js";
import { duelStats, compactStats } from "../analytics/statistics.js";
import { compareEvaluations, DEFAULT_DECKS, evaluateCandidate } from "../evaluation/evaluation.js";
import { createModelManifest } from "../persistence/model-registry.js";
import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "../engine/constants.js";

export { duelStats, compactStats };

const DEFAULT_OPPONENT_DECKS = DEFAULT_DECKS.filter((deckId) => deckId !== "chaos-turbo");
const DEFAULT_VALIDATION_DECKS = ["warrior", "earth-aggro"];
const DEFAULT_HIDDEN_DECKS = ["panda-burn", "reasoning-gate", "empty-jar", "chaos-recruiter", "flip-control"];

function outcomeFor(result) {
  return result.winner === 0 ? 1 : result.winner === 1 ? -1 : 0;
}

function checkpointFor(candidate, { completed, total, seed, deckId, opponentDeckIds, trainingStats }) {
  return {
    schema: 1,
    completed,
    total,
    seed,
    deckId,
    opponentDeckIds: [...opponentDeckIds],
    candidate: candidate.manifest(),
    trainingStats: compactStats(trainingStats),
    createdAt: new Date().toISOString()
  };
}

export function evaluateBot({ deckId = "chaos-turbo", opponentDeckIds = ["goat-control"], games = 100, seed = 1000, bot = null } = {}) {
  const deck = getDeck(deckId);
  const candidate = bot ?? new HeuristicBot({ name: "Candidate", seed });
  const results = [];
  for (let i = 0; i < games; i += 1) {
    const opponentDeckId = opponentDeckIds[i % opponentDeckIds.length];
    const opponentDeck = getDeck(opponentDeckId);
    const rival = new HeuristicBot({ name: `Astra ${opponentDeck.name}`, seed: seed + i + 17, difficulty: "normal" });
    const result = runDuel(deck.main, opponentDeck.main, candidate, rival, { seed: seed + i, startingPlayer: i % 2 });
    results.push({ ...result, opponentDeckId, opponentBotId: rival.id, startingPlayer: i % 2 });
  }
  return { stats: duelStats(results, { sampleSeed: seed }), results };
}

export function hydrateAdaptiveBot(manifest) {
  const candidate = new AdaptiveHeuristicBot({
    id: manifest.id ?? manifest.botId ?? "adaptive-heuristic",
    name: manifest.name ?? "Pepito",
    weights: manifest.weights ?? {},
    version: manifest.version ?? 1,
    learningRate: manifest.learningRate ?? 0.02,
    episodes: manifest.episodes ?? 0,
    outcomeSum: manifest.outcomeSum ?? 0,
    selectedActionCounts: manifest.selectedActionCounts ?? {}
  });
  candidate.decisions = manifest.decisions ?? 0;
  return candidate;
}

export function trainCandidate({
  botName = "Pepito",
  deckId = "chaos-turbo",
  opponentDeckIds = DEFAULT_OPPONENT_DECKS,
  validationDeckIds = DEFAULT_VALIDATION_DECKS,
  hiddenEvaluationDeckIds = DEFAULT_HIDDEN_DECKS,
  games = 1000,
  seed = 5000,
  onProgress = null,
  onCheckpoint = null,
  checkpointEvery = 100,
  initialBot = null,
  startIndex = 0,
  abortSignal = null,
  parentModelId = null
} = {}) {
  const candidate = initialBot ?? new AdaptiveHeuristicBot({ name: botName, id: `${botName.toLowerCase().replace(/\s+/g, "-")}-candidate` });
  const results = [];
  const totalGames = Math.max(0, Number(games) || 0);
  const firstIndex = Math.max(0, Number(startIndex) || 0);
  let completed = firstIndex;
  let cancelled = false;
  for (let i = firstIndex; i < totalGames; i += 1) {
    if (abortSignal?.aborted) { cancelled = true; break; }
    const opponentDeckId = opponentDeckIds[i % opponentDeckIds.length];
    const deck = getDeck(deckId);
    const opponentDeck = getDeck(opponentDeckId);
    const rival = new HeuristicBot({ name: `Rival ${opponentDeck.name}`, seed: seed + i + 91, difficulty: "normal" });
    const result = runDuel(deck.main, opponentDeck.main, candidate, rival, { seed: seed + i, startingPlayer: i % 2 });
    const enriched = { ...result, opponentDeckId, opponentBotId: rival.id, startingPlayer: i % 2 };
    results.push(enriched);
    candidate.updateFromOutcome(outcomeFor(result));
    completed = i + 1;
    const trainingStats = duelStats(results, { sampleSeed: seed });
    if (onProgress && (completed % Math.max(1, checkpointEvery) === 0 || completed === totalGames)) onProgress({ completed, total: totalGames, stats: trainingStats, manifest: candidate.manifest() });
    if (onCheckpoint && (completed % Math.max(1, checkpointEvery) === 0 || completed === totalGames)) onCheckpoint(checkpointFor(candidate, { completed, total: totalGames, seed, deckId, opponentDeckIds, trainingStats }));
  }

  const trainingStats = duelStats(results, { sampleSeed: seed });
  const evaluationGamesPerDeck = Math.max(1, Math.min(25, Math.floor(Math.max(1, totalGames) / 20)));
  const validation = evaluateCandidate({ candidate: hydrateAdaptiveBot(candidate.manifest()), deckId, deckIds: validationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 100, suite: "validation", includeRandom: false, includeHeuristic: true });
  const hiddenEvaluation = evaluateCandidate({ candidate: hydrateAdaptiveBot(candidate.manifest()), deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 1000, suite: "hidden-evaluation", includeRandom: true, includeHeuristic: true });
  const baseline = evaluateBot({ deckId, opponentDeckIds: hiddenEvaluationDeckIds, games: Math.max(1, hiddenEvaluation.results.length), seed: seed + totalGames + 2000, bot: hydrateAdaptiveBot(candidate.manifest()) });
  const comparison = compareEvaluations(hiddenEvaluation.stats, baseline.stats);
  const trainingPlan = {
    deckId,
    opponentDeckIds: [...opponentDeckIds],
    validationDeckIds: [...validationDeckIds],
    hiddenEvaluationDeckIds: [...hiddenEvaluationDeckIds],
    games: totalGames,
    seed,
    checkpointEvery,
    status: cancelled ? "CANCELLED" : completed >= totalGames ? "COMPLETED" : "IN_PROGRESS"
  };
  const model = createModelManifest({ bot: candidate.manifest(), deckId, trainingPlan, trainingStats, evaluation: hiddenEvaluation.stats, parentModelId });
  const pack = encodeDuelPack(results.map((result) => result.replay), {
    runId: `${candidate.id}-run-${seed}`,
    mode: "training",
    engineVersion: ENGINE_VERSION,
    formatVersion: FORMAT_VERSION,
    cardDatabaseVersion: CARD_DATABASE_VERSION
  });
  return {
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
    cancelled
  };
}

export function runBatch({ deckAId = "chaos-turbo", deckBId = "goat-control", games = 100, seed = 1 } = {}) {
  const deckA = getDeck(deckAId);
  const deckB = getDeck(deckBId);
  const results = [];
  for (let i = 0; i < games; i += 1) {
    const botA = new HeuristicBot({ name: "Astra A", seed: seed + i });
    const botB = new HeuristicBot({ name: "Astra B", seed: seed + i + 99 });
    const run = runDuel(deckA.main, deckB.main, botA, botB, { seed: seed + i, startingPlayer: i % 2 });
    results.push({ ...run.replay, startingPlayer: i % 2, opponentDeckId: deckBId });
  }
  return { stats: duelStats(results, { sampleSeed: seed }), replays: results };
}

export { trainCoreCandidate, evaluateCoreCandidate, runCoreBatch, readRuntimeResources, DEFAULT_CORE_OPPONENT_DECKS, DEFAULT_CORE_VALIDATION_DECKS, DEFAULT_CORE_HIDDEN_DECKS } from "./core-training.js";
export { trainLearnedPolicy, evaluateLearnedPolicy, DEFAULT_LEARNED_OPPONENT_DECKS } from "./learned-training.js";
export { evolveLearnedPolicy, mutateLearnedPolicy } from "./bot-league.js";
export { STRATEGY_SCENARIO_BANK, evaluateStrategyBank, strategyBankForDeck, strategyBankManifest } from "./strategy-bank.js";
export { trainUniversalBot, evaluateUniversalPolicy, universalQualityGate, UNIVERSAL_TRAINING_DECKS, UNIVERSAL_HIDDEN_EVALUATION_DECKS } from "./universal-training.js";
export { runNexo2Pilot, nexo2PilotGate, NEXO2_PILOT_DECKS } from "./nexo2-pilot.js";

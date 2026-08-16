import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "../engine/constants.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { CoreHeuristicBot, CoreRandomBot, hydrateCoreBot } from "../bots/ocgcore.js";
import { LearnedPolicyBot, hydrateLearnedPolicy, rewardForCoreResult, learnedPolicySummary } from "../bots/learned-policy.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { duelStats, compactStats } from "../analytics/statistics.js";
import { compareEvaluations } from "../evaluation/evaluation.js";
import { createModelManifest } from "../persistence/model-registry.js";
import { encodeDuelPack } from "../storage/duelpack.js";
import { evaluateStrategyBank, strategyBankForDeck } from "./strategy-bank.js";

export const DEFAULT_LEARNED_OPPONENT_DECKS = Object.freeze([
  "goat-control", "chaos-control", "warrior", "panda-burn", "reasoning-gate",
  "earth-aggro", "empty-jar", "chaos-recruiter", "flip-control"
]);

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }

function workers(value) { return Math.max(1, Math.min(6, Math.floor(Number(value) || 1))); }

function compactMetric(replay = {}) {
  return {
    winner: replay.result ?? null,
    terminationReason: replay.terminationReason ?? "UNKNOWN",
    turns: Number(replay.turns) || 0,
    decisions: Number(replay.decisions ?? replay.decisionCount) || 0,
    startingPlayer: replay.startingPlayer,
    opponentDeckId: replay.opponentDeckId ?? "unknown",
  };
}

function retainReplay(replay, index, total, retained, { sampleLimit, errorLimit } = {}) {
  const fatal = ["INVALID_ACTION", "UNSUPPORTED_RESPONSE", "UNSUPPORTED_MESSAGE", "RETRY_LIMIT"];
  if (fatal.includes(replay.terminationReason)) {
    if (retained.filter((entry) => entry.retentionReason === "error").length < errorLimit) retained.push({ ...replay, retentionReason: "error" });
    return;
  }
  const interval = Math.max(1, Math.ceil(Math.max(1, total) / Math.max(1, sampleLimit)));
  if (index === 0 || index === total - 1 || index % interval === 0) {
    if (retained.filter((entry) => entry.retentionReason === "sample").length < sampleLimit) retained.push({ ...replay, retentionReason: "sample" });
  }
}

function runJobs(jobs, count) {
  const output = [];
  const limit = workers(count);
  return (async () => {
    for (let index = 0; index < jobs.length; index += limit) output.push(...await Promise.all(jobs.slice(index, index + limit).map((job) => job())));
    return output;
  })();
}

function candidateFromManifest(manifest, { seed = 1, training = false } = {}) {
  if (manifest?.algorithm === "ocgcore-monte-carlo-policy-gradient-v1") {
    return new LearnedPolicyBot({ ...manifest, randomState: seed, training });
  }
  return hydrateCoreBot(manifest);
}

function makeOpponent(deckId, index, { seed, snapshot = null, selfPlayRate = 0.3 } = {}) {
  const selector = (index * 17 + seed) % 100;
  if (snapshot && selector < selfPlayRate * 100) {
    const selfPlayDeckId = snapshot.deckId ?? deckId;
    const deck = getDeck(selfPlayDeckId);
    return new LearnedPolicyBot({
      ...snapshot,
      id: `self-play-${deckId}-${index}`,
      botId: `self-play-${deckId}`,
      name: `Snapshot ${deck.name}`,
      profile: selfPlayDeckId,
      deckId: selfPlayDeckId,
      randomState: seed ^ (index + 0x51ed270b),
      training: false,
      state: "Validado",
    });
  }
  const deck = getDeck(deckId);
  if (selector < (selfPlayRate + 0.15) * 100) return new CoreRandomBot({ id: `random-${deckId}-${index}`, name: `Random ${deck.name}`, profile: deckId, deckId, seed: seed + index });
  return new CoreHeuristicBot({ id: `heuristic-${deckId}-${index}`, name: `Rival ${deck.name}`, profile: deckId, deckId, difficulty: selector > 75 ? "hard" : "normal", state: "Validado" });
}

async function playTrainingGame({ candidateManifest, deckId, opponentDeckId, seed, index, snapshot, selfPlayRate = 0.3, maxSteps, suite = "training" } = {}) {
  const candidateDeck = getDeck(deckId);
  const candidate = candidateFromManifest(candidateManifest, { seed: seed ^ (index + 0x9e3779b9), training: true });
  const rival = makeOpponent(opponentDeckId, index, { seed, snapshot, selfPlayRate });
  const rivalDeckId = rival.deckId ?? opponentDeckId;
  const opponentDeck = getDeck(rivalDeckId);
  const result = await runOcgcoreHeadless({
    decks: [cardNames(candidateDeck.main), cardNames(opponentDeck.main)],
    extraDecks: [cardNames(candidateDeck.fusion), cardNames(opponentDeck.fusion)],
    seed,
    startingPlayer: index % 2,
    maxSteps,
    botA: candidate,
    botB: rival,
    profileA: deckId,
    profileB: rivalDeckId,
  });
  const episode = candidate.consumeEpisode();
  const reward = rewardForCoreResult(result);
  const replay = { ...result.replay, suite, opponentDeckId: rivalDeckId, sourceOpponentDeckId: opponentDeckId, candidateBotId: candidate.id, opponentBotId: rival.bot?.id ?? rival.id, gameIndex: index, reward };
  return { result, replay, episode, reward, opponentDeckId: rivalDeckId, index };
}

async function playEvaluationGame({ candidateManifest, deckId, opponentDeckId, seed, index, opponentKind = "heuristic", maxSteps, suite }) {
  const candidateDeck = getDeck(deckId);
  const opponentDeck = getDeck(opponentDeckId);
  const candidate = candidateFromManifest(candidateManifest, { seed: seed ^ (index + 0x31415926), training: false });
  const rival = opponentKind === "random"
    ? new CoreRandomBot({ id: `eval-random-${index}`, name: "Independent Random", profile: opponentDeckId, deckId: opponentDeckId, seed: seed + index })
    : new CoreHeuristicBot({ id: `eval-heuristic-${index}`, name: `Independent ${opponentDeck.name}`, profile: opponentDeckId, deckId: opponentDeckId, difficulty: "normal", state: "Validado" });
  const result = await runOcgcoreHeadless({
    decks: [cardNames(candidateDeck.main), cardNames(opponentDeck.main)],
    extraDecks: [cardNames(candidateDeck.fusion), cardNames(opponentDeck.fusion)],
    seed,
    startingPlayer: index % 2,
    maxSteps,
    botA: candidate,
    botB: rival,
    profileA: deckId,
    profileB: opponentDeckId,
  });
  return { ...result.replay, opponentDeckId, opponentBotId: rival.id, suite, index };
}

export async function evaluateLearnedPolicy({ candidate, deckId = "chaos-turbo", deckIds = DEFAULT_LEARNED_OPPONENT_DECKS, gamesPerDeck = 5, seed = 9000, maxSteps = 5000, workers: workerCount = 1, includeRandom = true, includeHeuristic = true, suite = "hidden-evaluation" } = {}) {
  if (!candidate) throw new Error("evaluateLearnedPolicy necesita un candidato.");
  const manifest = candidate.manifest ? candidate.manifest() : candidate;
  const kinds = [];
  if (includeHeuristic) kinds.push("heuristic");
  if (includeRandom) kinds.push("random");
  if (!kinds.length) kinds.push("heuristic");
  const jobs = [];
  let index = 0;
  for (const opponentDeckId of deckIds) for (const kind of kinds) for (let game = 0; game < Math.max(1, Number(gamesPerDeck) || 1); game += 1) {
    const gameIndex = index;
    jobs.push(() => playEvaluationGame({ candidateManifest: manifest, deckId, opponentDeckId, seed: seed + gameIndex, index: gameIndex, opponentKind: kind, maxSteps, suite }));
    index += 1;
  }
  const results = await runJobs(jobs, workerCount);
  const stats = duelStats(results, { sampleSeed: seed });
  return { engine: "ocgcore", suite, deckId, deckIds: [...deckIds], gamesPerDeck, results, stats, bySuite: { [suite]: stats } };
}

export async function trainLearnedPolicy({
  botName = "Self-Play Learner",
  botId = null,
  deckId = "chaos-turbo",
  opponentDeckIds = DEFAULT_LEARNED_OPPONENT_DECKS,
  validationDeckIds = ["warrior", "earth-aggro"],
  hiddenEvaluationDeckIds = ["panda-burn", "reasoning-gate", "empty-jar", "chaos-recruiter", "flip-control"],
  games = 10000,
  seed = 16000,
  checkpointEvery = 250,
  maxSteps = 5000,
  workers: workerCount = 1,
  onProgress = null,
  onCheckpoint = null,
  onGame = null,
  initialBot = null,
  opponentManifest = null,
  selfPlayRate = 0.3,
  startIndex = 0,
  abortSignal = null,
  parentModelId = null,
  resourceProfile = "intensive",
  replaySampleLimit = 64,
  errorReplayLimit = 32,
} = {}) {
  const id = botId ?? `${botName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "learner"}-policy`;
  const candidate = initialBot instanceof LearnedPolicyBot
    ? initialBot
    : new LearnedPolicyBot({ id, botId: botId ?? id, name: botName, profile: deckId, deckId, randomState: seed, state: "En entrenamiento" });
  candidate.training = true;
  candidate.state = "En entrenamiento";
  const totalGames = Math.max(0, Number(games) || 0);
  const parallelWorkers = workers(workerCount);
  const selfPlayProbability = Math.max(0, Math.min(1, Number(selfPlayRate) || 0));
  const opponentPool = Array.isArray(opponentDeckIds) && opponentDeckIds.length ? [...opponentDeckIds] : [...DEFAULT_LEARNED_OPPONENT_DECKS];
  const firstIndex = Math.max(0, Number(startIndex) || 0);
  const results = [];
  const metricRows = [];
  const retentionPolicy = { sampleLimit: Math.max(1, Number(replaySampleLimit) || 64), errorLimit: Math.max(1, Number(errorReplayLimit) || 32), keep: "deterministic-samples-and-errors" };
  let completed = firstIndex;
  let cancelled = false;
  const fixedOpponent = opponentManifest?.manifest ? opponentManifest.manifest() : opponentManifest;
  const startedAt = Date.now();
  for (let cursor = firstIndex; cursor < totalGames; cursor += parallelWorkers) {
    if (abortSignal?.aborted) { cancelled = true; break; }
    const indexes = Array.from({ length: Math.min(parallelWorkers, totalGames - cursor) }, (_, offset) => cursor + offset);
    const snapshot = candidate.manifest();
    const batch = await Promise.all(indexes.map((index) => playTrainingGame({
      candidateManifest: snapshot,
      deckId,
      opponentDeckId: opponentPool[index % opponentPool.length],
      seed: seed + index,
      index,
      snapshot: fixedOpponent ?? snapshot,
      selfPlayRate: selfPlayProbability,
      maxSteps,
    })));
    for (const game of batch) {
      candidate.learnFromEpisode(game.episode, game.reward);
      candidate.decisions += game.episode.length;
      metricRows.push(compactMetric(game.replay));
      retainReplay(game.replay, game.index, totalGames, results, retentionPolicy);
      completed = Math.max(completed, game.index + 1);
      onGame?.({ ...game, replay: game.replay }, { completed, total: totalGames, candidate: candidate.manifest(), workers: parallelWorkers });
    }
    const stats = duelStats(metricRows, { sampleLimit: 0, sampleSeed: seed });
    if (completed % Math.max(1, checkpointEvery) === 0 || completed === totalGames) {
      onProgress?.({ completed, total: totalGames, stats, manifest: candidate.manifest(), workers: parallelWorkers, speed: completed / Math.max(0.001, (Date.now() - startedAt) / 1000) });
      onCheckpoint?.({ schema: 1, engine: "ocgcore", algorithm: candidate.algorithm, completed, total: totalGames, seed, deckId, opponentDeckIds: [...opponentPool], candidate: candidate.manifest(), trainingStats: compactStats(stats), workers: parallelWorkers, createdAt: new Date().toISOString() });
    }
  }
  const trainingStats = duelStats(metricRows, { sampleLimit: 0, sampleSeed: seed });
  const retention = { ...retentionPolicy, totalGames: metricRows.length, retainedGames: results.length, discardedGames: Math.max(0, metricRows.length - results.length) };
  const plan = { engine: "ocgcore", algorithm: candidate.algorithm, deckId, opponentDeckIds: [...opponentPool], opponentModelId: fixedOpponent?.id ?? fixedOpponent?.botId ?? null, selfPlayRate: selfPlayProbability, validationDeckIds: [...validationDeckIds], hiddenEvaluationDeckIds: [...hiddenEvaluationDeckIds], games: totalGames, seed, checkpointEvery, workers: parallelWorkers, maxSteps, resourceProfile, retention, status: cancelled ? "CANCELLED" : completed >= totalGames ? "COMPLETED" : "IN_PROGRESS" };
  if (cancelled && completed < totalGames) {
    candidate.state = "Candidato";
    candidate.training = false;
    const empty = duelStats([]);
    const model = createModelManifest({ bot: candidate.manifest(), deckId, trainingPlan: plan, trainingStats, evaluation: empty, state: candidate.state, parentModelId });
    const pack = encodeDuelPack(results, { runId: `${candidate.id}-run-${seed}`, mode: "training", engine: "ocgcore", engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION, cardDatabaseVersion: CARD_DATABASE_VERSION });
    return { engine: "ocgcore", algorithm: candidate.algorithm, bot: candidate.manifest(), model, trainingPlan: plan, trainingStats, validation: empty, hiddenEvaluation: empty, evaluation: empty, evaluationDetails: null, results, retention, pack, completed, cancelled, learning: learnedPolicySummary(candidate) };
  }
  const evaluationGamesPerDeck = Math.max(2, Math.min(50, Math.ceil(Math.max(1, totalGames) / 100)));
  const validation = await evaluateLearnedPolicy({ candidate, deckId, deckIds: validationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 100, maxSteps, workers: parallelWorkers, includeRandom: false, suite: "validation" });
  const hiddenEvaluation = await evaluateLearnedPolicy({ candidate, deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 1000, maxSteps, workers: parallelWorkers, suite: "hidden-evaluation" });
  const baseline = await evaluateLearnedPolicy({ candidate: new CoreHeuristicBot({ id: "heuristic-baseline", name: "Heuristic baseline", profile: deckId, deckId, state: "Validado" }), deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: evaluationGamesPerDeck, seed: seed + totalGames + 1000, maxSteps, workers: parallelWorkers, includeRandom: true, suite: "baseline" });
  const comparison = compareEvaluations(hiddenEvaluation.stats, baseline.stats);
  candidate.training = false;
  candidate.state = comparison.regression ? "Degradado" : "Candidato";
  const strategyBank = evaluateStrategyBank(hydrateLearnedPolicy(candidate.manifest()), { scenarios: strategyBankForDeck(deckId, { knowledge: candidate.deckKnowledge }) });
  const finalPlan = { ...plan, strategyBankId: "goat-strategy-bank-v1", strategyBankScenarios: strategyBank.scenarios };
  const model = createModelManifest({ bot: candidate.manifest(), deckId, trainingPlan: finalPlan, trainingStats, evaluation: hiddenEvaluation.stats, state: candidate.state, parentModelId });
  const pack = encodeDuelPack(results, { runId: `${candidate.id}-run-${seed}`, mode: "training", engine: "ocgcore", engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION, cardDatabaseVersion: CARD_DATABASE_VERSION });
  return { engine: "ocgcore", algorithm: candidate.algorithm, bot: candidate.manifest(), model, trainingPlan: finalPlan, trainingStats, validation: validation.stats, hiddenEvaluation: hiddenEvaluation.stats, evaluation: hiddenEvaluation.stats, evaluationDetails: { validation, hiddenEvaluation, baseline, comparison }, strategyBank, results, retention, pack, completed, cancelled, learning: learnedPolicySummary(candidate) };
}

export { candidateFromManifest };

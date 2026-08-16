import { getCard } from "../engine/cards.js";
import { getDeck } from "../decks/decks.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { LearnedPolicyBot, hydrateLearnedPolicy } from "../bots/learned-policy.js";
import { evaluateStrategyBank, strategyBankForDeck } from "./strategy-bank.js";
import { evaluateLearnedPolicy, trainLearnedPolicy } from "./learned-training.js";
import { compareEvaluations } from "../evaluation/evaluation.js";
import { duelStats } from "../analytics/statistics.js";
import { markModel } from "../persistence/model-registry.js";

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }
function workers(value) { return Math.max(1, Math.min(6, Math.floor(Number(value) || 1))); }
function randomUnit(state) { let value = state.value >>> 0; value ^= value << 13; value ^= value >>> 17; value ^= value << 5; state.value = value >>> 0; return state.value / 0xffffffff; }
function learnedManifest(value) {
  const source = value?.champion ?? value;
  if (!source) return null;
  if (source.algorithm === "ocgcore-monte-carlo-policy-gradient-v1" && (source.featureWeights || source.parameters || source.model?.featureWeights)) {
    return source.model?.featureWeights && !source.featureWeights
      ? { ...source, ...source.model, id: source.id ?? source.botId, botId: source.botId ?? source.id }
      : source;
  }
  return null;
}
function mutateMap(source = {}, state, { probability = 0.18, scale = 0.22, minimum = -8, maximum = 8 } = {}) {
  const next = {};
  for (const [key, value] of Object.entries(source)) {
    const current = Number(value) || 0;
    const mutation = randomUnit(state) < probability ? (randomUnit(state) * 2 - 1) * scale * (Math.abs(current) + 0.25) : 0;
    next[key] = Math.max(minimum, Math.min(maximum, current + mutation));
  }
  return next;
}

function mutateScalar(value, state, { probability = 0.18, scale = 0.22, minimum = 0, maximum = 4 } = {}) {
  const current = Number(value) || 0;
  if (randomUnit(state) >= probability) return Math.max(minimum, Math.min(maximum, current));
  const next = current + (randomUnit(state) * 2 - 1) * scale * (Math.abs(current) + 0.25);
  return Math.max(minimum, Math.min(maximum, next));
}

export function mutateLearnedPolicy(parent, { generation = 1, seed = 1, mutationRate = 0.18, mutationScale = 0.22 } = {}) {
  const manifest = parent?.manifest ? parent.manifest() : parent ?? {};
  const state = { value: Number(seed) >>> 0 || 1 };
  const parentId = manifest.id ?? manifest.botId ?? "learned-policy";
  return new LearnedPolicyBot({
    ...manifest,
    id: `${manifest.botId ?? manifest.id ?? "learner"}-generation-${generation}`,
    botId: manifest.botId ?? manifest.id ?? "learner",
    name: `${manifest.name ?? "Self-Play Learner"} G${generation}`,
    state: "En entrenamiento",
    randomState: seed,
    featureWeights: mutateMap(manifest.featureWeights ?? manifest.parameters ?? {}, state, { probability: mutationRate, scale: mutationScale }),
    valueByFamily: mutateMap(manifest.valueByFamily ?? {}, state, { probability: mutationRate, scale: mutationScale * 0.5, minimum: -1, maximum: 1 }),
    strategyBiases: mutateMap(manifest.strategyBiases ?? {}, state, { probability: mutationRate, scale: mutationScale * 0.5, minimum: -4, maximum: 4 }),
    strategyWeight: mutateScalar(manifest.strategyWeight ?? 1.25, state, { probability: mutationRate, scale: mutationScale, minimum: 0, maximum: 4 }),
    temperature: mutateScalar(manifest.temperature ?? 0.85, state, { probability: mutationRate, scale: mutationScale * 0.35, minimum: 0.2, maximum: 2 }),
    training: true,
    parentModelId: parentId,
  });
}

async function headToHead({ challenger, champion, deckId, games = 100, seed = 50000, maxSteps = 5000, workers: workerCount = 1 } = {}) {
  const deck = getDeck(deckId);
  const jobs = Array.from({ length: Math.max(1, Number(games) || 1) }, (_, index) => async () => {
    const botA = hydrateLearnedPolicy({ ...challenger, randomState: seed ^ (index + 0x9e3779b9) });
    const botB = hydrateLearnedPolicy({ ...champion, randomState: seed ^ (index + 0x51ed270b) });
    const result = await runOcgcoreHeadless({
      decks: [cardNames(deck.main), cardNames(deck.main)],
      extraDecks: [cardNames(deck.fusion), cardNames(deck.fusion)],
      seed: seed + index,
      startingPlayer: index % 2,
      maxSteps,
      botA,
      botB,
      profileA: deckId,
      profileB: deckId,
    });
    return { ...result.replay, suite: "head-to-head", generationGame: index };
  });
  const results = [];
  const limit = workers(workerCount);
  for (let index = 0; index < jobs.length; index += limit) results.push(...await Promise.all(jobs.slice(index, index + limit).map((job) => job())));
  return { games: results.length, results, stats: duelStats(results, { sampleSeed: seed }) };
}

async function compareAgainstChampion({ challenger, champion, deckId, hiddenEvaluationDeckIds, hiddenGamesPerDeck, seed, maxSteps, workers: workerCount }) {
  const hidden = await evaluateLearnedPolicy({ candidate: hydrateLearnedPolicy(challenger), deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: hiddenGamesPerDeck, seed, maxSteps, workers: workerCount, includeRandom: true, suite: "league-hidden" });
  const championHidden = await evaluateLearnedPolicy({ candidate: hydrateLearnedPolicy(champion), deckId, deckIds: hiddenEvaluationDeckIds, gamesPerDeck: hiddenGamesPerDeck, seed, maxSteps, workers: workerCount, includeRandom: true, suite: "league-champion-hidden" });
  const challengerBot = hydrateLearnedPolicy(challenger);
  const championBot = hydrateLearnedPolicy(champion);
  const strategy = evaluateStrategyBank(challengerBot, { scenarios: strategyBankForDeck(deckId, { knowledge: challengerBot.deckKnowledge }) });
  const championStrategy = evaluateStrategyBank(championBot, { scenarios: strategyBankForDeck(deckId, { knowledge: championBot.deckKnowledge }) });
  return { hidden, championHidden, hiddenComparison: compareEvaluations(hidden.stats, championHidden.stats, { regressionThreshold: 0 }), strategy, championStrategy };
}

function qualification({ headToHead, comparison, strategy, championStrategy, baselineComparison, minimumHeadToHeadGames, minimumHiddenGames, minimumHeadToHeadDelta, minimumHeadToHeadConfidence, minimumStrategyScore, maxHiddenRegression }) {
  const headDelta = Number(headToHead.stats?.winRate ?? 0) - 0.5;
  const headConfidenceLow = Number(headToHead.stats?.confidence95?.low ?? 0);
  const enough = Number(headToHead.stats?.games ?? 0) >= minimumHeadToHeadGames;
  const fatal = ["INVALID_ACTION", "UNSUPPORTED_RESPONSE", "UNSUPPORTED_MESSAGE", "RETRY_LIMIT", "DECISION_LIMIT"];
  const clean = (stats) => Number(stats?.games ?? 0) > 0 && Number(stats?.invalid ?? 0) === 0 && fatal.every((reason) => Number(stats?.termination?.[reason] ?? 0) === 0);
  const noInvalid = clean(headToHead.stats) && clean(comparison.hidden?.stats);
  const hiddenGames = Number(comparison.hidden?.stats?.games ?? 0);
  const hiddenCovered = hiddenGames >= Math.max(1, Number(minimumHiddenGames) || 1);
  const beatsChampion = headDelta >= minimumHeadToHeadDelta && headConfidenceLow >= Number(minimumHeadToHeadConfidence);
  const noHiddenRegression = Number(comparison.hiddenComparison?.delta ?? 0) >= -Math.abs(maxHiddenRegression);
  const strategyFloor = Math.max(Number(minimumStrategyScore) || 0, Number(championStrategy?.score ?? 0));
  const strategicEnough = Number(strategy?.score ?? 0) >= strategyFloor;
  const baselineSafe = !baselineComparison?.regression;
  return { promoted: enough && hiddenCovered && noInvalid && beatsChampion && noHiddenRegression && strategicEnough && baselineSafe, enough, hiddenGames, hiddenCovered, noInvalid, headDelta, headConfidenceLow, beatsChampion, noHiddenRegression, strategicEnough, baselineSafe, reason: !enough ? "INSUFFICIENT_HEAD_TO_HEAD" : !hiddenCovered ? "INSUFFICIENT_HIDDEN_EVAL" : !noInvalid ? "UNSAFE_TERMINATION" : !beatsChampion ? "DID_NOT_BEAT_CHAMPION_WITH_CONFIDENCE" : !noHiddenRegression ? "HIDDEN_REGRESSION" : !strategicEnough ? "STRATEGY_BANK_REGRESSION" : !baselineSafe ? "BASELINE_REGRESSION" : "PROMOTED" };
}

/** Evolves one deck as a champion/challenger league without replacing the champion on weak evidence. */
export async function evolveLearnedPolicy({
  botName = "Self-Play Learner",
  botId = "self-play-learner",
  deckId = "chaos-turbo",
  generations = 10,
  gamesPerGeneration = 1000,
  headToHeadGames = 200,
  hiddenGamesPerDeck = 10,
  minimumHiddenGames = 50,
  opponentDeckIds = ["goat-control", "chaos-control", "warrior", "panda-burn", "reasoning-gate", "earth-aggro", "empty-jar", "chaos-recruiter", "flip-control"],
  hiddenEvaluationDeckIds = ["panda-burn", "reasoning-gate", "empty-jar", "chaos-recruiter", "flip-control"],
  seed = 70000,
  workers: workerCount = 1,
  maxSteps = 5000,
  checkpointEvery = 250,
  mutationRate = 0.18,
  mutationScale = 0.22,
  selfPlayRate = 0.5,
  minimumHeadToHeadGames = 100,
  minimumHeadToHeadDelta = 0.05,
  minimumHeadToHeadConfidence = 0.5,
  maxHiddenRegression = 0,
  minimumStrategyScore = 0.75,
  initialBot = null,
  parentModelId = null,
  abortSignal = null,
  onProgress = null,
  onGeneration = null,
  onCheckpoint = null,
} = {}) {
  const additionalGenerations = Math.max(0, Number(generations) || 0);
  const sourceLeague = initialBot?.champion ? initialBot : null;
  const initialCompletedGenerations = Math.max(0, Number(sourceLeague?.completedGenerations) || 0);
  const targetCompletedGenerations = initialCompletedGenerations + additionalGenerations;
  const leagueConfig = {
    additionalGenerations,
    gamesPerGeneration,
    headToHeadGames,
    hiddenGamesPerDeck,
    minimumHiddenGames,
    opponentDeckIds: [...opponentDeckIds],
    hiddenEvaluationDeckIds: [...hiddenEvaluationDeckIds],
    seed,
    workers: workerCount,
    maxSteps,
    checkpointEvery,
    mutationRate,
    mutationScale,
    selfPlayRate,
    minimumHeadToHeadGames,
    minimumHeadToHeadDelta,
    minimumHeadToHeadConfidence,
    maxHiddenRegression,
    minimumStrategyScore,
  };
  const initialManifest = initialBot instanceof LearnedPolicyBot ? initialBot.manifest() : learnedManifest(initialBot);
  let champion = initialBot instanceof LearnedPolicyBot
    ? initialBot
    : initialManifest
      ? hydrateLearnedPolicy({ ...initialManifest, profile: deckId, deckId, training: false })
      : new LearnedPolicyBot({ id: `${botId}-champion`, botId, name: botName, profile: deckId, deckId, randomState: seed, training: false, state: "Candidato" });
  champion.training = false;
  if (champion.strategyCompatibility && !champion.strategyCompatibility.compatible) throw new Error(`El champion no es compatible con ${deckId}: ${champion.strategyCompatibility.errors.join("; ")}`);
  let championManifest = champion.manifest();
  let championModelId = parentModelId ?? sourceLeague?.championModelId ?? initialManifest?.id ?? `${botId}-strategy-seed`;
  const archive = Array.isArray(sourceLeague?.archive) ? structuredClone(sourceLeague.archive) : [];
  const history = Array.isArray(sourceLeague?.generations) ? structuredClone(sourceLeague.generations) : [];
  let completedGenerations = initialCompletedGenerations;
  for (let generation = initialCompletedGenerations + 1; generation <= targetCompletedGenerations; generation += 1) {
    if (abortSignal?.aborted) break;
    const challenger = mutateLearnedPolicy(championManifest, { generation, seed: seed + generation * 1009, mutationRate, mutationScale });
    const run = await trainLearnedPolicy({ botName: challenger.name, botId: challenger.botId, deckId, opponentDeckIds, hiddenEvaluationDeckIds, games: gamesPerGeneration, seed: seed + generation * 1009, checkpointEvery, workers: workerCount, maxSteps, initialBot: challenger, opponentManifest: championManifest, selfPlayRate, parentModelId: championModelId, resourceProfile: "intensive" });
    const challengerManifest = run.bot;
    const head = await headToHead({ challenger: challengerManifest, champion: championManifest, deckId, games: headToHeadGames, seed: seed + generation * 2003, maxSteps, workers: workerCount });
    const comparison = await compareAgainstChampion({ challenger: challengerManifest, champion: championManifest, deckId, hiddenEvaluationDeckIds, hiddenGamesPerDeck, seed: seed + generation * 3001, maxSteps, workers: workerCount });
    const gate = qualification({ headToHead: head, comparison, strategy: comparison.strategy, championStrategy: comparison.championStrategy, baselineComparison: run.evaluationDetails?.comparison, minimumHeadToHeadGames, minimumHiddenGames, minimumHeadToHeadDelta, minimumHeadToHeadConfidence, minimumStrategyScore, maxHiddenRegression });
    const archivedModel = gate.promoted ? markModel(run.model, "Validado") : run.model;
    const entry = { generation, parentModelId: championModelId, challengerModelId: run.model?.id ?? null, training: { games: run.trainingStats.games, winRate: run.trainingStats.winRate, invalid: run.trainingStats.invalid }, headToHead: head.stats, hidden: comparison.hidden.stats, championHidden: comparison.championHidden.stats, hiddenComparison: comparison.hiddenComparison, baselineComparison: run.evaluationDetails?.comparison ?? null, strategy: comparison.strategy, championStrategy: comparison.championStrategy, qualification: gate, model: archivedModel };
    archive.push(archivedModel);
    history.push(entry);
    completedGenerations = generation;
    if (gate.promoted) {
      championManifest = { ...challengerManifest, state: "Validado" };
      champion = hydrateLearnedPolicy(championManifest);
      champion.training = false;
      championModelId = run.model?.id ?? challengerManifest.id;
    }
    onProgress?.({ generation, generations: targetCompletedGenerations, promoted: gate.promoted, champion: championManifest, challenger: challengerManifest, qualification: gate });
    onGeneration?.(entry, { champion: championManifest, completedGenerations });
    onCheckpoint?.({ schema: 1, algorithm: "ocgcore-evolutionary-league-v1", botId, botName, deckId, completedGenerations, generations: history, champion: championManifest, championModelId, archive, config: leagueConfig, status: "IN_PROGRESS" });
  }
  return { schema: 1, algorithm: "ocgcore-evolutionary-league-v1", botId, botName, deckId, completedGenerations, generations: history, champion: championManifest, championModelId, archive, config: leagueConfig, status: completedGenerations >= targetCompletedGenerations ? "COMPLETED" : "CANCELLED" };
}

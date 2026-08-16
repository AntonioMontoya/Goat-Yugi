import { runDuel } from "../engine/game.js";
import { getDeck } from "../decks/decks.js";
import { HeuristicBot } from "../bots/heuristic.js";
import { LegalRandomBot } from "../bots/random.js";
import { duelStats } from "../analytics/statistics.js";

const DEFAULT_DECKS = [
  "chaos-turbo", "goat-control", "chaos-control", "warrior", "panda-burn",
  "reasoning-gate", "earth-aggro", "empty-jar", "chaos-recruiter", "flip-control"
];

function makeOpponent(kind, { name, seed, difficulty = "normal" } = {}) {
  if (kind === "random") return new LegalRandomBot({ name, seed });
  return new HeuristicBot({ name, seed, difficulty });
}

function opponentKinds(includeRandom, includeHeuristic) {
  const kinds = [];
  if (includeRandom) kinds.push("random");
  if (includeHeuristic) kinds.push("heuristic");
  return kinds.length ? kinds : ["heuristic"];
}

function bySuite(results) {
  const groups = {};
  for (const result of results) (groups[result.suite] ??= []).push(result);
  return Object.fromEntries(Object.entries(groups).map(([suite, suiteResults]) => [suite, duelStats(suiteResults)]));
}

/**
 * Evaluates a candidate against independent opponent instances. This function
 * never calls updateFromOutcome, so the candidate cannot learn from the
 * validation or hidden-evaluation sets.
 */
export function evaluateCandidate({
  candidate,
  deckId = "chaos-turbo",
  deckIds = DEFAULT_DECKS,
  gamesPerDeck = 5,
  seed = 1000,
  includeRandom = true,
  includeHeuristic = true,
  suite = "hidden-evaluation"
} = {}) {
  if (!candidate) throw new Error("evaluateCandidate necesita un bot candidato.");
  const candidateDeck = getDeck(deckId);
  const results = [];
  let index = 0;
  for (const opponentDeckId of deckIds) {
    const opponentDeck = getDeck(opponentDeckId);
    for (const kind of opponentKinds(includeRandom, includeHeuristic)) {
      for (let game = 0; game < gamesPerDeck; game += 1) {
        const gameSeed = seed + index;
        const rival = makeOpponent(kind, { name: `${kind}-${opponentDeck.name}`, seed: gameSeed + 17, difficulty: kind === "random" ? "easy" : "normal" });
        const result = runDuel(candidateDeck.main, opponentDeck.main, candidate, rival, { seed: gameSeed, startingPlayer: index % 2 });
        results.push({ ...result, opponentDeckId, opponentBotId: kind, suite, startingPlayer: index % 2 });
        index += 1;
      }
    }
  }
  const stats = duelStats(results, { sampleSeed: seed });
  return { suite, deckId, deckIds: [...deckIds], gamesPerDeck, results, stats, bySuite: bySuite(results) };
}

export function compareEvaluations(candidateStats, baselineStats, { regressionThreshold = 0.05 } = {}) {
  const candidateWinRate = Number(candidateStats?.winRate ?? 0);
  const baselineWinRate = Number(baselineStats?.winRate ?? 0);
  const delta = candidateWinRate - baselineWinRate;
  const invalid = Number(candidateStats?.invalid ?? 0);
  return {
    candidateWinRate,
    baselineWinRate,
    delta,
    invalid,
    regression: invalid > 0 || delta < -Math.abs(regressionThreshold),
    status: invalid > 0 ? "FAILED_REGRESSION" : delta < -Math.abs(regressionThreshold) ? "DEGRADED" : "CANDIDATE"
  };
}

export { DEFAULT_DECKS };

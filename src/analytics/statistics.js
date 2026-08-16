import { hashString } from "../engine/rng.js";

function asReplay(result) {
  if (result?.replay) return result.replay;
  if (result?.engine === "ocgcore" && Array.isArray(result?.decisionTrace)) return result;
  if (Array.isArray(result?.actions) && Object.prototype.hasOwnProperty.call(result, "result")) return result;
  return null;
}

function winnerOf(result, replay) {
  if (Object.prototype.hasOwnProperty.call(result ?? {}, "winner")) return result.winner;
  return replay?.result ?? null;
}

function resultOf(result, replay) {
  return result.terminationReason ?? replay?.terminationReason ?? "UNKNOWN";
}

function numberOf(result, replay, key) {
  const value = key === "decisions"
    ? result[key] ?? result.decisionCount ?? replay?.[key] ?? replay?.decisionCount ?? 0
    : result[key] ?? replay?.[key] ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function incrementBucket(bucket, key, winner, perspective) {
  const row = bucket[key] ??= { games: 0, wins: 0, losses: 0, draws: 0 };
  row.games += 1;
  if (winner === perspective) row.wins += 1;
  else if (winner === null || winner === undefined) row.draws += 1;
  else row.losses += 1;
}

export function confidenceInterval95(wins, games) {
  const n = Number(games);
  if (!n) return { low: 0, high: 0, margin: 0, level: 0.95 };
  const p = Math.max(0, Math.min(1, Number(wins) / n));
  const z = 1.96;
  const denominator = 1 + (z ** 2 / n);
  const centre = (p + (z ** 2 / (2 * n))) / denominator;
  const spread = (z / denominator) * Math.sqrt((p * (1 - p) / n) + (z ** 2 / (4 * n ** 2)));
  const low = Math.max(0, centre - spread);
  const high = Math.min(1, centre + spread);
  return { low, high, margin: (high - low) / 2, level: 0.95 };
}

function sampleResult(samples, candidate, index, limit, seed) {
  if (!candidate || limit <= 0) return;
  if (candidate.terminationReason === "INVALID_ACTION" || candidate.invalidAction) {
    samples.push(candidate);
    return;
  }
  if (samples.length < limit) {
    samples.push(candidate);
    return;
  }
  const slot = Number.parseInt(hashString(`${seed}:${index}:${candidate.seed ?? ""}`), 16) % (index + 1);
  if (slot < limit) samples[slot] = candidate;
}

/**
 * Incremental-friendly result aggregation. It accepts both runDuel results
 * and compact replay records, so storage and tournament callers cannot drift
 * into different definitions of a win or an invalid action.
 */
export function duelStats(results = [], { perspective = 0, sampleLimit = 50, sampleSeed = 1 } = {}) {
  const stats = {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    turns: 0,
    decisions: 0,
    invalid: 0,
    termination: {},
    byOpponent: {},
    byStartingPlayer: {},
    actionTypes: {},
    errors: {},
    samples: []
  };

  results.forEach((result, index) => {
    const replay = asReplay(result);
    const winner = winnerOf(result, replay);
    const terminationReason = resultOf(result, replay);
    const turns = numberOf(result, replay, "turns");
    const decisions = numberOf(result, replay, "decisions");
    const opponentDeckId = result.opponentDeckId ?? replay?.opponentDeckId ?? "unknown";
    const startingPlayer = String(result.startingPlayer ?? replay?.startingPlayer ?? "unknown");
    stats.games += 1;
    if (winner === perspective) stats.wins += 1;
    else if (winner === null || winner === undefined) stats.draws += 1;
    else stats.losses += 1;
    stats.turns += turns;
    stats.decisions += decisions;
    stats.termination[terminationReason] = (stats.termination[terminationReason] ?? 0) + 1;
    if (terminationReason === "INVALID_ACTION") stats.invalid += 1;
    if (result.invalidAction?.message) stats.errors[result.invalidAction.message] = (stats.errors[result.invalidAction.message] ?? 0) + 1;
    incrementBucket(stats.byOpponent, opponentDeckId, winner, perspective);
    incrementBucket(stats.byStartingPlayer, startingPlayer, winner, perspective);
    for (const entry of replay?.actions ?? []) {
      const type = entry.action?.type ?? "UNKNOWN";
      stats.actionTypes[type] = (stats.actionTypes[type] ?? 0) + 1;
    }
    for (const entry of replay?.decisionTrace ?? []) {
      const type = `CORE_${entry.messageType ?? "UNKNOWN"}`;
      stats.actionTypes[type] = (stats.actionTypes[type] ?? 0) + 1;
    }
    sampleResult(stats.samples, replay ?? result, index, sampleLimit, sampleSeed);
  });

  stats.winRate = stats.games ? stats.wins / stats.games : 0;
  stats.confidence95 = confidenceInterval95(stats.wins, stats.games);
  stats.averageTurns = stats.games ? stats.turns / stats.games : 0;
  stats.averageDecisions = stats.games ? stats.decisions / stats.games : 0;
  stats.sampleCount = stats.samples.length;
  return stats;
}

export function compactStats(stats = {}) {
  const { samples: _samples, ...summary } = stats;
  return { ...summary, sampleCount: stats.samples?.length ?? stats.sampleCount ?? 0 };
}

export function mergeDuelStats(left, right) {
  const combined = [];
  for (const stats of [left, right]) {
    if (!stats) continue;
    for (const sample of stats.samples ?? []) combined.push(sample);
  }
  return duelStats(combined, { sampleLimit: Math.max(left?.sampleCount ?? 0, right?.sampleCount ?? 0, 50) });
}

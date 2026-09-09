const VALID_TERMINATIONS = new Set(["WIN", "CORE_END"]);

export function inspectOcgcoreRun(run = {}) {
  const reasons = [];
  const terminationReason = String(run.terminationReason ?? run.replay?.terminationReason ?? "UNKNOWN");
  if (!VALID_TERMINATIONS.has(terminationReason)) reasons.push(`termination:${terminationReason}`);
  if ((run.retryLog?.length ?? 0) > 0) reasons.push(`engine-retries:${run.retryLog.length}`);
  if ((run.errors?.length ?? 0) > 0) reasons.push(`engine-errors:${run.errors.length}`);
  if (run.completed !== true && terminationReason !== "CORE_END") reasons.push("not-completed");
  return { valid: reasons.length === 0, reasons, terminationReason };
}

export function invalidReasonCounts(inspections = []) {
  const counts = {};
  for (const inspection of inspections) for (const reason of inspection.reasons ?? []) counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}

export function validateBotObservation(obs) {
  if (!obs || typeof obs !== "object") {
    return { valid: false, reason: "OBSERVATION_INVALID", missingField: "root" };
  }
  const numericFields = ["player", "turn", "ownLp", "opponentLp", "ownDeckSize", "opponentDeckSize", "handSize", "opponentHandSize"];
  for (const field of numericFields) {
    if (!Number.isFinite(Number(obs[field]))) {
      return { valid: false, reason: "OBSERVATION_INVALID", missingField: field };
    }
  }
  const arrayFields = ["ownMonsters", "ownBackrow", "opponentMonsters", "opponentBackrow", "graveyard", "banished", "publicChain"];
  for (const field of arrayFields) {
    if (!Array.isArray(obs[field])) {
      return { valid: false, reason: "OBSERVATION_INVALID", missingField: field };
    }
  }
  return { valid: true, reason: null };
}

export function resolveRunOutcome(run, candidateSeat = 0) {
  const inspection = inspectOcgcoreRun(run);
  if (!inspection.valid) {
    return { valid: false, outcome: "invalid", terminationReason: inspection.terminationReason, reasons: inspection.reasons };
  }
  const winner = run.winner;
  if (winner === candidateSeat) {
    return { valid: true, outcome: "win", terminationReason: inspection.terminationReason, reasons: [] };
  }
  if (winner === (1 - candidateSeat)) {
    return { valid: true, outcome: "loss", terminationReason: inspection.terminationReason, reasons: [] };
  }
  if (winner === 2 || (winner === null && inspection.terminationReason === "CORE_END")) {
    return { valid: true, outcome: "draw", terminationReason: inspection.terminationReason, reasons: [] };
  }
  return { valid: false, outcome: "invalid", terminationReason: "AMBIGUOUS_WINNER", reasons: ["ambiguous-winner"] };
}

export { VALID_TERMINATIONS };


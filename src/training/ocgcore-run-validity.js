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

export { VALID_TERMINATIONS };

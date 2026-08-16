function finite(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

export function summarizePolicyValidation(suites = []) {
  const rows = suites.map((entry) => ({
    seed: Number(entry.seed) || 0,
    games: Math.max(0, Number(entry.games) || 0),
    wins: Math.max(0, Number(entry.wins) || 0),
    invalid: Math.max(0, Number(entry.invalid) || 0),
    winRate: finite(entry.winRate),
  }));
  const games = rows.reduce((sum, entry) => sum + entry.games, 0);
  const wins = rows.reduce((sum, entry) => sum + entry.wins, 0);
  const invalid = rows.reduce((sum, entry) => sum + entry.invalid, 0);
  const rates = rows.map((entry) => entry.winRate);
  const winRate = games ? wins / games : 0;
  const worstWinRate = rates.length ? Math.min(...rates) : 0;
  const bestWinRate = rates.length ? Math.max(...rates) : 0;
  return {
    suites: rows,
    games,
    wins,
    invalid,
    winRate,
    worstWinRate,
    bestWinRate,
    spread: bestWinRate - worstWinRate,
    // The stability penalty prevents one unusually favorable seed suite from
    // disguising a policy that regresses elsewhere.
    selectionScore: winRate - (bestWinRate - worstWinRate) * 0.15,
  };
}

export function policyBeatsIncumbent(challenger, incumbent, { minimumGain = 0.01, maximumSuiteRegression = 0.04 } = {}) {
  if (!challenger || challenger.invalid !== 0 || !challenger.games) return false;
  if (!incumbent || incumbent.invalid !== 0 || !incumbent.games) return true;
  const challengerSuites = challenger.suites ?? [];
  const incumbentBySeed = new Map((incumbent.suites ?? []).map((entry) => [Number(entry.seed), entry]));
  const paired = challengerSuites.map((entry) => [entry, incumbentBySeed.get(Number(entry.seed))]).filter(([, other]) => other);
  const nonRegressing = paired.filter(([entry, other]) => entry.winRate + maximumSuiteRegression >= other.winRate).length;
  const suiteWins = paired.filter(([entry, other]) => entry.winRate >= other.winRate).length;
  const requiredSuites = Math.max(1, Math.ceil(paired.length / 2));
  return challenger.winRate >= incumbent.winRate + minimumGain
    && challenger.selectionScore > incumbent.selectionScore
    && (!paired.length || (nonRegressing === paired.length && suiteWins >= requiredSuites));
}

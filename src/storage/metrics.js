export class OnlineMetrics {
  constructor() {
    this.games = 0;
    this.wins = 0;
    this.losses = 0;
    this.draws = 0;
    this.turns = { count: 0, mean: 0, m2: 0 };
    this.decisions = { count: 0, mean: 0, m2: 0 };
    this.errors = {};
    this.matchups = {};
    this.termination = {};
  }

  add(result, { perspective = 0, matchup = "unknown" } = {}) {
    this.games += 1;
    if (result.winner === perspective) this.wins += 1;
    else if (result.winner === null) this.draws += 1;
    else this.losses += 1;
    this.addNumber(this.turns, result.turns);
    this.addNumber(this.decisions, result.decisions);
    this.termination[result.terminationReason] = (this.termination[result.terminationReason] ?? 0) + 1;
    if (result.terminationReason === "INVALID_ACTION") this.errors.invalidAction = (this.errors.invalidAction ?? 0) + 1;
    this.matchups[matchup] ??= { games: 0, wins: 0, losses: 0, draws: 0 };
    this.matchups[matchup].games += 1;
    if (result.winner === perspective) this.matchups[matchup].wins += 1;
    else if (result.winner === null) this.matchups[matchup].draws += 1;
    else this.matchups[matchup].losses += 1;
  }

  addNumber(accumulator, value) {
    accumulator.count += 1;
    const delta = value - accumulator.mean;
    accumulator.mean += delta / accumulator.count;
    accumulator.m2 += delta * (value - accumulator.mean);
  }

  snapshot() {
    return {
      games: this.games, wins: this.wins, losses: this.losses, draws: this.draws,
      winRate: this.games ? this.wins / this.games : 0,
      averageTurns: this.turns.mean, averageDecisions: this.decisions.mean,
      turnVariance: this.turns.count > 1 ? this.turns.m2 / (this.turns.count - 1) : 0,
      decisionVariance: this.decisions.count > 1 ? this.decisions.m2 / (this.decisions.count - 1) : 0,
      errors: { ...this.errors }, termination: { ...this.termination }, matchups: structuredClone(this.matchups)
    };
  }
}

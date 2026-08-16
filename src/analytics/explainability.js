function topRows(bucket = {}, limit = 3) {
  return Object.entries(bucket)
    .map(([key, value]) => ({ key, ...value, winRate: value.games ? value.wins / value.games : 0 }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * Produces only evidence-backed summaries. It never invents a strategic
 * explanation when the sample is too small; callers can render the facts and
 * the confidence interval directly.
 */
export function explainStats(stats = {}, { limit = 3 } = {}) {
  const games = Number(stats.games) || 0;
  const confidence = stats.confidence95 ?? { low: 0, high: 0, margin: 0 };
  const facts = games
    ? [`${stats.wins ?? 0}/${games} victorias (${Math.round((stats.winRate ?? 0) * 100)}%)`, `Intervalo 95%: ${Math.round((confidence.low ?? 0) * 100)}-${Math.round((confidence.high ?? 0) * 100)}%`, `${stats.invalid ?? 0} acciones invalidas`]
    : ["Sin partidas suficientes para inferir un patron."];
  return {
    games,
    facts,
    confidence95: confidence,
    topOpponents: topRows(stats.byOpponent, limit),
    topStartingPlayers: topRows(stats.byStartingPlayer, limit),
    actionTypes: topRows(Object.fromEntries(Object.entries(stats.actionTypes ?? {}).map(([key, value]) => [key, { games: value, wins: value, losses: 0, draws: 0 }])), limit),
    caution: games < 30 ? "Muestra pequena: no tratar las diferencias como una tendencia estable." : "Los patrones siguen siendo descriptivos; no prueban causalidad."
  };
}

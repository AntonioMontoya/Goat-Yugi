export function duelResultMarkup(view, { app, esc, duelBotName }) {
  if (view.winner === null || view.winner === undefined || app.resultDismissed) return "";
  const manual = Boolean(app.duelManual || view.manual);
  const won = view.winner === 0;
  const drew = view.winner !== 0 && view.winner !== 1;
  const opponentName = duelBotName(view);
  const match = app.pendingLadder?.match;
  const score = match ? `${match.playerWins}-${match.opponentWins}` : null;
  const nextSeriesGame = Boolean(match && !match.completed);
  const outcome = drew ? "EMPATE" : manual ? (won ? "JUGADOR 1 GANA" : "JUGADOR 2 GANA") : (won ? "VICTORIA" : "DERROTA");
  const modeLabel = app.pendingLadder?.mode === "practice" ? "PARTIDA DE PRÁCTICA" : match ? `SERIE BO${match.bestOf} · ${score}` : app.pendingLadder ? "DUELO PUNTUABLE · LADDER" : "DUELO LOCAL";
  const detail = drew ? "Ambos jugadores terminan sin un vencedor." : manual ? `La partida termina con el ${won ? "primer" : "segundo"} asiento en pie.` : won ? `Has derrotado a ${opponentName}.` : `${opponentName} te ha derrotado.`;
  return `<div class="duel-result result-${drew ? "draw" : won ? "win" : "loss"}" data-testid="duel-result" role="dialog" aria-modal="true" aria-label="${esc(outcome)}"><div class="duel-result-card"><span class="result-eyebrow">${esc(modeLabel)} · TURNO ${String(view.turn ?? 1).padStart(2, "0")}</span><h2 class="result-title">${esc(outcome)}</h2><p class="result-detail">${esc(detail)}</p><div class="result-lp-grid"><div><span>${manual ? "JUGADOR 1" : "TÚ"}</span><b>${view.players[0].lp.toLocaleString("es-ES")}</b></div><div class="result-vs">VS</div><div><span>${manual ? "JUGADOR 2" : esc(opponentName)}</span><b>${view.players[1].lp.toLocaleString("es-ES")}</b></div></div><div class="result-meta"><span>DECISIONES ${view.decisionCount ?? 0}</span><span>SEMILLA ${view.seed ?? "—"}</span></div><div class="result-actions">${nextSeriesGame ? `<button class="primary-button" data-action="next-series-game">Siguiente partida</button>` : ""}<button class="primary-button" data-action="new-duel">Nueva partida</button><button class="ghost-button" data-action="open-play">Preparar otra partida</button><button class="text-button" data-action="view-result-board">Ver tablero</button></div>${nextSeriesGame ? `<p class="result-note">La serie va ${match.playerWins}-${match.opponentWins}. Puedes ajustar el side deck en el panel inferior.</p>` : ""}</div></div>`;
}

export function duelStartOverlayMarkup(start, { esc }) {
  if (!start?.open) return "";
  const configured = start.configured === true;
  const winnerName = Number(start.winner) === 0 ? "Tú" : "el Rival";
  const title = configured ? `Comienza ${winnerName}` : `${start.side}: comienza ${winnerName}`;
  const detail = configured
    ? "El escenario conserva el asiento inicial que elegiste en el editor."
    : Number(start.winner) === 0
      ? "Has ganado el lanzamiento de moneda y recibirás el primer turno."
      : "El rival ha ganado el lanzamiento de moneda y jugará el primer turno.";
  return `<div class="duel-start-overlay" data-testid="duel-start-overlay" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="duel-start-card"><span class="start-eyebrow">${configured ? "INICIATIVA DEL ESCENARIO" : "LANZAMIENTO INICIAL"}</span><div class="duel-coin ${start.side === "CRUZ" ? "tails" : "heads"}"><img src="./sprites/Sprite_ornamentacion4.png" alt="" aria-hidden="true" /><i></i><b>${configured ? start.winner + 1 : start.side === "CARA" ? "C" : "X"}</b></div><h2>${esc(title)}</h2><p>${esc(detail)}</p><button type="button" class="primary-button" data-duel-start-continue>Entrar al duelo</button></div></div>`;
}

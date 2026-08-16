export function sortWindowKey(view) {
  if (!view?.sort?.cards?.length) return null;
  return `${view.pendingType}:${view.priorityPlayer}:${view.decisionCount}:${view.sort.cards.map((card) => `${card.index}:${card.cardCode}`).join("|")}`;
}

export function syncSortState(state, view) {
  const key = sortWindowKey(view);
  if (!key) return { key: null, order: [] };
  if (state?.key === key && state.order?.length === view.sort.cards.length) return state;
  return { key, order: view.sort.cards.map((card) => Number(card.index)) };
}

export function moveSortedCard(state, position, direction) {
  const order = [...(state?.order ?? [])];
  const from = Number(position);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || from >= order.length || to < 0 || to >= order.length) return state;
  [order[from], order[to]] = [order[to], order[from]];
  return { ...state, order };
}

export function sortActionFor(view, state) {
  const order = [...(state?.order ?? [])].map(Number);
  if (!view?.sort || order.length !== view.sort.cards.length || new Set(order).size !== order.length) return null;
  return {
    label: `Confirmar orden: ${order.map((index) => view.sort.cards.find((card) => Number(card.index) === index)?.cardName ?? index + 1).join(" → ")}`,
    actionKind: "sort-card",
    coreResponse: { type: view.sort.responseType, order },
  };
}

export function renderSortCardModal({ view, state, esc, cardMarkup, registerAction }) {
  if (!view?.sort?.cards?.length) return "";
  const synced = syncSortState(state, view);
  const cards = synced.order.map((originalIndex, position) => {
    const card = view.sort.cards.find((candidate) => Number(candidate.index) === Number(originalIndex));
    if (!card) return "";
    return `<li class="sort-card-item"><span class="sort-position">${position + 1}</span><span class="sort-card-visual">${cardMarkup({ cardId: card.cardId, faceUp: Boolean(card.cardId), location: card.location }, { compact: true })}</span><span><strong>${esc(card.cardName)}</strong><small>${esc(card.locationName)}</small></span><span class="sort-controls"><button type="button" data-sort-position="${position}" data-sort-direction="up" ${position === 0 ? "disabled" : ""} aria-label="Subir ${esc(card.cardName)}">↑</button><button type="button" data-sort-position="${position}" data-sort-direction="down" ${position === synced.order.length - 1 ? "disabled" : ""} aria-label="Bajar ${esc(card.cardName)}">↓</button></span></li>`;
  }).join("");
  const action = sortActionFor(view, synced);
  return `<div class="card-selection-modal sort-card-modal" data-testid="sort-card-modal" role="dialog" aria-modal="true" aria-label="Ordenar cartas"><div class="selection-modal-panel"><div class="selection-modal-head"><div><span>ORDEN AUTORITATIVO · JUGADOR ${(view.priorityPlayer ?? 0) + 1}</span><h2>Ordena todas las cartas</h2><p>Cualquier permutación es válida; la posición 1 se resolverá primero.</p></div><strong class="selection-progress">${synced.order.length} CARTAS</strong></div><ol class="sort-card-list">${cards}</ol><div class="selection-modal-actions"><small>Usa las flechas hasta obtener el orden exacto.</small><button type="button" class="primary-button selection-confirm" data-action-id="${esc(registerAction(action))}">Confirmar orden</button></div></div></div>`;
}

export function counterWindowKey(view) {
  const counter = view?.counterSelection;
  if (!counter?.cards?.length) return null;
  return `${view.pendingType}:${view.priorityPlayer}:${view.decisionCount}:${counter.total}:${counter.cards.map((card) => `${card.index}:${card.maximum}`).join("|")}`;
}

export function syncCounterState(state, view) {
  const key = counterWindowKey(view);
  if (!key) return { key: null, counters: [] };
  if (state?.key === key && state.counters?.length === view.counterSelection.cards.length) return state;
  return { key, counters: view.counterSelection.cards.map(() => 0) };
}

export function adjustCounter(state, index, delta, view) {
  const counters = [...(state?.counters ?? [])].map(Number);
  const position = Number(index);
  const card = view?.counterSelection?.cards?.[position];
  if (!card) return state;
  const used = counters.reduce((sum, value) => sum + value, 0);
  const next = Math.max(0, Math.min(Number(card.maximum), counters[position] + Number(delta)));
  if (next > counters[position] && used >= Number(view.counterSelection.total)) return state;
  counters[position] = next;
  return { ...state, counters };
}

export function counterActionFor(view, state) {
  const descriptor = view?.counterSelection;
  const counters = [...(state?.counters ?? [])].map(Number);
  if (!descriptor || counters.length !== descriptor.cards.length) return null;
  if (counters.reduce((sum, value) => sum + value, 0) !== Number(descriptor.total)) return null;
  if (counters.some((value, index) => value < 0 || value > Number(descriptor.cards[index].maximum))) return null;
  return { label: `Asignar ${descriptor.total} contador(es)`, actionKind: "select-counter", coreResponse: { type: descriptor.responseType, counters } };
}

export function renderCounterAllocationModal({ view, state, esc, cardMarkup, registerAction }) {
  const descriptor = view?.counterSelection;
  if (!descriptor?.cards?.length) return "";
  const synced = syncCounterState(state, view);
  const used = synced.counters.reduce((sum, value) => sum + Number(value), 0);
  const action = counterActionFor(view, synced);
  const rows = descriptor.cards.map((card, index) => `<li class="counter-allocation-item"><span class="counter-card-visual">${cardMarkup({ cardId: card.cardId, faceUp: Boolean(card.cardId), location: card.location }, { compact: true })}</span><span><strong>${esc(card.cardName)}</strong><small>Máximo ${card.maximum}</small></span><span class="counter-controls"><button type="button" data-counter-index="${index}" data-counter-delta="-1" ${synced.counters[index] <= 0 ? "disabled" : ""}>−</button><b>${synced.counters[index]}</b><button type="button" data-counter-index="${index}" data-counter-delta="1" ${synced.counters[index] >= card.maximum || used >= descriptor.total ? "disabled" : ""}>+</button></span></li>`).join("");
  return `<div class="card-selection-modal counter-allocation-modal" data-testid="counter-allocation-modal" role="dialog" aria-modal="true" aria-label="Asignar contadores"><div class="selection-modal-panel"><div class="selection-modal-head"><div><span>CONTADORES · JUGADOR ${(view.priorityPlayer ?? 0) + 1}</span><h2>Distribuye todos los contadores</h2><p>Cualquier distribución dentro de los límites de cada carta es válida.</p></div><strong class="selection-progress">${used}/${descriptor.total}</strong></div><ol class="counter-allocation-list">${rows}</ol><div class="selection-modal-actions"><small>${action ? "Distribución legal lista." : `Quedan ${Math.max(0, descriptor.total - used)} contadores.`}</small><button type="button" class="primary-button selection-confirm" ${action ? `data-action-id="${esc(registerAction(action))}"` : "disabled"}>Confirmar</button></div></div></div>`;
}

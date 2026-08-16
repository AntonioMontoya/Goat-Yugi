export function multiChoiceWindowKey(view) {
  const choice = view?.multiChoice;
  if (!choice?.options?.length) return null;
  return `${view.pendingType}:${view.priorityPlayer}:${view.decisionCount}:${choice.count}:${choice.options.map((option) => option.index).join("|")}`;
}

export function syncMultiChoiceState(state, view) {
  const key = multiChoiceWindowKey(view);
  if (!key) return { key: null, indices: [] };
  if (state?.key === key) return state;
  return { key, indices: [] };
}

export function toggleMultiChoice(state, index, maximum) {
  const value = Number(index);
  const indices = [...(state?.indices ?? [])].map(Number);
  if (indices.includes(value)) return { ...state, indices: indices.filter((candidate) => candidate !== value) };
  if (Number(maximum) === 1) return { ...state, indices: [value] };
  if (indices.length >= Number(maximum)) return state;
  return { ...state, indices: [...indices, value] };
}

export function multiChoiceActionFor(view, state) {
  const choice = view?.multiChoice;
  const indices = [...(state?.indices ?? [])].map(Number);
  if (!choice || indices.length !== Number(choice.count) || new Set(indices).size !== indices.length) return null;
  const selected = indices.map((index) => choice.options.find((option) => Number(option.index) === index)).filter(Boolean);
  if (selected.length !== indices.length) return null;
  const coreResponse = choice.kind === "place"
    ? { type: choice.responseType, places: selected.map((option) => option.value) }
    : choice.kind === "race"
      ? { type: choice.responseType, races: selected.map((option) => option.value) }
      : { type: choice.responseType, attributes: selected.map((option) => option.value) };
  return { label: `Confirmar: ${selected.map((option) => option.label).join(" + ")}`, actionKind: choice.actionKind, coreResponse };
}

export function renderMultiChoiceModal({ view, state, esc, registerAction }) {
  const choice = view?.multiChoice;
  if (!choice?.options?.length) return "";
  const synced = syncMultiChoiceState(state, view);
  const selected = new Set(synced.indices.map(Number));
  const action = multiChoiceActionFor(view, synced);
  const title = choice.kind === "place" ? "Elige las zonas exactas" : choice.kind === "race" ? "Declara los Tipos" : "Declara los Atributos";
  const rows = choice.options.map((option) => `<button type="button" class="multi-choice-option ${selected.has(Number(option.index)) ? "selected" : ""}" data-multi-choice-index="${option.index}" aria-pressed="${selected.has(Number(option.index))}"><span>${selected.has(Number(option.index)) ? "✓" : "○"}</span><b>${esc(option.label)}</b></button>`).join("");
  return `<div class="card-selection-modal multi-choice-modal" data-testid="multi-choice-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="selection-modal-panel"><div class="selection-modal-head"><div><span>ELECCIÓN AUTORITATIVA · JUGADOR ${(view.priorityPlayer ?? 0) + 1}</span><h2>${esc(title)}</h2><p>Selecciona exactamente ${choice.count}; se enviará esa combinación completa a OCGCore.</p></div><strong class="selection-progress">${selected.size}/${choice.count}</strong></div><div class="multi-choice-grid">${rows}</div><div class="selection-modal-actions"><small>${action ? "Combinación legal lista." : `Faltan ${Math.max(0, choice.count - selected.size)} elecciones.`}</small><button type="button" class="primary-button selection-confirm" ${action ? `data-action-id="${esc(registerAction(action))}"` : "disabled"}>Confirmar</button></div></div></div>`;
}

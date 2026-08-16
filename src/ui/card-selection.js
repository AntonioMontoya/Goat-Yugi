function selectedKey(indices) {
  return [...indices].map(Number).sort((a, b) => a - b).join(",");
}

export function selectionWindowKey(view) {
  if (!view?.selection?.candidates?.length) return null;
  const candidates = view.selection.candidates
    .map((card) => `${card.index}:${card.cardCode}:${card.controller}:${card.location}:${card.sequence}`)
    .join("|");
  return `${view.pendingType}:${view.priorityPlayer}:${view.decisionCount}:${candidates}`;
}

export function syncCardSelection(state, view) {
  const key = selectionWindowKey(view);
  if (!key) return { key: null, indices: [] };
  if (state?.key === key) return state;
  return { key, indices: (view.selection.candidates ?? []).filter((candidate) => candidate.required).map((candidate) => Number(candidate.index)) };
}

export function toggleCardSelection(state, index, maximum, locked = []) {
  const selected = new Set((state?.indices ?? []).map(Number));
  const target = Number(index);
  const lockedIndices = new Set((locked ?? []).map(Number));
  if (selected.has(target) && !lockedIndices.has(target)) selected.delete(target);
  else if (selected.size < Math.max(1, Number(maximum) || 1)) selected.add(target);
  return { ...state, indices: [...selected].sort((a, b) => a - b) };
}

export function selectionActionFor(view, actions, indices) {
  const wanted = selectedKey(indices);
  const exact = (actions ?? []).find((action) => selectedKey(action.coreResponse?.indicies ?? []) === wanted);
  const selection = view?.selection;
  const minimum = Number(selection?.minimum) || 0;
  const maximum = Number(selection?.maximum ?? minimum) || 0;
  if (!selection || !["SELECT_CARD", "SELECT_TRIBUTE", "SELECT_SUM"].includes(view?.pendingType)) return null;
  const normalized = [...new Set(indices.map(Number))].sort((a, b) => a - b);
  if (normalized.length < minimum || normalized.length > maximum) return null;
  const cards = normalized.map((index) => selection.candidates.find((candidate) => Number(candidate.index) === index)).filter(Boolean);
  if (cards.length !== normalized.length) return null;
  if (selection.mode === "tribute") {
    const total = cards.reduce((sum, card) => sum + Number(card.tributeValue ?? card.amount ?? 0), 0);
    if (total < Number(selection.valueMinimum ?? 0) || total > Number(selection.valueMaximum ?? selection.valueMinimum ?? 0)) return null;
  }
  if (selection.mode === "sum") {
    const required = new Set(selection.candidates.filter((candidate) => candidate.required).map((candidate) => Number(candidate.index)));
    if ([...required].some((index) => !normalized.includes(index))) return null;
    const total = cards.reduce((sum, card) => sum + Number(card.amount ?? 0), 0);
    const target = Number(selection.sumMinimum ?? 0);
    if (selection.allowGreater ? total < target : total !== target) return null;
    if (selection.allowGreater && cards.some((card) => !card.required && total - Number(card.amount ?? 0) >= target)) return null;
  }
  const responseType = selection.responseType ?? (actions ?? []).find((action) => action?.coreResponse?.type !== undefined)?.coreResponse?.type;
  if (responseType === undefined) return null;
  if (exact) return exact;
  return {
    label: `Elegir ${cards.map((card) => card.cardName).join(" + ")}`,
    actionKind: "select-card",
    selectionCards: cards,
    selectionMin: minimum,
    selectionMax: maximum,
    coreResponse: { type: responseType, indicies: normalized },
  };
}

export function isFusionMaterialSelection(view) {
  if (!['SELECT_CARD', 'SELECT_UNSELECT_CARD'].includes(view?.pendingType)) return false;
  if (view?.decisionContext?.purpose !== "fusion-material") return false;
  const candidates = view?.selection?.candidates ?? [];
  const onlyExtraDeck = candidates.length > 0 && candidates.every((card) => Number(card.location) === 64 || /fusion|extra/i.test(card.locationName ?? ""));
  return !onlyExtraDeck;
}

export function renderCardSelectionModal({ view, actions, state, esc, cardMarkup, registerAction }) {
  const selection = view?.selection;
  if (!selection?.candidates?.length) return "";
  // OCGCore's SELECT_UNSELECT_CARD is a live window: every click must be
  // sent immediately, while the current `unselect_cards` list is the source
  // of truth for the highlighted material cards.
  const liveToggleWindow = view.pendingType === "SELECT_UNSELECT_CARD";
  const selected = liveToggleWindow
    ? new Set(selection.candidates.filter((candidate) => candidate.selected === true).map((candidate) => Number(candidate.index)))
    : new Set((state?.indices ?? []).map(Number));
  const action = liveToggleWindow
    ? (actions ?? []).find((candidate) => candidate.coreResponse?.index === null)
    : selectionActionFor(view, actions, [...selected]);
  const minimum = Number(selection.minimum) || 0;
  const maximum = Math.max(minimum, Number(selection.maximum ?? minimum) || 0);
  const sumMode = selection.mode === "sum";
  const tributeMode = selection.mode === "tribute";
  const fusionMaterials = isFusionMaterialSelection(view);
  const currentSum = [...selected].reduce((total, index) => total + Number(selection.candidates.find((card) => Number(card.index) === index)?.amount ?? 0), 0);
  const progress = sumMode
    ? `${currentSum} / ${selection.sumMinimum}${selection.sumMaximum !== selection.sumMinimum ? `-${selection.sumMaximum}` : ""}`
    : tributeMode ? `${currentSum} / ${selection.valueMinimum}${selection.valueMaximum !== selection.valueMinimum ? `-${selection.valueMaximum}` : ""}`
    : `${selected.size} / ${minimum === maximum ? maximum : `${minimum}-${maximum}`}`;
  const title = fusionMaterials ? "Elige los materiales de Fusi\u00f3n" : sumMode ? "Elige los materiales" : tributeMode ? "Elige los Sacrificios" : minimum === maximum ? `Elige ${minimum} carta${minimum === 1 ? "" : "s"}` : `Elige entre ${minimum} y ${maximum} cartas`;
  const sourceName = view?.decisionContext?.source?.cardName ?? view?.pendingEffect?.cardName ?? null;
  const sourceText = view?.decisionContext?.source?.cardText ?? view?.pendingEffect?.cardText ?? null;
  const source = sourceName ? `<div class="selection-source"><span>ORIGEN DE LA DECISIÓN</span><strong>${esc(sourceName)}</strong>${sourceText ? `<small>${esc(sourceText)}</small>` : ""}</div>` : "";
  const cards = selection.candidates.map((candidate) => {
    const isSelected = liveToggleWindow ? candidate.selected === true : selected.has(Number(candidate.index));
    const visual = cardMarkup({ cardId: candidate.cardId, faceUp: Boolean(candidate.cardId), location: candidate.location }, { compact: true });
    const amount = sumMode || tributeMode ? `<em>VALOR ${Number(candidate.amount) || 0}</em>` : "";
    const order = [...selected].sort((left, right) => left - right).indexOf(Number(candidate.index));
    return `<button type="button" class="card-choice ${isSelected ? "selected" : ""} ${candidate.required ? "required" : ""}" data-card-choice-index="${candidate.index}" aria-pressed="${isSelected}" ${candidate.required ? "data-selection-required aria-disabled=\"true\"" : ""} aria-label="${candidate.required ? "Obligatoria" : isSelected ? "Quitar" : "Seleccionar"} ${esc(candidate.cardName)}"><span class="card-choice-visual">${visual}<i>${isSelected && order >= 0 ? order + 1 : ""}</i></span><strong>${esc(candidate.cardName)}</strong><small>${esc(candidate.locationName)} - Jugador ${candidate.controller + 1}${candidate.required ? " · OBLIGATORIA" : ""}</small>${amount}</button>`;
  }).join("");
  const confirm = action
    ? `<button type="button" class="primary-button selection-confirm" data-action-id="${esc(registerAction(action))}">${liveToggleWindow ? "Terminar seleccion" : "Confirmar seleccion"}</button>`
    : liveToggleWindow
      ? `<small class="selection-live-hint">Pulsa cada material por separado; el motor continuara cuando la cantidad sea correcta.</small>`
      : `<button type="button" class="primary-button selection-confirm" disabled>Completa la seleccion</button>`;
  const clear = liveToggleWindow ? "" : `<button type="button" class="ghost-button" data-selection-clear ${selected.size ? "" : "disabled"}>Limpiar</button>`;
  return `<div class="card-selection-modal ${fusionMaterials ? "fusion-material-modal" : ""}" data-testid="card-selection-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="selection-modal-panel"><div class="selection-modal-head"><div><span>${fusionMaterials ? "INVOCACION POR FUSION" : "DECISION"} - JUGADOR ${(view.priorityPlayer ?? 0) + 1}</span><h2>${esc(title)}</h2><p>${fusionMaterials ? "Selecciona en esta ventana las cartas que se usaran como materiales." : "Pulsa cada carta por separado. Las elegidas quedan iluminadas."}</p></div><strong class="selection-progress">${esc(progress)}</strong></div>${source}<div class="selection-candidate-grid">${cards}</div><div class="selection-modal-actions"><small>${liveToggleWindow ? "Cada clic se envia al motor como una seleccion individual." : action ? "La combinacion es legal y esta lista." : "Selecciona una combinacion valida para continuar."}</small>${clear}${confirm}</div></div></div>`;
}

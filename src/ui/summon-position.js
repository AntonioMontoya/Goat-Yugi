function positionCopy(action) {
  const label = String(action?.label ?? "");
  const defense = /defensa/i.test(label);
  const faceDown = /boca abajo/i.test(label);
  return {
    label,
    title: `${defense ? "Defensa" : "Ataque"}${faceDown ? " boca abajo" : " boca arriba"}`,
    icon: defense ? "DEF" : "ATK",
    detail: `La carta quedará en Posición de ${defense ? "Defensa" : "Ataque"}${faceDown ? " boca abajo" : " boca arriba"}.`,
  };
}

function contextCopy(context) {
  if (context === "special-summon") return ["INVOCACIÓN ESPECIAL", "Elige la posición de la Invocación Especial"];
  if (context === "summon") return ["INVOCACIÓN NORMAL", "Elige la posición de invocación"];
  if (context === "position") return ["CAMBIO DE POSICIÓN", "Elige la nueva posición"];
  if (context === "effect") return ["EFECTO EN RESOLUCIÓN", "Elige la posición indicada por el efecto"];
  return ["POSICIÓN DEL MONSTRUO", "Elige la posición"];
}

export function renderSummonPositionModal({ view, prompt, responses, context = null, esc, registerAction }) {
  const choices = (responses ?? []).filter((action) => action?.coreResponse?.type !== undefined).map((action) => ({ action, ...positionCopy(action) }));
  if (!choices.length) return "";
  const [eyebrow, title] = contextCopy(context);
  const cards = choices.map((choice) => {
    const actionId = registerAction(choice.action);
    return `<button type="button" class="position-tray-choice ${choice.icon === "DEF" ? "position-defense" : "position-attack"}" data-action-id="${esc(actionId)}" aria-label="${esc(choice.title)}"><span class="position-choice-icon"><i></i><b>${choice.icon}</b></span><span><strong>${esc(choice.title)}</strong><small>${esc(choice.detail)}</small></span></button>`;
  }).join("");
  const player = prompt?.playerName ?? `Jugador ${(view?.priorityPlayer ?? 0) + 1}`;
  return `<section class="duel-position-tray" data-testid="summon-position-modal" role="region" aria-label="${esc(title)}"><div class="position-tray-copy"><span>${eyebrow} · ${esc(player)}</span><strong>${esc(title)}</strong><small>OCGCore solo muestra las posiciones legales para esta carta.</small></div><div class="position-choice-grid">${cards}</div></section>`;
}

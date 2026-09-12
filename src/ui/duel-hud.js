import { DUEL_PHASES, isPhaseAction, phaseIndex, phaseLabel, phaseStepId } from "./duel-presentation.js";
import { actionAffordance, actionsForCard, interactionStatus, playerFacingActionLabel } from "./duel-interaction.js";

function registerButton(action, className, { esc, registerAction, label = null } = {}) {
  const actionId = registerAction(action);
  const affordance = actionAffordance(action);
  const copy = label ?? playerFacingActionLabel(action);
  return `<button type="button" class="${className}" data-action-id="${esc(actionId)}" aria-label="${esc(copy)}"><span>${esc(affordance.icon)}</span><b>${esc(copy)}</b></button>`;
}

export function renderDuelTopbar({ view, model, manual, title, subtitle, sandbox = false, fullscreenLabel, boardTilt = false, duelMenuOpen = false, esc, botProfile = null }) {
  const status = interactionStatus(model, view, { manual });
  return `<header class="duel-compact-head">
    <div class="duel-title-lockup"><span class="duel-mark">GOAT</span><div><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div></div>
    <div class="duel-live-status mode-${esc(model.mode)}" data-testid="duel-interaction-status"><i></i><span><b>${esc(status.eyebrow)}</b><small>${esc(status.title)}</small></span></div>
    <div class="duel-head-meta"><span>TURNO <b>${String(view?.turn ?? 0).padStart(2, "0")}</b></span><span>${esc(phaseLabel(view?.phase))}</span><span class="priority-owner">${esc(model.priorityName)}</span></div>
    <div class="duel-menu" data-open="${duelMenuOpen ? "true" : "false"}"><button type="button" class="duel-menu-toggle" data-duel-menu-toggle aria-label="Abrir menú del duelo" aria-expanded="${duelMenuOpen ? "true" : "false"}">•••</button><div class="duel-menu-panel">
      ${sandbox ? `<button type="button" data-action="restart-sandbox-duel">Reiniciar escenario</button><button type="button" data-action="edit-sandbox-scenario">Editar escenario</button>` : ""}
      <button type="button" data-action="new-duel">Reiniciar duelo</button>
      <button type="button" data-action="exit-to-home">Salir al menú principal</button>
      <details class="duel-debug-details"><summary>Diagnóstico</summary><code>${esc(view?.pendingType ?? "SIN DECISIÓN")} · ${esc(view?.timingWindow?.kind ?? "sin ventana")}</code><small>${Number(view?.decisionCount ?? 0)} decisiones OCGCore</small>${botProfile ? `<small style="display:block;margin-top:4px;color:var(--text-muted, #888)">Bot: <b>${esc(botProfile.name)}</b> [${esc(botProfile.modelOrigin ?? "base")}] · Hash: <code>${esc(String(botProfile.modelHash ?? "n/a").slice(0, 10))}</code></small>` : ""}</details>
    </div></div>
  </header>`;
}

export function renderPhaseRail({ view, model, esc, registerAction }) {
  const current = phaseStepId(view?.phase);
  const currentIndex = phaseIndex(current);
  const direct = model.phaseActions;
  const preferred = model.advanceAction ?? direct[0];
  const priorityPass = model.freePriority && model.declineAction
    ? { ...model.declineAction, label: "Pasar prioridad" }
    : null;
  const automatedOcgcore = view?.kind === "ocgcore";
  const commands = automatedOcgcore && view?.botPending
    ? `<span class="phase-auto is-opponent"><i></i><b>Rival actuando</b></span>`
    : automatedOcgcore && model.autoPhaseAdvance
      ? `<span class="phase-auto" data-testid="phase-auto"><i></i><b>Avance automático</b><small>0,3 s</small></span>`
      : model.mode === "response"
        ? `<small class="phase-locked">Decide en la ventana de acciones</small>`
        : direct.length
          ? registerButton(preferred, "phase-command", { esc, registerAction })
          : priorityPass
            ? registerButton(priorityPass, "phase-command", { esc, registerAction, label: "Pasar prioridad" })
            : `<small class="phase-locked">${model.mode === "open" ? "Sin cambio disponible" : "Completa la decisión actual"}</small>`;
  return `<nav class="duel-phase-rail" data-testid="phase-hud" aria-label="Fases del turno"><strong>FASES</strong><ol style="--phase-index:${currentIndex}">${DUEL_PHASES.map(([id, label], index) => `<li class="${id === current ? "current" : index < currentIndex ? "complete" : "future"}" data-phase="${esc(id)}" aria-label="${esc(label)}"${id === current ? ` aria-current="step"` : ""}><span>${esc(label.toUpperCase())}</span></li>`).join("")}</ol><div class="phase-rail-actions"><em>SIGUIENTE</em>${commands}</div></nav>`;
}

export function cardLocation(instance) {
  const location = Number(instance?.location);
  if (location === 2) return "MANO";
  if (location === 4) return "CAMPO · MONSTRUO";
  if (location === 8) return Number(instance?.sequence) === 5 ? "ZONA DE CAMPO" : "CAMPO · MAGIA/TRAMPA";
  if (location === 16) return "CEMENTERIO";
  if (location === 32) return "DESTIERRO";
  return "CARTA";
}

export function renderDuelCardInspector({ snapshot, getCard, cardMarkup, esc }) {
  if (!snapshot?.cardId) return "";
  const card = getCard(snapshot.cardId);
  if (!card) return "";
  const type = [card.kind, card.race, card.attribute].filter(Boolean).join(" · ");
  const stats = card.kind === "MONSTER" || card.kind === "TOKEN"
    ? `<span class="inspector-stats"><b>ATK <strong>${esc(card.atk)}</strong></b>${Number.isFinite(Number(card.def)) ? `<b>DEF <strong>${esc(card.def)}</strong></b>` : ""}</span>`
    : "";
  return `<aside class="duel-card-inspector" data-testid="card-inspector" aria-label="Detalles de ${esc(card.name)}">
    <header><span><small>INSPECTOR DE CARTA</small><strong>${esc(card.name)}</strong></span><button type="button" data-card-inspector-close aria-label="Cerrar inspector">×</button></header>
    <div class="inspector-content"><div class="inspector-art">${cardMarkup({ cardId: card.id, faceUp: true })}</div><div class="inspector-copy">
      <div class="inspector-meta"><span>${esc(type || "Carta")}</span>${stats}<span><b>ZONA</b> ${esc(cardLocation(snapshot))}</span><span><b>PROPIETARIO</b> ${esc(snapshot.ownerName ?? `Jugador ${Number(snapshot.controller ?? 0) + 1}`)}</span></div>
      <p>${esc(card.text || "Esta carta no tiene texto de efecto.")}</p>
    </div></div>
    <footer><span>El inspector no cambia las acciones legales.</span><kbd>Esc</kbd></footer>
  </aside>`;
}

export function renderCardActionPopover({ instance, model, placement = "above", getCard, esc, registerAction }) {
  if (!instance?.cardId || (model.mode !== "open" && model.mode !== "response")) return "";
  const card = getCard(instance.cardId);
  if (!card) return "";
  const actions = actionsForCard(model, instance).filter((action) => !isPhaseAction(action));
  if (!actions.length) return "";
  const buttons = actions.map((action) => {
    const actionId = registerAction(action);
    const affordance = actionAffordance(action);
    const fullLabel = playerFacingActionLabel(action);
    return `<button type="button" class="card-popover-action" data-action-id="${esc(actionId)}" aria-label="${esc(fullLabel)}" title="${esc(fullLabel)}"><span>${esc(affordance.icon)}</span><b>${esc(affordance.label)}</b></button>`;
  }).join("");
  return `<section class="card-action-popover card-action-popover-${esc(placement)}" data-testid="card-action-popover" role="group" aria-label="Acciones para ${esc(card.name)}">
    <header><span><small>${esc(cardLocation(instance))}</small><strong>${esc(card.name)}</strong></span><button type="button" data-card-clear aria-label="Cerrar acciones">×</button></header>
    <div class="card-popover-actions">${buttons}</div>
  </section>`;
}

function responseOption(action, { cardForCode, cardMarkup, esc, registerAction }) {
  const card = action?.cardCode ? cardForCode(action.cardCode) : null;
  const visual = card ? `<span class="response-card">${cardMarkup({ cardId: card.id, faceUp: true }, { compact: true })}</span>` : `<span class="response-sigil">${esc(actionAffordance(action).icon)}</span>`;
  const actionId = registerAction(action);
  return `<button type="button" class="response-option" data-action-id="${esc(actionId)}" aria-label="${esc(playerFacingActionLabel(action))}">${visual}<span><strong>${esc(playerFacingActionLabel(action))}</strong><small>ACCIÓN LEGAL</small></span></button>`;
}

export function renderOpenActionShortcuts({ model, esc, registerAction }) {
  const actions = model?.mode === "open" ? model.globalActions ?? [] : [];
  if (!actions.length) return "";
  return `<section class="duel-open-shortcuts" data-testid="open-action-shortcuts" role="group" aria-label="Acciones legales fuera del campo"><span>OTRAS ACCIONES</span><div>${actions.map((action) => registerButton(action, "open-shortcut-action", { esc, registerAction })).join("")}</div></section>`;
}

export function renderPhaseAdvanceConfirmation({ view, model, pending, esc }) {
  if (!pending?.action || !model?.optionalActions?.length) return "";
  const count = model.optionalActions.length;
  const destination = pending.label ?? playerFacingActionLabel(pending.action);
  const passingPriority = model.freePriority && pending.action.actionKind === "decline";
  if (passingPriority) {
    return `<section class="duel-phase-priority duel-phase-confirmation" data-testid="phase-advance-confirmation" role="alertdialog" aria-label="Confirmar paso de prioridad"><div><span>${esc(phaseLabel(view?.phase))} · VENTANA RÁPIDA</span><strong>¿Pasar prioridad?</strong><small>Aún tienes ${count} ${count === 1 ? "activación rápida disponible" : "activaciones rápidas disponibles"}. Si pasas, no la usarás en esta ventana y OCGCore continuará con las acciones legales de la fase.</small></div><div class="priority-choices"><button type="button" class="priority-choice priority-choice-no" data-phase-advance-cancel><span>←</span><b>Seguir decidiendo</b></button><button type="button" class="priority-choice" data-phase-advance-confirm><span>→</span><b>Sí, pasar prioridad</b></button></div></section>`;
  }
  return `<section class="duel-phase-priority duel-phase-confirmation" data-testid="phase-advance-confirmation" role="alertdialog" aria-label="Confirmar cambio de fase"><div><span>${esc(phaseLabel(view?.phase))} · CAMBIO DE FASE</span><strong>¿${esc(destination)}?</strong><small>Aún tienes ${count} ${count === 1 ? "acción legal disponible" : "acciones legales disponibles"}. Si continúas, no podrás realizarlas en esta fase.</small></div><div class="priority-choices"><button type="button" class="priority-choice priority-choice-no" data-phase-advance-cancel><span>←</span><b>Seguir jugando</b></button><button type="button" class="priority-choice" data-phase-advance-confirm><span>→</span><b>Sí, pasar de fase</b></button></div></section>`;
}

export function renderResponseTray({ view, model, revealed = false, cardForCode, cardMarkup, esc, registerAction }) {
  if (model.mode !== "response") return "";
  let options = [];
  let decline = model.declineAction;
  let eyebrow = model.source?.eyebrow ?? `RESPUESTA · ${model.priorityName}`;
  let title = model.source?.title ?? model.prompt.title;
  let detail = "Solo aparecen respuestas aceptadas por OCGCore.";
  if (view?.pendingType === "SELECT_EFFECTYN") {
    options = model.actions.filter((action) => action?.coreResponse?.yes === true);
    decline = model.actions.find((action) => action?.coreResponse?.yes === false) ?? null;
    const effect = view?.pendingEffect;
    const name = effect?.cardName ?? "este efecto";
    eyebrow = `EFECTO OPCIONAL · ${model.priorityName}`;
    title = `${name} puede activar su efecto.`;
    detail = effect?.cardText || detail;
  } else {
    options = model.responseOptions;
  }
  if (!revealed && options.length) {
    const alertTitle = view?.pendingType === "SELECT_EFFECTYN" ? "Tienes una posible activación" : "Tienes una respuesta disponible";
    const yesLabel = view?.pendingType === "SELECT_EFFECTYN" ? "Ver activación" : "Responder";
    return `<section class="duel-response-tray response-alert" data-testid="response-tray" role="alertdialog" aria-label="${esc(alertTitle)}"><div class="response-alert-animation" data-testid="response-alert-animation" aria-hidden="true"><img class="response-alert-ornament" src="./sprites/Sprite_Ornamentacion8.webp" alt="" /></div><div class="response-copy"><span>${esc(eyebrow)}</span><strong>${esc(alertTitle)}</strong><small>${esc(title)}</small></div><div class="response-alert-actions"><button type="button" class="response-reveal" data-action-options-reveal><span>FX</span><b>${esc(yesLabel)}</b></button>${decline ? registerButton(decline, "response-decline", { esc, registerAction, label: view?.pendingType === "SELECT_EFFECTYN" ? "No activar" : "No responder" }) : ""}</div></section>`;
  }
  return `<section class="duel-response-tray response-revealed" data-testid="response-tray-options" role="region" aria-label="${esc(title)}"><div class="response-copy"><span>${esc(eyebrow)}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><div class="response-options">${options.map((action) => responseOption(action, { cardForCode, cardMarkup, esc, registerAction })).join("") || `<span class="response-required">Elige la respuesta obligatoria disponible.</span>`}</div>${decline ? registerButton(decline, "response-decline", { esc, registerAction, label: "No hacer nada" }) : ""}</section>`;
}

function registerNumberButton(action, { esc, registerAction }) {
  const actionId = registerAction(action);
  const match = String(action.label ?? "").match(/\d+/);
  const num = match ? match[0] : String(action.coreResponse?.value !== undefined ? action.coreResponse.value + 1 : "");
  return `<button type="button" class="decision-number-btn" data-action-id="${esc(actionId)}" aria-label="Declarar ${esc(num)}" title="Declarar Nivel ${esc(num)}"><span class="number-star">★</span><b class="number-num">${esc(num)}</b></button>`;
}

export function renderDecisionBar({ view, model, actions, directField = false, esc, registerAction }) {
  if (model.mode !== "decision") return "";
  const responses = (actions ?? []).filter((action) => !isPhaseAction(action));
  const secondary = view?.pendingType === "SELECT_PLACE"
    ? responses.filter((action) => action.quickPlacement || !action.placement)
    : directField
      ? responses.filter((action) => Array.isArray(action.selectionCards) && action.selectionCards.length === 0)
      : responses;
  const isNumberAnnouncement = view?.pendingType === "ANNOUNCE_NUMBER" || (secondary.length > 0 && secondary.every((a) => a.actionKind === "announce-number"));
  const buttons = isNumberAnnouncement
    ? secondary.slice(0, 16).map((action) => registerNumberButton(action, { esc, registerAction })).join("")
    : secondary.slice(0, 16).map((action) => registerButton(action, "decision-action", { esc, registerAction })).join("");
  const title = directField ? "Elige directamente una carta iluminada" : (isNumberAnnouncement ? "Declara un nivel de monstruo" : model.prompt.title);
  const detail = directField ? `${model.priorityName}: pulsa el objetivo válido en el Campo.` : (isNumberAnnouncement ? `${model.priorityName}: elige el nivel que declaras para el efecto.` : model.prompt.detail);
  const actionContainerClass = isNumberAnnouncement ? "decision-actions decision-number-picker" : "decision-actions";
  return `<section class="duel-decision-bar ${isNumberAnnouncement ? "has-number-picker" : ""}" data-testid="decision-bar" role="region" aria-label="${esc(title)}"><div><span>DECISIÓN NECESARIA · ${esc(model.priorityName)}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>${buttons ? `<div class="${actionContainerClass}">${buttons}</div>` : ""}</section>`;
}

export function renderEventDrawer(view, { esc, state = {} }) {
  const events = [...(view?.recentLog ?? [])].filter((event) => !String(event.type).startsWith("SELECT_")).reverse();
  const query = String(state.search ?? "").trim().toLocaleLowerCase("es");
  const filter = ["all", "effect", "battle", "phase", "move"].includes(state.filter) ? state.filter : "all";
  const categoryFor = (event) => /CHAIN|ACTIVAT|RESOLV|FLIP/i.test(event.type) ? "effect" : /ATTACK|DAMAGE|BATTLE/i.test(event.type) ? "battle" : /TURN|PHASE/i.test(event.type) ? "phase" : "move";
  const rows = events.map((event) => {
    const searchable = `${event.cardName ?? ""} ${event.message ?? ""} ${event.type ?? ""}`.toLocaleLowerCase("es");
    const category = categoryFor(event);
    const hidden = Boolean(query && !searchable.includes(query)) || (filter !== "all" && category !== filter);
    const cardButton = event.cardCode ? `<button type="button" class="event-card-link" data-log-card-code="${Number(event.cardCode)}" title="Abrir ${esc(event.cardName ?? "carta")}">${esc(event.cardName ?? "Ver carta")}</button>` : "";
    return `<article class="duel-event-row" data-event-entry data-event-kind="${category}" data-event-search-text="${esc(searchable)}"${hidden ? " hidden" : ""}><i></i><span><small>T${String(event.turn ?? view?.turn ?? 0).padStart(2, "0")} · ${esc(String(event.type ?? "EVENTO").replaceAll("_", " "))}</small><b>${esc(event.message ?? "El duelo avanza.")}</b>${cardButton}</span></article>`;
  }).join("");
  const option = (value, label) => `<option value="${value}"${filter === value ? " selected" : ""}>${label}</option>`;
  return `<details class="duel-event-drawer"${state.open ? " open" : ""}><summary>Historial <b>${events.length}</b></summary><div class="event-drawer-tools"><input type="search" value="${esc(state.search ?? "")}" data-event-search aria-label="Buscar en el historial" placeholder="Buscar carta o acción…"><select data-event-filter aria-label="Filtrar historial">${option("all", "Todo")}${option("effect", "Efectos y cadenas")}${option("battle", "Batalla y daño")}${option("phase", "Turnos y fases")}${option("move", "Movimientos")}</select></div><div class="event-drawer-list">${rows || `<p class="event-drawer-empty">El duelo está preparado.</p>`}</div></details>`;
}

export function renderEventCue(cue, { motionLevel = "full", elapsed = 0, cardForCode, cardMarkup, esc }) {
  if (!cue) return "";
  const card = cue.cardCode ? cardForCode(cue.cardCode) : null;
  const sigil = cue.kind === "phase" ? "FASE" : cue.kind === "chain" ? `C${cue.chainLink || "?"}` : cue.kind === "activate" ? "FX" : "OK";
  const visual = card ? `<span class="event-cue-card">${cardMarkup({ cardId: card.id, faceUp: true }, { compact: true })}</span>` : `<span class="event-cue-sigil">${esc(sigil)}</span>`;
  const items = (cue.cards ?? []).slice(0, 4).map((item) => {
    const itemCard = item.cardCode ? cardForCode(item.cardCode) : null;
    const itemVisual = itemCard
      ? `<i>${cardMarkup({ cardId: itemCard.id, faceUp: true }, { compact: true })}</i>`
      : `<i class="event-cue-item-sigil">?</i>`;
    return `<span class="event-cue-item">${itemVisual}<span><b>${esc(item.label ?? "AFECTADA")}</b><small>${esc(item.cardName ?? itemCard?.name ?? "Carta")}</small></span></span>`;
  }).join("");
  const itemTray = items ? `<span class="event-cue-items" aria-label="Cartas implicadas">${items}</span>` : "";
  const compactClass = cue.compact ? " cue-compact" : "";
  return `<div class="duel-event-cue cue-${esc(cue.kind)}${compactClass} motion-${esc(motionLevel)}" style="--cue-duration:${Math.max(500, Number(cue.duration) || 900)}ms;--cue-delay:-${Math.max(0, Number(elapsed) || 0)}ms" data-testid="duel-event-cue" data-blocking="${cue.blocking ? "true" : "false"}" role="status" aria-live="assertive">${visual}<span class="event-cue-copy"><small>${esc(cue.eyebrow)}</small><strong>${esc(cue.title)}</strong><em>${esc(cue.detail)}</em>${itemTray}</span></div>`;
}

export function cardAffordanceBadges(model, instance, { esc }) {
  const affordances = actionsForCard(model, instance).filter((action) => !isPhaseAction(action)).map(actionAffordance);
  const unique = [...new Map(affordances.map((item) => [item.icon, item])).values()];
  return unique.length ? `<span class="card-affordances">${unique.map((item) => `<i title="${esc(item.label)}">${esc(item.icon)}</i>`).join("")}</span>` : "";
}

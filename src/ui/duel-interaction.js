import {
  chainResponseModel,
  chainWindowContext,
  freePriorityPhaseIntents,
  isPhaseAction,
  isTurnPlayerFreePriority,
  pausedPhaseIntent,
  pendingPrompt,
} from "./duel-presentation.js";
import {
  automaticPhasePlan,
  optionalGameplayActions,
  preferredPhaseAction,
} from "./duel-phase-flow.js";

const OPEN_COMMANDS = new Set(["SELECT_IDLECMD", "SELECT_BATTLECMD"]);
const RESPONSE_COMMANDS = new Set(["SELECT_CHAIN", "SELECT_EFFECTYN"]);

const ACTION_AFFORDANCES = Object.freeze({
  activate: { icon: "FX", label: "Activar" },
  chain: { icon: "FX", label: "Activar" },
  "trigger-effect": { icon: "FX", label: "Activar efecto" },
  summon: { icon: "INV", label: "Invocar" },
  "special-summon": { icon: "ESP", label: "Invocación Especial" },
  "set-monster": { icon: "SET", label: "Colocar" },
  "set-spell": { icon: "SET", label: "Colocar" },
  attack: { icon: "ATK", label: "Atacar" },
  position: { icon: "POS", label: "Cambiar posición" },
  phase: { icon: "→", label: "Cambiar fase" },
  place: { icon: "ZON", label: "Elegir zona" },
  "select-card": { icon: "SEL", label: "Seleccionar" },
});

export const DUEL_INTERACTION_MODES = Object.freeze(["open", "response", "decision", "resolving", "result"]);

export function actionAffordance(action) {
  const known = ACTION_AFFORDANCES[action?.actionKind];
  if (known) return known;
  const label = String(action?.label ?? "Acción");
  if (isPhaseAction(action)) return ACTION_AFFORDANCES.phase;
  if (/^Invocar especialmente/i.test(label)) return ACTION_AFFORDANCES["special-summon"];
  if (/^Invocar/i.test(label)) return ACTION_AFFORDANCES.summon;
  if (/^Colocar/i.test(label)) return ACTION_AFFORDANCES["set-monster"];
  if (/^Atacar/i.test(label)) return ACTION_AFFORDANCES.attack;
  if (/^Cambiar posici[oó]n/i.test(label)) return ACTION_AFFORDANCES.position;
  if (/^(Activar|Encadenar)/i.test(label)) return ACTION_AFFORDANCES.activate;
  return { icon: "OK", label };
}

export function playerFacingActionLabel(action) {
  const affordance = actionAffordance(action);
  const raw = String(action?.label ?? affordance.label);
  const cardName = String(action?.cardName ?? "").trim();
  if (cardName) return affordance.label;
  return raw
    .replace(/^Invocar boca arriba en Ataque\s*[·-]\s*/i, "Invocar · ")
    .replace(/^Colocar boca abajo en Defensa\s*[·-]\s*/i, "Colocar · ")
    .replace(/^Colocar Mágica\/Trampa boca abajo\s*[·-]\s*/i, "Colocar · ")
    .replace(/^Invocar especialmente\s+/i, "Invocación Especial · ")
    .replace(/^Atacar con\s+/i, "Atacar · ")
    .replace(/^Cambiar posicion de\s+/i, "Cambiar posición · ")
    .replace(/^Encadenar\s+/i, "Activar · ")
    .replace(/^Si$/i, "Sí");
}

export function interactionMode(view) {
  if (view?.winner !== null && view?.winner !== undefined) return "result";
  if (view?.phasePaused) return "open";
  if (view?.botPending || (!view?.pendingType && view?.status !== undefined)) return "resolving";
  if (OPEN_COMMANDS.has(view?.pendingType) || isTurnPlayerFreePriority(view)) return "open";
  if (RESPONSE_COMMANDS.has(view?.pendingType)) return "response";
  return "decision";
}

function actionKey(action) {
  if (action?.cardUid !== undefined && action?.cardUid !== null) return String(action.cardUid);
  if (action?.cardCode !== undefined && action?.cardCode !== null) return `code:${String(action.cardCode)}`;
  return null;
}

function groupActionsByCard(actions) {
  const grouped = new Map();
  for (const action of actions) {
    const key = actionKey(action);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), action]);
  }
  return grouped;
}

function visibleCardActionKeys(view) {
  const keys = new Set();
  for (const player of view?.players ?? []) {
    const instances = [...(player.hand ?? []), ...(player.monsterZone ?? []), ...(player.spellTrapZone ?? []), ...(player.fieldZone ?? [])];
    for (const instance of instances) {
      if (!instance?.cardId) continue;
      if (instance.uid != null) keys.add(String(instance.uid));
      const code = instance.runtimeCode ?? instance.cardCode;
      if (code != null) keys.add(`code:${String(code)}`);
    }
  }
  return keys;
}

export function actionsForCard(model, instance) {
  if (!model || !instance) return [];
  const exact = model.actionsByCard.get(String(instance.uid));
  if (exact?.length) return exact;
  const code = instance.runtimeCode ?? instance.cardCode;
  return code === undefined ? [] : model.actionsByCard.get(`code:${String(code)}`) ?? [];
}

export function createDuelInteractionModel(view, { manual = false } = {}) {
  const actions = [...(view?.actions ?? [])];
  const mode = interactionMode(view);
  const prompt = pendingPrompt(view, { manual });
  const phaseActions = actions.filter(isPhaseAction);
  const freePriority = isTurnPlayerFreePriority(view);
  const response = view?.pendingType === "SELECT_CHAIN" ? chainResponseModel(actions, true) : null;
  const optionalActions = optionalGameplayActions(view);
  const visibleActionKeys = visibleCardActionKeys(view);
  const source = mode === "response" ? chainWindowContext(view, { manual }) : null;
  const player = Number(view?.priorityPlayer);
  const priorityName = Number.isFinite(player)
    ? manual ? `Jugador ${player + 1}` : player === 0 ? "Tú" : view?.bot?.name ?? "Astra"
    : "Duelo terminado";
  return {
    mode,
    owner: Number.isFinite(player) ? player : null,
    priorityName,
    pending: view?.pendingType ?? null,
    prompt,
    source,
    freePriority,
    actions,
    actionsByCard: groupActionsByCard(actions),
    phaseActions,
    optionalActions,
    advanceAction: preferredPhaseAction(view),
    autoPhaseAdvance: Boolean(automaticPhasePlan(view)),
    phaseIntents: pausedPhaseIntent(view).length ? pausedPhaseIntent(view) : freePriorityPhaseIntents(view),
    responseOptions: response?.options ?? [],
    declineAction: response?.decline ?? actions.find((action) => action?.coreResponse?.yes === false) ?? null,
    globalActions: optionalActions.filter((action) => { const key = actionKey(action); return !key || !visibleActionKeys.has(key); }),
    selectableZones: actions.filter((action) => action?.placement),
    selection: view?.selection ?? null,
    canPass: Boolean(response?.decline),
    rawView: view,
  };
}

export function interactionStatus(model, view, { manual = false } = {}) {
  const turnPlayer = Number(view?.turnPlayer ?? view?.activePlayer ?? view?.priorityPlayer ?? 0);
  const turnName = manual ? `Jugador ${turnPlayer + 1}` : turnPlayer === 0 ? "Tú" : view?.bot?.name ?? "Astra";
  if (model.mode === "result") return { eyebrow: "DUELO TERMINADO", title: "Resultado confirmado", detail: `Turno ${view?.turn ?? "—"}` };
  if (model.mode === "resolving") return { eyebrow: "RESOLVIENDO", title: "El motor está actualizando el duelo", detail: `Turno de ${turnName}` };
  if (model.mode === "response") return { eyebrow: "RESPUESTA DISPONIBLE", title: model.priorityName === "Tú" ? "Puedes responder" : `${model.priorityName} puede responder`, detail: model.source?.title ?? model.prompt.detail };
  if (model.mode === "decision") return { eyebrow: "DECISIÓN NECESARIA", title: model.prompt.title, detail: model.prompt.detail };
  return { eyebrow: "PRIORIDAD LIBRE", title: model.priorityName === "Tú" ? "Puedes actuar" : `${model.priorityName} puede actuar`, detail: `Turno de ${turnName} · turno ${view?.turn ?? "—"}` };
}

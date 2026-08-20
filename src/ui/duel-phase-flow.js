import { isPhaseAction, phaseStepId } from "./duel-presentation.js";

export const AUTO_PHASE_DELAY_MS = 700;

const OPEN_PHASE_COMMANDS = new Set(["SELECT_IDLECMD", "SELECT_BATTLECMD"]);
const ALWAYS_MANUAL_PHASES = new Set(["MAIN_1"]);

function isDeclineAction(action) {
  return action?.actionKind === "decline"
    || action?.coreResponse?.index === null
    || /^No (?:encadenar|activar|responder)$/i.test(action?.label ?? "");
}

export function optionalGameplayActions(view) {
  return (view?.actions ?? []).filter((action) => !isPhaseAction(action) && !isDeclineAction(action) && action?.coreResponse != null);
}

export function preferredPhaseAction(view) {
  const actions = (view?.actions ?? []).filter(isPhaseAction);
  const phase = phaseStepId(view?.phase);
  if (phase === "MAIN_1") {
    return actions.find((action) => action.phaseTarget === "BATTLE")
      ?? actions.find((action) => action.phaseTarget === "END")
      ?? actions[0]
      ?? null;
  }
  if (phase === "BATTLE") {
    return actions.find((action) => action.phaseTarget === "MAIN_2")
      ?? actions.find((action) => action.phaseTarget === "END")
      ?? actions[0]
      ?? null;
  }
  if (phase === "MAIN_2") {
    return actions.find((action) => action.phaseTarget === "END")
      ?? actions[0]
      ?? null;
  }
  return actions[0] ?? null;
}

export function hasOptionalPhaseActions(view) {
  return OPEN_PHASE_COMMANDS.has(view?.pendingType) && optionalGameplayActions(view).length > 0;
}

export function automaticPhasePlan(view) {
  if (!view || view.botPending || (view.winner !== null && view.winner !== undefined)) return null;
  if (ALWAYS_MANUAL_PHASES.has(phaseStepId(view.phase))) return null;
  if (view.phasePaused && !view.pendingType) {
    return {
      kind: "continue-phase",
      key: `continue:${view.turn ?? 0}:${phaseStepId(view.phase)}:${view.decisionCount ?? 0}`,
    };
  }
  if (!OPEN_PHASE_COMMANDS.has(view.pendingType) || optionalGameplayActions(view).length > 0) return null;
  const action = preferredPhaseAction(view);
  if (!action) return null;
  return {
    kind: "phase-action",
    action,
    key: `action:${view.turn ?? 0}:${phaseStepId(view.phase)}:${view.decisionCount ?? 0}:${action.phaseTarget ?? action.label}`,
  };
}

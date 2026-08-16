import { OcgLocation, OcgMessageType } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";

export const GOAT_COMPATIBILITY_CARDS = Object.freeze({
  CONVULSION_OF_NATURE: 62966332,
  DARK_ZEBRA: 59784896,
});

export function filterHistoricalActionProjection(actions, message, session) {
  if (message?.type !== OcgMessageType.SELECT_IDLECMD || !session?.log?.length) return actions;
  const darkZebraLocked = session.log.some((event) => event.type === "CHAINING"
    && Number(event.turn) === Number(session.turn)
    && Number(event.cardCode) === GOAT_COMPATIBILITY_CARDS.DARK_ZEBRA);
  if (!darkZebraLocked) return actions;
  return actions.filter((candidate) => !(candidate.actionKind === "position" && Number(candidate.cardCode) === GOAT_COMPATIBILITY_CARDS.DARK_ZEBRA));
}

export function initialDeckReversalState(scenario) {
  return [0, 1].map((player) => Boolean(scenario?.players?.[player]?.spellTrapZone?.some((spec) => {
    const runtimeCode = Number(spec?.runtimeCode ?? 0);
    const name = String(spec?.name ?? spec ?? "");
    const isConvulsion = runtimeCode === GOAT_COMPATIBILITY_CARDS.CONVULSION_OF_NATURE || /Convulsion of Nature/i.test(name);
    return isConvulsion && String(spec?.position ?? "").toUpperCase() === "FACEUP";
  })));
}

export function updateDeckReversalState(state, message, cardCode) {
  if (Number(cardCode) !== GOAT_COMPATIBILITY_CARDS.CONVULSION_OF_NATURE) return state;
  if (message.type === OcgMessageType.CHAINING) return [true, true];
  if (message.type === OcgMessageType.MOVE && Number(message.to?.location) !== OcgLocation.SZONE) return [false, false];
  return state;
}

import { getCardByName } from "../engine/cards.js";
import { GOAT_BANLIST } from "./banlist-data.js";

const namesToIds = (names) => names.map((name) => getCardByName(name)?.id).filter(Boolean);

export { GOAT_BANLIST };

export const GOAT_BANLIST_IDS = Object.freeze({
  forbidden: new Set(namesToIds(GOAT_BANLIST.forbidden)),
  limited: new Set(namesToIds(GOAT_BANLIST.limited)),
  semiLimited: new Set(namesToIds(GOAT_BANLIST.semiLimited))
});

export function copyLimit(cardId) {
  if (GOAT_BANLIST_IDS.forbidden.has(cardId)) return 0;
  if (GOAT_BANLIST_IDS.limited.has(cardId)) return 1;
  if (GOAT_BANLIST_IDS.semiLimited.has(cardId)) return 2;
  return 3;
}

export function listStatus(cardId) {
  if (GOAT_BANLIST_IDS.forbidden.has(cardId)) return "FORBIDDEN";
  if (GOAT_BANLIST_IDS.limited.has(cardId)) return "LIMITED";
  if (GOAT_BANLIST_IDS.semiLimited.has(cardId)) return "SEMI_LIMITED";
  return "UNLIMITED";
}

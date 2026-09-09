import { OCGCORE_CARD_ENTRIES } from "../data/ocgcore-assets.js";
import { getCardByName } from "../engine/cards.js";
import { semanticRolesForCard } from "./deck-strategy.js";

let byCode = null;

function getByCode() {
  if (!byCode) {
    byCode = new Map();
    for (const entry of OCGCORE_CARD_ENTRIES) {
      const card = getCardByName(entry.name);
      if (!card) continue;
      const sem = { id: card.id, name: card.name, kind: card.kind, attribute: card.attribute, atk: Number(card.atk) || 0, def: Number(card.def) || 0, level: Number(card.level) || 0, roles: semanticRolesForCard(card) };
      if (entry.runtimeCode) byCode.set(Number(entry.runtimeCode), sem);
      if (entry.passcode) byCode.set(Number(entry.passcode), sem);
      if (card.id) byCode.set(Number(card.id), sem);
    }
  }
  return byCode;
}

export function publicCardSemantics(runtimeCode) {
  return getByCode().get(Number(runtimeCode)) ?? null;
}

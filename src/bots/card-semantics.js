import { OCGCORE_CARD_ENTRIES } from "../data/ocgcore-assets.js";
import { getCardByName } from "../engine/cards.js";
import { semanticRolesForCard } from "./deck-strategy.js";

const byCode = new Map(OCGCORE_CARD_ENTRIES.map((entry) => {
  const card = getCardByName(entry.name);
  return [Number(entry.runtimeCode), card ? { id: card.id, name: card.name, kind: card.kind, atk: Number(card.atk) || 0, def: Number(card.def) || 0, level: Number(card.level) || 0, roles: semanticRolesForCard(card) } : null];
}));

export function publicCardSemantics(runtimeCode) {
  return byCode.get(Number(runtimeCode)) ?? null;
}

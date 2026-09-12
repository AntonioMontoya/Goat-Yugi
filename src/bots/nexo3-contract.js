import { DECK_PRESETS } from "../decks/decks.js";

export const NEXO3_BOT_ID = "nexo3";
export const NEXO3_ALGORITHM = "ocgcore-public-belief-policy-value-v1";

export const NEXO3_ALL_DECK_IDS = Object.freeze(DECK_PRESETS.map((deck) => deck.id));
export const NEXO3_ALL_OPPONENT_DECK_IDS = NEXO3_ALL_DECK_IDS;
export const NEXO3_CATALOG_SIZE = NEXO3_ALL_DECK_IDS.length;

export function isNexo3Deck(deckId) {
  return NEXO3_ALL_DECK_IDS.includes(String(deckId ?? ""));
}

export function isNexo3OpponentDeck(deckId) {
  return NEXO3_ALL_OPPONENT_DECK_IDS.includes(String(deckId ?? ""));
}

export function isNexo3MatchupAllowed(playerDeckId, opponentDeckId) {
  return isNexo3OpponentDeck(playerDeckId) && isNexo3Deck(opponentDeckId);
}

export function nexo3DeckLabel(deckId) {
  if (isNexo3Deck(deckId)) return "Mazo del catálogo universal Nexo 3";
  if (isNexo3OpponentDeck(deckId)) return "Mazo de enfrentamiento Nexo 3";
  return "Fuera del catálogo Nexo 3";
}

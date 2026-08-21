import { DECK_PRESETS } from "../decks/decks.js";

export const NEXO2_BOT_ID = "nexo2-pilot";
// Kept as the original focused pilot contract for old checkpoints and tests.
// The universal runtime contract below now accepts every catalogued deck.
export const NEXO2_DECK_IDS = Object.freeze([
  "goat-control",
  "chaos-turbo",
  "flip-control",
  "warrior",
  "panda-burn",
]);

// These are the twenty public opponent lists used by the expanded curriculum.
// The five pilot lists are included so the model can still validate mirrors.
export const NEXO2_OPPONENT_DECK_IDS = Object.freeze([
  ...NEXO2_DECK_IDS,
  "chaos-recruiter",
  "goatformat-chaos-return",
  "goatformat-warrior",
  "goatformat-monarch",
  "goatformat-spell-counter-control",
  "goatformat-gravekeeper",
  "goatformat-horus",
  "goatformat-cyber-stein-otk",
  "goatformat-burn",
  "goatformat-destiny-board",
  "goatformat-banish-turbo",
  "goatformat-lockdown-burn",
  "goatformat-clown-control",
  "goatformat-cat-control",
  "goatformat-guardian-control",
]);

export const NEXO2_ALL_DECK_IDS = Object.freeze(DECK_PRESETS.map((deck) => deck.id));
export const NEXO2_ALL_OPPONENT_DECK_IDS = NEXO2_ALL_DECK_IDS;
export const NEXO2_CATALOG_SIZE = NEXO2_ALL_DECK_IDS.length;

export function isNexo2Deck(deckId) {
  return NEXO2_ALL_DECK_IDS.includes(String(deckId ?? ""));
}

export function isNexo2OpponentDeck(deckId) {
  return NEXO2_ALL_OPPONENT_DECK_IDS.includes(String(deckId ?? ""));
}

export function isNexo2MatchupAllowed(playerDeckId, opponentDeckId) {
  return isNexo2OpponentDeck(playerDeckId) && isNexo2Deck(opponentDeckId);
}

export function nexo2DeckLabel(deckId) {
  if (isNexo2Deck(deckId)) return "Mazo del catálogo universal Nexo 2";
  if (isNexo2OpponentDeck(deckId)) return "Mazo de enfrentamiento Nexo 2";
  return "Fuera del piloto Nexo 2";
}

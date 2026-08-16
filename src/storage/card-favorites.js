export const CARD_FAVORITES_STORAGE_KEY = "goat-local-lab-card-favorites-v1";

function getStorage(storage) {
  if (storage !== undefined) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
}

function normalizeCardIds(cardIds) {
  const values = cardIds instanceof Set ? [...cardIds] : Array.isArray(cardIds) ? cardIds : [];
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

export function loadFavoriteCardIds(storage) {
  const target = getStorage(storage);
  if (!target) return new Set();
  try {
    const parsed = JSON.parse(target.getItem(CARD_FAVORITES_STORAGE_KEY) ?? "[]");
    return new Set(normalizeCardIds(parsed));
  } catch {
    return new Set();
  }
}

export function saveFavoriteCardIds(cardIds, storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(CARD_FAVORITES_STORAGE_KEY, JSON.stringify(normalizeCardIds(cardIds)));
    return true;
  } catch {
    return false;
  }
}

export function isFavoriteCard(cardIds, cardId) {
  const id = Number(cardId);
  return cardIds instanceof Set ? cardIds.has(id) : normalizeCardIds(cardIds).includes(id);
}

export function toggleFavoriteCardId(cardIds, cardId) {
  const id = Number(cardId);
  const next = new Set(cardIds instanceof Set ? cardIds : normalizeCardIds(cardIds));
  if (!Number.isInteger(id) || id <= 0) return next;
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

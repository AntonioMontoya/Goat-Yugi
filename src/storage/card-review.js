export const CARD_WORK_STATUS = Object.freeze({
  YES: "yes",
  NO: "no",
  UNKNOWN: "unknown",
});

export const CARD_WORK_STATUS_LABELS = Object.freeze({
  [CARD_WORK_STATUS.YES]: "Sí",
  [CARD_WORK_STATUS.NO]: "No",
  [CARD_WORK_STATUS.UNKNOWN]: "No se sabe",
});

export const CARD_REVIEW_STORAGE_KEY = "goat-local-lab-card-review-v1";

function getStorage(storage) {
  if (storage !== undefined) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
}

function normalizeStatus(status) {
  return Object.hasOwn(CARD_WORK_STATUS_LABELS, status) ? status : CARD_WORK_STATUS.UNKNOWN;
}

function normalizeEntries(value) {
  const entries = value instanceof Map ? [...value.entries()] : value && typeof value === "object" ? Object.entries(value) : [];
  return entries
    .map(([id, status]) => [Number(id), normalizeStatus(status)])
    .filter(([id]) => Number.isInteger(id) && id > 0);
}

export function loadCardWorkStatuses(storage) {
  const target = getStorage(storage);
  if (!target) return new Map();
  try {
    return new Map(normalizeEntries(JSON.parse(target.getItem(CARD_REVIEW_STORAGE_KEY) ?? "{}")));
  } catch {
    return new Map();
  }
}

export function saveCardWorkStatuses(statuses, storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(CARD_REVIEW_STORAGE_KEY, JSON.stringify(Object.fromEntries(normalizeEntries(statuses))));
    return true;
  } catch {
    return false;
  }
}

export function cardWorkStatus(statuses, cardId) {
  const id = Number(cardId);
  return normalizeStatus(statuses instanceof Map ? statuses.get(id) : statuses?.[id]);
}

export function setCardWorkStatus(statuses, cardId, status) {
  const id = Number(cardId);
  const next = new Map(statuses instanceof Map ? statuses : normalizeEntries(statuses));
  if (Number.isInteger(id) && id > 0) next.set(id, normalizeStatus(status));
  return next;
}

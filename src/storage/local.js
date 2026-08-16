import { hashString } from "../engine/rng.js";

export const STORAGE_SCHEMA = 2;
const STORAGE_KEY = "goat-local-lab-state-v1";
const STORAGE_BACKUP_KEY = "goat-local-lab-state-backup-v1";

function envelope(value) {
  const payload = structuredClone(value);
  return { schema: STORAGE_SCHEMA, savedAt: new Date().toISOString(), checksum: hashString(JSON.stringify(payload)), payload };
}

function unwrap(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.schema !== STORAGE_SCHEMA || !parsed.payload) return { migrated: true, payload: parsed };
  if (parsed.checksum !== hashString(JSON.stringify(parsed.payload))) throw new Error("checksum mismatch");
  return { migrated: false, payload: parsed.payload };
}

export function loadLocalState(factory) {
  const storage = globalThis.localStorage;
  if (!storage) return factory();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return factory();
    const result = unwrap(raw);
    if (result.migrated) saveLocalState(result.payload);
    return result.payload;
  } catch {
    try {
      const backup = storage.getItem(STORAGE_BACKUP_KEY);
      if (backup) return unwrap(backup).payload;
    } catch {
      // fall through to a clean factory state
    }
    return factory();
  }
}

export function saveLocalState(value) {
  const storage = globalThis.localStorage;
  if (!storage) return false;
  const previous = storage.getItem(STORAGE_KEY);
  if (previous) storage.setItem(STORAGE_BACKUP_KEY, previous);
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope(value)));
  return true;
}

export function clearLocalState() {
  const storage = globalThis.localStorage;
  if (storage) {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(STORAGE_BACKUP_KEY);
  }
}

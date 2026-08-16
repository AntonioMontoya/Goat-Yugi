import { hashString } from "../engine/rng.js";
import { createBotRegistry, RETIRED_BOT_IDS } from "../bots/bot-system.js";

export const BOT_STORAGE_SCHEMA = 1;
const BOT_STORAGE_KEY = "goat-local-lab-bot-registry-v1";
const BOT_STORAGE_BACKUP_KEY = "goat-local-lab-bot-registry-backup-v1";

function envelope(registry) {
  const payload = structuredClone(registry);
  return { schema: BOT_STORAGE_SCHEMA, savedAt: new Date().toISOString(), checksum: hashString(JSON.stringify(payload)), payload };
}

function unwrap(raw) {
  const value = JSON.parse(raw);
  if (value?.schema !== BOT_STORAGE_SCHEMA || !value.payload) throw new Error("unsupported bot registry schema");
  if (value.checksum !== hashString(JSON.stringify(value.payload))) throw new Error("bot registry checksum mismatch");
  return value.payload;
}

function reconcileRegistry(stored, factory) {
  const defaults = factory();
  const retired = new Set(RETIRED_BOT_IDS);
  const bots = defaults.bots.map((baseline) => {
    const current = stored?.bots?.find((bot) => bot.id === baseline.id);
    return current ? { ...baseline, profiles: current.profiles ?? {}, rating: current.rating ?? baseline.rating, skillMmr: current.skillMmr ?? baseline.skillMmr } : baseline;
  });
  return { ...defaults, ...stored, schema: BOT_STORAGE_SCHEMA, bots: bots.filter((bot) => !retired.has(bot.id)) };
}

export function loadBotRegistry(factory = createBotRegistry) {
  const storage = globalThis.localStorage;
  if (!storage) return factory();
  try {
    const raw = storage.getItem(BOT_STORAGE_KEY);
    return raw ? reconcileRegistry(unwrap(raw), factory) : factory();
  } catch {
    try {
      const backup = storage.getItem(BOT_STORAGE_BACKUP_KEY);
      return backup ? reconcileRegistry(unwrap(backup), factory) : factory();
    } catch {
      return factory();
    }
  }
}

export function saveBotRegistry(registry) {
  const storage = globalThis.localStorage;
  if (!storage) return false;
  const previous = storage.getItem(BOT_STORAGE_KEY);
  if (previous) storage.setItem(BOT_STORAGE_BACKUP_KEY, previous);
  storage.setItem(BOT_STORAGE_KEY, JSON.stringify(envelope(registry)));
  return true;
}

export function clearBotRegistry() {
  const storage = globalThis.localStorage;
  if (!storage) return;
  storage.removeItem(BOT_STORAGE_KEY);
  storage.removeItem(BOT_STORAGE_BACKUP_KEY);
}

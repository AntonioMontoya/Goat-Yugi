import {
  OCGCORE_CARD_DATA,
  OCGCORE_CARD_ENTRIES,
  OCGCORE_MISSING_SCRIPTS,
} from "../data/ocgcore-assets.js";
import { OCGCORE_SCRIPT_SOURCES } from "../data/ocgcore-script-sources.js";

const entriesByName = new Map(OCGCORE_CARD_ENTRIES.map((entry) => [normalizeName(entry.name), entry]));

function normalizeName(name) {
  return String(name ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isPlayableRuntimeCard(card) {
  return entriesByName.has(normalizeName(card?.name));
}

function isNormalMonster(card) {
  return card?.kind === "MONSTER" && String(card.subtype ?? "").toLowerCase() === "normal";
}

/**
 * Resolves one imported CSV row to the authoritative OCGCore implementation.
 * The fallback descriptor is deliberately not used to claim full coverage:
 * the real effect is the loaded Lua script, or the CDB normal-monster data.
 */
export function cardRuntimeContract(card) {
  const entry = entriesByName.get(normalizeName(card?.name));
  if (!entry) {
    return Object.freeze({ cardId: card?.id ?? null, name: card?.name ?? "", status: "MISSING_RUNTIME", runtime: null });
  }

  const hasCardData = Boolean(OCGCORE_CARD_DATA[entry.runtimeCode]);
  const scriptSource = OCGCORE_SCRIPT_SOURCES[entry.script] ?? null;
  const normalMonster = isNormalMonster(card);
  const scriptLoaded = Boolean(scriptSource);
  const normalCoveredByCdb = normalMonster && OCGCORE_MISSING_SCRIPTS.includes(entry.script) && hasCardData;
  const runtime = scriptLoaded ? "ocgcore-lua" : normalCoveredByCdb ? "ocgcore-cdb-normal" : null;
  const status = hasCardData && runtime ? "EXECUTABLE" : "MISSING_RUNTIME";

  return Object.freeze({
    cardId: card?.id ?? null,
    name: card.name,
    kind: card.kind,
    subtype: card.subtype ?? null,
    passcode: entry.passcode,
    runtimeCode: entry.runtimeCode,
    script: entry.script,
    scriptLoaded,
    hasCardData,
    normalMonster,
    runtime,
    status,
  });
}

export function buildCardRuntimeManifest(cards) {
  return Object.freeze(cards.filter(isPlayableRuntimeCard).map(cardRuntimeContract));
}

export function validateCardRuntime(cards) {
  const manifest = buildCardRuntimeManifest(cards);
  const runtimeCodes = new Set();
  const duplicateRuntimeCodes = [];
  for (const item of manifest) {
    if (runtimeCodes.has(item.runtimeCode)) duplicateRuntimeCodes.push(item.runtimeCode);
    runtimeCodes.add(item.runtimeCode);
  }

  const byRuntime = manifest.reduce((counts, item) => {
    const key = item.runtime ?? "missing";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const missing = manifest.filter((item) => item.status !== "EXECUTABLE");
  return Object.freeze({
    cards: manifest.length,
    executable: manifest.length - missing.length,
    missing,
    duplicateRuntimeCodes: [...new Set(duplicateRuntimeCodes)],
    byRuntime: Object.freeze(byRuntime),
    manifest,
  });
}

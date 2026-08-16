import {
  OcgMessageType,
} from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import {
  OCGCORE_CARD_ENTRIES,
  OCGCORE_MISSING_SCRIPTS,
} from "../data/ocgcore-assets.js";
import { OCGCORE_SCRIPT_SOURCES } from "../data/ocgcore-script-sources.js";
import { HISTORICAL_SCRIPT_OVERRIDES } from "../data/historical-script-overrides.js";
import { CARDS } from "./cards.js";
import { runOcgcoreHeadless } from "./ocgcore-backend.js";
import { validateCardRuntime } from "./card-runtime-contract.js";

const INTERACTION_EVENTS = new Set([
  OcgMessageType.CHAINING,
  OcgMessageType.SUMMONING,
  OcgMessageType.SPSUMMONING,
  OcgMessageType.FLIPSUMMONING,
]);

const cardByName = new Map(CARDS.map((card) => [card.name, card]));

function entryForName(name) {
  return OCGCORE_CARD_ENTRIES.find((entry) => entry.name === name) ?? null;
}

function sourceContract(entry) {
  if (OCGCORE_MISSING_SCRIPTS.includes(entry.script)) {
    return { kind: "ocgcore-cdb-normal", initialEffect: false, source: null };
  }
  const override = HISTORICAL_SCRIPT_OVERRIDES[entry.script] ?? null;
  const source = override ?? OCGCORE_SCRIPT_SOURCES[entry.script] ?? null;
  return {
    kind: override ? "local-goat-override" : "ocgcore-lua",
    initialEffect: Boolean(source && /initial_effect/.test(source)),
    source: source ? entry.script : null,
  };
}

function targetEvents(result, runtimeCode) {
  return result.events.filter((event) => event.code === runtimeCode && INTERACTION_EVENTS.has(event.type));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function auditStratum(entry) {
  const card = cardByName.get(entry.name);
  const source = sourceContract(entry);
  return `${entry.historicalOverride ? "goat" : "official"}:${source.kind}:${card?.effectFamily ?? "UNKNOWN"}`;
}

export function stratifiedCardSample(entries, count, seed = 2005) {
  const requested = Math.max(0, Math.min(entries.length, Number(count) || 0));
  if (!requested || requested === entries.length) return entries.slice(0, requested || entries.length);
  const groups = new Map();
  for (const entry of entries) {
    const key = auditStratum(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const keys = [...groups.keys()].sort((left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`));
  for (const [key, group] of groups) {
    group.sort((left, right) => stableHash(`${seed}:${key}:${left.runtimeCode}`) - stableHash(`${seed}:${key}:${right.runtimeCode}`));
  }
  const selected = [];
  while (selected.length < requested) {
    let progressed = false;
    for (const key of keys) {
      const entry = groups.get(key).shift();
      if (!entry) continue;
      selected.push(entry);
      progressed = true;
      if (selected.length === requested) break;
    }
    if (!progressed) break;
  }
  return selected;
}

async function mapBounded(values, workers, callback) {
  const results = Array(values.length);
  let cursor = 0;
  const count = Math.max(1, Math.min(values.length || 1, Number(workers) || 1, 4));
  await Promise.all(Array.from({ length: count }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(values[index], index);
    }
  }));
  return { results, workers: count };
}

async function auditEntry(entry, index, { maxSteps, seed }) {
  const card = cardByName.get(entry.name);
  const source = sourceContract(entry);
  let run;
  try {
    run = await runOcgcoreHeadless({
      // Three copies keep the fixture close to a legal deck and avoid
      // pathological self-interactions from a 40-copy test deck.
      decks: [[...Array.from({ length: 37 }, () => "Blue-Eyes White Dragon"), ...Array.from({ length: 3 }, () => entry.name)], Array.from({ length: 40 }, () => "Blue-Eyes White Dragon")],
      seed: seed + index,
      maxSteps,
      brave: true,
      includeEvents: true,
    });
  } catch (error) {
    return { name: entry.name, runtimeCode: entry.runtimeCode, kind: card?.kind ?? null, source, status: "CORE_EXCEPTION", error: String(error) };
  }
  const observed = targetEvents(run, entry.runtimeCode);
  const unsupported = ["UNSUPPORTED_MESSAGE", "UNSUPPORTED_RESPONSE", "RETRY_LIMIT"].includes(run.terminationReason);
  return {
    name: entry.name,
    runtimeCode: entry.runtimeCode,
    kind: card?.kind ?? null,
    source,
    status: run.errors.length ? "SMOKE_REVIEW" : "SMOKE_PASS",
    errors: run.errors,
    terminationReason: run.terminationReason,
    botReview: unsupported,
    targetEvents: observed.length,
    effectObserved: observed.length > 0,
    decisions: run.decisions,
  };
}

/**
 * Runs a bounded real-core smoke for each imported card. This is deliberately
 * separate from the unit suite because 1,679 isolated duels are useful for a
 * release audit, but too expensive for every edit/test cycle.
 */
export async function auditAllCardEffects({ maxSteps = 40, limit = null, sample = null, workers = 1, seed = 2005, names = [] } = {}) {
  const contract = validateCardRuntime(CARDS);
  const requested = new Set((names ?? []).map((name) => String(name).trim().toLowerCase()).filter(Boolean));
  const available = requested.size
    ? OCGCORE_CARD_ENTRIES.filter((entry) => requested.has(entry.name.toLowerCase()))
    : OCGCORE_CARD_ENTRIES;
  const selectionMode = requested.size ? "targeted" : sample != null ? "stratified" : limit != null ? "prefix" : "full";
  const entries = selectionMode === "stratified"
    ? stratifiedCardSample(available, sample, seed)
    : available.slice(0, limit ?? available.length);
  const mapped = await mapBounded(entries, workers, (entry, index) => auditEntry(entry, index, { maxSteps, seed }));
  const cards = mapped.results;
  const failures = cards.filter((card) => card.status !== "SMOKE_PASS");
  const botReviews = cards.filter((card) => card.botReview);
  const sourceFailures = cards.filter((card) => !card.source.initialEffect && card.source.kind !== "ocgcore-cdb-normal");
  const effectObserved = cards.filter((card) => card.effectObserved).length;
  const byFamily = {};
  const bySource = {};
  for (const card of cards) {
    const family = cardByName.get(card.name)?.effectFamily ?? "UNKNOWN";
    const familyBucket = byFamily[family] ??= { cards: 0, observed: 0, reviews: 0, failures: 0 };
    familyBucket.cards += 1;
    familyBucket.observed += card.effectObserved ? 1 : 0;
    familyBucket.reviews += card.botReview ? 1 : 0;
    familyBucket.failures += card.status === "SMOKE_PASS" ? 0 : 1;
    const sourceBucket = bySource[card.source.kind] ??= { cards: 0, observed: 0, reviews: 0 };
    sourceBucket.cards += 1;
    sourceBucket.observed += card.effectObserved ? 1 : 0;
    sourceBucket.reviews += card.botReview ? 1 : 0;
  }
  return {
    command: "cards:effect-audit",
    cards: cards.length,
    requestedCards: contract.cards,
    requestedNames: [...requested],
    missingRequestedNames: [...requested].filter((name) => !cards.some((card) => card.name.toLowerCase() === name)),
    selectionMode,
    workers: mapped.workers,
    runtimeContract: contract.executable === contract.cards,
    smokePass: failures.length === 0,
    failures,
    botReviews,
    sourceFailures,
    effectObserved,
    coverage: { byFamily, bySource, observedRatio: cards.length ? Number((effectObserved / cards.length).toFixed(4)) : 0 },
    normalCdbCards: cards.filter((card) => card.source.kind === "ocgcore-cdb-normal").length,
    luaCards: cards.filter((card) => card.source.kind === "ocgcore-lua").length,
    maxSteps,
    results: cards,
  };
}

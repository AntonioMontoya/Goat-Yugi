import createCore, {
  OcgDuelMode,
  OcgLocation,
  OcgPosition,
  OcgProcessResult,
  OcgMessageType,
  OcgResponseType,
  OcgQueryFlags,
  OcgType,
  SelectBattleCMDAction,
  SelectIdleCMDAction,
  cardMatchesOpcode,
} from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import {
  OCGCORE_ASSET_SOURCE,
  OCGCORE_CARD_DATA,
  OCGCORE_CARD_ENTRIES,
  OCGCORE_MISSING_CARDS,
  OCGCORE_MISSING_SCRIPTS,
} from "../data/ocgcore-assets.js";
import { HISTORICAL_SCRIPT_OVERRIDES } from "../data/historical-script-overrides.js";
import { getCard, getCardByName } from "./cards.js";
import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "./constants.js";
import { hashString, SeededRng } from "./rng.js";

const entriesByName = new Map(OCGCORE_CARD_ENTRIES.map((entry) => [normalizeName(entry.name), entry]));
const entriesByRuntimeCode = new Map(OCGCORE_CARD_ENTRIES.map((entry) => [entry.runtimeCode, entry]));
const cardDataByCode = new Map(Object.entries(OCGCORE_CARD_DATA).map(([code, data]) => [Number(code), data]));
let scriptSourcesPromise = null;

function loadScriptSources() {
  scriptSourcesPromise ??= import("../data/ocgcore-script-sources.js").then((module) => module.OCGCORE_SCRIPT_SOURCES);
  return scriptSourcesPromise;
}

function normalizeName(name) {
  return String(name ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeScriptName(name) {
  return String(name ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function seedWords(seed) {
  const value = BigInt(seed ?? 1);
  return [value || 1n, (value + 1n) || 2n, (value + 2n) || 3n, (value + 3n) || 4n];
}

/*
 * The WASM adapter serializes SORT_CARD with an i8 length prefix, while
 * ocgcore's set_responseb() expects the permutation bytes directly (or a
 * single -1 byte to keep the current order).  Presenting an iterable whose
 * length is the first permutation byte makes the adapter emit the exact
 * byte sequence expected by the core without changing the dependency.
 */
function encodeSortCardOrder(order) {
  if (!Array.isArray(order)) return order;
  const bytes = order.map((value) => Number(value));
  if (!bytes.length) return null;
  return {
    get length() { return bytes[0]; },
    [Symbol.iterator]() { return bytes.slice(1)[Symbol.iterator](); },
  };
}

function entryForCard(cardOrId) {
  if (!cardOrId) return null;
  if (typeof cardOrId === "object") {
    if (cardOrId.runtimeCode) {
      const runtimeCode = Number(cardOrId.runtimeCode);
      if (entriesByRuntimeCode.has(runtimeCode)) return entriesByRuntimeCode.get(runtimeCode) ?? null;
      if (cardDataByCode.has(runtimeCode)) return { runtimeCode, name: cardOrId.name ?? `Carta ${runtimeCode}`, auxiliary: true };
    }
    if (cardOrId.cardId != null) {
      return entryForCard(cardOrId.cardId);
    }
    if (cardOrId.id != null) {
      return entryForCard(cardOrId.id);
    }
    if (cardOrId.name) {
      return entryForCard(cardOrId.name);
    }
    return null;
  }
  if (typeof cardOrId === "number") {
    if (entriesByRuntimeCode.has(cardOrId)) {
      return entriesByRuntimeCode.get(cardOrId) ?? null;
    }
    const card = getCard(cardOrId);
    if (card) {
      return entriesByName.get(normalizeName(card.name)) ?? null;
    }
    return null;
  }
  const card = getCardByName(cardOrId);
  const name = card?.name ?? String(cardOrId);
  return entriesByName.get(normalizeName(name)) ?? null;
}

function runtimeCodeForCard(cardOrId) {
  const entry = entryForCard(cardOrId);
  if (!entry) {
    const label = typeof cardOrId === "object" ? (cardOrId.name ?? cardOrId.cardId ?? JSON.stringify(cardOrId)) : String(cardOrId);
    throw new Error(`Carta sin passcode de ocgcore: ${label}`);
  }
  return entry.runtimeCode;
}

function cardReader(code) {
  const data = cardDataByCode.get(Number(code));
  if (!data) return null;
  return {
    ...data,
    setcodes: [...data.setcodes],
    race: BigInt(data.race),
  };
}

function createScriptReader(scriptSources, scriptOverrides = {}) {
  const cardScriptPrelude = [scriptSources["constant.lua"], scriptSources["utility.lua"]].filter(Boolean).join("\n");
  let preludeInjected = false;
  let constantLoaded = false;
  let utilityLoaded = false;
  return (name) => {
    const normalized = normalizeScriptName(name);
    const direct = scriptOverrides[normalized] ?? HISTORICAL_SCRIPT_OVERRIDES[normalized] ?? scriptSources[normalized];
    const basename = normalized.split("/").at(-1);
    const source = direct ?? scriptOverrides[basename] ?? HISTORICAL_SCRIPT_OVERRIDES[basename] ?? scriptSources[basename] ?? null;
    if (source == null) return null;
    if (basename === "constant.lua") {
      if (constantLoaded) return "";
      constantLoaded = true;
      return source;
    }
    if (basename === "utility.lua") {
      if (utilityLoaded) return "";
      utilityLoaded = true;
      return source;
    }
    if (/^c\d+\.lua$/i.test(basename) && !preludeInjected) {
      preludeInjected = true;
      constantLoaded = true;
      utilityLoaded = true;
      return `${cardScriptPrelude}\n${source}`;
    }
    return source;
  };
}

export const GOAT_DUEL_RULES = Object.freeze({
  mode: "MODE_GOAT",
  startingLP: 8000,
  startingDrawCount: 5,
  drawCountPerTurn: 1,
  minimumMainDeck: 40,
  maximumMainDeck: null,
  maximumFusionDeck: null,
});

function makeErrorHandler(errors) {
  return (type, text) => {
    errors.push({ type, text: String(text) });
  };
}

export async function createGoatCore({ errors = [], scriptOverrides = {} } = {}) {
  const [core, scriptSources] = await Promise.all([createCore({ sync: true }), loadScriptSources()]);
  const duelScriptReader = createScriptReader(scriptSources, scriptOverrides);
  return {
    core,
    errors,
    version: core.getVersion(),
    cardReader,
    scriptReader: duelScriptReader,
    assetSource: OCGCORE_ASSET_SOURCE,
  };
}

export async function createGoatDuel({
  decks = [[], []],
  extraDecks = [[], []],
  seed = 1,
  errors = [],
  startingLP = GOAT_DUEL_RULES.startingLP,
  startingDrawCount = GOAT_DUEL_RULES.startingDrawCount,
  drawCountPerTurn = GOAT_DUEL_RULES.drawCountPerTurn,
  start = true,
  scenario = null,
} = {}) {
  const runtime = await createGoatCore({ errors, scriptOverrides: scenario?.auxiliaryScripts ?? {} });
  const { core } = runtime;
  const p0 = scenario?.players?.[0] ?? {};
  const p1 = scenario?.players?.[1] ?? {};
  const team1LP = p0.lp != null && Number(p0.lp) > 0 ? Number(p0.lp) : startingLP;
  const team2LP = p1.lp != null && Number(p1.lp) > 0 ? Number(p1.lp) : startingLP;
  const team1Draw = scenario ? 0 : startingDrawCount;
  const team2Draw = scenario ? 0 : startingDrawCount;

  const handle = core.createDuel({
    flags: OcgDuelMode.MODE_GOAT,
    seed: seedWords(seed),
    team1: { startingLP: team1LP, startingDrawCount: team1Draw, drawCountPerTurn },
    team2: { startingLP: team2LP, startingDrawCount: team2Draw, drawCountPerTurn },
    cardReader,
    scriptReader: runtime.scriptReader,
    errorHandler: makeErrorHandler(errors),
  });
  if (!handle) throw new Error("ocgcore no pudo crear el duelo");

  const resolveMonsterPos = (pos) => {
    if (typeof pos === "number") return pos;
    const str = String(pos ?? "").toUpperCase();
    if (str === "DEFENSE" || str === "FACEUP_DEFENSE") return OcgPosition.FACEUP_DEFENSE;
    if (str === "FACEDOWN_DEFENSE" || str === "SET" || str === "FACEDOWN") return OcgPosition.FACEDOWN_DEFENSE;
    return OcgPosition.FACEUP_ATTACK;
  };

  const resolveSpellTrapPos = (pos) => {
    if (typeof pos === "number") return pos;
    const str = String(pos ?? "").toUpperCase();
    if (str === "FACEUP" || str === "FACEUP_ATTACK") return OcgPosition.FACEUP;
    return OcgPosition.FACEDOWN;
  };

  if (scenario) {
    for (let team = 0; team < 2; team += 1) {
      const p = scenario.players?.[team] ?? {};
      // Hand
      for (const card of p.hand ?? []) {
        if (!card) continue;
        const cardNameOrId = typeof card === "object" && card.runtimeCode != null ? card : (typeof card === "object" ? (card.cardId ?? card.name) : card);
        if (!cardNameOrId) continue;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.HAND,
          sequence: 0,
          position: OcgPosition.FACEDOWN,
        });
      }
      // Monster Zone
      const mzone = p.monsterZone ?? [];
      for (let seq = 0; seq < Math.min(5, mzone.length); seq += 1) {
        const spec = mzone[seq];
        if (!spec) continue;
        const cardNameOrId = typeof spec === "object" && spec.runtimeCode != null ? spec : (typeof spec === "object" ? (spec.cardId ?? spec.name ?? spec.card) : spec);
        if (!cardNameOrId) continue;
        const position = typeof spec === "object" ? resolveMonsterPos(spec.position) : OcgPosition.FACEUP_ATTACK;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.MZONE,
          sequence: seq,
          position,
        });
      }
      // Spell/Trap Zone
      const szone = p.spellTrapZone ?? [];
      for (let seq = 0; seq < Math.min(5, szone.length); seq += 1) {
        const spec = szone[seq];
        if (!spec) continue;
        const cardNameOrId = typeof spec === "object" && spec.runtimeCode != null ? spec : (typeof spec === "object" ? (spec.cardId ?? spec.name ?? spec.card) : spec);
        if (!cardNameOrId) continue;
        const position = typeof spec === "object" ? resolveSpellTrapPos(spec.position) : OcgPosition.FACEDOWN;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.SZONE,
          sequence: seq,
          position,
        });
      }
      // Graveyard
      for (const card of p.grave ?? []) {
        if (!card) continue;
        const cardNameOrId = typeof card === "object" && card.runtimeCode != null ? card : (typeof card === "object" ? (card.cardId ?? card.name) : card);
        if (!cardNameOrId) continue;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.GRAVE,
          sequence: 0,
          position: OcgPosition.FACEUP,
        });
      }
      // Banished (Removed)
      for (const card of p.banished ?? []) {
        if (!card) continue;
        const cardNameOrId = typeof card === "object" && card.runtimeCode != null ? card : (typeof card === "object" ? (card.cardId ?? card.name) : card);
        if (!cardNameOrId) continue;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.REMOVED,
          sequence: 0,
          position: OcgPosition.FACEUP,
        });
      }
      // Deck
      const deckCards = p.deck ?? decks[team] ?? [];
      for (const card of deckCards) {
        if (!card) continue;
        const cardNameOrId = typeof card === "object" && card.runtimeCode != null ? card : (typeof card === "object" ? (card.cardId ?? card.name) : card);
        if (!cardNameOrId) continue;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.DECK,
          sequence: 1,
          position: OcgPosition.FACEDOWN_DEFENSE,
        });
      }
      // Extra / Fusion
      const fusionCards = p.fusion ?? extraDecks[team] ?? [];
      for (const card of fusionCards) {
        if (!card) continue;
        const cardNameOrId = typeof card === "object" && card.runtimeCode != null ? card : (typeof card === "object" ? (card.cardId ?? card.name) : card);
        if (!cardNameOrId) continue;
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(cardNameOrId),
          controller: team,
          location: OcgLocation.EXTRA,
          sequence: 0,
          position: OcgPosition.FACEDOWN_DEFENSE,
        });
      }
    }
  } else {
    const addDeck = (team, cards, location) => {
      const orderedCards = location === OcgLocation.DECK
        ? new SeededRng((Number(seed) ^ (team ? 0x9e3779b9 : 0x85ebca6b)) >>> 0).shuffle([...cards])
        : [...cards];
      orderedCards.forEach((card) => {
        core.duelNewCard(handle, {
          team,
          duelist: 0,
          code: runtimeCodeForCard(card),
          controller: team,
          location,
          sequence: location === OcgLocation.DECK ? 1 : 0,
          position: location === OcgLocation.EXTRA ? OcgPosition.FACEDOWN_DEFENSE : OcgPosition.FACEDOWN_DEFENSE,
        });
      });
    };
    addDeck(0, decks[0] ?? [], OcgLocation.DECK);
    addDeck(1, decks[1] ?? [], OcgLocation.DECK);
    addDeck(0, extraDecks[0] ?? [], OcgLocation.EXTRA);
    addDeck(1, extraDecks[1] ?? [], OcgLocation.EXTRA);
  }

  if (start) core.startDuel(handle);

  return {
    ...runtime,
    handle,
    process: () => core.duelProcess(handle),
    messages: () => core.duelGetMessage(handle),
    respond: (response) => core.duelSetResponse(handle, response?.type === OcgResponseType.SORT_CARD
      ? { ...response, order: encodeSortCardOrder(response.order) }
      : response),
    queryField: () => core.duelQueryField(handle),
    destroy: () => core.destroyDuel(handle),
  };
}

export function makeBaselineDeck(size = 40) {
  const normal = OCGCORE_CARD_ENTRIES.find((entry) => entry.name === "Blue-Eyes White Dragon") ?? OCGCORE_CARD_ENTRIES[0];
  return Array.from({ length: size }, () => normal.name);
}

export async function runAuthoritativeSmoke({ maxSteps = 80 } = {}) {
  // This deterministic fixture intentionally uses Pot of Greed as every card
  // so the activation is guaranteed to be in the opening hand. Deck legality
  // is tested by the deck-builder; this fixture only proves the real Lua card
  // script can activate and draw exactly two cards through ocgcore.
  const errors = [];
  const deck = Array.from({ length: 40 }, () => "Pot of Greed");
  const duel = await createGoatDuel({ decks: [deck, deck], seed: 42, errors });
  let activated = 0;
  let effectDraws = 0;
  let steps = 0;
  const messageTypes = [];
  try {
    while (steps < maxSteps) {
      const status = duel.process();
      const messages = duel.messages();
      messageTypes.push(...messages.map((message) => message.type));
      for (const message of messages) {
        if (message.type === OcgMessageType.ROCK_PAPER_SCISSORS) {
          duel.respond({ type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 2 });
        } else if (message.type === OcgMessageType.SELECT_IDLECMD) {
          const index = activated === 0 ? message.activates.findIndex((card) => card.code === 55144522) : -1;
          if (index >= 0) {
            activated += 1;
            duel.respond({ type: OcgResponseType.SELECT_IDLECMD, action: 5, index });
          } else if (message.to_ep) {
            duel.respond({ type: OcgResponseType.SELECT_IDLECMD, action: 7, index: null });
          } else if (message.to_bp) {
            duel.respond({ type: OcgResponseType.SELECT_IDLECMD, action: 6, index: null });
          }
        } else if (message.type === OcgMessageType.SELECT_PLACE) {
          duel.respond({ type: OcgResponseType.SELECT_PLACE, places: [{ player: message.player, location: OcgLocation.SZONE, sequence: 0 }] });
        } else if (message.type === OcgMessageType.DRAW && message.drawn?.length === 2) {
          effectDraws += 1;
        }
      }
      steps += 1;
      if (status === OcgProcessResult.END || (activated > 0 && effectDraws > 0)) break;
    }
  } finally {
    duel.destroy();
  }
  return {
    activated,
    effectDraws,
    passed: activated === 1 && effectDraws === 1 && errors.length === 0,
    errors,
    steps,
    messageTypes,
  };
}

export async function validateOcgcoreScripts({ maxSteps = 2000 } = {}) {
  const errors = [];
  const duel = await createGoatDuel({ decks: [makeBaselineDeck(), makeBaselineDeck()], errors, start: false });
  const seen = new Set();
  const loadFailures = [];
  let loadedScripts = 0;
  duel.core.loadScript(duel.handle, "bootstrap.lua", "self_table={}; self_code=0");
  for (const entry of OCGCORE_CARD_ENTRIES) {
    if (seen.has(entry.runtimeCode)) continue;
    seen.add(entry.runtimeCode);
    const key = entry.script;
    const source = duel.scriptReader(key);
    if (!source) {
      if (!OCGCORE_MISSING_SCRIPTS.includes(key)) loadFailures.push({ name: entry.name, key, reason: "missing_source" });
      continue;
    }
    const loaded = duel.core.loadScript(duel.handle, key, source);
    if (!loaded) loadFailures.push({ name: entry.name, key, reason: "core_rejected_script" });
    else loadedScripts += 1;
  }
  duel.destroy();
  const runtimeSmoke = await runAuthoritativeSmoke({ maxSteps: Math.min(maxSteps, 80) });
  return {
    source: OCGCORE_ASSET_SOURCE,
    cards: OCGCORE_CARD_ENTRIES.length,
    missingCards: OCGCORE_MISSING_CARDS,
    missingScripts: OCGCORE_MISSING_SCRIPTS,
    loadedScripts,
    loadFailures,
    errors,
    process: runtimeSmoke,
    constants: {
      start: OcgMessageType.START,
      idle: OcgMessageType.SELECT_IDLECMD,
      responseIdle: OcgResponseType.SELECT_IDLECMD,
    },
  };
}

function firstFreeFieldPlaces(fieldMask, count, player) {
  const owner = Number(player) === 1 ? 1 : 0;
  const opponent = 1 - owner;
  const candidates = [
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << sequence, player: owner, location: OcgLocation.MZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (8 + sequence), player: owner, location: OcgLocation.SZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (16 + sequence), player: opponent, location: OcgLocation.MZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (24 + sequence), player: opponent, location: OcgLocation.SZONE, sequence })),
  ];
  const free = candidates.filter((candidate) => (fieldMask & candidate.bit) === 0).slice(0, count);
  return (free.length ? free : [{ player, location: OcgLocation.SZONE, sequence: 0 }])
    .map((place) => ({ player: place.player ?? player, location: place.location, sequence: place.sequence }));
}

function firstIndices(minimum, available) {
  return Array.from({ length: Math.min(minimum, available) }, (_, index) => index);
}

function bitFlags(mask, { bigint = false, width = 32 } = {}) {
  const value = bigint ? BigInt(mask ?? 0) : Number(mask ?? 0);
  const flags = [];
  for (let index = 0; index < width; index += 1) {
    const bit = bigint ? 1n << BigInt(index) : 1 << index;
    if ((value & bit) !== (bigint ? 0n : 0) && bit !== (bigint ? 0n : 0)) flags.push(bit);
  }
  return flags;
}

export const CORE_BOT_PROFILES = Object.freeze({
  generic: Object.freeze({ preferredActivations: [], preferredSummons: [], preferredSets: [] }),
  "chaos-turbo": Object.freeze({
    preferredActivations: ["Pot of Greed", "Graceful Charity", "Thunder Dragon", "Mystical Space Typhoon", "Nobleman of Crossout"],
    preferredSummons: ["Black Luster Soldier - Envoy of the Beginning", "Breaker the Magical Warrior", "D.D. Warrior Lady", "Tribe-Infecting Virus"],
    preferredSets: ["Mirror Force", "Torrential Tribute", "Ring of Destruction", "Bottomless Trap Hole"]
  }),
  "goat-control": Object.freeze({
    preferredActivations: ["Scapegoat", "Book of Moon", "Pot of Greed", "Graceful Charity", "Nobleman of Crossout"],
    preferredSummons: ["Breaker the Magical Warrior", "Magician of Faith", "Gravekeeper's Spy", "Spirit Reaper"],
    preferredSets: ["Mirror Force", "Torrential Tribute", "Sakuretsu Armor", "Bottomless Trap Hole"]
  }),
  "chaos-control": Object.freeze({
    preferredActivations: ["Pot of Greed", "Graceful Charity", "Book of Moon", "Mystical Space Typhoon"],
    preferredSummons: ["Black Luster Soldier - Envoy of the Beginning", "Breaker the Magical Warrior", "D.D. Warrior Lady"],
    preferredSets: ["Mirror Force", "Torrential Tribute", "Ring of Destruction"]
  }),
  warrior: Object.freeze({
    preferredActivations: ["Reinforcement of the Army", "Book of Moon", "Mystical Space Typhoon", "Nobleman of Crossout"],
    preferredSummons: ["D.D. Warrior Lady", "Breaker the Magical Warrior", "Spirit Reaper"],
    preferredSets: ["Mirror Force", "Sakuretsu Armor", "Bottomless Trap Hole"]
  }),
  "panda-burn": Object.freeze({
    preferredActivations: ["Pot of Greed", "Graceful Charity", "Scapegoat", "Lightning Vortex"],
    preferredSummons: ["Sangan", "Gravekeeper's Spy", "Spirit Reaper"],
    preferredSets: ["Ring of Destruction", "Torrential Tribute", "Sakuretsu Armor"]
  }),
  "reasoning-gate": Object.freeze({
    preferredActivations: ["Reasoning", "Monster Gate", "Graceful Charity", "Pot of Greed", "Book of Moon"],
    preferredSummons: ["Breaker the Magical Warrior", "Dark Magician of Chaos", "Chaos Sorcerer"],
    preferredSets: ["Solemn Judgment", "Torrential Tribute", "Ring of Destruction"]
  }),
  "earth-aggro": Object.freeze({
    preferredActivations: ["Reinforcement of the Army", "Book of Moon", "Mystical Space Typhoon", "Nobleman of Crossout"],
    preferredSummons: ["Gigantes", "D.D. Warrior Lady", "Exiled Force", "Breaker the Magical Warrior"],
    preferredSets: ["Mirror Force", "Sakuretsu Armor", "Bottomless Trap Hole"]
  }),
  "empty-jar": Object.freeze({
    preferredActivations: ["Morphing Jar", "Book of Moon", "Upstart Goblin", "Card Destruction", "The Forceful Sentry"],
    preferredSummons: ["Morphing Jar", "Cyber Jar", "Magician of Faith"],
    preferredSets: ["Book of Moon", "Solemn Judgment", "Threatening Roar"]
  }),
  "chaos-recruiter": Object.freeze({
    preferredActivations: ["Pot of Greed", "Graceful Charity", "Mystical Space Typhoon", "Nobleman of Crossout"],
    preferredSummons: ["Shining Angel", "Mystic Tomato", "D.D. Warrior Lady", "Black Luster Soldier - Envoy of the Beginning"],
    preferredSets: ["Mirror Force", "Torrential Tribute", "Bottomless Trap Hole"]
  }),
  "flip-control": Object.freeze({
    preferredActivations: ["Book of Moon", "Nobleman of Crossout", "Pot of Greed", "Graceful Charity"],
    preferredSummons: ["Magician of Faith", "Tsukuyomi", "Gravekeeper's Spy", "Breaker the Magical Warrior"],
    preferredSets: ["Mirror Force", "Torrential Tribute", "Sakuretsu Armor"]
  })
});

const INTERACTIVE_MESSAGE_TYPES = new Set([
  OcgMessageType.ROCK_PAPER_SCISSORS,
  OcgMessageType.SELECT_IDLECMD,
  OcgMessageType.SELECT_BATTLECMD,
  OcgMessageType.SELECT_EFFECTYN,
  OcgMessageType.SELECT_YESNO,
  OcgMessageType.SELECT_OPTION,
  OcgMessageType.SELECT_CARD,
  OcgMessageType.SELECT_CHAIN,
  OcgMessageType.SORT_CHAIN,
  OcgMessageType.SELECT_PLACE,
  OcgMessageType.SELECT_POSITION,
  OcgMessageType.SELECT_TRIBUTE,
  OcgMessageType.SELECT_COUNTER,
  OcgMessageType.SELECT_SUM,
  OcgMessageType.SELECT_DISFIELD,
  OcgMessageType.SORT_CARD,
  OcgMessageType.SELECT_UNSELECT_CARD,
  OcgMessageType.ANNOUNCE_RACE,
  OcgMessageType.ANNOUNCE_ATTRIB,
  OcgMessageType.ANNOUNCE_CARD,
  OcgMessageType.ANNOUNCE_NUMBER,
]);

function interactiveMessage(messages) {
  return [...messages].reverse().find((message) => INTERACTIVE_MESSAGE_TYPES.has(message.type)) ?? null;
}

function profileFor(profile) {
  if (typeof profile === "string") return CORE_BOT_PROFILES[profile] ?? CORE_BOT_PROFILES.generic;
  return profile ?? CORE_BOT_PROFILES.generic;
}

function normalizedCardName(code) {
  return normalizeName(entriesByRuntimeCode.get(Number(code))?.name);
}

function preferenceScore(card, preferences = []) {
  const name = normalizedCardName(card?.code);
  const index = preferences.findIndex((candidate) => normalizeName(candidate) === name);
  return index < 0 ? 0 : preferences.length - index;
}

function strongestIndex(cards = [], preferences = [], field = "attack") {
  return cards.reduce((best, card, index) => {
    const currentScore = preferenceScore(card, preferences) * 100000 + Number(card?.[field] ?? cardDataByCode.get(Number(card?.code))?.[field] ?? 0);
    const bestScore = best < 0 ? -1 : preferenceScore(cards[best], preferences) * 100000 + Number(cards[best]?.[field] ?? cardDataByCode.get(Number(cards[best]?.code))?.[field] ?? 0);
    return currentScore > bestScore ? index : best;
  }, -1);
}

function firstPreferredIndices(cards = [], minimum = 0, preferences = []) {
  const order = cards.map((card, index) => ({ index, score: preferenceScore(card, preferences) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(minimum, cards.length));
  return order.map((entry) => entry.index).sort((a, b) => a - b);
}

export function normalizeLp(value) {
  const lp = Number(value) || 0;
  return lp > 0x80000000 ? 0 : lp;
}

function jsonSafe(value) {
  if (typeof value === "bigint") return { __type: "bigint", value: value.toString() };
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]));
  return value;
}

function fromJsonSafe(value) {
  if (Array.isArray(value)) return value.map(fromJsonSafe);
  if (value && typeof value === "object") {
    if (value.__type === "bigint") return BigInt(value.value);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, fromJsonSafe(child)]));
  }
  return value;
}

const BOT_QUERY_FLAGS = OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.IS_PUBLIC | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.COUNTERS;

function botCardSnapshot(info, { known = false } = {}) {
  if (!info) return null;
  const code = known ? Number(info.code) || 0 : 0;
  const data = code ? cardDataByCode.get(code) : null;
  const entry = code ? entriesByRuntimeCode.get(code) : null;
  const faceUp = Boolean((Number(info.position) || 0) & OcgPosition.FACEUP);
  // The bundled query decoder does not currently consume the TYPE payload
  // safely, so derive it from the authoritative public card database once the
  // card code is visible. This includes the four Scapegoat Token codes.
  const type = known || faceUp ? Number(data?.type) || 0 : null;
  return {
    runtimeCode: code,
    controller: Number(info.controller) || 0,
    location: Number(info.location) || 0,
    sequence: Number(info.sequence) || 0,
    name: known ? entry?.name ?? data?.name ?? null : null,
    known,
    public: Boolean(info.isPublic) || faceUp,
    faceUp,
    position: Number(info.position) || 0,
    type,
    isToken: type !== null && (type & OcgType.TOKEN) !== 0,
    attack: known || faceUp ? Number(info.attack) || Number(data?.attack) || 0 : null,
    defense: known || faceUp ? Number(info.defense) || Number(data?.defense) || 0 : null,
    counters: known || faceUp ? { ...(info.counters ?? {}) } : {},
  };
}

function botLocation(duel, controller, location, player, { hiddenOpponent = true } = {}) {
  const values = duel.core.duelQueryLocation(duel.handle, { flags: BOT_QUERY_FLAGS, controller, location }) ?? [];
  const own = Number(controller) === Number(player);
  // duelQueryLocation returns card query payloads, not full locators. Preserve
  // the queried controller/location and the array slot so target evaluation
  // does not collapse every card onto player 0, zone 0, sequence 0.
  return values.map((info, sequence) => botCardSnapshot(info ? {
    ...info,
    controller: info.controller ?? controller,
    location: info.location ?? location,
    sequence: info.sequence ?? sequence,
  } : null, { known: own || (!hiddenOpponent && Boolean(info?.isPublic)) || Boolean(info?.isPublic) || Boolean((Number(info?.position) || 0) & OcgPosition.FACEUP) })).filter(Boolean);
}

/**
 * Safe bot observation. It deliberately contains no duel handle, seed or
 * opponent hand/deck identities. The core still remains the authority for
 * every legal response; this is only the information a player could know.
 */
export function createBotObservation(duel, player = 0, message = null, { turn = 0, turnPlayer = null, phase = null, decisions = 0, deckKnowledge = null } = {}) {
  const field = duel?.core?.duelQueryField?.(duel.handle) ?? {};
  const players = field.players ?? [];
  const ownRaw = players[Number(player)] ?? {};
  const opponentRaw = players[1 - Number(player)] ?? {};
  const ownHand = botLocation(duel, player, OcgLocation.HAND, player);
  const ownMonsters = botLocation(duel, player, OcgLocation.MZONE, player);
  const ownBackrow = botLocation(duel, player, OcgLocation.SZONE, player);
  const ownGrave = botLocation(duel, player, OcgLocation.GRAVE, player);
  const ownBanished = botLocation(duel, player, OcgLocation.REMOVED, player);
  const opponentMonsters = botLocation(duel, 1 - Number(player), OcgLocation.MZONE, player);
  const opponentBackrow = botLocation(duel, 1 - Number(player), OcgLocation.SZONE, player);
  const opponentGrave = botLocation(duel, 1 - Number(player), OcgLocation.GRAVE, player);
  const opponentBanished = botLocation(duel, 1 - Number(player), OcgLocation.REMOVED, player);
  const knownCards = [...ownHand, ...ownMonsters, ...ownBackrow, ...ownGrave, ...ownBanished, ...opponentMonsters, ...opponentBackrow, ...opponentGrave, ...opponentBanished];
  const graveRoles = new Set(ownGrave.flatMap((card) => deckKnowledge?.byRuntimeCode?.[String(card.runtimeCode)]?.roles ?? []));
  return {
    schema: 1,
    player: Number(player),
    turn: Number(turn) || 0,
    turnPlayer: Number.isFinite(Number(turnPlayer)) ? Number(turnPlayer) : null,
    isOwnTurn: Number.isFinite(Number(turnPlayer)) ? Number(turnPlayer) === Number(player) : null,
    phase,
    decisions: Number(decisions) || 0,
    ownLp: normalizeLp(ownRaw.lp),
    opponentLp: normalizeLp(opponentRaw.lp),
    handSize: ownHand.length || Number(ownRaw.hand_size) || 0,
    opponentHandSize: Number(opponentRaw.hand_size) || 0,
    ownDeckSize: Number(ownRaw.deck_size) || 0,
    opponentDeckSize: Number(opponentRaw.deck_size) || 0,
    ownBoardPower: ownMonsters.reduce((sum, card) => sum + (Number(card.attack) || 0), 0),
    opponentThreat: opponentMonsters.reduce((sum, card) => sum + (Number(card.attack) || 0), 0),
    ownMonsterCount: ownMonsters.length,
    opponentMonsterCount: opponentMonsters.length,
    ownBackrowCount: ownBackrow.length,
    opponentBackrowCount: opponentBackrow.length,
    ownHand,
    ownMonsters,
    ownBackrow,
    graveyard: ownGrave,
    banished: ownBanished,
    opponentMonsters,
    opponentBackrow,
    opponentGrave,
    opponentBanished,
    publicChain: (field.chain ?? []).map((entry) => ({ code: Number(entry.code) || 0, controller: Number(entry.triggering_controller ?? entry.controller) || 0, location: Number(entry.triggering_location ?? entry.location) || 0, sequence: Number(entry.triggering_sequence ?? entry.sequence) || 0 })),
    knownCardCount: knownCards.filter((card) => card.known).length,
    chaosReady: graveRoles.has("light") && graveRoles.has("dark"),
    requestType: Number(message?.type) || null,
  };
}

function replayBotMetadata(bot) {
  if (!bot) return null;
  const manifest = typeof bot.manifest === "function" ? bot.manifest() : bot;
  return {
    id: manifest.botId ?? manifest.id ?? null,
    name: manifest.name ?? null,
    algorithm: manifest.algorithm ?? null,
    profile: manifest.profile ?? manifest.deckId ?? "generic",
    deckId: manifest.deckId ?? manifest.profile ?? null,
    strategyId: manifest.strategy?.id ?? null,
    deckKnowledgeHash: manifest.strategy?.deckHash ?? null,
    strategyCompatibility: manifest.strategyCompatibility ?? null,
    difficulty: manifest.difficulty ?? null,
    version: Number(manifest.version) || 1,
    state: manifest.state ?? null,
  };
}

export function serializeCoreResponse(response) {
  return jsonSafe(response);
}

export function deserializeCoreResponse(response) {
  return fromJsonSafe(response);
}

export function chooseCoreBotResponse(message, { brave = true, profile = "generic", weights = {} } = {}) {
  const preferences = profileFor(profile);
  const actionWeight = (key, fallback = 0) => Number(weights[key] ?? fallback);
  switch (message.type) {
    case OcgMessageType.ROCK_PAPER_SCISSORS:
      return { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 2 };
    case OcgMessageType.SELECT_IDLECMD:
      if (brave && message.activates.length) {
        const index = strongestIndex(message.activates, preferences.preferredActivations, "attack");
        if (index >= 0 && (preferenceScore(message.activates[index], preferences.preferredActivations) > 0 || actionWeight("activate", 0) >= 0)) {
          return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_ACTIVATE, index };
        }
      }
      if (brave && message.summons.length) {
        const index = strongestIndex(message.summons, preferences.preferredSummons, "attack");
        return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SUMMON, index: Math.max(0, index) };
      }
      if (brave && message.special_summons?.length) {
        const index = strongestIndex(message.special_summons, preferences.preferredSummons, "attack");
        return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON, index: Math.max(0, index) };
      }
      if (message.monster_sets.length) {
        const index = strongestIndex(message.monster_sets, preferences.preferredSummons, "defense");
        return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_MONSTER_SET, index: Math.max(0, index) };
      }
      if (message.spell_sets.length) {
        const index = strongestIndex(message.spell_sets, preferences.preferredSets, "attack");
        return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPELL_SET, index: Math.max(0, index) };
      }
      if (message.pos_changes?.length) {
        const index = strongestIndex(message.pos_changes, preferences.preferredSummons, "defense");
        return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_POS_CHANGE, index: Math.max(0, index) };
      }
      if (message.shuffle) return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SHUFFLE, index: null };
      if (message.to_bp) return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null };
      return { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_EP, index: null };
    case OcgMessageType.SELECT_BATTLECMD:
      if (brave && message.chains?.length) {
        const index = strongestIndex(message.chains, preferences.preferredActivations, "attack");
        if (preferenceScore(message.chains[index], preferences.preferredActivations) > 0 || actionWeight("activate", 0) > 1) {
          return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_CHAIN, index: Math.max(0, index) };
        }
      }
      if (brave && message.attacks.length) {
        const index = strongestIndex(message.attacks, preferences.preferredSummons, "attack");
        return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index: Math.max(0, index) };
      }
      if (message.to_m2) return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null };
      return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null };
    case OcgMessageType.SELECT_EFFECTYN:
      return { type: OcgResponseType.SELECT_EFFECTYN, yes: brave };
    case OcgMessageType.SELECT_YESNO:
      return { type: OcgResponseType.SELECT_YESNO, yes: brave };
    case OcgMessageType.SELECT_OPTION:
      return { type: OcgResponseType.SELECT_OPTION, index: 0 };
    case OcgMessageType.SELECT_CARD:
      return { type: OcgResponseType.SELECT_CARD, indicies: firstPreferredIndices(message.selects, message.min, preferences.preferredActivations) };
    case OcgMessageType.SELECT_CHAIN:
      return { type: OcgResponseType.SELECT_CHAIN, index: message.forced && message.selects.length ? 0 : null };
    case OcgMessageType.SORT_CHAIN:
      return { type: OcgResponseType.SORT_CARD, order: message.cards.map((_, index) => index) };
    case OcgMessageType.SELECT_PLACE:
      return { type: OcgResponseType.SELECT_PLACE, places: firstFreeFieldPlaces(message.field_mask, message.count, message.player) };
    case OcgMessageType.SELECT_POSITION: {
      const positions = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEDOWN_ATTACK];
      return { type: OcgResponseType.SELECT_POSITION, position: positions.find((position) => (message.positions & position) !== 0) ?? OcgPosition.FACEUP_ATTACK };
    }
    case OcgMessageType.SELECT_TRIBUTE:
      return { type: OcgResponseType.SELECT_TRIBUTE, indicies: firstIndices(message.min, message.selects.length) };
    case OcgMessageType.SELECT_SUM: {
      const required = message.selects_must ?? [];
      let total = required.reduce((sum, card) => sum + Number(card.amount || 0), 0);
      const indicies = required.map((_card, index) => index);
      for (const [index, card] of message.selects.entries()) {
        if (total >= Number(message.amount || 0)) break;
        indicies.push(required.length + index);
        total += Number(card.amount || 0);
      }
      return { type: OcgResponseType.SELECT_SUM, indicies };
    }
    case OcgMessageType.SELECT_DISFIELD:
      return { type: OcgResponseType.SELECT_DISFIELD, places: firstFreeFieldPlaces(message.field_mask, message.count, message.player) };
    case OcgMessageType.SELECT_UNSELECT_CARD:
      return {
        type: OcgResponseType.SELECT_UNSELECT_CARD,
        index: message.can_finish && message.min === 0
          ? null
          : (message.select_cards?.length ? 0 : message.unselect_cards?.length ? message.select_cards?.length ?? 0 : null),
      };
    case OcgMessageType.SORT_CARD:
      return { type: OcgResponseType.SORT_CARD, order: message.cards.map((_, index) => index) };
    case OcgMessageType.SELECT_COUNTER:
      {
        let remaining = message.count;
        return { type: OcgResponseType.SELECT_COUNTER, counters: message.cards.map((card) => { const selected = Math.min(card.count, remaining); remaining -= selected; return selected; }) };
      }
    case OcgMessageType.ANNOUNCE_RACE:
      return { type: OcgResponseType.ANNOUNCE_RACE, races: bitFlags(message.available, { bigint: true, width: 64 }).slice(0, Math.max(1, message.count ?? 1)) };
    case OcgMessageType.ANNOUNCE_ATTRIB:
      return { type: OcgResponseType.ANNOUNCE_ATTRIB, attributes: bitFlags(message.available, { width: 8 }).slice(0, Math.max(1, message.count ?? 1)) };
    case OcgMessageType.ANNOUNCE_CARD: {
      const opcodes = message.opcodes ?? [];
      const matching = OCGCORE_CARD_ENTRIES.find((entry) => {
        const data = cardDataByCode.get(Number(entry.runtimeCode));
        if (!data) return false;
        try { return cardMatchesOpcode({ ...data, race: BigInt(data.race) }, opcodes); } catch { return false; }
      });
      return { type: OcgResponseType.ANNOUNCE_CARD, card: matching?.runtimeCode ?? OCGCORE_CARD_ENTRIES[0]?.runtimeCode ?? 0 };
    }
    case OcgMessageType.ANNOUNCE_NUMBER:
      // OCGCore expects the zero-based position in `options`, not the
      // announced number itself. Sending (for example) 3000 here selects an
      // invalid slot and can make the activation resolve without its cost.
      return { type: OcgResponseType.ANNOUNCE_NUMBER, value: 0 };
    default:
      return null;
  }
}

export async function runOcgcoreHeadless({
  decks = [makeBaselineDeck(), makeBaselineDeck()],
  extraDecks = [[], []],
  seed = 1,
  maxSteps = 5000,
  brave = true,
  includeEvents = false,
  botA = null,
  botB = null,
  profileA = "generic",
  profileB = "generic",
  startingPlayer = null,
  onDecision = null,
} = {}) {
  const errors = [];
  const duel = await createGoatDuel({ decks, extraDecks, seed, errors });
  const events = [];
  const decisionTrace = [];
  const bots = [botA, botB];
  const profiles = [profileA, profileB];
  let winner = null;
  let status = null;
  let terminationReason = null;
  let turns = 0;
  let turnPlayer = null;
  let phase = null;
  let decisions = 0;
  let steps = 0;
  let retryCount = 0;
  let lastInteractive = null;
  let lastTrace = null;
  const retryLog = [];
  try {
    while (steps < maxSteps) {
      status = duel.process();
      const messages = duel.messages();
      events.push(...messages.map((message) => ({ type: message.type, player: message.player, code: message.code })));
      const turnMessages = messages.filter((message) => message.type === OcgMessageType.NEW_TURN);
      turns += turnMessages.length;
      if (turnMessages.length) turnPlayer = Number(turnMessages.at(-1).player);
      const phaseMessage = messages.find((message) => message.type === OcgMessageType.NEW_PHASE);
      if (phaseMessage) phase = phaseMessage.phase;
      const winnerMessage = messages.find((message) => message.type === OcgMessageType.WIN);
      if (winnerMessage) winner = winnerMessage.player;
      if (winnerMessage) { terminationReason = "WIN"; break; }
      if (status === OcgProcessResult.END) { terminationReason = "CORE_END"; break; }
      if (status === OcgProcessResult.WAITING) {
        const interactive = interactiveMessage(messages);
        if (!interactive) {
          const retry = messages.some((message) => message.type === OcgMessageType.RETRY);
          if (retry && lastInteractive && lastTrace && retryCount < 3) {
            let retryResponse = chooseCoreBotResponse(lastInteractive, {
              brave: false,
              profile: profiles[lastTrace.player],
              weights: {},
            });
            // A SELECT_PLACE can refer to the other field when an effect hands
            // control to the opponent.  The compact bridge reports only the
            // selecting player, so retry the legal mirrored zone once before
            // classifying the window as a bot limitation.
            if (retryResponse?.type === OcgResponseType.SELECT_PLACE
              && lastInteractive.type === OcgMessageType.SELECT_PLACE
              && Array.isArray(retryResponse.places)
              && retryResponse.places.length) {
              retryResponse = {
                ...retryResponse,
                places: retryResponse.places.map((place) => ({
                  ...place,
                  player: Number(place.player) === 0 ? 1 : 0,
                })),
              };
            }
            if (!retryResponse) { terminationReason = "UNSUPPORTED_RESPONSE"; break; }
            lastTrace.retries ??= [];
            lastTrace.retries.push(serializeCoreResponse(retryResponse));
            retryLog.push({ messageType: lastTrace.messageType, responseType: lastTrace.response?.type ?? null, retryResponseType: retryResponse.type });
            duel.respond(retryResponse);
            retryCount += 1;
            steps += 1;
            continue;
          }
          terminationReason = retry ? "RETRY_LIMIT" : "UNSUPPORTED_MESSAGE";
          break;
        }
        retryCount = 0;
        const player = Number(interactive.player ?? 1);
        const bot = bots[player];
        const botBrave = bot?.difficulty === "easy" ? false : bot?.brave ?? brave;
        const observation = createBotObservation(duel, player, interactive, { turn: turns, turnPlayer, phase, decisions, deckKnowledge: bot?.deckKnowledge });
        const context = { brave: botBrave, profile: bot?.profile ?? profiles[player], weights: bot?.weights ?? {}, player, observation, deckKnowledge: bot?.deckKnowledge ?? null, decisions };
        const response = typeof bot?.chooseResponse === "function"
          ? bot.chooseResponse(interactive, context)
          : typeof bot?.chooseCoreResponse === "function"
            ? bot.chooseCoreResponse(interactive, context)
            : chooseCoreBotResponse(interactive, context);
        if (!response) { terminationReason = "UNSUPPORTED_RESPONSE"; break; }
        if (interactive.type === OcgMessageType.ROCK_PAPER_SCISSORS && startingPlayer !== null && startingPlayer !== undefined) {
          response.value = player === Number(startingPlayer) ? 2 : 1;
        }
        const trace = {
          player,
          messageType: interactive.type,
          requestHash: hashString(JSON.stringify(jsonSafe(interactive))),
          response: serializeCoreResponse(response),
          retries: [],
        };
        decisionTrace.push(trace);
        lastInteractive = interactive;
        lastTrace = trace;
        onDecision?.(trace, { decisions: decisions + 1, message: interactive, observation, bot, response });
        duel.respond(response);
        decisions += 1;
      }
      steps += 1;
    }
    if (!terminationReason && steps >= maxSteps) terminationReason = "DECISION_LIMIT";
  } finally {
    duel.destroy();
  }
  const finalStatus = winner !== null || status === OcgProcessResult.END ? "END" : status === OcgProcessResult.WAITING ? "WAITING" : "CONTINUE";
  const replay = {
    schema: 1,
    engine: "ocgcore",
    engineVersion: ENGINE_VERSION,
    formatVersion: FORMAT_VERSION,
    cardDatabaseVersion: CARD_DATABASE_VERSION,
    seed,
    startingPlayer,
    decks: [decks[0] ?? [], decks[1] ?? []],
    extraDecks,
    bots: bots.map(replayBotMetadata),
    result: winner,
    terminationReason: terminationReason ?? "UNKNOWN",
    turns,
    decisions,
    decisionTrace,
  };
  return {
    winner,
    status: finalStatus,
    statusCode: status,
    completed: status === OcgProcessResult.END || winner !== null,
    terminationReason: terminationReason ?? "UNKNOWN",
    turns,
    decisions,
    steps,
    eventCount: events.length,
    events: includeEvents ? events : events.slice(-40),
    errors,
    retryLog,
    field: null,
    replay,
  };
}

export async function replayOcgcore(replay, { maxSteps = 5000 } = {}) {
  if (!replay || replay.engine !== "ocgcore") throw new Error("El replay no pertenece al backend OCGCore.");
  const errors = [];
  const duel = await createGoatDuel({ decks: replay.decks, extraDecks: replay.extraDecks ?? [[], []], seed: replay.seed, errors });
  const trace = replay.decisionTrace ?? [];
  let cursor = 0;
  let status = null;
  let winner = null;
  let turns = 0;
  let steps = 0;
  let failure = null;
  let lastExpected = null;
  let retryCursor = 0;
  try {
    while (steps < maxSteps) {
      status = duel.process();
      const messages = duel.messages();
      turns += messages.filter((message) => message.type === OcgMessageType.NEW_TURN).length;
      const winnerMessage = messages.find((message) => message.type === OcgMessageType.WIN);
      if (winnerMessage) { winner = winnerMessage.player; break; }
      if (status === OcgProcessResult.END) break;
      if (status === OcgProcessResult.WAITING) {
        const request = interactiveMessage(messages);
        if (!request && messages.some((message) => message.type === OcgMessageType.RETRY)) {
          const expected = lastExpected ?? trace[cursor];
          const retryIndex = retryCursor;
          const response = expected?.retries?.[retryIndex] ?? expected?.response;
          if (!response) {
            failure = "Falta la respuesta registrada para reintentar la ventana del core.";
            break;
          }
          retryCursor += 1;
          duel.respond(deserializeCoreResponse(response));
          steps += 1;
          continue;
        }
        const expected = trace[cursor];
        if (!request || !expected) {
          if (replay.terminationReason === "DECISION_LIMIT" && cursor === trace.length) break;
          failure = "Falta una decisión registrada.";
          break;
        }
        if (Number(expected.player ?? 1) !== Number(request.player ?? 1) || Number(expected.messageType) !== Number(request.type)) {
          failure = `La decisión ${cursor} no coincide con la ventana del core.`;
          break;
        }
        if (expected.requestHash && expected.requestHash !== hashString(JSON.stringify(jsonSafe(request)))) {
          failure = `La ventana ${cursor} cambió durante el replay; el estado interno dejó de ser determinista.`;
          break;
        }
        lastExpected = expected;
        retryCursor = 0;
        duel.respond(deserializeCoreResponse(expected.response));
        cursor += 1;
      }
      steps += 1;
    }
  } finally {
    duel.destroy();
  }
  const matches = !failure && errors.length === 0 && cursor === trace.length && winner === replay.result && turns === replay.turns && (winner !== null || status === OcgProcessResult.END || ["DECISION_LIMIT", "RETRY_LIMIT"].includes(replay.terminationReason));
  return {
    matches,
    failure,
    errors,
    winner,
    statusCode: status,
    terminationReason: replay.terminationReason,
    turns,
    decisions: cursor,
    steps,
    expectedDecisions: trace.length,
  };
}

export {
  OCGCORE_ASSET_SOURCE,
  OCGCORE_CARD_DATA,
  OCGCORE_CARD_ENTRIES,
  OCGCORE_MISSING_CARDS,
  OCGCORE_MISSING_SCRIPTS,
  cardReader,
  entryForCard,
  runtimeCodeForCard,
};

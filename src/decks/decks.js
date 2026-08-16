import { CARD_KIND, VALIDATION_STATUS } from "../engine/constants.js";
import { getCard } from "../engine/cards.js";
import { copyLimit, listStatus } from "../format/banlist.js";
import { hashString } from "../engine/rng.js";
import { extraDeckForStrategy, officialMainDeckForName, GOATFORMAT_GUIDE_DECKS } from "./goatformat-decks.js";

const ids = {
  gemini: 1, chaser: 2, skull: 3, breaker: 4, dd: 5, faith: 6, spy: 7, sangan: 8, serpent: 9,
  tribe: 10, tsuku: 11, tomato: 12, reaper: 13, bls: 14, thunder: 15, airknight: 16,
  pot: 30, graceful: 31, book: 32, mst: 33, heavy: 34, nobleman: 35, scapegoat: 36, snatch: 37,
  premature: 38, swap: 39, rota: 40, duo: 41, vortex: 42,
  mirror: 60, torrential: 61, ring: 62, sakuretsu: 63, call: 64, dust: 65, bottomless: 66
};

function fillTo(core, filler, size = 40) {
  const deck = [...core];
  const counts = new Map();
  const legalCore = [];
  for (const cardId of deck) {
    const count = counts.get(cardId) ?? 0;
    if (count >= copyLimit(cardId)) continue;
    counts.set(cardId, count + 1);
    legalCore.push(cardId);
  }
  deck.length = 0;
  deck.push(...legalCore);
  const pool = [...filler, ...Object.values(ids)];
  let index = 0;
  while (deck.length < size && index < pool.length * 5) {
    const candidate = pool[index % pool.length];
    const count = counts.get(candidate) ?? 0;
    if (count < copyLimit(candidate)) {
      deck.push(candidate);
      counts.set(candidate, count + 1);
    }
    index += 1;
  }
  if (deck.length < size) throw new Error(`No hay suficientes cartas legales para completar un preset (${deck.length}/${size}).`);
  return deck;
}

function preset({ id, name, archetype, readiness, provenance, core, filler, notes, fusion, source = "Prototype seed; not a historical tournament list." }) {
  const officialMain = officialMainDeckForName(name);
  const main = officialMain ?? fillTo(core, filler);
  const resolvedFusion = fusion ?? extraDeckForStrategy({ name, archetype });
  return Object.freeze({
    id,
    name,
    archetype,
    readiness,
    provenance: officialMain ? "goatformat-deck-list" : provenance,
    source: officialMain ? "https://www.goatformat.com/decks.html" : source,
    notes: officialMain ? "Lista principal importada de la sección Deck List de GoatFormat." : notes,
    tags: [archetype],
    main,
    fusion: [...resolvedFusion],
    side: [],
    hash: hashString(JSON.stringify({ id, main, fusion: resolvedFusion, side: [] }))
  });
}

const CORE_DECK_PRESETS = [
  preset({
    id: "chaos-turbo",
    name: "Chaos Turbo",
    archetype: "Chaos / Midrange",
    readiness: VALIDATION_STATUS.PARTIAL,
    provenance: "vertical-seed",
    core: [ids.bls, ids.breaker, ids.dd, ids.sangan, ids.serpent, ids.tribe, ids.pot, ids.graceful, ids.heavy, ids.mst, ids.mirror, ids.torrential, ids.ring, ids.bottomless, ids.nobleman, ids.nobleman, ids.book, ids.book, ids.thunder, ids.thunder, ids.gemini, ids.gemini, ids.gemini, ids.chaser, ids.chaser, ids.spy, ids.spy, ids.faith, ids.faith, ids.tomato, ids.tomato, ids.reaper, ids.reaper, ids.scapegoat, ids.scapegoat, ids.vortex],
    filler: [ids.gemini, ids.chaser, ids.spy, ids.book],
    notes: "Corte jugable para probar LIGHT/DARK, control de tempo y removal. No es una lista histórica certificada."
  }),
  preset({
    id: "goat-control",
    name: "Goat Control",
    archetype: "Control",
    readiness: VALIDATION_STATUS.PARTIAL,
    provenance: "vertical-seed",
    core: [ids.breaker, ids.dd, ids.sangan, ids.serpent, ids.tribe, ids.pot, ids.graceful, ids.book, ids.book, ids.mst, ids.heavy, ids.nobleman, ids.nobleman, ids.scapegoat, ids.scapegoat, ids.mirror, ids.torrential, ids.ring, ids.sakuretsu, ids.sakuretsu, ids.bottomless, ids.faith, ids.faith, ids.spy, ids.spy, ids.reaper, ids.reaper, ids.tomato, ids.tomato, ids.gemini, ids.gemini, ids.gemini, ids.chaser, ids.chaser, ids.vortex, ids.vortex],
    filler: [ids.gemini, ids.spy, ids.book, ids.sakuretsu],
    notes: "Corte jugable centrado en Scapegoat, Book of Moon, flip effects y trampas. No es una lista histórica certificada."
  }),
  preset({ id: "chaos-control", name: "Chaos Control", archetype: "Chaos / Control", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.bls, ids.breaker, ids.dd, ids.sangan, ids.serpent, ids.tribe, ids.pot, ids.graceful, ids.mst, ids.book, ids.book, ids.mirror, ids.torrential, ids.ring, ids.bottomless, ids.gemini, ids.gemini, ids.chaser, ids.spy, ids.spy, ids.faith, ids.faith, ids.tomato, ids.tomato], filler: [ids.gemini, ids.chaser, ids.book, ids.sakuretsu], notes: "Preset experimental generado para diversidad de entrenamiento." }),
  preset({ id: "warrior", name: "Warrior / Anti-Meta", archetype: "Aggro / Anti-meta", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.breaker, ids.dd, ids.sangan, ids.rota, ids.rota, ids.gemini, ids.gemini, ids.gemini, ids.chaser, ids.chaser, ids.book, ids.mst, ids.nobleman, ids.nobleman, ids.mirror, ids.torrential, ids.sakuretsu, ids.sakuretsu, ids.bottomless, ids.reaper, ids.reaper], filler: [ids.gemini, ids.dd, ids.sakuretsu, ids.book], notes: "Preset experimental; requiere ampliar la base de Warrior antes de llamarlo histórico." }),
  preset({ id: "panda-burn", name: "Panda Burn", archetype: "Burn", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.sangan, ids.serpent, ids.pot, ids.graceful, ids.duo, ids.duo, ids.vortex, ids.scapegoat, ids.scapegoat, ids.mirror, ids.ring, ids.ring, ids.sakuretsu, ids.sakuretsu, ids.bottomless], filler: [ids.gemini, ids.reaper, ids.scapegoat, ids.book], notes: "El nombre identifica un arquetipo; las cartas de burn específicas aún no están en el corte." }),
  preset({ id: "reasoning-gate", name: "Reasoning Gate", archetype: "Combo", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.skull, ids.skull, ids.bls, ids.pot, ids.graceful, ids.heavy, ids.mst, ids.book, ids.book, ids.scapegoat, ids.scapegoat, ids.mirror, ids.torrential, ids.ring, ids.bottomless], filler: [ids.gemini, ids.chaser, ids.spy, ids.faith], notes: "Reasoning/Gate todavía no tiene scripts en el subset; preset para planificación." }),
  preset({ id: "earth-aggro", name: "Earth Aggro", archetype: "Aggro", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.gemini, ids.gemini, ids.gemini, ids.chaser, ids.chaser, ids.breaker, ids.dd, ids.sangan, ids.rota, ids.rota, ids.book, ids.book, ids.mst, ids.nobleman, ids.nobleman, ids.mirror, ids.torrential, ids.sakuretsu, ids.sakuretsu], filler: [ids.gemini, ids.chaser, ids.book, ids.sakuretsu], notes: "Preset experimental basado en presión de ATK; no es lista histórica." }),
  preset({ id: "empty-jar", name: "Empty Jar", archetype: "Deck-out / Combo", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.faith, ids.faith, ids.spy, ids.spy, ids.pot, ids.graceful, ids.book, ids.book, ids.scapegoat, ids.scapegoat, ids.mirror, ids.torrential, ids.sakuretsu], filler: [ids.gemini, ids.reaper, ids.book, ids.scapegoat], notes: "Morphing Jar no está implementado en este corte; no usar como prueba de estrategia." }),
  preset({ id: "chaos-recruiter", name: "Chaos Recruiter", archetype: "Chaos / Recruiter", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.bls, ids.sangan, ids.serpent, ids.tomato, ids.tomato, ids.dd, ids.pot, ids.graceful, ids.mst, ids.book, ids.book, ids.mirror, ids.torrential, ids.ring, ids.bottomless], filler: [ids.gemini, ids.spy, ids.tomato, ids.sakuretsu], notes: "Preset experimental; la cadena de recruiters aún necesita más scripts." }),
  preset({ id: "flip-control", name: "Flip Control", archetype: "Control / Flip", readiness: VALIDATION_STATUS.EXPERIMENTAL, provenance: "prototype-seed", core: [ids.faith, ids.faith, ids.spy, ids.spy, ids.sangan, ids.breaker, ids.book, ids.book, ids.nobleman, ids.nobleman, ids.mst, ids.heavy, ids.scapegoat, ids.scapegoat, ids.mirror, ids.torrential, ids.sakuretsu, ids.sakuretsu, ids.bottomless], filler: [ids.gemini, ids.reaper, ids.book, ids.sakuretsu], notes: "Preset experimental centrado en volteos y ventaja incremental." })
];

const coreDeckNames = new Set(CORE_DECK_PRESETS.map((deck) => deck.name));
export const DECK_PRESETS = Object.freeze([
  ...CORE_DECK_PRESETS,
  ...GOATFORMAT_GUIDE_DECKS.filter((deck) => !coreDeckNames.has(deck.name))
]);

const byId = new Map(DECK_PRESETS.map((deck) => [deck.id, deck]));

export function getDeck(deckId) {
  const deck = byId.get(deckId);
  if (!deck) throw new Error(`Deck desconocido: ${deckId}`);
  return structuredClone(deck);
}

export function deckCardCounts(deck) {
  const counts = new Map();
  for (const cardId of [...deck.main, ...deck.fusion, ...deck.side]) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return counts;
}

export function validateDeck(deck, { includeSide = true } = {}) {
  const errors = [];
  const warnings = [];
  const counts = deckCardCounts(deck);
  if (deck.main.length < 40) errors.push(`Main Deck tiene ${deck.main.length}; el mínimo es 40.`);
  if (includeSide && deck.side.length !== 0 && deck.side.length !== 15) warnings.push("En GOAT se usa Side Deck de 0 o 15 cartas; esta lista no tiene una de esas longitudes.");
  for (const [cardId, count] of counts) {
    const card = getCard(cardId);
    if (!card) {
      errors.push(`Card ID ${cardId} no pertenece a la base cargada.`);
      continue;
    }
    const limit = copyLimit(cardId);
    if (limit === 0) errors.push(`${card.name} está prohibida en la lista TCG April 2005.`);
    else if (count > limit) errors.push(`${card.name}: ${count} copias; límite ${limit} (${listStatus(cardId)}).`);
    const authoritativeStatus = card.authoritativeStatus ?? card.status;
    if (authoritativeStatus !== VALIDATION_STATUS.SUPPORTED) warnings.push(`${card.name}: estado del motor ${authoritativeStatus}; no se puede ejecutar con OCGCore.`);
  }
  const unsupported = [...counts.keys()].filter((cardId) => (getCard(cardId)?.authoritativeStatus ?? getCard(cardId)?.status) !== VALIDATION_STATUS.SUPPORTED);
  if (unsupported.length) errors.push("El mazo incluye cartas sin runtime autoritativo; no puede ejecutarse en headless.");
  const limited = [];
  const forbidden = [];
  const exceeded = [];
  const outOfFormat = [];
  const incomplete = [];
  for (const [cardId, count] of counts) {
    const card = getCard(cardId);
    if (!card) continue;
    const limit = copyLimit(cardId);
    if (limit < 3) limited.push({ name: card.name, count, limit });
    if (limit === 0) forbidden.push(card.name);
    if (count > limit) exceeded.push({ name: card.name, count, limit });
    if (card.legalities?.goatFormat !== "LEGAL") outOfFormat.push(card.name);
    if (card.metadataComplete === false || (card.authoritativeStatus ?? card.status) !== VALIDATION_STATUS.SUPPORTED) incomplete.push({ name: card.name, status: card.status, authoritativeStatus: card.authoritativeStatus });
  }
  const monsterCount = deck.main.filter((cardId) => getCard(cardId)?.kind === CARD_KIND.MONSTER).length;
  const spellCount = deck.main.filter((cardId) => getCard(cardId)?.kind === CARD_KIND.SPELL).length;
  const trapCount = deck.main.filter((cardId) => getCard(cardId)?.kind === CARD_KIND.TRAP).length;
  return {
    valid: errors.length === 0,
    headlessReady: errors.length === 0 && unsupported.length === 0,
    errors,
    warnings,
    counts,
    summary: {
      main: deck.main.length,
      fusion: deck.fusion.length,
      side: deck.side.length,
      monsterCount,
      spellCount,
      trapCount,
      limited,
      forbidden,
      exceeded,
      outOfFormat,
      incomplete,
      botCompatible: errors.length === 0 && outOfFormat.length === 0 && unsupported.length === 0
    }
  };
}

export function createCustomDeck({ id = "custom-deck", name = "Custom Deck", archetype = "Custom", source = "local-user", notes = "", tags = [], main = [], fusion = [], side = [] } = {}) {
  const deck = { id, name, archetype, readiness: "EXPERIMENTAL", provenance: "local-user", source, notes, tags: [...tags], main: [...main], fusion: [...fusion], side: [...side] };
  deck.hash = hashString(JSON.stringify({ id: deck.id, main: deck.main, fusion: deck.fusion, side: deck.side }));
  return deck;
}

/**
 * Applies an equal-size side-deck swap without mutating the saved deck. The
 * caller supplies cards leaving Main and cards entering it; every requested
 * card must exist in its corresponding zone and the result is re-hashed.
 */
export function applySideDeckSwap(deck, { mainOut = [], sideIn = [] } = {}) {
  if (!Array.isArray(mainOut) || !Array.isArray(sideIn) || mainOut.length !== sideIn.length) throw new Error("Un side swap necesita el mismo numero de cartas de entrada y salida.");
  const next = structuredClone(deck);
  for (const cardId of mainOut) {
    const index = next.main.indexOf(Number(cardId));
    if (index === -1) throw new Error(`La carta ${cardId} no esta en el Main Deck.`);
    next.main.splice(index, 1);
  }
  for (const cardId of sideIn) {
    const index = next.side.indexOf(Number(cardId));
    if (index === -1) throw new Error(`La carta ${cardId} no esta en el Side Deck.`);
    next.side.splice(index, 1);
    next.main.push(Number(cardId));
  }
  for (const cardId of mainOut) next.side.push(Number(cardId));
  next.hash = hashString(JSON.stringify({ id: next.id, main: next.main, fusion: next.fusion, side: next.side }));
  return next;
}

export function deckToYdk(deck) {
  const section = (title, cards) => `${title}\n${cards.join("\n")}`;
  return [section("#main", deck.main), section("#extra", deck.fusion), section("!side", deck.side)].join("\n");
}

export function deckFromYdk(text) {
  const deck = { main: [], fusion: [], side: [] };
  let zone = "main";
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "#main") { zone = "main"; continue; }
    if (line === "#extra") { zone = "fusion"; continue; }
    if (line === "!side") { zone = "side"; continue; }
    const cardId = Number(line);
    if (Number.isInteger(cardId)) deck[zone].push(cardId);
  }
  return deck;
}

export function getDeckReadiness(deck) {
  const result = validateDeck(deck);
  if (!result.valid) return "INVALID";
  if (result.warnings.length) return "PARTIAL";
  return "SUPPORTED";
}

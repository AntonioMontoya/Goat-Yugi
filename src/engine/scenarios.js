import { getCard, getCardByName } from "./cards.js";
import { createDuel, observe, step } from "./game.js";
import { MONSTER_POSITION, PHASE, STARTING_LIFE_POINTS, ZONE } from "./constants.js";
import { getDeck } from "../decks/decks.js";

function cardIdOf(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const card = getCardByName(value);
    if (!card) throw new Error(`Carta de escenario desconocida: ${value}`);
    return card.id;
  }
  if (value && value.cardId !== undefined) return cardIdOf(value.cardId);
  if (value && value.name) return cardIdOf(value.name);
  throw new Error(`Especificación de carta inválida: ${JSON.stringify(value)}`);
}

function deckIds(value, fallback) {
  if (value === undefined) return getDeck(fallback).main;
  if (typeof value === "string") return getDeck(value).main;
  if (!Array.isArray(value)) throw new Error("Un deck de escenario debe ser un preset o una lista.");
  return value.map(cardIdOf);
}

function zoneName(zone) {
  const normalized = String(zone ?? "").toUpperCase();
  return ({
    DECK: ZONE.DECK,
    HAND: ZONE.HAND,
    GRAVE: ZONE.GRAVE,
    BANISHED: ZONE.BANISHED,
    MONSTER: ZONE.MONSTER,
    MONSTERZONE: ZONE.MONSTER,
    SPELL_TRAP: ZONE.SPELL_TRAP,
    SPELLTRAP: ZONE.SPELL_TRAP,
    SPELLTRAPZONE: ZONE.SPELL_TRAP
  })[normalized] ?? ZONE.DECK;
}

function cardSpecId(spec) {
  return cardIdOf(spec);
}

function findInZone(state, reference) {
  const playerId = Number(reference.player ?? reference.playerId);
  if (!Number.isInteger(playerId) || !state.players[playerId]) throw new Error(`Referencia de escenario sin jugador válido: ${JSON.stringify(reference)}`);
  const p = state.players[playerId];
  const zone = String(reference.zone ?? "HAND").toUpperCase();
  const collections = zone === "FIELD"
    ? [...p.monsterZone, ...p.spellTrapZone]
    : zone === "MONSTER" || zone === "MONSTERZONE"
      ? p.monsterZone
      : zone === "SPELL_TRAP" || zone === "SPELLTRAP" || zone === "SPELLTRAPZONE"
        ? p.spellTrapZone
        : p[zone.toLowerCase()];
  if (!Array.isArray(collections)) throw new Error(`Zona de referencia desconocida: ${reference.zone}`);
  if (reference.uid !== undefined) return collections.find((instance) => instance?.uid === Number(reference.uid))?.uid ?? null;
  if (reference.index !== undefined) return collections[Number(reference.index)]?.uid ?? null;
  const requestedId = reference.cardId === undefined && reference.name === undefined ? null : cardSpecId(reference);
  return collections.find((instance) => instance && (requestedId === null || instance.cardId === requestedId))?.uid ?? null;
}

function resolveActionValue(state, value) {
  if (Array.isArray(value)) return value.map((item) => resolveActionValue(state, item));
  if (!value || typeof value !== "object") return value;
  if (value.ref) return resolveActionValue(state, value.ref);
  if (value.zone && (value.player !== undefined || value.playerId !== undefined) && value.type === undefined) {
    const uid = findInZone(state, value);
    if (uid === null) throw new Error(`No se encontró la carta referenciada: ${JSON.stringify(value)}`);
    return uid;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveActionValue(state, item)]));
}

function removeFromPool(pool, spec) {
  const cardId = cardSpecId(spec);
  const index = pool.findIndex((instance) => instance.cardId === cardId);
  if (index === -1) throw new Error(`El deck del escenario no contiene otra copia de ${getCard(cardId)?.name ?? cardId}.`);
  return pool.splice(index, 1)[0];
}

function placeInstance(instance, spec, zone, ownerId) {
  const card = getCard(instance.cardId);
  const normalizedZone = zoneName(zone);
  instance.zone = normalizedZone;
  instance.controller = Number(spec?.controller ?? ownerId);
  instance.faceUp = spec?.faceUp ?? (normalizedZone === ZONE.MONSTER || normalizedZone === ZONE.SPELL_TRAP ? false : true);
  instance.position = card.kind === "MONSTER" || card.kind === "TOKEN"
    ? spec?.position ?? MONSTER_POSITION.ATTACK
    : null;
  instance.setTurn = spec?.setTurn ?? null;
  instance.summonedTurn = spec?.summonedTurn ?? null;
  instance.positionChangedTurn = spec?.positionChangedTurn ?? null;
  return instance;
}

function placeList(state, playerId, pool, list, zone, destination) {
  for (const spec of list ?? []) {
    const instance = placeInstance(removeFromPool(pool, spec), spec, zone, playerId);
    destination.push(instance);
  }
}

function setupPlayer(state, playerId, configuration, pool) {
  const p = state.players[playerId];
  p.lp = Number(configuration.lp ?? STARTING_LIFE_POINTS);
  p.hand = [];
  p.grave = [];
  p.banished = [];
  p.deck = [];
  p.monsterZone = Array.from({ length: p.monsterZone.length }, () => null);
  p.spellTrapZone = Array.from({ length: p.spellTrapZone.length }, () => null);
  const field = configuration.field ?? {};
  placeList(state, playerId, pool, configuration.hand, ZONE.HAND, p.hand);
  placeList(state, playerId, pool, configuration.grave, ZONE.GRAVE, p.grave);
  placeList(state, playerId, pool, configuration.banished, ZONE.BANISHED, p.banished);
  const monsterSpecs = configuration.monsterZone ?? field.monsterZone ?? [];
  for (let index = 0; index < Math.min(monsterSpecs.length, p.monsterZone.length); index += 1) {
    const spec = monsterSpecs[index];
    if (spec === null || spec === undefined) continue;
    p.monsterZone[index] = placeInstance(removeFromPool(pool, spec), spec, ZONE.MONSTER, playerId);
  }
  const spellTrapSpecs = configuration.spellTrapZone ?? field.spellTrapZone ?? [];
  for (let index = 0; index < Math.min(spellTrapSpecs.length, p.spellTrapZone.length); index += 1) {
    const spec = spellTrapSpecs[index];
    if (spec === null || spec === undefined) continue;
    p.spellTrapZone[index] = placeInstance(removeFromPool(pool, spec), spec, ZONE.SPELL_TRAP, playerId);
  }
  const explicitDeck = configuration.deck ?? null;
  if (explicitDeck) placeList(state, playerId, pool, explicitDeck, ZONE.DECK, p.deck);
  for (const instance of pool) p.deck.push(placeInstance(instance, {}, ZONE.DECK, playerId));
  pool.length = 0;
  p.normalSummonUsed = Boolean(configuration.normalSummonUsed);
  p.lockedNormalSummon = Boolean(configuration.lockedNormalSummon);
}

/**
 * Builds a deterministic, test-only state from a compact JSON fixture. The
 * fixture loader is deliberately separate from the UI and bots; production
 * actions still have to pass through step().
 */
export function createScenario(fixture) {
  const decks = fixture.decks ?? [fixture.deckA, fixture.deckB];
  const deckA = deckIds(decks?.[0], "chaos-turbo");
  const deckB = deckIds(decks?.[1], "goat-control");
  const options = fixture.options ?? {};
  const state = createDuel(deckA, deckB, {
    seed: fixture.seed ?? options.seed ?? 1,
    startingPlayer: fixture.startingPlayer ?? options.startingPlayer ?? 0,
    names: fixture.names ?? ["Scenario A", "Scenario B"],
    maxDecisions: fixture.maxDecisions ?? options.maxDecisions,
    maxTurns: fixture.maxTurns ?? options.maxTurns
  });
  if (!fixture.state) return state;
  const pools = state.players.map((p) => [...p.deck, ...p.hand]);
  const configurations = fixture.state.players ?? fixture.state;
  for (let playerId = 0; playerId < 2; playerId += 1) setupPlayer(state, playerId, configurations[playerId] ?? {}, pools[playerId]);
  const stateConfig = fixture.state.meta ?? fixture.state;
  state.turn = Number(stateConfig.turn ?? 1);
  state.phase = stateConfig.phase ?? PHASE.DRAW;
  state.activePlayer = Number(stateConfig.activePlayer ?? fixture.startingPlayer ?? 0);
  state.priorityPlayer = stateConfig.priorityPlayer ?? state.activePlayer;
  state.needsDraw = stateConfig.needsDraw ?? state.phase === PHASE.DRAW;
  state.reaction = stateConfig.chain ?? stateConfig.reaction ?? null;
  state.winner = null;
  state.terminationReason = null;
  state.invalidAction = null;
  state.decisionCount = 0;
  state.history = [];
  state.log = [];
  state.eventCount = 0;
  state.scenarioId = fixture.id ?? null;
  return state;
}

function compareZone(expected, actual) {
  if (!Array.isArray(expected)) return true;
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const found = actual[index];
    if (wanted === null) {
      if (found !== null) return false;
      continue;
    }
    if (!found) return false;
    if (wanted.cardId !== undefined && found.cardId !== Number(wanted.cardId)) return false;
    if (wanted.name !== undefined && getCard(found.cardId)?.name !== wanted.name) return false;
    for (const key of ["faceUp", "position", "controller", "owner"]) if (wanted[key] !== undefined && found[key] !== wanted[key]) return false;
  }
  return true;
}

export function checkScenario(state, expected = {}) {
  const checks = [];
  checks.push({ key: "winner", pass: expected.winner === undefined || state.winner === expected.winner });
  checks.push({ key: "terminationReason", pass: expected.terminationReason === undefined || state.terminationReason === expected.terminationReason });
  checks.push({ key: "phase", pass: expected.phase === undefined || state.phase === expected.phase });
  checks.push({ key: "turn", pass: expected.turn === undefined || state.turn === Number(expected.turn) });
  if (expected.players) for (let playerId = 0; playerId < expected.players.length; playerId += 1) {
    const wanted = expected.players[playerId] ?? {};
    const found = state.players[playerId];
    if (!found) { checks.push({ key: `players.${playerId}`, pass: false }); continue; }
    if (wanted.lp !== undefined) checks.push({ key: `players.${playerId}.lp`, pass: found.lp === Number(wanted.lp) });
    for (const zone of ["hand", "grave", "banished", "deck", "monsterZone", "spellTrapZone"]) {
      if (wanted[zone] !== undefined) checks.push({ key: `players.${playerId}.${zone}`, pass: compareZone(wanted[zone], found[zone]) });
    }
  }
  if (expected.eventTypes) {
    const events = new Set(state.log.map((event) => event.type));
    checks.push({ key: "eventTypes", pass: expected.eventTypes.every((type) => events.has(type)) });
  }
  return { pass: checks.every((check) => check.pass), checks };
}

export function runScenario(fixture, { throwOnFailure = true } = {}) {
  const state = createScenario(fixture);
  for (const rawAction of fixture.actions ?? []) step(state, resolveActionValue(state, rawAction));
  const result = checkScenario(state, fixture.expect ?? {});
  if (throwOnFailure && !result.pass) throw new Error(`Escenario ${fixture.id ?? "sin-id"} falló: ${result.checks.filter((check) => !check.pass).map((check) => check.key).join(", ")}`);
  return { id: fixture.id ?? null, result, state, observation: observe(state, 0) };
}


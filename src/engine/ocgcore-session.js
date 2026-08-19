import {
  OcgAttribute,
  OcgLocation,
  OcgMessageType,
  OcgPosition,
  OcgProcessResult,
  OcgQueryFlags,
  OcgRace,
  OcgResponseType,
  SelectBattleCMDAction,
  SelectIdleCMDAction,
  cardMatchesOpcode,
} from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import {
  OCGCORE_CARD_ENTRIES,
  OCGCORE_CARD_DATA,
  chooseCoreBotResponse,
  createBotObservation,
  createGoatDuel,
  normalizeLp,
} from "./ocgcore-backend.js";
import { getCardByName } from "./cards.js";
import { filterHistoricalActionProjection, initialDeckReversalState, updateDeckReversalState } from "./goat-session-compatibility.js";

const QUERY_FLAGS = OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.IS_PUBLIC | OcgQueryFlags.LEVEL | OcgQueryFlags.RACE | OcgQueryFlags.ATTRIBUTE | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE;
const cardByRuntimeCode = new Map(OCGCORE_CARD_ENTRIES.map((entry) => [Number(entry.runtimeCode), getCardByName(entry.name)]));
const internalTokenCards = new Map([73915052, 73915053, 73915054, 73915055].map((code) => [code, "Scapegoat Token"]));
const messageNames = new Map(Object.entries(OcgMessageType).filter(([key]) => Number.isNaN(Number(key))).map(([key, value]) => [value, key]));

const GOAT_RACE_LABELS = new Map([
  [OcgRace.WARRIOR, "Guerrero"],
  [OcgRace.SPELLCASTER, "Lanzador de Conjuros"],
  [OcgRace.FAIRY, "Hada"],
  [OcgRace.FIEND, "Demonio"],
  [OcgRace.ZOMBIE, "Zombi"],
  [OcgRace.MACHINE, "Máquina"],
  [OcgRace.AQUA, "Aqua"],
  [OcgRace.PYRO, "Piro"],
  [OcgRace.ROCK, "Roca"],
  [OcgRace.WINGEDBEAST, "Bestia Alada"],
  [OcgRace.PLANT, "Planta"],
  [OcgRace.INSECT, "Insecto"],
  [OcgRace.THUNDER, "Trueno"],
  [OcgRace.DRAGON, "Dragón"],
  [OcgRace.BEAST, "Bestia"],
  [OcgRace.BEASTWARRIOR, "Guerrero-Bestia"],
  [OcgRace.DINOSAUR, "Dinosaurio"],
  [OcgRace.FISH, "Pez"],
  [OcgRace.SEASERPENT, "Serpiente Marina"],
  [OcgRace.REPTILE, "Reptil"],
]);

const ATTRIBUTE_LABELS = new Map([
  [OcgAttribute.EARTH, "TIERRA"],
  [OcgAttribute.WATER, "AGUA"],
  [OcgAttribute.FIRE, "FUEGO"],
  [OcgAttribute.WIND, "VIENTO"],
  [OcgAttribute.LIGHT, "LUZ"],
  [OcgAttribute.DARK, "OSCURIDAD"],
  [OcgAttribute.DIVINE, "DIVINIDAD"],
]);

function cardForCode(code) {
  const runtimeCode = Number(code);
  return cardByRuntimeCode.get(runtimeCode) ?? getCardByName(internalTokenCards.get(runtimeCode)) ?? null;
}

function isFaceUp(position) {
  return Boolean((Number(position) || 0) & OcgPosition.FACEUP);
}

function cardInstance(info, controller, location, sequence, { hidden = false, hand = false } = {}) {
  if (!info) return null;
  const code = Number(info.code) || 0;
  const card = hidden ? null : cardForCode(code);
  return {
    uid: `ocg:${controller}:${location}:${sequence}:${code}`,
    cardId: card?.id ?? null,
    runtimeCode: code,
    controller,
    location,
    sequence,
    faceUp: hand || isFaceUp(info.position),
    position: Number(info.position) || 0,
    defensePosition: Boolean((Number(info.position) || 0) & (OcgPosition.FACEUP_DEFENSE | OcgPosition.FACEDOWN_DEFENSE)),
    level: info.level,
    race: info.race,
    attribute: info.attribute,
    attack: info.attack,
    defense: info.defense,
    public: Boolean(info.isPublic),
  };
}

function queryLocation(duel, controller, location, { slots = null, offset = 0, hide = () => false, hand = false } = {}) {
  const values = duel.core.duelQueryLocation(duel.handle, { flags: QUERY_FLAGS, controller, location }) ?? [];
  const count = slots ?? Math.max(0, values.length - offset);
  return Array.from({ length: count }, (_, index) => {
    const sequence = offset + index;
    return cardInstance(values[sequence], controller, location, sequence, { hidden: hide(values[sequence], sequence), hand });
  });
}

function rawCardCode(value) {
  const raw = typeof value?.card === "number"
    ? value.card
    : value?.code ?? value?.card?.code ?? value?.card_code ?? value?.triggering_card?.code;
  return Number(raw) || 0;
}

function rawCardUid(value) {
  const code = rawCardCode(value);
  const controller = Number(value?.controller);
  const location = Number(value?.location);
  const sequence = Number(value?.sequence);
  if (!code || !Number.isFinite(controller) || !Number.isFinite(location) || !Number.isFinite(sequence)) return null;
  return `ocg:${controller}:${location}:${sequence}:${code}`;
}

function cardActionDetails(card, actionKind) {
  return { cardCode: rawCardCode(card), cardUid: rawCardUid(card), actionKind };
}

function friendlyCard(loc) {
  const code = rawCardCode(loc);
  return cardForCode(code)?.name ?? (code ? `Carta ${code}` : "carta");
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
  const free = candidates
    .filter((candidate) => (fieldMask & candidate.bit) === 0)
    .sort((left, right) => Number(right.player === player) - Number(left.player === player))
    .slice(0, count);
  return (free.length ? free : [{ player, location: OcgLocation.SZONE, sequence: 0 }])
    .map((place) => ({ player: place.player ?? player, location: place.location, sequence: place.sequence }));
}

function firstIndices(minimum, available) {
  return Array.from({ length: Math.min(minimum, available) }, (_, index) => index);
}

function combinations(length, size, limit = 16) {
  const result = [];
  const walk = (start, picked) => {
    if (result.length >= limit) return;
    if (picked.length === size) { result.push([...picked]); return; }
    for (let index = start; index < length; index += 1) {
      walk(index + 1, [...picked, index]);
      if (result.length >= limit) return;
    }
  };
  walk(0, []);
  return result;
}

function counterCombinations(message, limit = 16) {
  const cards = message.cards ?? [];
  const total = Math.max(0, Number(message.count) || 0);
  const results = [];
  const walk = (index, remaining, picked) => {
    if (results.length >= limit) return;
    if (index >= cards.length) {
      if (remaining === 0) results.push([...picked]);
      return;
    }
    const capacity = Math.max(0, Number(cards[index]?.count) || 0);
    for (let amount = 0; amount <= Math.min(capacity, remaining); amount += 1) {
      picked.push(amount);
      walk(index + 1, remaining - amount, picked);
      picked.pop();
      if (results.length >= limit) return;
    }
  };
  walk(0, total, []);
  return results;
}

function allowedPositions(mask) {
  return [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEDOWN_ATTACK]
    .filter((position) => (mask & position) !== 0);
}

function availableGoatRaces(mask) {
  const available = BigInt(mask ?? 0);
  return [...GOAT_RACE_LABELS.entries()].filter(([race]) => (available & race) !== 0n);
}

function availableAttributes(mask) {
  const available = Number(mask ?? 0);
  return [...ATTRIBUTE_LABELS.entries()].filter(([attribute]) => (available & attribute) !== 0);
}

function effectOptionDetails(value, index) {
  let raw;
  try { raw = BigInt(value); } catch { raw = 0n; }
  const code = Number(raw >> 4n);
  const descriptionIndex = Number(raw & 0xfn);
  const card = cardForCode(code);
  if (!card) return { label: `Elegir alternativa ${index + 1}`, cardCode: null, descriptionIndex };
  const clauses = String(card.text ?? "")
    .split(/(?:\.\s+|;\s+|\n+)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const summary = clauses[descriptionIndex] ?? clauses[index] ?? clauses[0] ?? "Aplicar este efecto";
  const shortened = summary.length > 92 ? `${summary.slice(0, 89).trimEnd()}…` : summary;
  return { label: `${card.name}: ${shortened}`, cardCode: code, descriptionIndex };
}

function pendingEffectContext(message) {
  if (!message) return null;
  const cardCode = rawCardCode(message);
  const card = cardForCode(cardCode);
  if (!cardCode && !card) return null;
  return {
    cardCode,
    cardId: card?.id ?? null,
    cardName: card?.name ?? (cardCode ? `Carta ${cardCode}` : "Carta"),
    cardText: card?.text ?? "",
    cardUid: rawCardUid(message),
    controller: Number.isFinite(Number(message.controller)) ? Number(message.controller) : Number(message.player ?? 0),
    location: Number(message.location) || 0,
    sequence: Number(message.sequence) || 0,
    description: message.description === undefined ? null : String(message.description),
  };
}

function sumAmount(card) {
  return Number(card?.amount ?? 0);
}

function sumOptions(message, limit = 24) {
  const required = message.selects_must ?? [];
  const optional = message.selects ?? [];
  const target = Number(message.amount) || 0;
  const minimumCount = Math.max(0, Number(message.min) || 0);
  const maximumCount = Number(message.max) > 0 ? Math.min(optional.length, Number(message.max)) : optional.length;
  const allowGreater = Boolean(message.select_max);
  const requiredTotal = required.reduce((total, card) => total + sumAmount(card), 0);
  const options = [];
  for (let size = minimumCount; size <= maximumCount && options.length < limit; size += 1) {
    for (const indicies of combinations(optional.length, size, limit - options.length)) {
      const total = requiredTotal + indicies.reduce((sum, index) => sum + sumAmount(optional[index]), 0);
      const reachesTarget = allowGreater ? total >= target : total === target;
      const minimalForGreater = !allowGreater || !indicies.some((removedIndex) => total - sumAmount(optional[removedIndex]) >= target);
      if (reachesTarget && minimalForGreater) {
        options.push([
          ...required.map((_card, index) => index),
          ...indicies.map((index) => required.length + index),
        ]);
      }
    }
  }
  return options;
}

function fieldPlaces(fieldMask, player) {
  const owner = Number(player) === 1 ? 1 : 0;
  const opponent = 1 - owner;
  const candidates = [
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << sequence, player: owner, location: OcgLocation.MZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (8 + sequence), player: owner, location: OcgLocation.SZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (16 + sequence), player: opponent, location: OcgLocation.MZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (24 + sequence), player: opponent, location: OcgLocation.SZONE, sequence })),
  ];
  return candidates.filter((candidate) => (fieldMask & candidate.bit) === 0)
    .map((candidate) => ({ player: candidate.player ?? player, location: candidate.location, sequence: candidate.sequence }));
}

function fieldPlaceLabel(place) {
  const zone = place.location === OcgLocation.MZONE ? "Zona de Monstruos" : "Zona de Magias/Trampas";
  return `${zone} ${place.sequence + 1}`;
}

function cardAnnouncementOptions(message, limit = Number.POSITIVE_INFINITY) {
  const opcodes = message.opcodes ?? [];
  return OCGCORE_CARD_ENTRIES.filter((entry) => {
    const data = OCGCORE_CARD_DATA[entry.runtimeCode] ?? OCGCORE_CARD_DATA[String(entry.runtimeCode)];
    if (!data) return false;
    try { return cardMatchesOpcode({ ...data, race: BigInt(data.race) }, opcodes); } catch { return false; }
  }).slice(0, limit);
}

function locationLabel(location) {
  return ({
    [OcgLocation.HAND]: "mano",
    [OcgLocation.MZONE]: "campo",
    [OcgLocation.SZONE]: "retaguardia",
    [OcgLocation.GRAVE]: "Cementerio",
    [OcgLocation.REMOVED]: "Destierro",
    [OcgLocation.DECK]: "Deck",
    [OcgLocation.EXTRA]: "Fusion Deck",
  })[location] ?? "zona";
}

function selectionCardDescriptor(card, index, fallbackPlayer = 0) {
  const cardCode = rawCardCode(card);
  const resolved = cardForCode(cardCode);
  const controller = Number(card?.controller ?? fallbackPlayer) === 1 ? 1 : 0;
  return {
    index,
    cardCode,
    cardId: resolved?.id ?? null,
    cardName: resolved?.name ?? (cardCode ? `Carta ${cardCode}` : "Carta oculta"),
    controller,
    player: controller,
    location: Number(card?.location) || 0,
    locationName: locationLabel(card?.location),
    sequence: Number(card?.sequence) || 0,
    amount: Number(card?.amount ?? card?.release_param) || 0,
    tributeValue: Number(card?.release_param) || 0,
  };
}

function selectionSummary(cards, verb = "Elegir") {
  if (!cards.length) return "Continuar sin seleccionar";
  const counts = new Map();
  for (const card of cards) counts.set(card.cardName, (counts.get(card.cardName) ?? 0) + 1);
  const names = [...counts].map(([name, count]) => `${name}${count > 1 ? ` x${count}` : ""}`).join(" + ");
  const sources = [...new Set(cards.map((card) => card.locationName))].join(" / ");
  const owners = [...new Set(cards.map((card) => `Jugador ${card.controller + 1}`))].join(" / ");
  return `${verb} ${names} · ${sources} · ${owners}`;
}

function selectionSignature(cards) {
  const counts = new Map();
  for (const card of cards) {
    const onField = card.location === OcgLocation.MZONE || card.location === OcgLocation.SZONE;
    const key = `${card.cardCode}:${card.controller}:${card.location}:${onField ? card.sequence : "copy"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `${key}x${count}`).join("|");
}

function selectionActions(message, responseType, { verb = "Elegir", limit = 24 } = {}) {
  const selects = message.selects ?? [];
  const minimum = Math.max(0, Number(message.min) || 0);
  const maximum = Math.min(selects.length, Math.max(minimum, Number(message.max ?? minimum)));
  const options = [];
  const signatures = new Set();
  if (minimum === 0) {
    options.push(coreAction("Continuar sin seleccionar", { type: responseType, indicies: [] }, {
      actionKind: "select-card",
      selectionCards: [],
      selectionMin: minimum,
      selectionMax: maximum,
    }));
    signatures.add("");
  }
  for (let size = Math.max(1, minimum); size <= maximum && options.length < limit; size += 1) {
    for (const indicies of combinations(selects.length, size, limit * 3)) {
      const cards = indicies.map((index) => selectionCardDescriptor(selects[index], index, message.player));
      const signature = selectionSignature(cards);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      options.push(coreAction(selectionSummary(cards, verb), { type: responseType, indicies }, {
        actionKind: "select-card",
        selectionCards: cards,
        selectionMin: minimum,
        selectionMax: maximum,
      }));
      if (options.length >= limit) break;
    }
  }
  if (maximum > Math.max(1, minimum)) {
    const indicies = combinations(selects.length, maximum, 1)[0];
    if (indicies) {
      const cards = indicies.map((index) => selectionCardDescriptor(selects[index], index, message.player));
      const signature = selectionSignature(cards);
      if (!signatures.has(signature)) {
        if (options.length >= limit) options.pop();
        options.push(coreAction(selectionSummary(cards, verb), { type: responseType, indicies }, {
          actionKind: "select-card",
          selectionCards: cards,
          selectionMin: minimum,
          selectionMax: maximum,
        }));
      }
    }
  }
  return options;
}

function selectionView(message, actions) {
  if (!message || ![OcgMessageType.SELECT_CARD, OcgMessageType.SELECT_TRIBUTE, OcgMessageType.SELECT_SUM, OcgMessageType.SELECT_UNSELECT_CARD].includes(message.type)) return null;
  const unselectWindow = message.type === OcgMessageType.SELECT_UNSELECT_CARD;
  const sumMode = message.type === OcgMessageType.SELECT_SUM;
  const tributeMode = message.type === OcgMessageType.SELECT_TRIBUTE;
  const selectable = message.select_cards ?? [];
  const alreadySelected = message.unselect_cards ?? [];
  const required = sumMode ? (message.selects_must ?? []) : [];
  const rawCandidates = sumMode ? [...required, ...(message.selects ?? [])] : message.selects ?? [...selectable, ...alreadySelected];
  const candidates = rawCandidates.map((card, index) => ({
    ...selectionCardDescriptor(card, index, message.player),
    ...(unselectWindow ? { selected: index >= selectable.length } : {}),
    ...(sumMode ? { required: index < required.length } : {}),
  }));
  const minimum = sumMode
    ? required.length + Math.max(0, Number(message.min) || 0)
    : tributeMode ? (Number(message.min) > 0 ? 1 : 0) : Math.max(0, Number(message.min) || 0);
  const maximum = sumMode
    ? required.length + (Number(message.max) > 0 ? Math.min((message.selects ?? []).length, Number(message.max)) : (message.selects ?? []).length)
    : tributeMode ? candidates.length : Math.max(0, Number(message.max ?? message.min) || 0);
  const responseType = ({
    [OcgMessageType.SELECT_CARD]: OcgResponseType.SELECT_CARD,
    [OcgMessageType.SELECT_TRIBUTE]: OcgResponseType.SELECT_TRIBUTE,
    [OcgMessageType.SELECT_SUM]: OcgResponseType.SELECT_SUM,
  })[message.type] ?? null;
  return {
    mode: sumMode ? "sum" : tributeMode ? "tribute" : "cards",
    minimum,
    maximum,
    valueMinimum: tributeMode ? Math.max(0, Number(message.min) || 0) : null,
    valueMaximum: tributeMode ? Math.max(0, Number(message.max ?? message.min) || 0) : null,
    sumMinimum: sumMode ? Math.max(0, Number(message.amount) || 0) : null,
    sumMaximum: sumMode && !message.select_max ? Math.max(0, Number(message.amount) || 0) : null,
    allowGreater: sumMode ? Boolean(message.select_max) : false,
    requiredCount: required.length,
    responseType,
    candidateCount: candidates.length,
    candidates,
    selectedCount: unselectWindow ? alreadySelected.length : null,
    sources: [...new Set(candidates.map((card) => card.locationName))],
    optionCount: actions.length,
  };
}

function sortDecisionView(message) {
  if (!message || ![OcgMessageType.SORT_CARD, OcgMessageType.SORT_CHAIN].includes(message.type)) return null;
  return {
    responseType: OcgResponseType.SORT_CARD,
    cards: (message.cards ?? []).map((card, index) => selectionCardDescriptor(card, index, message.player)),
  };
}

function announcementView(message) {
  if (message?.type !== OcgMessageType.ANNOUNCE_CARD) return null;
  return {
    responseType: OcgResponseType.ANNOUNCE_CARD,
    options: cardAnnouncementOptions(message).map((entry) => ({
      cardId: entry.id,
      name: entry.name,
      runtimeCode: entry.runtimeCode,
      coreResponse: { type: OcgResponseType.ANNOUNCE_CARD, card: entry.runtimeCode },
    })),
  };
}

export function multiChoiceView(message) {
  if (!message) return null;
  const count = Math.max(1, Number(message.count) || 1);
  if (message.type === OcgMessageType.SELECT_PLACE && count > 1) return {
    kind: "place", actionKind: "place", count, responseType: OcgResponseType.SELECT_PLACE,
    options: fieldPlaces(message.field_mask, message.player).map((place, index) => ({ index, label: fieldPlaceLabel(place), value: place })),
  };
  if (message.type === OcgMessageType.SELECT_DISFIELD) return {
    kind: "place", actionKind: "disable-place", count, responseType: OcgResponseType.SELECT_DISFIELD,
    options: fieldPlaces(message.field_mask, message.player).map((place, index) => ({ index, label: fieldPlaceLabel(place), value: place })),
  };
  if (message.type === OcgMessageType.ANNOUNCE_RACE) return {
    kind: "race", actionKind: "announce-race", count, responseType: OcgResponseType.ANNOUNCE_RACE,
    options: availableGoatRaces(message.available).map(([value, label], index) => ({ index, label, value })),
  };
  if (message.type === OcgMessageType.ANNOUNCE_ATTRIB) return {
    kind: "attribute", actionKind: "announce-attribute", count, responseType: OcgResponseType.ANNOUNCE_ATTRIB,
    options: availableAttributes(message.available).map(([value, label], index) => ({ index, label, value })),
  };
  return null;
}

export function counterSelectionView(message) {
  if (message?.type !== OcgMessageType.SELECT_COUNTER) return null;
  return {
    responseType: OcgResponseType.SELECT_COUNTER,
    total: Math.max(0, Number(message.count) || 0),
    cards: (message.cards ?? []).map((card, index) => ({ ...selectionCardDescriptor(card, index, message.player), maximum: Math.max(0, Number(card.count) || 0) })),
  };
}

const FUSION_DECISION_SOURCES = new Set(["Polymerization", "Fusion Gate", "Metamorphosis"]);

function decisionContextFor(message, session) {
  if (!message) return null;
  const direct = pendingEffectContext(message);
  const lastChainEnd = session.log.reduce((index, event, current) => event.type === "CHAIN_END" ? current : index, -1);
  const sourceEvent = [...session.log.slice(lastChainEnd + 1)].reverse().find((event) => ["CHAINING", "FLIP", "SUMMONING", "SPSUMMONING", "FLIPSUMMONING"].includes(event.type));
  const source = direct?.cardCode || direct?.cardName
    ? direct
    : sourceEvent ? {
      cardCode: sourceEvent.cardCode ?? null,
      cardId: sourceEvent.cardCode ? cardForCode(sourceEvent.cardCode)?.id ?? null : null,
      cardName: sourceEvent.cardName ?? null,
      cardText: sourceEvent.cardText ?? "",
      controller: sourceEvent.player ?? message.player ?? 0,
    } : null;
  const selectionType = [OcgMessageType.SELECT_CARD, OcgMessageType.SELECT_SUM, OcgMessageType.SELECT_UNSELECT_CARD].includes(message.type);
  const purpose = selectionType && FUSION_DECISION_SOURCES.has(source?.cardName) ? "fusion-material" : null;
  return { purpose, source };
}

function responseSignature(response) {
  return JSON.stringify(response, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}

function chainWindowFingerprint(message, session) {
  if (message?.type !== OcgMessageType.SELECT_CHAIN) return null;
  const choices = (message.selects ?? []).map((card) => [rawCardUid(card), rawCardCode(card), String(card?.description ?? "")]);
  const contextEvent = session.log.at(-1);
  const context = contextEvent ? `${contextEvent.index}:${contextEvent.type}` : "start";
  return responseSignature({ turn: session.turn, phase: session.phase, player: message.player, forced: message.forced, context, choices });
}

function timingWindowFor(message, session) {
  if (message?.type !== OcgMessageType.SELECT_CHAIN) return null;
  const lastChainEnd = session.log.reduce((index, event, current) => event.type === "CHAIN_END" ? current : index, -1);
  const events = session.log.slice(lastChainEnd + 1);
  const lastChain = [...events].reverse().find((event) => event.type === "CHAINING");
  if (lastChain) return { kind: "chain", phase: session.phase, sourcePlayer: lastChain.player };
  const lastDraw = [...events].reverse().find((event) => event.type === "DRAW" && event.turn === session.turn);
  if (session.phase === "DRAW" && lastDraw) {
    return { kind: "post-draw", phase: session.phase, sourcePlayer: lastDraw.player, drawEventIndex: lastDraw.index };
  }
  const lastEvent = events.at(-1) ?? null;
  return {
    kind: "phase-priority",
    phase: session.phase,
    sourcePlayer: session.turnPlayer,
    sourceEventType: lastEvent?.type ?? null,
    sourceEventIndex: lastEvent?.index ?? null,
  };
}

function movementDetails(message) {
  if (message.type !== OcgMessageType.MOVE) return {};
  return {
    fromPlayer: message.from?.controller ?? null,
    fromLocation: locationLabel(message.from?.location),
    fromLocationCode: Number(message.from?.location) || 0,
    fromSequence: message.from?.sequence ?? null,
    fromPosition: Number(message.from?.position) || 0,
    toPlayer: message.to?.controller ?? null,
    toLocation: locationLabel(message.to?.location),
    toLocationCode: Number(message.to?.location) || 0,
    toSequence: message.to?.sequence ?? null,
    toPosition: Number(message.to?.position) || 0,
  };
}

function resolutionDetails(message) {
  if (message.type === OcgMessageType.DRAW) return { drawCount: message.drawn?.length ?? 0 };
  if ([OcgMessageType.CHAINING, OcgMessageType.CHAIN_SOLVING, OcgMessageType.CHAIN_SOLVED].includes(message.type)) {
    return { chainLink: Number(message.chain_size) || 0 };
  }
  return {};
}

function targetDetails(message, duel, { manual = false } = {}) {
  if (message.type !== OcgMessageType.BECOME_TARGET) return {};
  const targets = (message.cards ?? []).map((location) => {
    const values = duel.core.duelQueryLocation(duel.handle, { flags: QUERY_FLAGS, controller: location.controller, location: location.location }) ?? [];
    const info = values[location.sequence];
    const code = Number(info?.code) || 0;
    const visible = manual || Number(location.controller) === 0 || Boolean(info?.isPublic) || isFaceUp(info?.position);
    return {
      controller: Number(location.controller),
      location: Number(location.location),
      sequence: Number(location.sequence),
      cardCode: visible ? code : null,
      cardName: visible && code ? cardForCode(code)?.name ?? null : "carta boca abajo",
    };
  });
  return { targets, targetNames: targets.map((target) => target.cardName).filter(Boolean) };
}

function eventLabel(message, mapPlayer = (player) => player) {
  const name = messageNames.get(message.type) ?? `CORE_${message.type}`;
  const player = mapPlayer(message.player);
  switch (message.type) {
    case OcgMessageType.DRAW: return `${player === 0 ? "Tú robas" : "Astra roba"} ${message.drawn?.length ?? 0} carta(s).`;
    case OcgMessageType.DAMAGE: return `${player === 0 ? "Tú" : "Astra"} recibe ${message.amount ?? 0} de daño.`;
    case OcgMessageType.RECOVER: return `${player === 0 ? "Tú" : "Astra"} recupera ${message.amount ?? 0} LP.`;
    case OcgMessageType.LPUPDATE: return "Los Life Points se actualizan.";
    case OcgMessageType.NEW_TURN: return `Turno de ${player === 0 ? "Tú" : "Astra"}.`;
    case OcgMessageType.NEW_PHASE: return `${phaseLabel(phaseName(message.phase))}.`;
    case OcgMessageType.CHAINING: return `Se inicia una cadena con ${friendlyCard(message)}.`;
    case OcgMessageType.BECOME_TARGET: return "El efecto declara su objetivo.";
    case OcgMessageType.CHAIN_SOLVING: return "La cadena empieza a resolverse.";
    case OcgMessageType.CHAIN_SOLVED: return "Un eslabón de la cadena queda resuelto.";
    case OcgMessageType.CHAIN_END: return "La cadena ha terminado.";
    case OcgMessageType.SUMMONING: return `${friendlyCard(message)} se Invoca de Modo Normal.`;
    case OcgMessageType.SPSUMMONING: return `${friendlyCard(message)} aparece por Invocación Especial.`;
    case OcgMessageType.FLIPSUMMONING: return `${friendlyCard(message)} se Invoca por Volteo.`;
    case OcgMessageType.ATTACK: return `${friendlyCard(message)} declara un ataque.`;
    case OcgMessageType.MOVE: return `${friendlyCard(message)} pasa de ${locationLabel(message.from?.location)} a ${locationLabel(message.to?.location)}.`;
    case OcgMessageType.TOSS_DICE: return `TOSS_DICE ${(message.results ?? []).join(",")}`;
    case OcgMessageType.TOSS_COIN: return `TOSS_COIN ${(message.results ?? []).join(",")}`;
    case OcgMessageType.WIN: return `${player === 0 ? "Tú" : "Astra"} gana el duelo.`;
    default: return name.replaceAll("_", " ");
  }
}

function botSetActionLabel(actionKind) {
  if (actionKind === "set-spell") return "Colocar una Magica/Trampa boca abajo";
  if (actionKind === "set-monster") return "Colocar un monstruo boca abajo en Defensa";
  return "Colocar una carta boca abajo";
}

function publicBotAction(action) {
  if (!action || !["set-monster", "set-spell"].includes(action.actionKind)) return action;
  return { ...action, label: botSetActionLabel(action.actionKind), cardCode: null, cardUid: null };
}

function phaseLabel(phase) {
  return ({ DRAW: "Draw Phase", STANDBY: "Standby Phase", MAIN_1: "Main Phase 1", BATTLE: "Battle Phase", MAIN_2: "Main Phase 2", END: "End Phase" })[phase] ?? phase;
}

function messageCardCode(message) {
  return rawCardCode(message) || null;
}

const LOGGED_MESSAGE_TYPES = new Set([
  OcgMessageType.DRAW,
  OcgMessageType.DAMAGE,
  OcgMessageType.RECOVER,
  OcgMessageType.LPUPDATE,
  OcgMessageType.NEW_TURN,
  OcgMessageType.NEW_PHASE,
  OcgMessageType.CHAINING,
  OcgMessageType.CHAIN_SOLVING,
  OcgMessageType.CHAIN_SOLVED,
  OcgMessageType.CHAIN_END,
  OcgMessageType.BECOME_TARGET,
  OcgMessageType.SUMMONING,
  OcgMessageType.SPSUMMONING,
  OcgMessageType.FLIPSUMMONING,
  OcgMessageType.ATTACK,
  OcgMessageType.MOVE,
  OcgMessageType.TOSS_DICE,
  OcgMessageType.TOSS_COIN,
  OcgMessageType.WIN,
]);

function interactiveMessage(messages) {
  const interactive = new Set([
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
  return [...messages].reverse().find((message) => interactive.has(message.type)) ?? null;
}

function coreAction(label, response, details = {}) {
  return { label, coreResponse: response, ...details };
}

function legacyUserActionsFor(message) {
  if (!message) return [];
  switch (message.type) {
    case OcgMessageType.ROCK_PAPER_SCISSORS:
      return [
        coreAction("Piedra", { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 1 }),
        coreAction("Papel", { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 2 }),
        coreAction("Tijera", { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 3 }),
      ];
    case OcgMessageType.SELECT_IDLECMD:
      return [
        ...message.activates.map((card, index) => coreAction(`Activar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_ACTIVATE, index })),
        ...message.summons.map((card, index) => coreAction(`Invocar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SUMMON, index })),
        ...message.special_summons.map((card, index) => coreAction(`Invocar especialmente ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON, index })),
        ...message.monster_sets.map((card, index) => coreAction(`Colocar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_MONSTER_SET, index })),
        ...message.spell_sets.map((card, index) => coreAction(`Colocar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPELL_SET, index })),
        ...message.pos_changes.map((card, index) => coreAction(`Cambiar posición de ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_POS_CHANGE, index })),
        ...(message.to_bp ? [coreAction("Ir a Battle Phase", { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null })] : []),
        ...(message.to_ep ? [coreAction("Ir a End Phase", { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_EP, index: null })] : []),
      ];
    case OcgMessageType.SELECT_BATTLECMD:
      return [
        ...message.chains.map((card, index) => coreAction(`Activar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_CHAIN, index })),
        ...message.attacks.map((attack, index) => coreAction(`Atacar con ${friendlyCard(attack)}`, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index })),
        ...(message.to_m2 ? [coreAction("Ir a Main Phase 2", { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null })] : []),
        ...(message.to_ep ? [coreAction("Terminar Battle Phase", { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null })] : []),
      ];
    case OcgMessageType.SELECT_EFFECTYN:
      return [coreAction("Sí, activar", { type: OcgResponseType.SELECT_EFFECTYN, yes: true }), coreAction("No", { type: OcgResponseType.SELECT_EFFECTYN, yes: false })];
    case OcgMessageType.SELECT_YESNO:
      return [coreAction("Sí", { type: OcgResponseType.SELECT_YESNO, yes: true }), coreAction("No", { type: OcgResponseType.SELECT_YESNO, yes: false })];
    case OcgMessageType.SELECT_OPTION:
      return message.options.map((_, index) => coreAction(`Opción ${index + 1}`, { type: OcgResponseType.SELECT_OPTION, index }));
    case OcgMessageType.SELECT_CARD: {
      const minimum = Number(message.min) || 0;
      const maximum = Number(message.max ?? minimum);
      const options = minimum === 0 ? [coreAction("No seleccionar", { type: OcgResponseType.SELECT_CARD, indicies: [] })] : [];
      if (minimum === 1 && maximum === 1) {
        options.push(...message.selects.map((card, index) => coreAction(`${friendlyCard(card)} · ${locationLabel(card.location)}`, { type: OcgResponseType.SELECT_CARD, indicies: [index] })));
      } else {
        const subsets = combinations(message.selects.length, minimum);
        options.push(...subsets.map((indicies) => coreAction(`Seleccionar ${indicies.length} cartas`, { type: OcgResponseType.SELECT_CARD, indicies })));
        if (!subsets.length) options.push(coreAction(`Selección automática (${minimum}-${maximum})`, { type: OcgResponseType.SELECT_CARD, indicies: firstIndices(minimum, message.selects.length) }));
      }
      return options;
    }
    case OcgMessageType.SELECT_CHAIN:
      return [
        ...message.selects.map((card, index) => coreAction(`Encadenar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_CHAIN, index })),
        ...(!message.forced ? [coreAction("No encadenar", { type: OcgResponseType.SELECT_CHAIN, index: null })] : []),
      ];
    case OcgMessageType.SORT_CHAIN:
      return [coreAction("Mantener orden legal", { type: OcgResponseType.SORT_CARD, order: message.cards.map((_, index) => index) })];
    case OcgMessageType.SELECT_PLACE:
      return [coreAction("Elegir primera zona legal", { type: OcgResponseType.SELECT_PLACE, places: firstFreeFieldPlaces(message.field_mask, message.count, message.player) })];
    case OcgMessageType.SELECT_POSITION:
      return allowedPositions(message.positions).map((position) => coreAction(position === OcgPosition.FACEUP_ATTACK ? "Ataque boca arriba" : position === OcgPosition.FACEUP_DEFENSE ? "Defensa boca arriba" : position === OcgPosition.FACEDOWN_ATTACK ? "Ataque boca abajo" : "Defensa boca abajo", { type: OcgResponseType.SELECT_POSITION, position }));
    case OcgMessageType.SELECT_TRIBUTE: {
      const subsets = combinations(message.selects.length, Number(message.min) || 0);
      return subsets.length
        ? subsets.map((indicies) => coreAction(`Seleccionar ${indicies.length} tributo(s)`, { type: OcgResponseType.SELECT_TRIBUTE, indicies }))
        : [coreAction(`Seleccionar ${message.min} tributo(s) automáticamente`, { type: OcgResponseType.SELECT_TRIBUTE, indicies: firstIndices(message.min, message.selects.length) })];
    }
    case OcgMessageType.SELECT_COUNTER: {
      const response = chooseCoreBotResponse(message, { brave: true });
      return response ? [coreAction("Elegir contadores legalmente", response)] : [];
    }
    case OcgMessageType.SELECT_SUM:
    case OcgMessageType.SELECT_DISFIELD:
    case OcgMessageType.SELECT_UNSELECT_CARD:
    case OcgMessageType.SORT_CARD:
    case OcgMessageType.ANNOUNCE_RACE:
    case OcgMessageType.ANNOUNCE_ATTRIB:
    case OcgMessageType.ANNOUNCE_CARD:
    case OcgMessageType.ANNOUNCE_NUMBER: {
      const response = chooseCoreBotResponse(message, { brave: true });
      return response ? [coreAction("Resolver selección legal", response)] : [];
    }
    default:
      return [];
  }
}

/* The original fallback above is intentionally kept for backwards fixtures.
 * This UI mapper is the active path and exposes bounded, legal alternatives
 * for the less common OCGCore windows instead of hiding them behind a button.
 */
function userActionsFor(message, { timingWindow = null } = {}) {
  if (!message) return [];
  const action = (label, response, details = {}) => coreAction(label, response, details);
  switch (message.type) {
    case OcgMessageType.ROCK_PAPER_SCISSORS:
      return [action("Piedra", { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 1 }, { actionKind: "rps" }), action("Papel", { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 2 }, { actionKind: "rps" }), action("Tijera", { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 3 }, { actionKind: "rps" })];
    case OcgMessageType.SELECT_IDLECMD:
      return [
        ...(message.activates ?? []).map((card, index) => action(`Activar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_ACTIVATE, index }, cardActionDetails(card, "activate"))),
        ...(message.summons ?? []).map((card, index) => action(`Invocar boca arriba en Ataque · ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SUMMON, index }, cardActionDetails(card, "summon"))),
        ...(message.special_summons ?? []).map((card, index) => action(`Invocar especialmente ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON, index }, cardActionDetails(card, "special-summon"))),
        ...(message.monster_sets ?? []).map((card, index) => action(`Colocar boca abajo en Defensa · ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_MONSTER_SET, index }, cardActionDetails(card, "set-monster"))),
        ...(message.spell_sets ?? []).map((card, index) => action(`Colocar Mágica/Trampa boca abajo · ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPELL_SET, index }, cardActionDetails(card, "set-spell"))),
        ...(message.pos_changes ?? []).map((card, index) => action(`Cambiar posicion de ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_POS_CHANGE, index }, cardActionDetails(card, "position"))),
        ...(message.to_bp ? [action("Ir a Battle Phase", { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null }, { actionKind: "phase", phaseTarget: "BATTLE" })] : []),
        ...(message.to_ep ? [action("Ir a End Phase", { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_EP, index: null }, { actionKind: "phase", phaseTarget: "END" })] : []),
      ];
    case OcgMessageType.SELECT_BATTLECMD:
      return [
        ...(message.chains ?? []).map((card, index) => action(`Activar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_CHAIN, index }, cardActionDetails(card, "chain"))),
        ...(message.attacks ?? []).map((attack, index) => action(`Atacar con ${friendlyCard(attack)}`, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index }, cardActionDetails(attack, "attack"))),
        ...(message.to_m2 ? [action("Ir a Main Phase 2", { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null }, { actionKind: "phase", phaseTarget: "MAIN_2" })] : []),
        ...(message.to_ep ? [action("Terminar Battle Phase", { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null }, { actionKind: "phase", phaseTarget: "END" })] : []),
      ];
    case OcgMessageType.SELECT_EFFECTYN:
      return [
        action(`Sí, activar ${friendlyCard(message)}`, { type: OcgResponseType.SELECT_EFFECTYN, yes: true }, cardActionDetails(message, "trigger-effect")),
        action("No activar", { type: OcgResponseType.SELECT_EFFECTYN, yes: false }, cardActionDetails(message, "decline-effect")),
      ];
    case OcgMessageType.SELECT_YESNO:
      return [action("Si", { type: OcgResponseType.SELECT_YESNO, yes: true }, { actionKind: "confirm" }), action("No", { type: OcgResponseType.SELECT_YESNO, yes: false }, { actionKind: "decline" })];
    case OcgMessageType.SELECT_OPTION:
      return (message.options ?? []).map((optionValue, index) => {
        const details = effectOptionDetails(optionValue, index);
        return action(details.label, { type: OcgResponseType.SELECT_OPTION, index }, { ...details, actionKind: "effect-option" });
      });
    case OcgMessageType.SELECT_CARD: {
      const options = selectionActions(message, OcgResponseType.SELECT_CARD);
      return options.length ? options : [action("Seleccion automatica legal", chooseCoreBotResponse(message, { brave: true }), { actionKind: "select-card" })].filter((entry) => entry.coreResponse);
    }
    case OcgMessageType.SELECT_CHAIN:
      {
        const isOpenChain = timingWindow?.kind === "chain" || timingWindow === null;
      return [
        ...(message.selects ?? []).map((card, index) => action(`${isOpenChain ? "Encadenar" : "Activar"} ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_CHAIN, index }, {
          ...cardActionDetails(card, isOpenChain ? "chain" : "activate"),
          timingWindowKind: timingWindow?.kind ?? "chain",
        })),
        ...(!message.forced ? [action(isOpenChain ? "No encadenar" : "No activar", { type: OcgResponseType.SELECT_CHAIN, index: null }, { actionKind: "decline", timingWindowKind: timingWindow?.kind ?? "chain" })] : []),
      ];
      }
    case OcgMessageType.SORT_CHAIN:
    case OcgMessageType.SORT_CARD: {
      const identity = (message.cards ?? []).map((_, index) => index);
      return [action("Mantener orden", { type: OcgResponseType.SORT_CARD, order: identity }, { actionKind: "sort-card" }), ...(identity.length > 1 ? [action("Invertir orden", { type: OcgResponseType.SORT_CARD, order: [...identity].reverse() }, { actionKind: "sort-card" })] : [])];
    }
    case OcgMessageType.SELECT_PLACE: {
      const places = fieldPlaces(message.field_mask, message.player);
      const count = Math.max(1, Number(message.count) || 1);
      const manualPlaces = count === 1
        ? places.map((place) => action(`Elegir ${fieldPlaceLabel(place)}`, { type: OcgResponseType.SELECT_PLACE, places: [place] }, {
          actionKind: "place",
          placement: { player: place.player, zone: place.location === OcgLocation.MZONE ? "monster" : "spell", sequence: place.sequence },
        }))
        : combinations(places.length, count, 16).map((indices) => {
          const selected = indices.map((index) => places[index]);
          return action(`Elegir ${selected.map(fieldPlaceLabel).join(" + ")}`, { type: OcgResponseType.SELECT_PLACE, places: selected }, { actionKind: "place" });
        });
      const quickPlace = action("Colocación rápida: primeras zonas libres", { type: OcgResponseType.SELECT_PLACE, places: firstFreeFieldPlaces(message.field_mask, count, message.player) }, { actionKind: "place", quickPlacement: true, repeatPrompt: "SELECT_PLACE" });
      return [...manualPlaces, quickPlace];
    }
    case OcgMessageType.SELECT_POSITION:
      return allowedPositions(message.positions).map((position) => action(position === OcgPosition.FACEUP_ATTACK ? "Ataque boca arriba" : position === OcgPosition.FACEUP_DEFENSE ? "Defensa boca arriba" : position === OcgPosition.FACEDOWN_ATTACK ? "Ataque boca abajo" : "Defensa boca abajo", { type: OcgResponseType.SELECT_POSITION, position }, { actionKind: "position-choice" }));
    case OcgMessageType.SELECT_TRIBUTE: {
      const minimum = Math.max(0, Number(message.min) || 0);
      const maximum = Math.max(minimum, Number(message.max ?? minimum));
      const options = selectionActions(message, OcgResponseType.SELECT_TRIBUTE, { verb: "Sacrificar" });
      if (minimum === 0 && message.can_cancel) options.push(action("Cancelar tributos", { type: OcgResponseType.SELECT_TRIBUTE, indicies: null }, { actionKind: "cancel-selection" }));
      return options.length ? options : [action("Tributos legales", chooseCoreBotResponse(message, { brave: true }), { actionKind: "select-card" })].filter((entry) => entry.coreResponse);
    }
    case OcgMessageType.SELECT_COUNTER: {
      const options = counterCombinations(message);
      return options.length
        ? options.map((counters) => action(`Asignar ${counters.reduce((sum, value) => sum + value, 0)} contador(es)`, { type: OcgResponseType.SELECT_COUNTER, counters }, { actionKind: "select-counter" }))
        : [action("Resolver contadores legalmente", chooseCoreBotResponse(message, { brave: true }), { actionKind: "select-counter" })].filter((entry) => entry.coreResponse);
    }
    case OcgMessageType.SELECT_SUM: {
      const options = sumOptions(message);
      const candidates = [...(message.selects_must ?? []), ...(message.selects ?? [])];
      return options.length
        ? options.map((indicies) => action(`Suma ${indicies.length ? indicies.map((index) => sumAmount(candidates[index])).join(" + ") : "obligatoria"}`, { type: OcgResponseType.SELECT_SUM, indicies }, {
          actionKind: "select-card",
          selectionCards: indicies.map((index) => selectionCardDescriptor(candidates[index], index, message.player)),
          selectionMin: 0,
          selectionMax: Math.max(1, Number(message.select_max) || (message.selects ?? []).length),
        }))
        : [action("Resolver suma legal", chooseCoreBotResponse(message, { brave: true }), { actionKind: "select-card" })].filter((entry) => entry.coreResponse);
    }
    case OcgMessageType.SELECT_DISFIELD: {
      const places = fieldPlaces(message.field_mask, message.player);
      const count = Math.max(1, Number(message.count) || 1);
      if (!places.length) return [action("Resolver zona legal", chooseCoreBotResponse(message, { brave: true }), { actionKind: "disable-place" })].filter((entry) => entry.coreResponse);
      const subsets = combinations(places.length, count, 16);
      return (subsets.length ? subsets : [places.slice(0, count)]).map((indices) => action(`Deshabilitar ${indices.length} zona(s)`, { type: OcgResponseType.SELECT_DISFIELD, places: indices.map((index) => places[index]) }, { actionKind: "disable-place" }));
    }
    case OcgMessageType.SELECT_UNSELECT_CARD: {
      const selected = message.select_cards ?? [];
      const unselected = message.unselect_cards ?? [];
      return [
        ...(message.can_finish ? [action("Terminar seleccion", { type: OcgResponseType.SELECT_UNSELECT_CARD, index: null }, { actionKind: "finish-selection" })] : []),
        ...selected.map((card, index) => action(`Seleccionar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_UNSELECT_CARD, index }, cardActionDetails(card, "select-card"))),
        ...unselected.map((card, index) => action(`Quitar ${friendlyCard(card)}`, { type: OcgResponseType.SELECT_UNSELECT_CARD, index: selected.length + index }, cardActionDetails(card, "unselect-card"))),
      ];
    }
    case OcgMessageType.ANNOUNCE_RACE: {
      const count = Math.max(1, Number(message.count) || 1);
      const races = availableGoatRaces(message.available);
      return combinations(races.length, count, 32).map((indices) => {
        const selected = indices.map((index) => races[index]);
        return action(`Declarar ${selected.map(([, label]) => label).join(" + ")}`, { type: OcgResponseType.ANNOUNCE_RACE, races: selected.map(([race]) => race) }, { actionKind: "announce-race", choiceLabels: selected.map(([, label]) => label) });
      });
    }
    case OcgMessageType.ANNOUNCE_ATTRIB: {
      const count = Math.max(1, Number(message.count) || 1);
      const attributes = availableAttributes(message.available);
      return combinations(attributes.length, count, 16).map((indices) => {
        const selected = indices.map((index) => attributes[index]);
        return action(`Declarar ${selected.map(([, label]) => label).join(" + ")}`, { type: OcgResponseType.ANNOUNCE_ATTRIB, attributes: selected.map(([attribute]) => attribute) }, { actionKind: "announce-attribute", choiceLabels: selected.map(([, label]) => label) });
      });
    }
    case OcgMessageType.ANNOUNCE_CARD: {
      const options = cardAnnouncementOptions(message, 24);
      return (options.length ? options : [null]).map((entry) => entry ? action(`Declarar ${entry.name}`, { type: OcgResponseType.ANNOUNCE_CARD, card: entry.runtimeCode }, { actionKind: "announce-card", cardCode: entry.runtimeCode }) : action("Declarar carta legal", chooseCoreBotResponse(message, { brave: true }), { actionKind: "announce-card" })).filter((entry) => entry.coreResponse);
    }
    case OcgMessageType.ANNOUNCE_NUMBER:
      return (message.options ?? []).map((optionValue, index) => action(`Declarar ${String(optionValue)}`, { type: OcgResponseType.ANNOUNCE_NUMBER, value: index }, { actionKind: "announce-number" }));
    default:
      return [];
  }
}

function phaseName(phase) {
  return ({ 1: "DRAW", 2: "STANDBY", 4: "MAIN_1", 8: "BATTLE", 16: "BATTLE", 32: "BATTLE", 64: "BATTLE", 128: "BATTLE", 256: "MAIN_2", 512: "END" })[Number(phase)] ?? String(phase ?? "START");
}

function chooseSessionBotResponse(bot, message, context = {}) {
  if (typeof bot?.chooseResponse === "function") return bot.chooseResponse(message, context);
  if (typeof bot?.chooseCoreResponse === "function") return bot.chooseCoreResponse(message, context);
  return chooseCoreBotResponse(message, context);
}

function publicBotDescriptor(bot) {
  if (!bot) return null;
  const manifest = typeof bot.manifest === "function" ? bot.manifest() : bot;
  return {
    id: manifest.botId ?? manifest.id ?? "bot",
    name: manifest.name ?? "Bot",
    algorithm: manifest.algorithm ?? "unknown",
    profile: manifest.profile ?? manifest.deckId ?? "generic",
    deckId: manifest.deckId ?? manifest.profile ?? null,
    style: manifest.style ?? "Heurística",
    strategyId: manifest.strategy?.id ?? null,
    strategyCompatibility: manifest.strategyCompatibility ?? null,
    difficulty: manifest.difficulty ?? "normal",
    version: Number(manifest.version) || 1,
    state: manifest.state ?? "Sin entrenar",
  };
}

export async function createOcgcoreSession({ deckA, deckB, fusionA = [], fusionB = [], seed = Math.floor(Math.random() * 0xffffffff), startingPlayer = null, brave = true, manual = false, pacedBot = false, pacedPhases = false, bot = null, scenario = null, onDecision = null } = {}) {
  const errors = [];
  const firstSeat = Number(scenario?.startingPlayer ?? startingPlayer) === 1 ? 1 : 0;
  const coreToUi = firstSeat === 1 ? [1, 0] : [0, 1];
  const uiToCore = firstSeat === 1 ? [1, 0] : [0, 1];
  const decksByUi = [deckA, deckB];
  const fusionsByUi = [fusionA, fusionB];
  const coreScenario = scenario ? { ...scenario, startingPlayer: 0, players: coreToUi.map((uiSeat) => scenario.players?.[uiSeat] ?? {}) } : null;
  const duel = await createGoatDuel({ decks: coreToUi.map((uiSeat) => decksByUi[uiSeat]), extraDecks: coreToUi.map((uiSeat) => fusionsByUi[uiSeat]), seed, errors, scenario: coreScenario });
  const uiPlayer = (corePlayer) => Number.isFinite(Number(corePlayer)) ? coreToUi[Number(corePlayer)] : corePlayer;
  const uiUid = (uid) => {
    const parts = String(uid ?? "").split(":");
    if (parts.length !== 5 || parts[0] !== "ocg") return uid;
    parts[1] = String(uiPlayer(parts[1]));
    return parts.join(":");
  };
  const uiCard = (card) => card ? { ...card, controller: uiPlayer(card.controller), player: uiPlayer(card.player) } : card;
  const uiAction = (action) => action ? {
    ...action,
    cardUid: uiUid(action.cardUid),
    selectionCards: Array.isArray(action.selectionCards) ? action.selectionCards.map(uiCard) : action.selectionCards,
    placement: action.placement ? { ...action.placement, player: uiPlayer(action.placement.player) } : action.placement,
  } : action;
  const session = {
    kind: "ocgcore",
    seed,
    startingPlayer: firstSeat,
    firstSeat,
    duel,
    errors,
    brave,
    manual,
    pacedBot,
    pacedPhases,
    bot,
    onDecision,
    botPending: false,
    lastPacedPhase: null,
    lastPacedPhaseKey: null,
    phasePaused: false,
    lastDeclinedChain: null,
    pending: null,
    winner: null,
    status: null,
    turn: 0,
    turnPlayer: null,
    phase: "START",
    phaseCode: null,
    decisionCount: 0,
    eventCount: 0,
    log: [],
    deckReversed: initialDeckReversalState(scenario),
    destroyed: false,
    advance() {
      if (this.destroyed || this.winner !== null) return this.view();
      if (this.phasePaused) return this.view();
      let guard = 0;
      let idleSpins = 0;
      while (guard < 12000) {
        this.status = this.duel.process();
        const messages = this.duel.messages();
        const phaseChanged = messages.some((message) => message.type === OcgMessageType.NEW_TURN || message.type === OcgMessageType.NEW_PHASE);
        const drawCompleted = messages.some((message) => message.type === OcgMessageType.DRAW);
        for (const message of messages) {
          if (message.type === OcgMessageType.NEW_TURN) {
            this.turn += 1;
            this.turnPlayer = message.player ?? 0;
            this.phase = "DRAW";
          }
          if (message.type === OcgMessageType.NEW_PHASE) {
            this.phase = phaseName(message.phase);
            this.phaseCode = Number(message.phase);
          }
          if (message.type === OcgMessageType.WIN) this.winner = uiPlayer(message.player);
          if (LOGGED_MESSAGE_TYPES.has(message.type)) {
            const hiddenBotMove = !this.manual
              && message.type === OcgMessageType.MOVE
              && uiPlayer(message.to?.controller) === 1
              && [OcgLocation.MZONE, OcgLocation.SZONE].includes(Number(message.to?.location))
              && !isFaceUp(message.to?.position);
            const cardCode = hiddenBotMove ? null : messageCardCode(message);
            const card = cardCode ? cardForCode(cardCode) : null;
            this.deckReversed = updateDeckReversalState(this.deckReversed, message, cardCode);
            const flipEffect = message.type === OcgMessageType.CHAINING
              && Number(message.location) === OcgLocation.MZONE
              && (String(card?.class ?? "").toLowerCase() === "flip" || /^FLIP\s*:/i.test(card?.text ?? "") || /flipped face-up/i.test(card?.text ?? ""));
            if (flipEffect) {
              this.log.push({
                index: this.eventCount++,
                type: "FLIP",
                turn: this.turn,
                player: message.player ?? message.controller ?? null,
                cardCode,
                cardName: card?.name ?? null,
                cardText: card?.text ?? null,
                message: `${card?.name ?? "El monstruo"} se voltea boca arriba y activa su efecto FLIP.`,
              });
            }
            this.log.push({
              index: this.eventCount++,
              type: messageNames.get(message.type) ?? `CORE_${message.type}`,
              turn: this.turn,
              player: message.player ?? message.controller ?? null,
              cardCode,
              cardName: card?.name ?? null,
              cardText: card?.text ?? null,
              message: hiddenBotMove
                ? (Number(message.to?.location) === OcgLocation.MZONE ? "Astra coloca un monstruo boca abajo." : "Astra coloca una carta boca abajo.")
                : eventLabel(message, uiPlayer),
              ...movementDetails(message),
              ...resolutionDetails(message),
              ...targetDetails(message, this.duel, { manual: this.manual }),
              ...(message.type === OcgMessageType.TOSS_DICE ? { diceResults: [...(message.results ?? [])] } : {}),
              ...(message.type === OcgMessageType.TOSS_COIN ? { coinResults: [...(message.results ?? [])] } : {}),
            });
          }
        }
        if (this.log.length > 80) this.log.splice(0, this.log.length - 80);
        if (this.winner !== null || this.status === OcgProcessResult.END) {
          this.pending = null;
          this.botPending = false;
          break;
        }
        const phaseKey = `${this.turn}:${this.phase}`;
        const paceBotPhase = this.pacedBot && !this.manual && this.turnPlayer === uiToCore[1];
        const pacePlayerPhase = this.pacedPhases
          && (this.manual || this.turnPlayer === uiToCore[0])
          && ["DRAW", "STANDBY", "END"].includes(this.phase);
        const phaseReadyToPause = this.phase === "DRAW" ? drawCompleted : phaseChanged;
        if (phaseReadyToPause && (paceBotPhase || pacePlayerPhase) && phaseKey !== this.lastPacedPhaseKey) {
          this.pending = null;
          this.phasePaused = true;
          this.botPending = paceBotPhase;
          this.lastPacedPhase = this.phase;
          this.lastPacedPhaseKey = phaseKey;
          break;
        }
        if (this.status === OcgProcessResult.WAITING) {
          const request = interactiveMessage(messages);
          if (!request) {
            guard += 1;
            idleSpins += 1;
            if (idleSpins < 64) continue;
            break;
          }
          const player = request.player ?? 1;
          const timingWindow = timingWindowFor(request, this);
          if (this.manual || player === uiToCore[0]) {
            const requestActions = userActionsFor(request, { timingWindow });
            const repeatedDeclinedWindow = request.type === OcgMessageType.SELECT_CHAIN
              && !request.forced
              && this.lastDeclinedChain === chainWindowFingerprint(request, this);
            if (repeatedDeclinedWindow) {
              const decline = requestActions.find((action) => action.coreResponse?.index === null);
              if (decline) {
                this.duel.respond(decline.coreResponse);
                this.decisionCount += 1;
                guard += 1;
                continue;
              }
            }
            const onlyPassesEmptyChain = request.type === OcgMessageType.SELECT_CHAIN
              && !request.forced
              && (request.selects ?? []).length === 0
              && requestActions.length === 1
              && requestActions[0].coreResponse?.index === null;
            if (onlyPassesEmptyChain) {
              this.duel.respond(requestActions[0].coreResponse);
              this.decisionCount += 1;
              guard += 1;
              continue;
            }
            const isMainPhaseFreePriority = request.type === OcgMessageType.SELECT_CHAIN
              && !request.forced
              && timingWindow?.kind === "phase-priority"
              && ["MAIN_1", "MAIN_2"].includes(this.phase)
              && player === this.turnPlayer;
            if (isMainPhaseFreePriority) {
              const decline = requestActions.find((action) => action.coreResponse?.index === null);
              if (decline) {
                this.duel.respond(decline.coreResponse);
                this.decisionCount += 1;
                guard += 1;
                continue;
              }
            }
            this.pending = request;
            this.botPending = false;
            break;
          }
          const requestActions = userActionsFor(request, { timingWindow });
          const onlyPassesEmptyChain = request.type === OcgMessageType.SELECT_CHAIN
            && !request.forced
            && (request.selects ?? []).length === 0
            && requestActions.length === 1
            && requestActions[0].coreResponse?.index === null;
          if (onlyPassesEmptyChain) {
            this.duel.respond(requestActions[0].coreResponse);
            this.decisionCount += 1;
            guard += 1;
            continue;
          }
          const isMainPhaseFreePriority = request.type === OcgMessageType.SELECT_CHAIN
            && !request.forced
            && timingWindow?.kind === "phase-priority"
            && ["MAIN_1", "MAIN_2"].includes(this.phase)
            && player === this.turnPlayer;
          if (isMainPhaseFreePriority) {
            const decline = requestActions.find((action) => action.coreResponse?.index === null);
            if (decline) {
              this.duel.respond(decline.coreResponse);
              this.decisionCount += 1;
              guard += 1;
              continue;
            }
          }
          if (this.pacedBot) {
            this.pending = request;
            this.botPending = true;
            if (phaseChanged) this.lastPacedPhase = this.phase;
            break;
          }
          const response = chooseSessionBotResponse(this.bot, request, {
            brave: this.bot?.difficulty === "easy" ? false : this.bot?.brave ?? this.brave,
            profile: this.bot?.profile ?? "generic",
            weights: this.bot?.weights ?? {},
            player,
            observation: createBotObservation(this.duel, player, request, { turn: this.turn, turnPlayer: this.turnPlayer, phase: this.phaseCode, decisions: this.decisionCount, deckKnowledge: this.bot?.deckKnowledge }),
            deckKnowledge: this.bot?.deckKnowledge ?? null,
            decisions: this.decisionCount,
          });
          if (!response) break;
          this.duel.respond(response);
          this.decisionCount += 1;
        }
        guard += 1;
      }
      return this.view();
    },
    continuePhase() {
      if (!this.phasePaused || this.destroyed || this.winner !== null) return this.view();
      this.phasePaused = false;
      this.botPending = false;
      return this.advance();
    },
    respond(action) {
      if (!this.pending || this.botPending || !action?.coreResponse || this.winner !== null) return this.view();
      const before = this.view();
      const declinedChain = this.pending.type === OcgMessageType.SELECT_CHAIN
        && action.coreResponse.type === OcgResponseType.SELECT_CHAIN
        && action.coreResponse.index === null;
      this.lastDeclinedChain = declinedChain ? chainWindowFingerprint(this.pending, this) : null;
      this.duel.respond(action.coreResponse);
      this.pending = null;
      this.decisionCount += 1;
      this.advance();
      if (action.repeatPrompt) {
        let guard = 0;
        while (this.pending && (messageNames.get(this.pending.type) ?? `CORE_${this.pending.type}`) === action.repeatPrompt && guard < 8) {
          const response = chooseSessionBotResponse(this.bot, this.pending, {
            brave: this.bot?.difficulty === "easy" ? false : this.bot?.brave ?? true,
            profile: this.bot?.profile ?? "generic",
            weights: this.bot?.weights ?? {},
            player: this.pending.player ?? 1,
            observation: createBotObservation(this.duel, this.pending.player ?? 1, this.pending, { turn: this.turn, turnPlayer: this.turnPlayer, phase: this.phaseCode, decisions: this.decisionCount, deckKnowledge: this.bot?.deckKnowledge }),
            deckKnowledge: this.bot?.deckKnowledge ?? null,
            decisions: this.decisionCount,
          });
          if (!response) break;
          this.duel.respond(response);
          this.pending = null;
          this.decisionCount += 1;
          this.advance();
          guard += 1;
        }
      }
      const after = this.view();
      if (typeof this.onDecision === "function") {
        try { this.onDecision({ action, before, after }); } catch { /* Evidence recording must never alter duel resolution. */ }
      }
      return after;
    },
    respondBot() {
      if (!this.botPending || this.winner !== null) return { action: null, view: this.view() };
      if (!this.pending) {
        const phase = this.phase;
        this.continuePhase();
        return { action: { label: `Continuar ${phaseLabel(phase)}`, actionKind: "phase" }, view: this.view() };
      }
      const request = this.pending;
      const response = chooseSessionBotResponse(this.bot, request, {
        brave: this.bot?.difficulty === "easy" ? false : this.bot?.brave ?? this.brave,
        profile: this.bot?.profile ?? "generic",
        weights: this.bot?.weights ?? {},
        player: request.player ?? 1,
        observation: createBotObservation(this.duel, request.player ?? 1, request, { turn: this.turn, turnPlayer: this.turnPlayer, phase: this.phaseCode, decisions: this.decisionCount, deckKnowledge: this.bot?.deckKnowledge }),
        deckKnowledge: this.bot?.deckKnowledge ?? null,
        decisions: this.decisionCount,
      });
      if (!response) return { action: null, view: this.view() };
      const actions = filterHistoricalActionProjection(userActionsFor(request, { timingWindow: timingWindowFor(request, this) }), request, this);
      const signature = responseSignature(response);
      const action = actions.find((candidate) => responseSignature(candidate.coreResponse) === signature)
        ?? { label: "Astra continúa su jugada", coreResponse: response, actionKind: "bot" };
      this.duel.respond(response);
      this.pending = null;
      this.botPending = false;
      this.decisionCount += 1;
      this.advance();
      return { action: uiAction(publicBotAction(action)), view: this.view() };
    },
    view() {
      const field = this.duel.queryField();
      const players = [0, 1].map((controller) => {
        const raw = field.players[controller];
        const publicController = uiPlayer(controller);
        const opponent = publicController === 1;
        const hidePrivate = !this.manual && opponent;
        const remapInstances = (instances) => instances.map((instance) => instance ? { ...instance, uid: uiUid(instance.uid), controller: publicController } : null);
        return {
          id: publicController,
          lp: normalizeLp(raw.lp),
          handCount: raw.hand_size,
          deckCount: raw.deck_size,
          graveCount: raw.grave_size,
          banishCount: raw.banish_size,
          extraCount: raw.extra_size,
          deckReversed: Boolean(this.deckReversed[publicController]),
          hand: remapInstances(queryLocation(this.duel, controller, OcgLocation.HAND, { slots: raw.hand_size, hide: (info) => hidePrivate && !info?.isPublic, hand: true })),
          monsterZone: remapInstances(queryLocation(this.duel, controller, OcgLocation.MZONE, { slots: 5, hide: (info) => hidePrivate && (!info?.isPublic || !isFaceUp(info.position)) })),
          spellTrapZone: remapInstances(queryLocation(this.duel, controller, OcgLocation.SZONE, { slots: 5, hide: (info) => hidePrivate && (!info?.isPublic || !isFaceUp(info.position)) })),
          fieldZone: remapInstances(queryLocation(this.duel, controller, OcgLocation.SZONE, { slots: 1, offset: 5, hide: (info) => hidePrivate && (!info?.isPublic || !isFaceUp(info.position)) })),
          // Your own Extra Deck is public to you during a duel; keep the
          // opponent's cards hidden unless this is the manual two-player view.
          extraDeck: remapInstances(queryLocation(this.duel, controller, OcgLocation.EXTRA, { slots: raw.extra_size, hide: () => hidePrivate })),
          graveyard: remapInstances(queryLocation(this.duel, controller, OcgLocation.GRAVE, { hide: (info) => hidePrivate && !info?.isPublic })),
          banished: remapInstances(queryLocation(this.duel, controller, OcgLocation.REMOVED, { hide: (info) => hidePrivate && !info?.isPublic })),
        };
      }).sort((left, right) => left.id - right.id);
      const timingWindow = timingWindowFor(this.pending, this);
      const rawActions = this.pending && !this.botPending
        ? filterHistoricalActionProjection(userActionsFor(this.pending, { timingWindow }), this.pending, this)
        : [];
      const actions = rawActions.map(uiAction);
      const rawSelection = selectionView(this.pending, rawActions);
      const selection = rawSelection ? { ...rawSelection, candidates: rawSelection.candidates.map(uiCard) } : null;
      const rawSort = sortDecisionView(this.pending);
      const sort = rawSort ? { ...rawSort, cards: rawSort.cards.map(uiCard) } : null;
      const announcement = announcementView(this.pending);
      const rawMultiChoice = multiChoiceView(this.pending);
      // `value` is the exact core response payload. Labels are already public,
      // so keep core player indices untouched even when seats are swapped.
      const multiChoice = rawMultiChoice;
      const rawCounterSelection = counterSelectionView(this.pending);
      const counterSelection = rawCounterSelection ? { ...rawCounterSelection, cards: rawCounterSelection.cards.map(uiCard) } : null;
      const rawDecisionContext = decisionContextFor(this.pending, this);
      const decisionContext = rawDecisionContext ? {
        ...rawDecisionContext,
        source: rawDecisionContext.source ? {
          ...rawDecisionContext.source,
          controller: uiPlayer(rawDecisionContext.source.controller),
          cardUid: rawDecisionContext.source.cardUid === undefined ? undefined : uiUid(rawDecisionContext.source.cardUid),
        } : null,
      } : null;
      const publicTimingWindow = timingWindow ? { ...timingWindow, sourcePlayer: uiPlayer(timingWindow.sourcePlayer) } : null;
      const pendingEffect = pendingEffectContext(this.pending);
      return {
        kind: this.kind,
        manual: this.manual,
        seed: this.seed,
        winner: this.winner,
        status: this.status,
        turn: this.turn,
        turnPlayer: uiPlayer(this.turnPlayer),
        phase: this.phase,
        phasePaused: this.phasePaused,
        priorityPlayer: this.pending ? uiPlayer(this.pending.player) : this.phasePaused ? uiPlayer(this.turnPlayer) : (this.winner === null ? uiPlayer(1) : null),
        botPending: this.botPending,
        bot: publicBotDescriptor(this.bot),
        decisionCount: this.decisionCount,
        players,
        deckReversed: [...this.deckReversed],
        actions,
        selection,
        sort,
        announcement,
        multiChoice,
        counterSelection,
        decisionContext,
        timingWindow: publicTimingWindow,
        pendingEffect: pendingEffect ? { ...pendingEffect, controller: uiPlayer(pendingEffect.controller), cardUid: uiUid(pendingEffect.cardUid) } : null,
        pendingType: this.pending ? (messageNames.get(this.pending.type) ?? `CORE_${this.pending.type}`) : null,
        recentLog: this.log.map((event) => ({
          ...event,
          player: uiPlayer(event.player),
          fromPlayer: uiPlayer(event.fromPlayer),
          toPlayer: uiPlayer(event.toPlayer),
          targets: Array.isArray(event.targets) ? event.targets.map((target) => ({ ...target, controller: uiPlayer(target.controller) })) : event.targets,
        })),
        errors: [...this.errors],
      };
    },
    destroy() {
      if (!this.destroyed) {
        this.destroyed = true;
        this.duel.destroy();
      }
    },
  };
  session.advance();
  return session;
}

export { cardForCode, messageNames, userActionsFor };

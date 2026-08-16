import { OcgLocation, OcgMessageType, OcgPosition, OcgResponseType, SelectBattleCMDAction, SelectIdleCMDAction, cardMatchesOpcode } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { OCGCORE_CARD_DATA, OCGCORE_CARD_ENTRIES } from "../data/ocgcore-assets.js";

function jsonString(value) { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? `${item}n` : item); }

function pushUnique(list, response) {
  if (!response) return;
  const key = jsonString(response);
  if (!list.some((candidate) => jsonString(candidate) === key)) list.push(response);
}

function combinations(length, size, limit = 32) {
  const results = [];
  const walk = (start, picked) => {
    if (results.length >= limit) return;
    if (picked.length === size) { results.push([...picked]); return; }
    for (let index = start; index < length; index += 1) {
      walk(index + 1, [...picked, index]);
      if (results.length >= limit) return;
    }
  };
  if (size >= 0 && size <= length) walk(0, []);
  return results;
}

function diverseCombinations(length, size, limit = 64) {
  const results = [];
  const seen = new Set();
  const add = (picked) => {
    const row = [...new Set(picked)].sort((left, right) => left - right);
    if (row.length !== size || row.some((index) => index < 0 || index >= length)) return;
    const key = row.join(",");
    if (!seen.has(key)) { seen.add(key); results.push(row); }
  };
  for (const row of combinations(length, size, Math.max(4, Math.floor(limit / 4)))) add(row);
  for (const row of combinations(length, size, Math.max(4, Math.floor(limit / 4)))) add(row.map((index) => length - 1 - index));
  for (let offset = 0; offset < length && results.length < limit; offset += 1) {
    add(Array.from({ length: size }, (_, index) => (offset + Math.floor(index * length / Math.max(1, size))) % length));
  }
  let state = ((length + 1) * 0x9e3779b1 ^ (size + 1) * 0x85ebca6b) >>> 0;
  let attempts = 0;
  while (results.length < limit && attempts < limit * 20) {
    attempts += 1;
    const pool = Array.from({ length }, (_, index) => index);
    for (let index = pool.length - 1; index > 0; index -= 1) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const swap = (state >>> 0) % (index + 1);
      [pool[index], pool[swap]] = [pool[swap], pool[index]];
    }
    const before = results.length;
    add(pool.slice(0, size));
    if (before === results.length && length <= 1) break;
  }
  return results.slice(0, limit);
}

function cardCombinations(message, limit = 96) {
  const length = message.selects?.length ?? message.select_cards?.length ?? 0;
  const minimum = Math.max(0, Number(message.min) || 0);
  const maximum = Math.min(length, Math.max(minimum, Number(message.max ?? minimum)));
  const sizes = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  const perSize = Math.max(8, Math.ceil(limit / Math.max(1, sizes.length)));
  return sizes.flatMap((size) => diverseCombinations(length, size, perSize)).slice(0, limit);
}

function sumCombinations(message, limit = 48) {
  const cards = message.selects ?? [];
  const required = message.selects_must ?? [];
  const requiredTotal = required.reduce((sum, card) => sum + (Number(card?.amount) || 0), 0);
  const target = Number(message.amount) || 0;
  const allowGreater = Boolean(message.select_max);
  const results = [];
  const walk = (start, total, picked) => {
    if (results.length >= limit) return;
    const reachesTarget = allowGreater ? total >= target : total === target;
    const minimalForGreater = !allowGreater || !picked.some((removedIndex) => total - (Number(cards[removedIndex]?.amount) || 0) >= target);
    if (reachesTarget && minimalForGreater) {
      results.push([...required.map((_card, index) => index), ...picked.map((index) => required.length + index)]);
      return;
    }
    for (let index = start; index < cards.length; index += 1) {
      const amount = Number(cards[index]?.amount) || 0;
      walk(index + 1, total + amount, [...picked, index]);
      if (results.length >= limit) return;
    }
  };
  walk(0, requiredTotal, []);
  return results;
}

function counterCombinations(message, limit = 48) {
  const cards = message.cards ?? [];
  const total = Math.max(0, Number(message.count) || 0);
  const results = [];
  const walk = (index, remaining, picked) => {
    if (results.length >= limit) return;
    if (index >= cards.length) { if (remaining === 0) results.push([...picked]); return; }
    const capacity = Math.max(0, Number(cards[index]?.count) || 0);
    for (let amount = 0; amount <= Math.min(capacity, remaining); amount += 1) {
      walk(index + 1, remaining - amount, [...picked, amount]);
      if (results.length >= limit) return;
    }
  };
  walk(0, total, []);
  return results;
}

function fieldPlaces(message) {
  const owner = Number(message.player) === 1 ? 1 : 0;
  const candidates = [
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << sequence, player: owner, location: OcgLocation.MZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (8 + sequence), player: owner, location: OcgLocation.SZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (16 + sequence), player: 1 - owner, location: OcgLocation.MZONE, sequence })),
    ...Array.from({ length: 5 }, (_, sequence) => ({ bit: 1 << (24 + sequence), player: 1 - owner, location: OcgLocation.SZONE, sequence })),
  ].filter((candidate) => (Number(message.field_mask) & candidate.bit) === 0);
  const count = Math.max(1, Number(message.count) || 1);
  return diverseCombinations(candidates.length, Math.min(count, candidates.length), 48).map((indexes) => indexes.map((index) => {
    const place = candidates[index];
    return { player: place.player, location: place.location, sequence: place.sequence };
  }));
}

function bitValues(value, width = 32, bigint = false) {
  const available = bigint ? BigInt(value ?? 0) : Number(value ?? 0);
  return Array.from({ length: width }, (_, index) => bigint ? 1n << BigInt(index) : 1 << index).filter((bit) => (available & bit) !== (bigint ? 0n : 0));
}

function announceCardMatches(message, limit = 32, preferredCodes = []) {
  const opcodes = message?.opcodes ?? [];
  if (!opcodes.length) return [];
  const matches = [];
  for (const entry of OCGCORE_CARD_ENTRIES) {
    const data = OCGCORE_CARD_DATA[Number(entry.runtimeCode)];
    if (!data) continue;
    try {
      const race = typeof data.race === "bigint" ? data.race : BigInt(data.race ?? 0);
      if (cardMatchesOpcode({ ...data, race }, opcodes)) matches.push(Number(entry.runtimeCode));
    } catch {
      // A malformed opcode or card record must not make the legal mask fail.
    }
  }
  if (!preferredCodes.length) return matches;
  const preferred = new Set(preferredCodes.map((code) => Number(code)));
  return [...matches.filter((code) => preferred.has(code)), ...matches.filter((code) => !preferred.has(code))].slice(0, limit);
}

/** Returns only responses representable by the current OCGCore request. */
export function candidateResponses(message, baseline, { deckKnowledge = null } = {}) {
  const candidates = [];
  switch (message.type) {
    case OcgMessageType.ROCK_PAPER_SCISSORS:
      [1, 2, 3].forEach((value) => pushUnique(candidates, { type: OcgResponseType.ROCK_PAPER_SCISSORS, value }));
      break;
    case OcgMessageType.SELECT_IDLECMD:
      (message.activates ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_ACTIVATE, index }));
      (message.summons ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SUMMON, index }));
      (message.special_summons ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON, index }));
      (message.monster_sets ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_MONSTER_SET, index }));
      (message.spell_sets ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPELL_SET, index }));
      (message.pos_changes ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_POS_CHANGE, index }));
      if (message.shuffle) pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SHUFFLE, index: null });
      if (message.to_bp) pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null });
      if (message.to_ep) pushUnique(candidates, { type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_EP, index: null });
      break;
    case OcgMessageType.SELECT_BATTLECMD:
      (message.chains ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_CHAIN, index }));
      (message.attacks ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index }));
      if (message.to_m2) pushUnique(candidates, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null });
      if (message.to_ep) pushUnique(candidates, { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null });
      break;
    case OcgMessageType.SELECT_EFFECTYN:
    case OcgMessageType.SELECT_YESNO:
      pushUnique(candidates, { type: message.type === OcgMessageType.SELECT_EFFECTYN ? OcgResponseType.SELECT_EFFECTYN : OcgResponseType.SELECT_YESNO, yes: true });
      pushUnique(candidates, { type: message.type === OcgMessageType.SELECT_EFFECTYN ? OcgResponseType.SELECT_EFFECTYN : OcgResponseType.SELECT_YESNO, yes: false });
      break;
    case OcgMessageType.SELECT_OPTION:
      (message.options ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_OPTION, index }));
      break;
    case OcgMessageType.SELECT_CHAIN:
      if (!message.forced) pushUnique(candidates, { type: OcgResponseType.SELECT_CHAIN, index: null });
      (message.selects ?? []).forEach((_, index) => pushUnique(candidates, { type: OcgResponseType.SELECT_CHAIN, index }));
      break;
    case OcgMessageType.SELECT_CARD:
      cardCombinations(message).forEach((indicies) => pushUnique(candidates, { type: OcgResponseType.SELECT_CARD, indicies }));
      break;
    case OcgMessageType.SELECT_TRIBUTE:
      cardCombinations(message).forEach((indicies) => pushUnique(candidates, { type: OcgResponseType.SELECT_TRIBUTE, indicies }));
      break;
    case OcgMessageType.SELECT_SUM:
      sumCombinations(message).forEach((indicies) => pushUnique(candidates, { type: OcgResponseType.SELECT_SUM, indicies }));
      break;
    case OcgMessageType.SELECT_COUNTER:
      counterCombinations(message).forEach((counters) => pushUnique(candidates, { type: OcgResponseType.SELECT_COUNTER, counters }));
      break;
    case OcgMessageType.SELECT_PLACE:
    case OcgMessageType.SELECT_DISFIELD:
      fieldPlaces(message).forEach((places) => pushUnique(candidates, { type: message.type === OcgMessageType.SELECT_PLACE ? OcgResponseType.SELECT_PLACE : OcgResponseType.SELECT_DISFIELD, places }));
      break;
    case OcgMessageType.SELECT_UNSELECT_CARD: {
      const selectable = message.select_cards ?? [];
      const unselectable = message.unselect_cards ?? [];
      if (message.can_finish) pushUnique(candidates, { type: OcgResponseType.SELECT_UNSELECT_CARD, index: null });
      for (let index = 0; index < selectable.length + unselectable.length; index += 1) pushUnique(candidates, { type: OcgResponseType.SELECT_UNSELECT_CARD, index });
      break;
    }
    case OcgMessageType.SORT_CARD:
    case OcgMessageType.SORT_CHAIN: {
      const length = message.cards?.length ?? 0;
      const identity = Array.from({ length }, (_, index) => index);
      const reverse = [...identity].reverse();
      const responseType = message.type === OcgMessageType.SORT_CHAIN ? OcgResponseType.SORT_CHAIN : OcgResponseType.SORT_CARD;
      pushUnique(candidates, { type: responseType, order: identity });
      pushUnique(candidates, { type: responseType, order: reverse });
      for (let offset = 1; offset < Math.min(length, 6); offset += 1) pushUnique(candidates, { type: responseType, order: [...identity.slice(offset), ...identity.slice(0, offset)] });
      break;
    }
    case OcgMessageType.SELECT_POSITION: {
      const positions = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEDOWN_ATTACK]
        .filter((position) => (Number(message.positions ?? 0) & position) !== 0);
      positions.forEach((position) => pushUnique(candidates, { type: OcgResponseType.SELECT_POSITION, position }));
      break;
    }
    case OcgMessageType.ANNOUNCE_NUMBER:
      (message.options ?? []).forEach((value) => pushUnique(candidates, { type: OcgResponseType.ANNOUNCE_NUMBER, value: Number(value) }));
      break;
    case OcgMessageType.ANNOUNCE_RACE:
      {
        const values = bitValues(message.available, 64, true);
        combinations(values.length, Math.max(1, Number(message.count) || 1), 24).forEach((indexes) => pushUnique(candidates, { type: OcgResponseType.ANNOUNCE_RACE, races: indexes.map((index) => values[index]) }));
      }
      break;
    case OcgMessageType.ANNOUNCE_ATTRIB:
      {
        const values = bitValues(message.available, 8);
        combinations(values.length, Math.max(1, Number(message.count) || 1), 24).forEach((indexes) => pushUnique(candidates, { type: OcgResponseType.ANNOUNCE_ATTRIB, attributes: indexes.map((index) => values[index]) }));
      }
      break;
    case OcgMessageType.ANNOUNCE_CARD:
      announceCardMatches(message, 32, Object.keys(deckKnowledge?.byRuntimeCode ?? {})).forEach((card) => pushUnique(candidates, { type: OcgResponseType.ANNOUNCE_CARD, card }));
      break;
    default:
      break;
  }
  if (!candidates.length && baseline) pushUnique(candidates, baseline);
  return candidates;
}

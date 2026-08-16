import {
  ACTION, CARD_DATABASE_VERSION, CARD_KIND, ENGINE_VERSION, FORMAT_VERSION, MAX_DECISIONS, MAX_MONSTERS, MAX_SPELL_TRAPS, MAX_TURNS,
  MONSTER_POSITION, PHASE, STARTING_HAND_SIZE, STARTING_LIFE_POINTS, TERMINATION, ZONE
} from "./constants.js";
import { getCard } from "./cards.js";
import { SeededRng } from "./rng.js";
import { createEffectApi } from "./effect-api.js";
import { getEffectScript } from "./effect-scripts.js";

export class IllegalActionError extends Error {
  constructor(message, action, legalActions = []) {
    super(message);
    this.name = "IllegalActionError";
    this.action = action;
    this.legalActions = legalActions;
  }
}

function emptySlots(size) {
  return Array.from({ length: size }, () => null);
}

function makeInstance(state, cardId, owner, zone) {
  const card = getCard(cardId);
  if (!card) throw new Error(`No existe la carta ${cardId}`);
  const instance = {
    uid: state.nextUid++,
    cardId,
    owner,
    controller: owner,
    zone,
    faceUp: zone !== ZONE.MONSTER && zone !== ZONE.SPELL_TRAP,
    position: card.kind === CARD_KIND.MONSTER ? MONSTER_POSITION.ATTACK : null,
    setTurn: null,
    summonedTurn: null,
    attackUsedTurn: null,
    positionChangedTurn: null,
    spellCounters: card.effect === "BREAKER" ? 0 : undefined,
    equippedTo: null,
    lockNormalSummon: false
  };
  return instance;
}

function cloneAction(action) {
  const { id: _id, label: _label, ...compact } = action;
  return structuredClone(compact);
}

function actionId(action) {
  const normalized = cloneAction(action);
  if (Array.isArray(normalized.tributes) && normalized.tributes.length === 0) delete normalized.tributes;
  return JSON.stringify(normalized);
}

function withActionMeta(action, label) {
  return { ...action, id: actionId(action), label };
}

function player(state, playerId) {
  return state.players[playerId];
}

function opponentId(playerId) {
  return playerId === 0 ? 1 : 0;
}

function allFieldInstances(state) {
  return state.players.flatMap((p) => [...p.monsterZone, ...p.spellTrapZone].filter(Boolean));
}

function findInstance(state, uid) {
  for (const p of state.players) {
    for (const collection of [p.deck, p.hand, p.grave, p.banished, p.monsterZone, p.spellTrapZone]) {
      const found = collection.find((instance) => instance?.uid === uid);
      if (found) return found;
    }
  }
  return null;
}

function findSlot(state, uid) {
  for (const p of state.players) {
    const monsterIndex = p.monsterZone.findIndex((instance) => instance?.uid === uid);
    if (monsterIndex !== -1) return { player: p, zone: ZONE.MONSTER, index: monsterIndex };
    const spellTrapIndex = p.spellTrapZone.findIndex((instance) => instance?.uid === uid);
    if (spellTrapIndex !== -1) return { player: p, zone: ZONE.SPELL_TRAP, index: spellTrapIndex };
  }
  return null;
}

function removeFromArray(array, uid) {
  const index = array.findIndex((instance) => instance?.uid === uid);
  if (index === -1) return null;
  return array.splice(index, 1)[0];
}

function removeFromCurrentZone(state, uid) {
  const instance = findInstance(state, uid);
  if (!instance) return null;
  for (const p of state.players) {
    for (const collection of [p.deck, p.hand, p.grave, p.banished]) {
      const removed = removeFromArray(collection, uid);
      if (removed) return removed;
    }
    for (const collection of [p.monsterZone, p.spellTrapZone]) {
      const index = collection.findIndex((value) => value?.uid === uid);
      if (index !== -1) {
        const removed = collection[index];
        collection[index] = null;
        return removed;
      }
    }
  }
  return null;
}

function firstFreeSlot(zone) {
  return zone.findIndex((instance) => instance === null);
}

function logEvent(state, type, message, data = {}) {
  const event = { index: state.eventCount++, turn: state.turn, phase: state.phase, type, message, ...data };
  state.log.push(event);
  if (state.log.length > 120) state.log.shift();
  return event;
}

function cardName(uidOrCardId, state) {
  const instance = typeof uidOrCardId === "number" && findInstance(state, uidOrCardId);
  const card = instance ? getCard(instance.cardId) : getCard(uidOrCardId);
  return card?.name ?? "Carta desconocida";
}

function hasMonster(p, predicate = () => true) {
  return p.monsterZone.some((instance) => instance && predicate(instance));
}

function activeMonsters(p, predicate = () => true) {
  return p.monsterZone.filter((instance) => instance && predicate(instance));
}

function zoneHasCard(p, zone, cardId) {
  return p[zone].some((instance) => instance?.cardId === cardId);
}

function getZoneForInstance(state, instance) {
  const slot = findSlot(state, instance.uid);
  if (slot) return slot.zone;
  const owner = player(state, instance.owner);
  if (owner.hand.some((value) => value.uid === instance.uid)) return ZONE.HAND;
  if (owner.grave.some((value) => value.uid === instance.uid)) return ZONE.GRAVE;
  if (owner.banished.some((value) => value.uid === instance.uid)) return ZONE.BANISHED;
  if (owner.deck.some((value) => value.uid === instance.uid)) return ZONE.DECK;
  return instance.zone;
}

function isFaceUpMonster(state, uid) {
  const instance = findInstance(state, uid);
  const slot = instance && findSlot(state, uid);
  return Boolean(instance && slot?.zone === ZONE.MONSTER && instance.faceUp);
}

function isReadyToActivate(state, instance) {
  return instance && instance.setTurn !== state.turn;
}

function isQuickPlaySpell(card) {
  return card?.kind === CARD_KIND.SPELL && String(card.spellType ?? "").toUpperCase() === "QUICK_PLAY";
}

function setZone(instance, zone) {
  instance.zone = zone;
  if (zone === ZONE.HAND || zone === ZONE.GRAVE || zone === ZONE.BANISHED || zone === ZONE.DECK) {
    instance.faceUp = true;
  }
}

function addToHand(state, instance, playerId) {
  const p = player(state, playerId);
  instance.controller = instance.owner;
  setZone(instance, ZONE.HAND);
  p.hand.push(instance);
}

function sendToGrave(state, uid, reason = "effect") {
  const instance = removeFromCurrentZone(state, uid);
  if (!instance) return null;
  if (instance.cardId === 17) return instance;
  const owner = player(state, instance.owner);
  setZone(instance, ZONE.GRAVE);
  instance.controller = instance.owner;
  owner.grave.push(instance);
  logEvent(state, "SEND_TO_GRAVE", `${cardName(instance.uid, state)} va al Cementerio.`, { uid, reason });
  onSentToGrave(state, instance, reason);
  return instance;
}

function banish(state, uid, reason = "effect") {
  const instance = removeFromCurrentZone(state, uid);
  if (!instance) return null;
  const owner = player(state, instance.owner);
  setZone(instance, ZONE.BANISHED);
  instance.controller = instance.owner;
  owner.banished.push(instance);
  logEvent(state, "BANISH", `${cardName(instance.uid, state)} es desterrada.`, { uid, reason });
  return instance;
}

function returnToHand(state, uid, reason = "effect") {
  const instance = removeFromCurrentZone(state, uid);
  if (!instance) return null;
  addToHand(state, instance, instance.owner);
  logEvent(state, "RETURN_TO_HAND", `${cardName(instance.uid, state)} vuelve a la mano.`, { uid, reason });
  return instance;
}

function destroy(state, uid, reason = "effect") {
  const instance = findInstance(state, uid);
  const slot = instance && findSlot(state, uid);
  if (!instance || !slot) return null;
  const card = getCard(instance.cardId);
  if (reason === "battle" && card.effect === "SPIRIT_REAPER") {
    logEvent(state, "BATTLE_PROTECTION", `${card.name} no es destruido por batalla.`);
    return instance;
  }
  return sendToGrave(state, uid, reason);
}

function draw(state, playerId, amount = 1) {
  const p = player(state, playerId);
  for (let i = 0; i < amount; i += 1) {
    if (!p.deck.length) {
      finish(state, opponentId(playerId), TERMINATION.DECK_OUT);
      return false;
    }
    const instance = p.deck.shift();
    addToHand(state, instance, playerId);
    logEvent(state, "DRAW", `${p.name} roba una carta.`, { playerId });
  }
  return true;
}

function finish(state, winner, reason) {
  if (state.winner !== null) return;
  state.winner = winner;
  state.terminationReason = reason;
  state.phase = PHASE.END;
  state.priorityPlayer = null;
  logEvent(state, "DUEL_END", winner === null ? "El duelo termina en empate." : `${state.players[winner].name} gana.`, { winner, reason });
}

function applyDamage(state, playerId, amount, reason) {
  if (amount <= 0 || state.winner !== null) return;
  const p = player(state, playerId);
  p.lp = Math.max(0, p.lp - amount);
  logEvent(state, "DAMAGE", `${p.name} recibe ${amount} de daño.`, { playerId, amount, reason });
  if (p.lp <= 0) finish(state, opponentId(playerId), TERMINATION.LIFE_POINTS);
}

function heal(state, playerId, amount) {
  const p = player(state, playerId);
  p.lp += amount;
  logEvent(state, "RECOVER", `${p.name} recupera ${amount} LP.`, { playerId, amount });
}

function onSentToGrave(state, instance, reason) {
  const card = getCard(instance.cardId);
  if (card.effect === "SANGAN" && reason !== "cost") {
    const owner = player(state, instance.owner);
    const candidateIndex = owner.deck.findIndex((value) => {
      const candidate = getCard(value.cardId);
      return candidate.kind === CARD_KIND.MONSTER && candidate.atk <= 1500;
    });
    if (candidateIndex !== -1) {
      const candidate = owner.deck.splice(candidateIndex, 1)[0];
      addToHand(state, candidate, instance.owner);
      logEvent(state, "TRIGGER", `${card.name} añade ${getCard(candidate.cardId).name} a la mano.`, { sourceUid: instance.uid, targetUid: candidate.uid });
    }
  }
}

function handleFlip(state, instance) {
  if (!instance || instance.faceUp) return;
  instance.faceUp = true;
  const card = getCard(instance.cardId);
  logEvent(state, "FLIP", `${card.name} se voltea boca arriba.`);
  if (card.effect === "MAGICIAN_OF_FAITH") {
    const owner = player(state, instance.owner);
    const candidateIndex = owner.grave.findIndex((value) => getCard(value.cardId).kind === CARD_KIND.SPELL);
    if (candidateIndex !== -1) {
      const candidate = owner.grave.splice(candidateIndex, 1)[0];
      addToHand(state, candidate, instance.owner);
      logEvent(state, "TRIGGER", `${card.name} recupera ${getCard(candidate.cardId).name}.`, { sourceUid: instance.uid, targetUid: candidate.uid });
    }
  }
  if (card.effect === "GRAVEKEEPER_SPY") {
    const owner = player(state, instance.owner);
    const targetIndex = owner.deck.findIndex((value) => {
      const target = getCard(value.cardId);
      return target.name === "Gravekeeper's Spy" && target.def <= 1500;
    });
    const slot = firstFreeSlot(owner.monsterZone);
    if (targetIndex !== -1 && slot !== -1) {
      const target = owner.deck.splice(targetIndex, 1)[0];
      target.zone = ZONE.MONSTER;
      target.controller = instance.owner;
      target.faceUp = false;
      target.position = MONSTER_POSITION.DEFENSE;
      target.summonedTurn = state.turn;
      owner.monsterZone[slot] = target;
      logEvent(state, "SPECIAL_SUMMON", `${card.name} coloca otro Gravekeeper's Spy en Defensa boca abajo.`, { sourceUid: instance.uid, targetUid: target.uid });
    }
  }
}

function resolveStandby(state, playerId) {
  const p = player(state, playerId);
  const serpentIndex = p.grave.findIndex((instance) => getCard(instance.cardId).effect === "SINISTER_SERPENT");
  if (serpentIndex !== -1) {
    const serpent = p.grave.splice(serpentIndex, 1)[0];
    addToHand(state, serpent, playerId);
    logEvent(state, "TRIGGER", "Sinister Serpent vuelve a la mano durante la Standby Phase.", { playerId, uid: serpent.uid });
  }
  for (const fieldInstance of allFieldInstances(state)) {
    if (fieldInstance.equippedTo && fieldInstance.owner !== fieldInstance.controller && fieldInstance.effect === "SNATCH_STEAL") {
      heal(state, fieldInstance.controller, 1000);
    }
  }
}

function activateFieldSpell(state, action) {
  const p = player(state, action.playerId);
  const handInstance = p.hand.find((value) => value.uid === action.cardUid);
  const fieldIndex = p.spellTrapZone.findIndex((value) => value?.uid === action.cardUid);
  const fieldInstance = fieldIndex === -1 ? null : p.spellTrapZone[fieldIndex];
  const instance = handInstance ?? fieldInstance;
  if (!instance) throw new Error("La carta no está en la mano.");
  const card = getCard(instance.cardId);
  const fromSet = Boolean(fieldInstance);
  if (fromSet && (instance.faceUp || !isReadyToActivate(state, instance))) throw new Error("Set spell cannot be activated yet.");
  if (!fromSet && isQuickPlaySpell(card) && action.playerId !== state.activePlayer) throw new Error("A Quick-Play Spell from hand can only be activated during its controller turn.");
  const persistent = ["EQUIP", "CONTINUOUS", "FIELD"].includes(card.spellType);
  let slot = -1;
  if (persistent && !fromSet) {
    slot = firstFreeSlot(p.spellTrapZone);
    if (slot === -1) throw new Error("No hay espacio para activar la Mágica.");
  }
  if (fromSet) p.spellTrapZone[fieldIndex] = null;
  else p.hand.splice(p.hand.indexOf(instance), 1);
  if (persistent) {
    setZone(instance, ZONE.SPELL_TRAP);
    instance.faceUp = true;
    instance.setTurn = null;
    instance.equippedTo = card.spellType === "EQUIP" ? action.targetUid ?? null : null;
    p.spellTrapZone[slot] = instance;
  } else {
    setZone(instance, ZONE.GRAVE);
    p.grave.push(instance);
  }
  if (state.reaction && fromSet) {
    state.reaction = null;
    state.priorityPlayer = state.activePlayer;
  }
  logEvent(state, "ACTIVATE", `${p.name} activa ${card.name}.`, { playerId: action.playerId, uid: instance.uid });
  resolveCardEffect(state, instance, action);
}

function activateMonsterEffect(state, action) {
  const p = player(state, action.playerId);
  const instance = p.hand.find((value) => value.uid === action.cardUid);
  const card = instance && getCard(instance.cardId);
  if (!instance || card?.effect !== "THUNDER_DRAGON") throw new Error("El efecto de monstruo no está disponible.");
  const targets = p.deck.filter((value) => getCard(value.cardId)?.name === "Thunder Dragon");
  if (!targets.length) throw new Error("No hay otro Thunder Dragon en el Deck.");
  sendToGrave(state, instance.uid, "cost");
  const retrieved = targets.slice(0, 2);
  for (const target of retrieved) { removeFromArray(p.deck, target.uid); addToHand(state, target, p.id); }
  state.rng.shuffle(p.deck);
  logEvent(state, "SEARCH", `${p.name} añade ${retrieved.length} Thunder Dragon del Deck a la mano y baraja el Deck.`, { sourceUid: instance.uid, count: retrieved.length });
}

function effectCandidates(state, actorId, criteria = {}) {
  const scope = String(criteria.scope ?? "FIELD").toUpperCase();
  const zone = String(criteria.zone ?? "FIELD").toUpperCase();
  const ownerId = scope === "OPPONENT" ? opponentId(actorId) : scope === "SELF" ? actorId : null;
  const candidates = [];
  const players = ownerId === null ? state.players : [player(state, ownerId)];
  for (const p of players) {
    const collections = zone === "FIELD"
      ? [...p.monsterZone, ...p.spellTrapZone]
      : zone === "MONSTER"
        ? p.monsterZone
        : zone === "SPELL_TRAP"
          ? p.spellTrapZone
          : p[zone.toLowerCase()] ?? [];
    for (const instance of collections) {
      if (!instance) continue;
      const card = getCard(instance.cardId);
      if (criteria.cardId !== undefined && instance.cardId !== Number(criteria.cardId)) continue;
      if (criteria.kind && card.kind !== criteria.kind) continue;
      if (criteria.race && String(card.race ?? "").toLowerCase() !== String(criteria.race).toLowerCase()) continue;
      if (criteria.attribute && String(card.attribute ?? "").toLowerCase() !== String(criteria.attribute).toLowerCase()) continue;
      if (criteria.level !== undefined && Number(card.level) !== Number(criteria.level)) continue;
      if (criteria.spellType && String(card.spellType ?? card.subtype ?? "").toLowerCase() !== String(criteria.spellType).toLowerCase()) continue;
      if (criteria.trapType && String(card.trapType ?? card.subtype ?? "").toLowerCase() !== String(criteria.trapType).toLowerCase()) continue;
      if (criteria.position && instance.position !== criteria.position) continue;
      if (criteria.equipped !== undefined && Boolean(instance.equippedTo) !== Boolean(criteria.equipped)) continue;
      if (criteria.faceUp !== undefined && instance.faceUp !== Boolean(criteria.faceUp)) continue;
      if (criteria.excludeUid !== undefined && instance.uid === Number(criteria.excludeUid)) continue;
      candidates.push(instance.uid);
    }
  }
  const limit = criteria.limit === undefined ? candidates.length : Math.max(0, Number(criteria.limit));
  return candidates.slice(0, limit);
}

function createEngineEffectApi(state, instance, action, actor) {
  return createEffectApi({
    actorId: actor.id,
    sourceUid: instance.uid,
    commands: {
      select: (criteria) => effectCandidates(state, actor.id, criteria),
      reveal: (targets, visibility) => {
        const uids = Array.isArray(targets) ? targets : [targets];
        logEvent(state, "REVEAL", `${actor.name} revela ${uids.length} carta(s).`, { sourceUid: instance.uid, targets: uids, visibility });
        return uids;
      },
      draw: (amount, playerId) => draw(state, playerId, amount),
      recover: (amount, playerId) => heal(state, playerId, amount),
      damage: (amount, playerId) => applyDamage(state, playerId, amount, "effect"),
      discard: (amount, playerId, options = {}) => {
        const owner = player(state, playerId);
        if (owner.hand.length < amount && options.required) return false;
        const cards = [...owner.hand];
        if (options.strategy === "random") state.rng.shuffle(cards);
        else cards.sort((a, b) => cardValue(getCard(a.cardId)) - cardValue(getCard(b.cardId)));
        for (const target of cards.slice(0, amount)) sendToGrave(state, target.uid, "cost");
        logEvent(state, "DISCARD", `${owner.name} descarta ${Math.min(amount, cards.length)} carta(s).`, { playerId, sourceUid: instance.uid });
        return cards.length >= amount;
      },
      shuffle: (zone, playerId) => {
        const owner = player(state, playerId);
        const collection = owner[String(zone).toLowerCase()];
        if (!Array.isArray(collection)) throw new Error(`Zona no barajable: ${zone}`);
        state.rng.shuffle(collection);
        logEvent(state, "SHUFFLE", `${owner.name} baraja ${zone}.`, { playerId, sourceUid: instance.uid });
        return true;
      },
      destroy: (targetUid, reason) => destroy(state, targetUid, reason),
      sendToGrave: (targetUid, reason) => sendToGrave(state, targetUid, reason),
      banish: (targetUid, reason) => banish(state, targetUid, reason),
      returnToHand: (targetUid, reason) => returnToHand(state, targetUid, reason),
      summon: (spec = {}) => {
        const targetPlayer = player(state, spec.playerId ?? actor.id);
        const count = Math.max(1, Number(spec.count ?? 1));
        let summoned = 0;
        for (let index = 0; index < count; index += 1) {
          const slot = firstFreeSlot(targetPlayer.monsterZone);
          if (slot === -1) break;
          const token = makeInstance(state, Number(spec.cardId), targetPlayer.id, ZONE.MONSTER);
          token.faceUp = spec.faceUp !== false;
          token.position = spec.position ?? MONSTER_POSITION.ATTACK;
          token.summonedTurn = state.turn;
          targetPlayer.monsterZone[slot] = token;
          summoned += 1;
        }
        if (summoned) logEvent(state, "SPECIAL_SUMMON", `${targetPlayer.name} Invoca ${summoned} carta(s).`, { sourceUid: instance.uid, playerId: targetPlayer.id });
        return summoned;
      },
      changeControl: (targetUid, newController) => transferControl(state, targetUid, newController),
      changePosition: (targetUid, position, faceUp) => {
        const target = findInstance(state, targetUid);
        const slot = target && findSlot(state, targetUid);
        if (!target || !slot || slot.zone !== ZONE.MONSTER) return false;
        target.position = position === "TOGGLE"
          ? target.position === MONSTER_POSITION.ATTACK ? MONSTER_POSITION.DEFENSE : MONSTER_POSITION.ATTACK
          : position;
        target.faceUp = faceUp;
        target.positionChangedTurn = state.turn;
        logEvent(state, "POSITION", `${cardName(target.uid, state)} cambia a ${position}.`, { targetUid, sourceUid: instance.uid });
        return true;
      },
      modifyStats: (targetUid, modifier) => {
        const effect = { sourceUid: instance.uid, targetUid, modifier, appliedTurn: state.turn };
        state.effects.temporary.push(effect);
        logEvent(state, "MODIFIER", `${cardName(targetUid, state)} recibe un modificador temporal.`, { targetUid, sourceUid: instance.uid });
        return effect;
      },
      negate: (target, options) => {
        const effect = { sourceUid: instance.uid, target, options, appliedTurn: state.turn };
        state.effects.negations.push(effect);
        logEvent(state, "NEGATE", `${actor.name} registra una negación.`, { sourceUid: instance.uid, target });
        return effect;
      },
      restrict: (restriction) => {
        state.effects.restrictions.push({ sourceUid: instance.uid, appliedTurn: state.turn, ...restriction });
        if (restriction.key === "normalSummon" && restriction.playerId === actor.id && restriction.value === false) player(state, actor.id).lockedNormalSummon = true;
        return restriction;
      },
      registerContinuous: (effect) => {
        const record = { sourceUid: instance.uid, ...effect };
        state.effects.continuous.push(record);
        return record;
      },
      registerTemporary: (effect) => {
        const record = { sourceUid: instance.uid, appliedTurn: state.turn, ...effect };
        state.effects.temporary.push(record);
        return record;
      },
      scheduleExpiry: (expiry) => {
        const record = { sourceUid: instance.uid, ...expiry };
        state.effects.expirations.push(record);
        return record;
      }
    }
  });
}

function resolveCardEffect(state, instance, action) {
  const card = getCard(instance.cardId);
  const actor = player(state, action.playerId ?? instance.controller);
  const script = getEffectScript(card.effect);
  if (script) {
    script(createEngineEffectApi(state, instance, action, actor), { action, card });
    return;
  }
  switch (card.effect) {
    case "DRAW_2": draw(state, actor.id, 2); break;
    case "DRAW_3_DISCARD_2": {
      draw(state, actor.id, 3);
      const sorted = [...actor.hand].sort((a, b) => cardValue(getCard(a.cardId)) - cardValue(getCard(b.cardId)));
      for (const discard of sorted.slice(0, 2)) sendToGrave(state, discard.uid, "cost");
      logEvent(state, "DISCARD", `${actor.name} descarta 2 cartas como parte de Graceful Charity.`);
      break;
    }
    case "BOOK_OF_MOON": {
      const target = findInstance(state, action.targetUid);
      if (target && isFaceUpMonster(state, target.uid)) {
        target.faceUp = false;
        target.position = MONSTER_POSITION.DEFENSE;
        logEvent(state, "POSITION", `${cardName(target.uid, state)} cambia a Defensa boca abajo.`, { targetUid: target.uid });
      }
      break;
    }
    case "MST":
    case "DUST_TORNADO": {
      if (action.targetUid) destroy(state, action.targetUid, card.effect);
      break;
    }
    case "HEAVY_STORM": {
      for (const p of state.players) for (const fieldCard of [...p.spellTrapZone].filter(Boolean)) destroy(state, fieldCard.uid, "heavy-storm");
      break;
    }
    case "NOBLEMAN": {
      const target = findInstance(state, action.targetUid);
      if (target && !target.faceUp && findSlot(state, target.uid)?.zone === ZONE.MONSTER) {
        const targetCardId = target.cardId;
        banish(state, target.uid, "nobleman");
        for (const p of state.players) {
          for (const deckCard of [...p.deck]) if (deckCard.cardId === targetCardId) banish(state, deckCard.uid, "nobleman-copy");
        }
      }
      break;
    }
    case "SCAPEGOAT": {
      const targetPlayer = player(state, action.playerId);
      let spawned = 0;
      for (let i = 0; i < MAX_MONSTERS && spawned < 4; i += 1) {
        if (targetPlayer.monsterZone[i]) continue;
        const token = makeInstance(state, 17, action.playerId, ZONE.MONSTER);
        token.faceUp = true;
        token.position = MONSTER_POSITION.DEFENSE;
        token.summonedTurn = state.turn;
        targetPlayer.monsterZone[i] = token;
        spawned += 1;
      }
      targetPlayer.lockedNormalSummon = true;
      logEvent(state, "SPECIAL_SUMMON", `${targetPlayer.name} crea ${spawned} Sheep Tokens.`);
      break;
    }
    case "SNATCH_STEAL": {
      transferControl(state, action.targetUid, action.playerId);
      break;
    }
    case "PREMATURE_BURIAL": {
      if (actor.lp <= 800) break;
      applyDamage(state, actor.id, 800, "premature-burial-cost");
      reviveFromGrave(state, actor.id, action.targetUid, MONSTER_POSITION.ATTACK);
      break;
    }
    case "CREATURE_SWAP": {
      const own = activeMonsters(actor, (value) => value.faceUp)[0];
      const other = activeMonsters(player(state, opponentId(actor.id)), (value) => value.faceUp)[0];
      if (own && other) {
        transferControl(state, own.uid, opponentId(actor.id));
        transferControl(state, other.uid, actor.id);
      }
      break;
    }
    case "ROTA": {
      const targetIndex = actor.deck.findIndex((value) => {
        const target = getCard(value.cardId);
        return target.kind === CARD_KIND.MONSTER && target.race === "Warrior" && target.level <= 4;
      });
      if (targetIndex !== -1) {
        const target = actor.deck.splice(targetIndex, 1)[0];
        addToHand(state, target, actor.id);
        logEvent(state, "SEARCH", `${actor.name} añade ${getCard(target.cardId).name} con Reinforcement of the Army.`);
      }
      break;
    }
    case "DUO": {
      if (actor.lp <= 1000) break;
      applyDamage(state, actor.id, 1000, "delinquent-duo-cost");
      const target = player(state, opponentId(actor.id));
      for (let i = 0; i < 2 && target.hand.length; i += 1) {
        const discard = target.hand[state.rng.integer(target.hand.length)];
        sendToGrave(state, discard.uid, "delinquent-duo");
      }
      break;
    }
    case "LIGHTNING_VORTEX": {
      if (actor.hand.length) sendToGrave(state, actor.hand[0].uid, "cost");
      for (const target of activeMonsters(player(state, opponentId(actor.id)), (value) => value.faceUp)) destroy(state, target.uid, "lightning-vortex");
      break;
    }
    case "MIRROR_FORCE": {
      const target = player(state, opponentId(actor.id));
      for (const monster of activeMonsters(target, (value) => value.faceUp && value.position === MONSTER_POSITION.ATTACK)) destroy(state, monster.uid, "mirror-force");
      break;
    }
    case "TORRENTIAL": {
      for (const monster of allFieldInstances(state).filter((value) => findSlot(state, value.uid)?.zone === ZONE.MONSTER)) destroy(state, monster.uid, "torrential");
      break;
    }
    case "RING": {
      const target = findInstance(state, action.targetUid);
      if (target && isFaceUpMonster(state, target.uid)) {
        const targetCard = getCard(target.cardId);
        destroy(state, target.uid, "ring");
        applyDamage(state, target.controller, targetCard.atk, "ring");
        applyDamage(state, opponentId(target.controller), targetCard.atk, "ring");
      }
      break;
    }
    case "SAKURETSU": {
      if (action.targetUid) destroy(state, action.targetUid, "sakuretsu");
      break;
    }
    case "BOTTOMLESS": {
      const target = findInstance(state, action.targetUid);
      if (target && getCard(target.cardId).atk >= 1500) {
        destroy(state, target.uid, "bottomless");
        banish(state, target.uid, "bottomless");
      }
      break;
    }
    case "CALL": {
      reviveFromGrave(state, actor.id, action.targetUid, MONSTER_POSITION.ATTACK);
      break;
    }
    case "BREAKER": {
      const target = findInstance(state, action.targetUid);
      if (target && target.zone === ZONE.SPELL_TRAP && target.controller !== actor.id) {
        const breaker = findInstance(state, action.sourceUid);
        if (breaker?.spellCounters > 0) {
          breaker.spellCounters -= 1;
          destroy(state, target.uid, "breaker");
        }
      }
      break;
    }
    default:
      logEvent(state, "UNSUPPORTED_EFFECT", `${card.name} tiene efecto ${card.effect} pendiente de implementación.`);
  }
}

function cardValue(card) {
  if (!card) return 0;
  if (card.kind === CARD_KIND.MONSTER) return card.atk + card.def * 0.2 + (card.level >= 5 ? 200 : 0);
  if (card.effect === "DRAW_2" || card.effect === "DRAW_3_DISCARD_2") return 900;
  if (["MIRROR_FORCE", "TORRENTIAL", "RING", "SAKURETSU", "BOTTOMLESS"].includes(card.effect)) return 850;
  return 500;
}

function transferControl(state, uid, newController) {
  const instance = findInstance(state, uid);
  const slot = instance && findSlot(state, uid);
  const destination = player(state, newController);
  if (!instance || !slot || slot.zone !== ZONE.MONSTER) return false;
  const destinationSlot = firstFreeSlot(destination.monsterZone);
  if (destinationSlot === -1) return false;
  slot.player.monsterZone[slot.index] = null;
  destination.monsterZone[destinationSlot] = instance;
  instance.controller = newController;
  logEvent(state, "CONTROL", `${destination.name} toma el control de ${getCard(instance.cardId).name}.`, { uid, playerId: newController });
  return true;
}

function reviveFromGrave(state, playerId, uid, position) {
  const p = player(state, playerId);
  const target = p.grave.find((value) => value.uid === uid);
  const slot = firstFreeSlot(p.monsterZone);
  if (!target || slot === -1) return false;
  p.grave.splice(p.grave.indexOf(target), 1);
  setZone(target, ZONE.MONSTER);
  target.controller = playerId;
  target.faceUp = true;
  target.position = position;
  target.summonedTurn = state.turn;
  p.monsterZone[slot] = target;
  logEvent(state, "SPECIAL_SUMMON", `${p.name} revive ${getCard(target.cardId).name}.`);
  return true;
}

function canNormalSummon(state, playerId, cardId) {
  const p = player(state, playerId);
  const card = getCard(cardId);
  if (!card || card.kind !== CARD_KIND.MONSTER || p.normalSummonUsed || p.lockedNormalSummon) return false;
  if (card.level <= 4) return true;
  const needed = card.level <= 6 ? 1 : 2;
  return activeMonsters(p).length >= needed;
}

function availableTributeSets(p, card) {
  if (card.level <= 4) return [[]];
  const needed = card.level <= 6 ? 1 : 2;
  const monsters = activeMonsters(p).filter((instance) => getCard(instance.cardId).kind === CARD_KIND.MONSTER);
  const results = [];
  function visit(start, chosen) {
    if (chosen.length === needed) { results.push(chosen.map((value) => value.uid)); return; }
    for (let i = start; i < monsters.length; i += 1) visit(i + 1, [...chosen, monsters[i]]);
  }
  visit(0, []);
  return results;
}

function summon(state, action, set = false) {
  const p = player(state, action.playerId);
  const instance = p.hand.find((value) => value.uid === action.cardUid);
  if (!instance) throw new Error("La carta no está en la mano.");
  const card = getCard(instance.cardId);
  const slot = firstFreeSlot(p.monsterZone);
  if (slot === -1) throw new Error("No hay zona de monstruos libre.");
  if (set) {
    if (card.kind !== CARD_KIND.MONSTER || p.normalSummonUsed || p.lockedNormalSummon) throw new Error("Set de monstruo ilegal.");
    p.hand.splice(p.hand.indexOf(instance), 1);
    setZone(instance, ZONE.MONSTER);
    instance.faceUp = false;
    instance.position = MONSTER_POSITION.DEFENSE;
    instance.setTurn = state.turn;
    instance.summonedTurn = state.turn;
    p.monsterZone[slot] = instance;
    p.normalSummonUsed = true;
    logEvent(state, "SET_MONSTER", `${p.name} coloca un monstruo boca abajo.`);
    openReaction(state, "SUMMON", { instanceUid: instance.uid });
    return;
  }
  if (!canNormalSummon(state, action.playerId, instance.cardId)) throw new Error("Invocación Normal ilegal.");
  const tributes = action.tributes ?? [];
  const expected = availableTributeSets(p, card);
  if (!expected.some((setIds) => setIds.length === tributes.length && setIds.every((uid) => tributes.includes(uid)))) throw new Error("Tributos no válidos.");
  for (const tributeUid of tributes) sendToGrave(state, tributeUid, "tribute");
  p.hand.splice(p.hand.indexOf(instance), 1);
  setZone(instance, ZONE.MONSTER);
  instance.faceUp = true;
  instance.position = MONSTER_POSITION.ATTACK;
  instance.summonedTurn = state.turn;
  p.monsterZone[slot] = instance;
  p.normalSummonUsed = true;
  if (card.effect === "BREAKER") instance.spellCounters = 1;
  logEvent(state, "SUMMON", `${p.name} Invoca Normalmente a ${card.name}.`, { uid: instance.uid });
  openReaction(state, "SUMMON", { instanceUid: instance.uid });
}

function setSpellTrap(state, action) {
  const p = player(state, action.playerId);
  const instance = p.hand.find((value) => value.uid === action.cardUid);
  const slot = firstFreeSlot(p.spellTrapZone);
  if (!instance || slot === -1) throw new Error("Set de Mágica/Trampa ilegal.");
  const card = getCard(instance.cardId);
  if (![CARD_KIND.SPELL, CARD_KIND.TRAP].includes(card.kind)) throw new Error("La carta no es Mágica/Trampa.");
  p.hand.splice(p.hand.indexOf(instance), 1);
  setZone(instance, ZONE.SPELL_TRAP);
  instance.faceUp = false;
  instance.setTurn = state.turn;
  p.spellTrapZone[slot] = instance;
  logEvent(state, "SET_BACKROW", `${p.name} coloca una carta boca abajo.`);
}

function changePosition(state, action) {
  const instance = findInstance(state, action.cardUid);
  const slot = instance && findSlot(state, instance.uid);
  if (!instance || !slot || slot.player.id !== action.playerId || slot.zone !== ZONE.MONSTER) throw new Error("Cambio de posición ilegal.");
  if (instance.summonedTurn === state.turn || instance.positionChangedTurn === state.turn) throw new Error("No puede cambiar de posición ahora.");
  if (!instance.faceUp) {
    handleFlip(state, instance);
    instance.position = MONSTER_POSITION.ATTACK;
  } else {
    instance.position = instance.position === MONSTER_POSITION.ATTACK ? MONSTER_POSITION.DEFENSE : MONSTER_POSITION.ATTACK;
  }
  instance.positionChangedTurn = state.turn;
  logEvent(state, "POSITION", `${getCard(instance.cardId).name} cambia a ${instance.position}.`);
}

function resolveAttack(state, action) {
  const attacker = findInstance(state, action.attackerUid);
  const attackerSlot = attacker && findSlot(state, attacker.uid);
  if (!attacker || !attackerSlot || attackerSlot.player.id !== action.playerId || !attacker.faceUp || attacker.position !== MONSTER_POSITION.ATTACK) return;
  if (attackerSlot.player !== player(state, action.playerId)) return;
  attacker.attackUsedTurn = state.turn;
  const defenderPlayer = player(state, opponentId(action.playerId));
  const defender = action.targetUid ? findInstance(state, action.targetUid) : null;
  if (defender) {
    const defenderSlot = findSlot(state, defender.uid);
    if (!defenderSlot || defenderSlot.player.id !== defenderPlayer.id) return;
    if (!defender.faceUp) handleFlip(state, defender);
    const attackerCard = getCard(attacker.cardId);
    const defenderCard = getCard(defender.cardId);
    if (defender.position === MONSTER_POSITION.ATTACK) {
      if (attackerCard.atk > defenderCard.atk) {
        applyDamage(state, defenderPlayer.id, attackerCard.atk - defenderCard.atk, "battle");
        destroy(state, defender.uid, "battle");
      } else if (attackerCard.atk < defenderCard.atk) {
        applyDamage(state, action.playerId, defenderCard.atk - attackerCard.atk, "battle");
        destroy(state, attacker.uid, "battle");
      } else {
        destroy(state, attacker.uid, "battle");
        destroy(state, defender.uid, "battle");
      }
    } else {
      if (attackerCard.atk > defenderCard.def) destroy(state, defender.uid, "battle");
      else if (attackerCard.atk < defenderCard.def) applyDamage(state, action.playerId, defenderCard.def - attackerCard.atk, "battle");
    }
  } else {
    applyDamage(state, defenderPlayer.id, getCard(attacker.cardId).atk, "direct-attack");
  }
  logEvent(state, "ATTACK_RESOLVED", `${getCard(attacker.cardId).name} resuelve su ataque.`);
}

function openReaction(state, event, data) {
  const responder = opponentId(state.activePlayer);
  const reaction = { event, data, responder, openedTurn: state.turn };
  if (responseActions(state, responder, reaction).length) {
    state.reaction = reaction;
    state.priorityPlayer = responder;
    logEvent(state, "CHAIN_WINDOW", `${state.players[responder].name} puede responder a ${event}.`);
  }
}

function responseActions(state, playerId, reaction = state.reaction) {
  if (!reaction || playerId !== reaction.responder) return [];
  const p = player(state, playerId);
  const result = [];
  const event = reaction.event;
  for (const instance of p.spellTrapZone.filter(Boolean)) {
    if (instance.faceUp || !isReadyToActivate(state, instance)) continue;
    const card = getCard(instance.cardId);
    if (isQuickPlaySpell(card)) {
      const base = { type: ACTION.ACTIVATE_SPELL, playerId, cardUid: instance.uid };
      result.push(...cardActivationActions(state, playerId, card, base, p, `Activar ${card.name}`));
      continue;
    }
    if (card.kind !== CARD_KIND.TRAP) continue;
    const actionBase = { type: ACTION.ACTIVATE_TRAP, playerId, cardUid: instance.uid };
    if (event === "SUMMON" && card.effect === "TORRENTIAL") result.push(withActionMeta(actionBase, `Activar ${card.name}`));
    if (event === "SUMMON" && card.effect === "BOTTOMLESS") {
      const target = findInstance(state, reaction.data.instanceUid);
      if (target && getCard(target.cardId).atk >= 1500) result.push(withActionMeta({ ...actionBase, targetUid: target.uid }, `Activar ${card.name}`));
    }
    if (event === "SUMMON" && card.effect === "RING") {
      for (const target of activeMonsters(player(state, opponentId(playerId)), (value) => value.faceUp)) result.push(withActionMeta({ ...actionBase, targetUid: target.uid }, `Activar ${card.name} → ${getCard(target.cardId).name}`));
    }
    if (event === "ATTACK_DECLARED" && card.effect === "MIRROR_FORCE") result.push(withActionMeta(actionBase, `Activar ${card.name}`));
    if (event === "ATTACK_DECLARED" && card.effect === "SAKURETSU") result.push(withActionMeta({ ...actionBase, targetUid: reaction.data.attackerUid }, `Activar ${card.name}`));
    if (["SPELL_ACTIVATED", "SUMMON", "ATTACK_DECLARED"].includes(event) && card.effect === "DUST_TORNADO") {
      for (const target of player(state, opponentId(playerId)).spellTrapZone.filter(Boolean)) result.push(withActionMeta({ ...actionBase, targetUid: target.uid }, `Activar ${card.name} → retaguardia`));
    }
  }
  return result;
}

function mainSpellActions(state, playerId) {
  const p = player(state, playerId);
  const actions = [];
  for (const instance of p.hand.filter(Boolean)) {
    const card = getCard(instance.cardId);
    if (card.kind !== CARD_KIND.SPELL) continue;
    if (card.status === "UNSUPPORTED") continue;
    if (isQuickPlaySpell(card) && state.activePlayer !== playerId) continue;
    if (["EQUIP", "CONTINUOUS", "FIELD"].includes(card.spellType) && firstFreeSlot(p.spellTrapZone) === -1) continue;
    const base = { type: ACTION.ACTIVATE_SPELL, playerId, cardUid: instance.uid };
    actions.push(...cardActivationActions(state, playerId, card, base, p, `Usar ${card.name}`));
  }
  return actions;
}

function setQuickPlaySpellActions(state, playerId) {
  const p = player(state, playerId);
  const actions = [];
  for (const instance of p.spellTrapZone.filter(Boolean)) {
    if (instance.faceUp || !isReadyToActivate(state, instance)) continue;
    const card = getCard(instance.cardId);
    if (!isQuickPlaySpell(card) || card.status === "UNSUPPORTED") continue;
    const base = { type: ACTION.ACTIVATE_SPELL, playerId, cardUid: instance.uid };
    actions.push(...cardActivationActions(state, playerId, card, base, p, `Activar ${card.name}`));
  }
  return actions;
}

function mainTrapActions(state, playerId) {
  const p = player(state, playerId);
  const actions = [];
  for (const instance of p.spellTrapZone.filter(Boolean)) {
    if (!isReadyToActivate(state, instance)) continue;
    const card = getCard(instance.cardId);
    if (!instance.faceUp && card.effect === "CALL" && card.trapType === "CONTINUOUS") {
      for (const target of p.grave.filter((value) => getCard(value.cardId).kind === CARD_KIND.MONSTER)) {
        actions.push(withActionMeta({ type: ACTION.ACTIVATE_TRAP, playerId, cardUid: instance.uid, targetUid: target.uid }, `Activar ${card.name}`));
      }
      continue;
    }
    if (instance.faceUp) continue;
    if (instance.faceUp) {
      if (card.effect !== "CALL") continue;
      for (const target of p.grave.filter((value) => getCard(value.cardId).kind === CARD_KIND.MONSTER)) actions.push(withActionMeta({ type: ACTION.ACTIVATE_TRAP, playerId, cardUid: instance.uid, targetUid: target.uid }, `Activar ${card.name} → ${getCard(target.cardId).name}`));
      continue;
    }
    if (card.kind !== CARD_KIND.TRAP || card.trapType !== "NORMAL" || !getEffectScript(card.effect)) continue;
    const base = { type: ACTION.ACTIVATE_TRAP, playerId, cardUid: instance.uid };
    actions.push(...cardActivationActions(state, playerId, card, base, p, `Activar ${card.name}`));
  }
  return actions;
}

function cardActivationActions(state, playerId, card, base, p, label) {
  const actions = [];
  const addTargets = (targets, suffix = "") => {
    for (const target of targets) actions.push(withActionMeta({ ...base, targetUid: target.uid }, `${label}${suffix ? ` → ${suffix(target)}` : ""}`));
  };
  switch (card.effect) {
    case "BOOK_OF_MOON":
      addTargets(allFieldInstances(state).filter((value) => isFaceUpMonster(state, value.uid)), (target) => getCard(target.cardId).name);
      break;
    case "MST":
    case "DUST_TORNADO":
      addTargets(effectInstances(state, { zone: "SPELL_TRAP", scope: "FIELD" }), () => "retaguardia");
      break;
    case "NOBLEMAN":
      addTargets(player(state, opponentId(playerId)).monsterZone.filter((value) => value && !value.faceUp), (target) => "monstruo boca abajo");
      break;
    case "SNATCH_STEAL":
      addTargets(activeMonsters(player(state, opponentId(playerId)), (value) => value.faceUp), (target) => getCard(target.cardId).name);
      break;
    case "PREMATURE_BURIAL":
      addTargets(p.grave.filter((value) => getCard(value.cardId).kind === CARD_KIND.MONSTER), (target) => getCard(target.cardId).name);
      break;
    case "DESTROY_FACEUP_MONSTER":
      addTargets(effectInstances(state, { zone: "MONSTER", scope: "FIELD", faceUp: true }), (target) => getCard(target.cardId).name);
      break;
    case "DESTROY_FACEUP_TRAP":
      addTargets(effectInstances(state, { zone: "SPELL_TRAP", scope: "FIELD", kind: CARD_KIND.TRAP, faceUp: true }), () => "Trampa boca arriba");
      break;
    case "OFFERINGS_TO_THE_DOOMED":
      addTargets(effectInstances(state, { zone: "MONSTER", scope: "FIELD", faceUp: true }), (target) => getCard(target.cardId).name);
      break;
    case "FISSURE": {
      const targets = effectInstances(state, { zone: "MONSTER", scope: "OPPONENT", faceUp: true });
      const minimum = Math.min(...targets.map((target) => Number(getCard(target.cardId).atk ?? 0)));
      addTargets(targets.filter((target) => Number(getCard(target.cardId).atk ?? 0) === minimum), (target) => getCard(target.cardId).name);
      break;
    }
    case "HAMMER_SHOT": {
      const targets = effectInstances(state, { zone: "MONSTER", scope: "FIELD", faceUp: true, position: MONSTER_POSITION.ATTACK });
      const maximum = Math.max(...targets.map((target) => Number(getCard(target.cardId).atk ?? 0)));
      addTargets(targets.filter((target) => Number(getCard(target.cardId).atk ?? 0) === maximum), (target) => getCard(target.cardId).name);
      break;
    }
    case "BLOCK_ATTACK":
      addTargets(effectInstances(state, { zone: "MONSTER", scope: "OPPONENT", faceUp: true, position: MONSTER_POSITION.ATTACK }), (target) => getCard(target.cardId).name);
      break;
    case "BOOK_OF_TAIYOU":
      addTargets(effectInstances(state, { zone: "MONSTER", scope: "FIELD", faceUp: false }), (target) => getCard(target.cardId).name);
      break;
    case "READY_FOR_INTERCEPTING":
      addTargets(effectInstances(state, { zone: "MONSTER", scope: "FIELD", faceUp: true }).filter((target) => ["Warrior", "Spellcaster"].includes(getCard(target.cardId).race)), (target) => getCard(target.cardId).name);
      break;
    case "DARK_CORE":
      addTargets(effectInstances(state, { zone: "MONSTER", scope: "FIELD", faceUp: true }), (target) => getCard(target.cardId).name);
      break;
    case "RAIGEKI_BREAK":
      addTargets(effectInstances(state, { zone: "FIELD", scope: "FIELD" }), (target) => getCard(target.cardId).name);
      break;
    default:
      if (getEffectScript(card.effect)) actions.push(withActionMeta(base, label));
  }
  return actions;
}

function effectInstances(state, criteria) {
  return effectCandidates(state, criteria.actorId ?? state.activePlayer, criteria)
    .map((uid) => findInstance(state, uid))
    .filter(Boolean);
}

function monsterActions(state, playerId) {
  const p = player(state, playerId);
  const actions = [];
  if (firstFreeSlot(p.monsterZone) !== -1 && !p.normalSummonUsed && !p.lockedNormalSummon) {
    for (const instance of p.hand.filter((value) => getCard(value.cardId).kind === CARD_KIND.MONSTER)) {
      const card = getCard(instance.cardId);
      if (card.effect === "THUNDER_DRAGON" && p.deck.some((value) => getCard(value.cardId)?.name === "Thunder Dragon")) actions.push(withActionMeta({ type: ACTION.ACTIVATE_MONSTER, playerId, cardUid: instance.uid }, `Activar ${card.name}`));
      const tributeSets = availableTributeSets(p, card);
      if (canNormalSummon(state, playerId, instance.cardId)) for (const tributes of tributeSets) actions.push(withActionMeta({ type: ACTION.SUMMON, playerId, cardUid: instance.uid, tributes }, `Invocar ${card.name}${tributes.length ? " (Tributo)" : ""}`));
      if (card.level <= 4) actions.push(withActionMeta({ type: ACTION.SET_MONSTER, playerId, cardUid: instance.uid }, `Colocar monstruo`));
    }
  }
  for (const instance of p.monsterZone.filter(Boolean)) {
    if (instance.faceUp && instance.position === MONSTER_POSITION.ATTACK && instance.summonedTurn !== state.turn && instance.attackUsedTurn !== state.turn) {
      const opponent = player(state, opponentId(playerId));
      const targets = opponent.monsterZone.filter(Boolean);
      if (!targets.length) actions.push(withActionMeta({ type: ACTION.ATTACK, playerId, attackerUid: instance.uid }, `Atacar directamente con ${getCard(instance.cardId).name}`));
      else for (const target of targets) actions.push(withActionMeta({ type: ACTION.ATTACK, playerId, attackerUid: instance.uid, targetUid: target.uid }, `Atacar con ${getCard(instance.cardId).name}`));
    }
    if (instance.summonedTurn !== state.turn && instance.positionChangedTurn !== state.turn) actions.push(withActionMeta({ type: ACTION.CHANGE_POSITION, playerId, cardUid: instance.uid }, instance.faceUp ? `Cambiar posición de ${getCard(instance.cardId).name}` : `Voltear ${getCard(instance.cardId).name}`));
  }
  return actions;
}

function setActions(state, playerId) {
  const p = player(state, playerId);
  const actions = [];
  if (firstFreeSlot(p.spellTrapZone) !== -1) for (const instance of p.hand.filter((value) => [CARD_KIND.SPELL, CARD_KIND.TRAP].includes(getCard(value.cardId).kind))) actions.push(withActionMeta({ type: ACTION.SET_SPELL_TRAP, playerId, cardUid: instance.uid }, `Colocar Mágica/Trampa`));
  return actions;
}

export function legalActions(state, playerId = state.priorityPlayer) {
  if (state.winner !== null || playerId === null || playerId === undefined) return [];
  if (state.reaction) {
    if (playerId !== state.reaction.responder) return [];
    return [withActionMeta({ type: ACTION.PASS_PRIORITY, playerId }, "No responder"), ...responseActions(state, playerId)];
  }
  if (playerId !== state.activePlayer || playerId !== state.priorityPlayer) return [];
  const actions = [withActionMeta({ type: ACTION.SURRENDER, playerId }, "Rendirse")];
  if ([PHASE.DRAW, PHASE.STANDBY, PHASE.MAIN_1, PHASE.BATTLE, PHASE.MAIN_2, PHASE.END].includes(state.phase)) actions.push(withActionMeta({ type: ACTION.ADVANCE_PHASE, playerId }, state.phase === PHASE.DRAW ? "Robar y continuar" : state.phase === PHASE.STANDBY ? "Pasar a Main Phase 1" : state.phase === PHASE.MAIN_1 ? "Ir a Battle Phase" : state.phase === PHASE.BATTLE ? "Terminar Battle Phase" : state.phase === PHASE.MAIN_2 ? "Terminar Main Phase 2" : "Terminar turno"));
  if (state.phase === PHASE.MAIN_1 || state.phase === PHASE.MAIN_2) actions.push(...monsterActions(state, playerId), ...mainSpellActions(state, playerId), ...setQuickPlaySpellActions(state, playerId), ...mainTrapActions(state, playerId), ...setActions(state, playerId));
  return actions;
}

function matchesAction(action, candidate) {
  return actionId(action) === actionId(candidate);
}

function startNextTurn(state) {
  state.activePlayer = opponentId(state.activePlayer);
  state.priorityPlayer = state.activePlayer;
  state.turn += 1;
  state.effects.temporary = state.effects.temporary.filter((effect) => effect.untilTurn === undefined || effect.untilTurn >= state.turn);
  state.effects.restrictions = state.effects.restrictions.filter((effect) => effect.untilTurn === undefined || effect.untilTurn >= state.turn);
  state.effects.expirations = state.effects.expirations.filter((effect) => effect.atTurn === undefined || effect.atTurn > state.turn);
  state.players.forEach((p) => {
    p.normalSummonUsed = false;
    p.lockedNormalSummon = false;
    p.monsterZone.forEach((instance) => {
      if (instance) instance.attackUsedTurn = null;
    });
  });
  state.phase = PHASE.DRAW;
  state.needsDraw = true;
  logEvent(state, "TURN_START", `Comienza el turno de ${state.players[state.activePlayer].name}.`);
}

function advancePhase(state, playerId) {
  if (state.phase === PHASE.DRAW) {
    if (state.needsDraw) {
      state.needsDraw = false;
      const skipIndex = state.effects.restrictions.findIndex((effect) => effect.key === "skipDraw" && effect.playerId === playerId);
      if (skipIndex !== -1) {
        state.effects.restrictions.splice(skipIndex, 1);
        logEvent(state, "SKIP_DRAW", `${player(state, playerId).name} salta su Draw Phase.`);
      } else {
        draw(state, playerId, 1);
      }
      if (state.winner !== null) return;
    }
    state.phase = PHASE.STANDBY;
    logEvent(state, "PHASE", "Standby Phase.");
  } else if (state.phase === PHASE.STANDBY) {
    resolveStandby(state, playerId);
    state.phase = PHASE.MAIN_1;
    logEvent(state, "PHASE", "Main Phase 1.");
  } else if (state.phase === PHASE.MAIN_1) {
    state.phase = PHASE.BATTLE;
    logEvent(state, "PHASE", "Battle Phase.");
  } else if (state.phase === PHASE.BATTLE) {
    state.phase = PHASE.MAIN_2;
    logEvent(state, "PHASE", "Main Phase 2.");
  } else if (state.phase === PHASE.MAIN_2) {
    state.phase = PHASE.END;
    logEvent(state, "PHASE", "End Phase.");
  } else if (state.phase === PHASE.END) {
    startNextTurn(state);
  }
}

function activateTrap(state, action) {
  const p = player(state, action.playerId);
  const instance = p.spellTrapZone.find((value) => value?.uid === action.cardUid);
  if (!instance) throw new Error("La Trampa no está colocada.");
  const card = getCard(instance.cardId);
  if (!isReadyToActivate(state, instance)) throw new Error("Una Trampa recién colocada no puede activarse aún.");
  const persistent = card.trapType === "CONTINUOUS";
  if (persistent) {
    instance.faceUp = true;
    instance.setTurn = null;
  } else {
    p.spellTrapZone[p.spellTrapZone.indexOf(instance)] = null;
    setZone(instance, ZONE.GRAVE);
    p.grave.push(instance);
    instance.faceUp = true;
  }
  logEvent(state, "ACTIVATE", `${p.name} activa ${card.name}.`, { playerId: action.playerId, uid: instance.uid });
  if (state.reaction) {
    const reaction = state.reaction;
    state.reaction = null;
    state.priorityPlayer = state.activePlayer;
    if (reaction.event === "ATTACK_DECLARED" && card.effect === "SAKURETSU") action.targetUid = reaction.data.attackerUid;
  }
  resolveCardEffect(state, instance, action);
}

function execute(state, action) {
  switch (action.type) {
    case ACTION.ADVANCE_PHASE: advancePhase(state, action.playerId); break;
    case ACTION.SUMMON: summon(state, action); break;
    case ACTION.SET_MONSTER: summon(state, action, true); break;
    case ACTION.SET_SPELL_TRAP: setSpellTrap(state, action); break;
    case ACTION.ACTIVATE_MONSTER: activateMonsterEffect(state, action); break;
    case ACTION.ACTIVATE_SPELL: activateFieldSpell(state, action); break;
    case ACTION.ACTIVATE_TRAP: activateTrap(state, action); break;
    case ACTION.ATTACK:
      state.reaction = { event: "ATTACK_DECLARED", data: { attackerUid: action.attackerUid, targetUid: action.targetUid }, responder: opponentId(action.playerId), openedTurn: state.turn };
      if (!responseActions(state, state.reaction.responder, state.reaction).length) {
        state.reaction = null;
        resolveAttack(state, action);
      } else {
        state.priorityPlayer = state.reaction.responder;
        logEvent(state, "ATTACK_DECLARED", `${getCard(findInstance(state, action.attackerUid).cardId).name} declara un ataque.`);
      }
      break;
    case ACTION.CHANGE_POSITION: changePosition(state, action); break;
    case ACTION.PASS_PRIORITY: {
      const reaction = state.reaction;
      state.reaction = null;
      state.priorityPlayer = state.activePlayer;
      if (reaction?.event === "ATTACK_DECLARED") resolveAttack(state, { ...reaction.data, playerId: state.activePlayer });
      break;
    }
    case ACTION.SURRENDER: finish(state, opponentId(action.playerId), TERMINATION.SURRENDER); break;
    default: throw new Error(`Acción desconocida: ${action.type}`);
  }
}

export function step(state, action) {
  if (state.winner !== null) throw new IllegalActionError("El duelo ya ha terminado.", action);
  const legal = legalActions(state, state.priorityPlayer);
  const candidate = legal.find((value) => matchesAction(action, value));
  if (!candidate) throw new IllegalActionError(`Acción ilegal: ${JSON.stringify(action)}`, action, legal);
  state.decisionCount += 1;
  state.history.push({ actor: action.playerId, action: cloneAction(action) });
  try {
    execute(state, structuredClone(action));
  } catch (error) {
    state.invalidAction = { action: cloneAction(action), message: error.message };
    finish(state, opponentId(action.playerId), TERMINATION.INVALID_ACTION);
    throw error;
  }
  if (state.decisionCount >= state.maxDecisions && state.winner === null) finish(state, null, TERMINATION.DECISION_LIMIT);
  if (state.turn >= state.maxTurns && state.winner === null) finish(state, null, TERMINATION.TURN_LIMIT);
  return state;
}

export function createDuel(deckA, deckB, { seed = 1, startingPlayer = null, names = ["Tú", "Astra"], maxDecisions = MAX_DECISIONS, maxTurns = MAX_TURNS } = {}) {
  const state = {
    engineVersion: ENGINE_VERSION,
    formatVersion: FORMAT_VERSION,
    cardDatabaseVersion: CARD_DATABASE_VERSION,
    seed: Number(seed) >>> 0,
    rng: new SeededRng(seed),
    nextUid: 1,
    eventCount: 0,
    decisionCount: 0,
    maxDecisions,
    maxTurns,
    turn: 1,
    activePlayer: startingPlayer === null ? 0 : startingPlayer,
    priorityPlayer: startingPlayer === null ? 0 : startingPlayer,
    phase: PHASE.DRAW,
    needsDraw: true,
    reaction: null,
    winner: null,
    terminationReason: null,
    invalidAction: null,
    effects: {
      continuous: [],
      temporary: [],
      negations: [],
      restrictions: [],
      expirations: []
    },
    log: [],
    history: [],
    initialDecks: [structuredClone(deckA), structuredClone(deckB)],
    players: [0, 1].map((id) => ({
      id,
      name: names[id] ?? `Player ${id + 1}`,
      lp: STARTING_LIFE_POINTS,
      deck: [],
      hand: [],
      grave: [],
      banished: [],
      monsterZone: emptySlots(MAX_MONSTERS),
      spellTrapZone: emptySlots(MAX_SPELL_TRAPS),
      normalSummonUsed: false,
      lockedNormalSummon: false
    }))
  };
  for (const [playerId, deck] of [deckA, deckB].entries()) {
    const instances = deck.map((cardId) => makeInstance(state, cardId, playerId, ZONE.DECK));
    state.rng.shuffle(instances);
    state.players[playerId].deck = instances;
  }
  draw(state, 0, STARTING_HAND_SIZE);
  draw(state, 1, STARTING_HAND_SIZE);
  state.startingPlayer = state.activePlayer;
  logEvent(state, "DUEL_START", `${state.players[state.activePlayer].name} empieza.`, { seed: state.seed });
  return state;
}

export function runDuel(deckA, deckB, botA, botB, options = {}) {
  const state = createDuel(deckA, deckB, options);
  const bots = [botA, botB];
  while (state.winner === null) {
    const actor = state.priorityPlayer;
    const observation = observe(state, actor);
    const actions = legalActions(state, actor);
    if (!actions.length) {
      finish(state, null, TERMINATION.INVALID_ACTION);
      break;
    }
    const selected = bots[actor].chooseAction(observation, actions);
    try {
      step(state, selected);
    } catch (error) {
      state.invalidAction = { action: selected, message: error.message };
      if (state.winner === null) finish(state, opponentId(actor), TERMINATION.INVALID_ACTION);
    }
  }
  return {
    winner: state.winner,
    terminationReason: state.terminationReason,
    turns: state.turn,
    decisions: state.decisionCount,
    lp: state.players.map((p) => p.lp),
    state,
    replay: {
      schema: 1,
      engineVersion: state.engineVersion,
      formatVersion: state.formatVersion,
      cardDatabaseVersion: state.cardDatabaseVersion,
      seed: state.seed,
      startingPlayer: state.startingPlayer,
      decks: state.initialDecks,
      result: state.winner,
      terminationReason: state.terminationReason,
      turns: state.turn,
      decisions: state.decisionCount,
      actions: state.history
    }
  };
}

function hiddenInstance(instance, viewerId, visible) {
  if (!instance) return null;
  const card = getCard(instance.cardId);
  if (visible) return { uid: instance.uid, cardId: instance.cardId, name: card.name, kind: card.kind, atk: card.atk, def: card.def, level: card.level, faceUp: instance.faceUp, position: instance.position, controller: instance.controller, owner: instance.owner, spellCounters: instance.spellCounters };
  return { uid: instance.uid, cardId: null, name: "Carta oculta", kind: card.kind === CARD_KIND.MONSTER ? CARD_KIND.MONSTER : "UNKNOWN", faceUp: false, position: instance.position, controller: instance.controller, owner: instance.owner };
}

export function observe(state, viewerId) {
  const view = {
    viewerId,
    turn: state.turn,
    phase: state.phase,
    activePlayer: state.activePlayer,
    priorityPlayer: state.priorityPlayer,
    reaction: state.reaction ? { event: state.reaction.event, data: structuredClone(state.reaction.data), responder: state.reaction.responder } : null,
    winner: state.winner,
    terminationReason: state.terminationReason,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      lp: p.lp,
      deckCount: p.deck.length,
      handCount: p.hand.length,
      hand: p.id === viewerId ? p.hand.map((instance) => hiddenInstance(instance, viewerId, true)) : p.hand.map((instance) => hiddenInstance(instance, viewerId, false)),
      grave: p.grave.map((instance) => hiddenInstance(instance, viewerId, true)),
      banishedCount: p.banished.length,
      monsterZone: p.monsterZone.map((instance) => hiddenInstance(instance, viewerId, Boolean(instance?.faceUp || p.id === viewerId))),
      spellTrapZone: p.spellTrapZone.map((instance) => hiddenInstance(instance, viewerId, Boolean(instance?.faceUp || p.id === viewerId)))
    })),
    recentLog: state.log.slice(-20).map((event) => ({ ...event })),
    legalActions: legalActions(state, viewerId).map((action) => ({ ...action }))
  };
  return view;
}

export function debugState(state) {
  return structuredClone({ ...state, rng: { seed: state.rng.seed, state: state.rng.state } });
}

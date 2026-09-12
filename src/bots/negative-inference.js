import { CARDS } from "../engine/cards.js";
import { GOAT_BANLIST } from "../format/banlist-data.js";
import { strategyActionRole } from "./deck-strategy.js";
import { OcgMessageType, SelectBattleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";

let cachedCardNames = null;

function cardNameLookup() {
  if (cachedCardNames) return cachedCardNames;
  cachedCardNames = new Map();
  for (const card of CARDS) {
    const name = String(card.name ?? "").toLowerCase();
    if (card.authoritative?.runtimeCode) cachedCardNames.set(Number(card.authoritative.runtimeCode), name);
    if (card.id) cachedCardNames.set(Number(card.id), name);
  }
  return cachedCardNames;
}

function nameOfCard(card) {
  if (card?.name) return String(card.name).toLowerCase();
  const code = Number(card?.runtimeCode ?? card?.code ?? 0);
  if (!code) return "";
  const lookup = cardNameLookup();
  return lookup.get(code) ?? "";
}

/**
 * Limited and Forbidden cards in Goat Format derived from authoritative banlist.
 * Once seen in public zones, limited cards cannot exist in hidden zones
 * unless explicitly recycled to hand/deck.
 */
export const GOAT_LIMITED_CARDS = Object.freeze(
  [...GOAT_BANLIST.limited, ...GOAT_BANLIST.forbidden].map((name) => name.toLowerCase())
);

export function createNegativeInferenceTracker({ legacy = false } = {}) {
  return {
    schema: 3,
    legacy: legacy === true,
    testedSlots: {}, // sequence -> { passedAttack: boolean, passedSummon: boolean, turnsSet: number, cardUid: string|null }
    slotGenerations: {}, // sequence -> number
    activeSlotIds: {}, // sequence -> string
    pendingAttack: null, // { turn, slotsPresent: [{ sequence, uid }] }
    pendingSummon: null, // { turn, slotsPresent: [{ sequence, uid }] }
    knownOpponentHand: [], // list of card names known in opponent's hand
    exhaustedLimitedCards: new Set(),
    lastTurn: 0,
    attacksDeclaredThisTurn: 0,
    summonsDeclaredThisTurn: 0,
    attackDeclaringSlotPassed: false,
    oppHadSinisterInGrave: false,
  };
}

/**
 * Updates tracker with public observation facts and prior action events.
 */
export function updateNegativeInference(tracker = createNegativeInferenceTracker(), observation = {}, message = null, response = null) {
  if (tracker.legacy === true) {
    const legacyNext = {
      ...tracker,
      testedSlots: { ...tracker.testedSlots },
      knownOpponentHand: [...tracker.knownOpponentHand],
      exhaustedLimitedCards: new Set(tracker.exhaustedLimitedCards),
    };

    const currentTurn = Number(observation.turn) || 0;
    if (currentTurn !== legacyNext.lastTurn) {
      legacyNext.lastTurn = currentTurn;
      legacyNext.attacksDeclaredThisTurn = 0;
      legacyNext.attackDeclaringSlotPassed = false;
    }

    const allPublicOppCards = [
      ...(observation.opponentGrave ?? []),
      ...(observation.opponentBanished ?? []),
    ];
    for (const card of allPublicOppCards) {
      const name = nameOfCard(card);
      if (name && GOAT_LIMITED_CARDS.includes(name)) {
        legacyNext.exhaustedLimitedCards.add(name);
      }
    }

    const oppGraveNames = (observation.opponentGrave ?? []).map(nameOfCard);
    const oppHasSinisterInGrave = oppGraveNames.includes("sinister serpent");
    if (!oppHasSinisterInGrave && tracker.oppHadSinisterInGrave && !legacyNext.knownOpponentHand.includes("sinister serpent")) {
      legacyNext.knownOpponentHand.push("sinister serpent");
    }
    legacyNext.oppHadSinisterInGrave = oppHasSinisterInGrave;

    const role = response && message ? strategyActionRole(message, response) : null;
    const isAttackAction = role === "attack" || response?.action === 1 || response?.role === "attack";
    if (isAttackAction) {
      legacyNext.attacksDeclaredThisTurn += 1;
    }

    const oppBackrow = observation.opponentBackrow ?? [];
    const publicChain = observation.publicChain ?? [];
    const opponentChainedInBattle = publicChain.some((c) => Number(c.controller) !== Number(observation.player));

    if (legacyNext.attacksDeclaredThisTurn > 0 && !opponentChainedInBattle) {
      legacyNext.attackDeclaringSlotPassed = true;
      for (const card of oppBackrow) {
        const seq = Number(card.sequence ?? 0);
        if (!card.faceUp) {
          legacyNext.testedSlots[seq] = {
            passedAttack: true,
            turnsSet: (legacyNext.testedSlots[seq]?.turnsSet ?? 0) + 1,
          };
        }
      }
    }

    return legacyNext;
  }

  const next = {
    ...tracker,
    testedSlots: { ...tracker.testedSlots },
    slotGenerations: { ...tracker.slotGenerations },
    activeSlotIds: { ...tracker.activeSlotIds },
    knownOpponentHand: [...tracker.knownOpponentHand],
    exhaustedLimitedCards: new Set(),
  };

  const currentTurn = Number(observation.turn) || 0;
  if (currentTurn !== next.lastTurn) {
    next.lastTurn = currentTurn;
    next.attacksDeclaredThisTurn = 0;
    next.summonsDeclaredThisTurn = 0;
    next.pendingAttack = null;
    next.pendingSummon = null;
  }

  // 0. If response is passed, the bot is choosing an action in the current window.
  // Record intent (e.g. pending attack declaration, pending summon) without resolving it immediately.
  if (response && message) {
    const role = strategyActionRole(message, response);
    const isAttackAction =
      ((Number(message?.type) === OcgMessageType.SELECT_BATTLECMD || String(message?.desc).includes("SELECT_BATTLECMD")) &&
        Number(response?.action) === SelectBattleCMDAction.SELECT_BATTLE) ||
      role === "attack";
    if (isAttackAction) {
      next.pendingAttack = {
        turn: currentTurn,
        slotsPresent: (observation.opponentBackrow ?? [])
          .filter((c) => !c.faceUp)
          .map((c) => ({ sequence: Number(c.sequence ?? 0), uid: c.uid ?? `seq_${c.sequence}_gen_${next.slotGenerations[c.sequence] ?? 1}` })),
      };
    }
    const isSummonAction = role === "summon" || role === "special-summon";
    if (isSummonAction) {
      next.pendingSummon = {
        turn: currentTurn,
        slotsPresent: (observation.opponentBackrow ?? [])
          .filter((c) => !c.faceUp)
          .map((c) => ({ sequence: Number(c.sequence ?? 0), uid: c.uid ?? `seq_${c.sequence}_gen_${next.slotGenerations[c.sequence] ?? 1}` })),
      };
    }
    return next;
  }

  // 1. Recalculate Exhausted Limited Cards from CURRENT public locations (grave, banished, face-up)
  // Limited cards leaving grave/banished (e.g. recycled) return to hidden/unknown possibilities!
  const currentPublicOppCards = [
    ...(observation.opponentGrave ?? []),
    ...(observation.opponentBanished ?? []),
    ...(observation.opponentMonsters ?? []).filter((c) => c.faceUp),
    ...(observation.opponentBackrow ?? []).filter((c) => c.faceUp),
    ...(observation.publicChain ?? []),
  ];
  for (const card of currentPublicOppCards) {
    const name = nameOfCard(card);
    if (name && GOAT_LIMITED_CARDS.includes(name)) {
      next.exhaustedLimitedCards.add(name);
    }
  }

  // 2. Track Zone Generations & Clean Vacated Slots
  const currentFacedownSeqMap = new Map();
  for (const card of observation.opponentBackrow ?? []) {
    if (!card.faceUp) {
      const seq = Number(card.sequence ?? 0);
      const cardUid = card.uid ?? null;
      currentFacedownSeqMap.set(seq, cardUid);
    }
  }

  // Clean slots that are no longer occupied by a facedown card
  for (const seqStr of Object.keys(next.testedSlots)) {
    const seq = Number(seqStr);
    if (!currentFacedownSeqMap.has(seq)) {
      delete next.testedSlots[seq];
      delete next.activeSlotIds[seq];
    }
  }

  // Check new placements in sequence slots
  for (const [seq, cardUid] of currentFacedownSeqMap.entries()) {
    const prevId = next.activeSlotIds[seq];
    if (!prevId) {
      next.slotGenerations[seq] = (next.slotGenerations[seq] ?? 0) + 1;
      next.activeSlotIds[seq] = cardUid ?? `seq_${seq}_gen_${next.slotGenerations[seq]}`;
    } else if (cardUid && prevId !== cardUid) {
      // Card changed in this slot
      next.slotGenerations[seq] = (next.slotGenerations[seq] ?? 0) + 1;
      next.activeSlotIds[seq] = cardUid;
      delete next.testedSlots[seq];
    }
  }

  // 3. Resolve Pending Attack / Summon Declaration if window finished
  if (next.pendingAttack) {
    const publicChain = observation.publicChain ?? [];
    const opponentChained = publicChain.some((c) => Number(c.controller) !== Number(observation.player));

    // If opponent chained a trap, window closed with response
    if (opponentChained) {
      next.pendingAttack = null;
    } else {
      // If the duel progressed (e.g. new phase, damage step, or another decision prompt without active chain)
      next.attacksDeclaredThisTurn += 1;
      for (const slot of next.pendingAttack.slotsPresent) {
        if (currentFacedownSeqMap.has(slot.sequence)) {
          const currentUid = currentFacedownSeqMap.get(slot.sequence);
          if (!slot.uid || !currentUid || slot.uid === currentUid) {
            next.testedSlots[slot.sequence] = {
              ...(next.testedSlots[slot.sequence] ?? {}),
              passedAttack: true,
              turnsSet: (next.testedSlots[slot.sequence]?.turnsSet ?? 0) + 1,
              cardUid: slot.uid ?? currentUid,
            };
          }
        }
      }
      next.pendingAttack = null;
    }
  }

  if (next.pendingSummon) {
    const publicChain = observation.publicChain ?? [];
    const opponentChained = publicChain.some((c) => Number(c.controller) !== Number(observation.player));
    if (opponentChained) {
      next.pendingSummon = null;
    } else {
      next.summonsDeclaredThisTurn += 1;
      for (const slot of next.pendingSummon.slotsPresent) {
        if (currentFacedownSeqMap.has(slot.sequence)) {
          const currentUid = currentFacedownSeqMap.get(slot.sequence);
          if (!slot.uid || !currentUid || slot.uid === currentUid) {
            next.testedSlots[slot.sequence] = {
              ...(next.testedSlots[slot.sequence] ?? {}),
              passedSummon: true,
              cardUid: slot.uid ?? currentUid,
            };
          }
        }
      }
      next.pendingSummon = null;
    }
  }

  // 4. Track Known Cards in Opponent Hand
  // Sinister Serpent: check if it left grave
  const oppGraveNames = (observation.opponentGrave ?? []).map(nameOfCard);
  const oppBanishedNames = (observation.opponentBanished ?? []).map(nameOfCard);
  const oppFieldNames = [...(observation.opponentMonsters ?? []), ...(observation.opponentBackrow ?? [])].map(nameOfCard);

  const oppHasSinisterInGrave = oppGraveNames.includes("sinister serpent");
  const oppHasSinisterInBanished = oppBanishedNames.includes("sinister serpent");
  const oppHasSinisterOnField = oppFieldNames.includes("sinister serpent");

  // Only consider returned to hand if it left grave AND was NOT banished AND was NOT sent to field
  if (!oppHasSinisterInGrave && tracker.oppHadSinisterInGrave) {
    if (!oppHasSinisterInBanished && !oppHasSinisterOnField) {
      if (!next.knownOpponentHand.includes("sinister serpent")) {
        next.knownOpponentHand.push("sinister serpent");
      }
    }
  }
  // If Sinister was in hand but is now banished, in grave, or on field, remove it
  if (oppHasSinisterInBanished || oppHasSinisterInGrave || oppHasSinisterOnField) {
    const sIdx = next.knownOpponentHand.indexOf("sinister serpent");
    if (sIdx >= 0) next.knownOpponentHand.splice(sIdx, 1);
  }

  next.oppHadSinisterInGrave = oppHasSinisterInGrave;

  // Remove known hand cards when opponent plays them publicly
  const oppPlayedThisTurn = [
    ...(observation.opponentMonsters ?? []),
    ...(observation.opponentBackrow ?? []),
    ...(observation.publicChain ?? []).filter((c) => Number(c.controller) !== Number(observation.player)),
  ];
  for (const played of oppPlayedThisTurn) {
    const name = nameOfCard(played);
    if (name) {
      const idx = next.knownOpponentHand.indexOf(name);
      if (idx >= 0) next.knownOpponentHand.splice(idx, 1);
    }
  }

  return next;
}

/**
 * Checks if all current face-down backrow cards have been probed by an attack and declined to respond.
 */
export function isOpponentBackrowProbed(tracker = {}, observation = {}) {
  if (tracker.legacy === true) {
    if (Number(observation.opponentBackrowCount ?? 0) === 0) return true;
    if (tracker.attackDeclaringSlotPassed === true) return true;
    const oppBackrow = observation.opponentBackrow ?? [];
    if (!oppBackrow.length) return true;
    return oppBackrow.every((card) => card.faceUp || tracker.testedSlots?.[Number(card.sequence)]?.passedAttack === true);
  }
  const oppBackrow = (observation.opponentBackrow ?? []).filter((card) => !card.faceUp);
  if (!oppBackrow.length) return true;
  return oppBackrow.every((card) => {
    const seq = Number(card.sequence ?? 0);
    const slot = tracker.testedSlots?.[seq];
    if (!slot || !slot.passedAttack) return false;
    if (card.uid && slot.cardUid && card.uid !== slot.cardUid) return false;
    return true;
  });
}

/**
 * Vía 3: Calculates exact hypergeometric probability of opponent holding a specific limited card in hand.
 */
export function calculateHiddenHandProbability(cardName, tracker = {}, observation = {}) {
  const normName = String(cardName ?? "").toLowerCase().trim();
  const exhausted = tracker?.exhaustedLimitedCards ?? new Set();
  if (exhausted.has(normName)) return 0.0;

  // Known revealed card in hand (e.g. Sinister Serpent returned to hand)
  const knownHand = (tracker?.knownOpponentHand ?? []).map((n) => String(n).toLowerCase().trim());
  if (knownHand.includes(normName)) return 1.0;

  // Check if card is currently face-up or in graveyard/banished
  const allPublicOppCards = [
    ...(observation.opponentGrave ?? []),
    ...(observation.opponentBanished ?? []),
    ...(observation.opponentMonsters ?? []).filter((c) => c.faceUp),
    ...(observation.opponentBackrow ?? []).filter((c) => c.faceUp),
  ];
  if (allPublicOppCards.some((c) => nameOfCard(c) === normName)) return 0.0;

  const handCount = Number(observation.opponentHandSize ?? observation.opponentHandCount ?? (observation.opponentHand ?? []).length ?? 0);
  if (handCount <= 0) return 0.0;

  const deckCount = Math.max(1, Number(observation.opponentDeckSize ?? 35));
  // Exact hypergeometric probability of drawing a 1-of card from unrevealed pool (deck + unknown hand)
  const unknownPool = deckCount + Math.max(0, handCount - knownHand.length);
  return unknownPool > 0 ? Math.min(1.0, handCount / unknownPool) : 0.0;
}

/**
 * Returns adjusted probabilities of specific trap threats and hand power cards given negative inference.
 */
export function evaluateBackrowThreats(tracker = {}, observation = {}) {
  const exhausted = tracker.exhaustedLimitedCards ?? new Set();
  const backrowProbed = isOpponentBackrowProbed(tracker, observation);
  const oppBackrowCount = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);

  // Mirror Force is possible as long as there is an unrevealed backrow card AND it is not exhausted.
  // Inaction reduces belief (mirrorForceRisk drops to 0.04), but NEVER proves impossibility!
  // In legacy mode, backrowProbed falsely zeroed out mirrorForcePossible.
  const mirrorForcePossible = oppBackrowCount > 0 && !exhausted.has("mirror force") && (tracker.legacy === true ? !backrowProbed : true);
  const torrentialPossible = oppBackrowCount > 0 && !exhausted.has("torrential tribute");
  const ringOfDestructionPossible = oppBackrowCount > 0 && !exhausted.has("ring of destruction");

  // Bayesian posterior: if bot summoned and opponent declined to activate Torrential, slots present passed
  const oppBackrow = (observation.opponentBackrow ?? []).filter((card) => !card.faceUp);
  const allPassedSummon = oppBackrow.length > 0 && oppBackrow.every((c) => tracker.testedSlots?.[Number(c.sequence)]?.passedSummon === true);

  const mirrorForceRisk = mirrorForcePossible ? (backrowProbed ? 0.05 : 0.28) : 0.0;
  const torrentialRisk = torrentialPossible ? (allPassedSummon ? 0.04 : 0.25) : 0.0;
  const ringRisk = ringOfDestructionPossible ? (Number(observation.ownLp) <= 2500 ? 0.45 : 0.20) : 0.0;

  const handProbabilities = {
    snatchSteal: calculateHiddenHandProbability("snatch steal", tracker, observation),
    heavyStorm: calculateHiddenHandProbability("heavy storm", tracker, observation),
    delinquentDuo: calculateHiddenHandProbability("delinquent duo", tracker, observation),
    potOfGreed: calculateHiddenHandProbability("pot of greed", tracker, observation),
    gracefulCharity: calculateHiddenHandProbability("graceful charity", tracker, observation),
    bls: calculateHiddenHandProbability("black luster soldier - envoy of the beginning", tracker, observation),
    lightningVortex: calculateHiddenHandProbability("lightning vortex", tracker, observation),
    tsukuyomi: calculateHiddenHandProbability("tsukuyomi", tracker, observation),
  };

  return {
    mirrorForcePossible,
    torrentialPossible,
    ringOfDestructionPossible,
    backrowProbed,
    mirrorForceRisk,
    torrentialRisk,
    ringRisk,
    knownOpponentHandCount: tracker.knownOpponentHand?.length ?? 0,
    knownOpponentHandCards: tracker.knownOpponentHand ?? [],
    handProbabilities,
  };
}

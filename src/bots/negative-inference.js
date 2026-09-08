import { CARDS } from "../engine/cards.js";
import { strategyActionRole } from "./deck-strategy.js";

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
 * Limited cards in Goat Format (max 1 copy per deck). 
 * Once seen in public GY or banished, they cannot exist in hidden zones
 * unless explicitly recycled by Magician of Faith, Mask of Darkness, etc.
 */
export const GOAT_LIMITED_CARDS = Object.freeze([
  "mirror force",
  "torrential tribute",
  "ring of destruction",
  "heavy storm",
  "pot of greed",
  "graceful charity",
  "delinquent duo",
  "snatch steal",
  "premature burial",
  "call of the haunted",
  "mystical space typhoon",
  "card destruction",
  "morphing jar",
  "black luster soldier - envoy of the beginning",
  "sinister serpent",
  "tribe-infecting virus",
  "breaker the magical warrior",
  "jinzo",
]);

export function createNegativeInferenceTracker() {
  return {
    schema: 1,
    testedSlots: {}, // sequence -> { passedAttack: boolean, turnsSet: number }
    knownOpponentHand: [], // list of card names known in opponent's hand
    exhaustedLimitedCards: new Set(),
    lastTurn: 0,
    attacksDeclaredThisTurn: 0,
    attackDeclaringSlotPassed: false,
  };
}

/**
 * Updates tracker with public observation facts and prior action events.
 */
export function updateNegativeInference(tracker = createNegativeInferenceTracker(), observation = {}, message = null, response = null) {
  const next = {
    ...tracker,
    testedSlots: { ...tracker.testedSlots },
    knownOpponentHand: [...tracker.knownOpponentHand],
    exhaustedLimitedCards: new Set(tracker.exhaustedLimitedCards),
  };

  const currentTurn = Number(observation.turn) || 0;
  if (currentTurn !== next.lastTurn) {
    next.lastTurn = currentTurn;
    next.attacksDeclaredThisTurn = 0;
    next.attackDeclaringSlotPassed = false;
  }

  // 1. Track Exhausted Limited Cards in Opponent Graveyard & Banished
  const allPublicOppCards = [
    ...(observation.opponentGrave ?? []),
    ...(observation.opponentBanished ?? []),
  ];
  for (const card of allPublicOppCards) {
    const name = nameOfCard(card);
    if (name && GOAT_LIMITED_CARDS.includes(name)) {
      next.exhaustedLimitedCards.add(name);
    }
  }

  // 2. Track Known Cards in Opponent Hand
  // e.g. Sinister Serpent entering hand during Standby Phase, Sangan search, etc.
  const oppGraveNames = (observation.opponentGrave ?? []).map(nameOfCard);
  const oppHasSinisterInGrave = oppGraveNames.includes("sinister serpent");
  if (!oppHasSinisterInGrave && tracker.oppHadSinisterInGrave && !next.knownOpponentHand.includes("sinister serpent")) {
    // Sinister returned to hand!
    next.knownOpponentHand.push("sinister serpent");
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

  // 3. Track Negative Inference on Battle Traps
  // If we declared an attack during Battle Phase (or an attack is currently resolved without trap chain)
  const role = response && message ? strategyActionRole(message, response) : null;
  const isAttackAction = role === "attack" || response?.action === 1 || response?.role === "attack";
  if (isAttackAction) {
    next.attacksDeclaredThisTurn += 1;
  }

  // If we have already declared at least 1 attack this turn and opponent did not chain a trap:
  const oppBackrow = observation.opponentBackrow ?? [];
  const publicChain = observation.publicChain ?? [];
  const opponentChainedInBattle = publicChain.some((c) => Number(c.controller) !== Number(observation.player));

  if (next.attacksDeclaredThisTurn > 0 && !opponentChainedInBattle) {
    next.attackDeclaringSlotPassed = true;
    for (const card of oppBackrow) {
      const seq = Number(card.sequence ?? 0);
      if (!card.faceUp) {
        next.testedSlots[seq] = {
          passedAttack: true,
          turnsSet: (next.testedSlots[seq]?.turnsSet ?? 0) + 1,
        };
      }
    }
  }

  return next;
}

/**
 * Checks if the opponent's backrow has been probed by an attack and declined to respond.
 */
export function isOpponentBackrowProbed(tracker = {}, observation = {}) {
  if (Number(observation.opponentBackrowCount ?? 0) === 0) return true;
  if (tracker.attackDeclaringSlotPassed === true) return true;
  const oppBackrow = observation.opponentBackrow ?? [];
  if (!oppBackrow.length) return true;
  return oppBackrow.every((card) => card.faceUp || tracker.testedSlots?.[Number(card.sequence)]?.passedAttack === true);
}

/**
 * Returns adjusted probabilities of specific trap threats given negative inference.
 */
export function evaluateBackrowThreats(tracker = {}, observation = {}) {
  const exhausted = tracker.exhaustedLimitedCards ?? new Set();
  const backrowProbed = isOpponentBackrowProbed(tracker, observation);
  const oppBackrowCount = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);

  const mirrorForcePossible = oppBackrowCount > 0 && !exhausted.has("mirror force") && !backrowProbed;
  const torrentialPossible = oppBackrowCount > 0 && !exhausted.has("torrential tribute");
  const ringOfDestructionPossible = oppBackrowCount > 0 && !exhausted.has("ring of destruction");

  return {
    mirrorForcePossible,
    torrentialPossible,
    ringOfDestructionPossible,
    backrowProbed,
    mirrorForceRisk: mirrorForcePossible ? (backrowProbed ? 0.02 : 0.28) : 0.0,
    torrentialRisk: torrentialPossible ? 0.25 : 0.0,
    ringRisk: ringOfDestructionPossible ? (Number(observation.ownLp) <= 2500 ? 0.45 : 0.20) : 0.0,
    knownOpponentHandCount: tracker.knownOpponentHand?.length ?? 0,
    knownOpponentHandCards: tracker.knownOpponentHand ?? [],
  };
}

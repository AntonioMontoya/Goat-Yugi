import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { publicCardSemantics } from "./card-semantics.js";
import { publicMonsterTargetPlan } from "./target-feasibility.js";
import { getDeckGuardrails } from "./deck-guardrails/index.js";

const MILL_ENGINE_CODES = new Set([
  81843628,  // Needle Worm
  33508719,  // Morphing Jar
  79106360,  // Morphing Jar #2
  504700188, // Cyber Jar
  15383415,  // Swarm of Scarabs
  41872150,  // Swarm of Locusts
  2694423,   // Medusa Worm
]);
export const BATTLE_LOCK_CODES = new Set([
  85742772, // Gravity Bind
  3136426,  // Level Limit - Area B
  44656491, // Messenger of Peace
]);
export const CONTINUOUS_THREAT_CODES = new Set([
  38992735, // Wave-Motion Cannon
  85742772, // Gravity Bind
  3136426,  // Level Limit - Area B
  44656491, // Messenger of Peace
  82732705, // Skill Drain
  51452091, // Royal Decree
  45986603, // Snatch Steal
  70828912, // Premature Burial
  97077563, // Call of the Haunted
]);
const SOUL_EXCHANGE_CODE = 68005187;
const GIANT_TRUNADE_CODE = 42703248;
const DELINQUENT_DUO_CODE = 44763025;
const TORRENTIAL_TRIBUTE_CODE = 53582587;
const HEAVY_STORM_CODE = 19613556;
const CARD_DESTRUCTION_CODE = 72892473;
const CREATURE_SWAP_CODE = 31036355;
const PREMATURE_BURIAL_CODE = 70828912;
const CALL_OF_THE_HAUNTED_CODE = 97077563;
const NOBLEMAN_OF_CROSSOUT_CODES = new Set([71044499, 504700116]);

function isCardActiveFaceUp(c) {
  return c?.faceUp === true || (Number(c?.position) & 1) !== 0;
}

function codeOf(entry) {
  return Number(entry?.code ?? entry?.card ?? entry?.runtimeCode ?? entry?.id ?? 0);
}

function controllerOf(entry) {
  const value = entry?.controller ?? entry?.controler ?? entry?.player;
  return value === undefined || value === null ? null : Number(value);
}

function rolesOf(entry) {
  return new Set((entry?.analysis?.cards ?? []).flatMap((card) => card?.roles ?? []));
}

function primaryCode(entry) {
  return Number(entry?.analysis?.cards?.[0]?.runtimeCode) || 0;
}

function isImmediateLethal(entry, observation = {}) {
  const card = entry?.analysis?.cards?.[0];
  const oppLp = Number(observation.opponentLp ?? 8000);
  const oppMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0);
  if (["summon", "special-summon"].includes(entry?.analysis?.role)) {
    return oppMonsters === 0 && Number(card?.atk) > 0 && Number(card.atk) >= oppLp;
  }
  const ownPower = Number(observation.ownBoardPower ?? 0);
  return oppMonsters === 0 && ownPower >= oppLp && ownPower > 0;
}

function sourceRoles(knowledge, message, memory = {}, observation = {}) {
  const directCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  if (directCode) return new Set(knowledge?.byRuntimeCode?.[String(directCode)]?.roles ?? []);
  const turn = Number(observation.turn) || 0;
  const decision = Number(observation.decisions) || 0;
  const recent = [...(memory?.recent ?? [])].reverse().find((entry) => Number(entry.turn) === turn
    && Number(entry.cardCode)
    && (!decision || !Number(entry.decision) || decision - Number(entry.decision) <= 4));
  return new Set(recent?.roles ?? []);
}

function sourceCode(knowledge, message, memory = {}, observation = {}) {
  const directCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  if (directCode) return directCode;
  const turn = Number(observation.turn) || 0;
  const decision = Number(observation.decisions) || 0;
  const recent = [...(memory?.recent ?? [])].reverse().find((entry) => Number(entry.turn) === turn
    && Number(entry.cardCode)
    && (!decision || !Number(entry.decision) || decision - Number(entry.decision) <= 4));
  return Number(recent?.cardCode) || 0;
}

function cardSemantics(knowledge, entry) {
  const code = codeOf(entry);
  return knowledge?.byRuntimeCode?.[String(code)] ?? publicCardSemantics(code) ?? null;
}

function selectedBoardInstance(message, candidate, observation = {}) {
  const entry = message?.pos_changes?.[Number(candidate?.index)];
  if (!entry) return null;
  const code = codeOf(entry);
  return (observation.ownMonsters ?? []).find((card) => codeOf(card) === code
    && (entry.sequence === undefined || Number(card.sequence) === Number(entry.sequence)))
    ?? (observation.ownMonsters ?? []).find((card) => codeOf(card) === code)
    ?? null;
}

/**
 * Public chain context for timing-sensitive decisions. The active opposing
 * link is intentionally derived only from the visible chain and board; no
 * hidden hand or deck information is consulted.
 */
export function publicChainTargetContext(knowledge, observation = {}, { owner = observation.player, sourceCode: source = 0, sourceAlreadyChained = false } = {}) {
  const normalizedOwner = Number(owner);
  const entries = observation.publicChain ?? [];
  let eligible = entries;
  if (sourceAlreadyChained && Number(source)) {
    const sourceIndex = [...entries].map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => controllerOf(entry) === normalizedOwner && codeOf(entry) === Number(source))?.index;
    if (sourceIndex !== undefined) eligible = entries.slice(0, sourceIndex);
  }
  const entry = [...eligible].reverse().find((candidate) => controllerOf(candidate) !== null && controllerOf(candidate) !== normalizedOwner) ?? null;
  const card = entry ? cardSemantics(knowledge, entry) : null;
  const opponentBoard = [...(observation.opponentMonsters ?? []), ...(observation.opponentBackrow ?? [])].filter(Boolean);
  const onBoard = Boolean(entry && opponentBoard.some((candidate) => matchesPublicChainCard(candidate, entry)));
  return {
    entry,
    card,
    onBoard,
    otherTargetCount: Math.max(0, opponentBoard.length - (onBoard ? 1 : 0)),
  };
}

export function matchesPublicChainCard(card, entry) {
  if (!card || !entry || codeOf(card) !== codeOf(entry)) return false;
  if (controllerOf(card) !== null && controllerOf(entry) !== null && controllerOf(card) !== controllerOf(entry)) return false;
  if (entry.sequence !== undefined && card.sequence !== undefined && Number(entry.sequence) !== Number(card.sequence)) return false;
  return true;
}

function selectionStats(message, candidate, owner) {
  const selections = message?.selects ?? message?.select_cards ?? [];
  let own = 0;
  let opponent = 0;
  let unknown = 0;
  for (const index of candidate?.indicies ?? []) {
    const controller = controllerOf(selections[Number(index)]);
    if (controller === null) unknown += 1;
    else if (controller === owner) own += 1;
    else opponent += 1;
  }
  return { own, opponent, unknown };
}

function publicBackrowFacts(observation = {}) {
  const own = observation.ownBackrow ?? [];
  const opponent = observation.opponentBackrow ?? [];
  const opponentChainBackrow = (observation.publicChain ?? []).some((entry) => Number(entry.controller) !== Number(observation.player)
    && [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(entry.location)));
  return {
    own: Number(observation.ownBackrowCount ?? own.length) || 0,
    opponent: Math.max(Number(observation.opponentBackrowCount ?? opponent.length) || 0, opponentChainBackrow ? 1 : 0),
    ownFaceUp: own.filter((card) => card?.faceUp === true).length,
    ownFaceDown: own.filter((card) => card?.faceUp !== true).length,
  };
}

function selectedActionInstance(message, entry, observation = {}) {
  const selected = message?.selects?.[Number(entry?.candidate?.index)];
  if (!selected) return null;
  return (observation.ownMonsters ?? []).find((card) => codeOf(card) === codeOf(selected)
    && Number(card?.sequence) === Number(selected?.sequence))
    ?? (observation.ownMonsters ?? []).find((card) => codeOf(card) === codeOf(selected))
    ?? null;
}

function counterTotal(card) {
  return Object.values(card?.counters ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function visibleOwnHandRoles(knowledge, observation = {}) {
  return new Set((observation.ownHand ?? observation.hand ?? []).flatMap((entry) => knowledge?.byRuntimeCode?.[String(codeOf(entry))]?.roles ?? []));
}

function recentlySummonedFaceUp(memory, observation, cardCode) {
  const turn = Number(observation.turn) || 0;
  return (memory?.recent ?? []).some((recent) => Number(recent.turn) === turn
    && ["summon", "special-summon"].includes(recent.role)
    && Number(recent.cardCode) === Number(cardCode));
}

function zoneSignature(cards = []) {
  return cards.map((card) => [
    codeOf(card), Number(card?.sequence) || 0, Number(card?.position) || 0,
    Number(card?.attack) || 0, Number(card?.defense) || 0,
    Object.entries(card?.counters ?? {}).sort(([left], [right]) => Number(left) - Number(right)),
  ]);
}

/** Fingerprint of public progress only; decision counters and hidden identities are excluded. */
export function publicProgressSignature(observation = {}) {
  return JSON.stringify([
    Number(observation.turn) || 0, Number(observation.phase) || 0,
    Number(observation.ownLp) || 0, Number(observation.opponentLp) || 0,
    Number(observation.handSize ?? observation.ownHand?.length) || 0,
    Number(observation.opponentHandSize) || 0,
    Number(observation.ownDeckSize) || 0, Number(observation.opponentDeckSize) || 0,
    zoneSignature(observation.ownMonsters), zoneSignature(observation.ownBackrow),
    zoneSignature(observation.opponentMonsters), zoneSignature(observation.opponentBackrow),
    zoneSignature(observation.graveyard), zoneSignature(observation.opponentGrave),
  ]);
}

function rejectionReason(entry, evaluated, knowledge, message, context = {}) {
  const { observation = {}, memory = {} } = context;
  const role = entry.analysis?.role;
  const roles = rolesOf(entry);
  const sameCardAlternatives = evaluated.filter((other) => other !== entry && primaryCode(other) === primaryCode(entry));

  // Delegate to modular deck guardrail if applicable
  const deckGuardrail = getDeckGuardrails(knowledge?.deckId, entry, message, context, knowledge, evaluated);
  if (deckGuardrail) {
    const deckReason = deckGuardrail(entry, evaluated, knowledge, message, context);
    if (deckReason) return deckReason;
  }

  if (role === "summon" && roles.has("flip") && !isImmediateLethal(entry, observation)
    && sameCardAlternatives.some((other) => other.analysis?.role === "monster-set")) {
    const card = entry.analysis?.cards?.[0];
    const attack = Number(card?.atk) || 0;
    const opponentMonsters = (observation.opponentMonsters ?? []).filter((m) => m?.faceUp === true);
    const canDefeatVisible = opponentMonsters.some((m) => {
      const pos = Number(m.position) || 0;
      const stat = (pos & OcgPosition.ATTACK) !== 0 ? (Number(m.attack ?? m.atk) || 0) : (Number(m.defense ?? m.def) || 0);
      return attack >= stat;
    });
    if (!canDefeatVisible && context?.allowFlipSummon !== true) {
      return "FLIP_VALUE_REQUIRES_SET";
    }
  }

  if (role === "summon" && roles.has("spirit")) {
    const opponentMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) || 0;
    const isLethal = isImmediateLethal(entry, observation);
    if (!isLethal) {
      const targetPlan = publicMonsterTargetPlan(roles, observation);
      const hasProfitableFlipTarget = targetPlan.own.some((card) =>
        knowledge?.byRuntimeCode?.[String(codeOf(card))]?.roles?.includes("flip")
        && !recentlySummonedFaceUp(memory, observation, codeOf(card)));
      if (opponentMonsters === 0 && !hasProfitableFlipTarget) {
        return "SPIRIT_REQUIRES_OPPONENT_TARGET_OR_LETHAL";
      }
    }
  }

  if (role === "monster-set" && !roles.has("flip")) {
    const card = entry.analysis?.cards?.[0];
    const attack = Number(card?.atk) || 0;
    const defense = Number(card?.def) || 0;
    const oppFaceUp = (observation.opponentMonsters ?? []).filter((m) => m?.faceUp === true);
    const facingSuperiorAttacker = oppFaceUp.some((m) => Number(m.attack ?? m.atk ?? 0) > attack);
    if (attack >= 1600 && attack > defense && defense < 1400 && !facingSuperiorAttacker
      && sameCardAlternatives.some((other) => other.analysis?.role === "summon")) {
      return "BEATER_SHOULD_BE_SUMMONED_IN_ATTACK";
    }
  }

  if (role === "position-change" && message?.type === OcgMessageType.SELECT_IDLECMD) {
    const card = entry.analysis?.cards?.[0];
    const instance = selectedBoardInstance(message, entry.candidate, observation) ?? selectedActionInstance(message, entry, observation);
    const pos = Number(instance?.position) || 0;
    const attack = Number(instance?.attack ?? instance?.atk ?? card?.atk ?? card?.attack ?? 0);
    const defense = Number(instance?.defense ?? instance?.def ?? card?.def ?? card?.defense ?? 0);
    if ((pos & OcgPosition.ATTACK) !== 0 && attack >= 1400 && attack > defense && defense < 1400
      && !roles.has("defense") && !roles.has("stall") && !roles.has("flip")) {
      return "AVOID_SWITCHING_BEATER_TO_DEFENSE";
    }
    const hasSpecialAtk = roles.has("absorb") || roles.has("dynamic-atk") || roles.has("variable-atk")
      || ["relinquished", "thousand-eyes restrict"].some((n) => String(card?.name ?? "").toLowerCase().includes(n));
    if ((pos & OcgPosition.DEFENSE) !== 0 && attack === 0 && !hasSpecialAtk) {
      return "AVOID_EXPOSING_ZERO_ATK_IN_ATTACK";
    }
    if ((pos & OcgPosition.DEFENSE) !== 0 && attack < 1400 && !roles.has("dynamic-atk") && !roles.has("damage-step-boost") && !roles.has("variable-atk")) {
      const oppStronger = (observation.opponentMonsters ?? []).some((m) => {
        const oppPos = Number(m.position) || 0;
        const oppStat = (oppPos & OcgPosition.ATTACK) !== 0 ? (Number(m.attack ?? m.atk) || 0) : (Number(m.defense ?? m.def) || 0);
        return oppStat > attack;
      });
      if (oppStronger) {
        return "AVOID_SHIFTING_LOW_ATK_TO_ATTACK";
      }
    }
  }

  if (role === "spell-set" && !roles.has("reactive")) {
    const handSize = Number(observation.handSize ?? observation.ownHand?.length) || 0;
    if (handSize <= 6 || roles.has("swing") || roles.has("recycle-board")) return "NON_REACTIVE_SET_LOSES_OPTIONALITY";
  }

  if (role === "spell-set") {
    const handRoles = visibleOwnHandRoles(knowledge, observation);
    const backrow = publicBackrowFacts(observation);
    if (handRoles.has("backrow-sweeper") && backrow.own >= 2 && !roles.has("reactive")) return "DO_NOT_OVERCOMMIT_INTO_OWN_SWEEPER";
    const phase = Number(observation.phase) || 0;
    const isMain1 = (phase & OcgPhase.MAIN1) !== 0 || phase === OcgPhase.MAIN1 || phase === 4;
    const isPastTurn1 = Number(observation.turn ?? 1) > 1;
    const canEnterBattle = Boolean(message.to_bp) || evaluated.some((other) => other !== entry && other.analysis?.role === "battle-phase");
    const hasHandPreparation = handRoles.has("hand-discard") || handRoles.has("prepare-discard") || context?.allowMain1Set === true;
    if (isMain1 && isPastTurn1 && canEnterBattle && !hasHandPreparation) {
      return "DEFER_DEFENSIVE_SET_TO_MAIN_PHASE_2";
    }

    const canPassOrEnd = evaluated.some((other) => other !== entry && ["end-phase", "pass-chain", "battle-phase"].includes(other.analysis?.role));
    const oppGraveOrBanished = [...(observation.opponentGrave ?? []), ...(observation.opponentBanished ?? [])];
    const heavyStormSpent = oppGraveOrBanished.some((c) => codeOf(c) === HEAVY_STORM_CODE || String(c?.name ?? "").toLowerCase().includes("heavy storm"));
    const oppHandSize = Number(observation.opponentHandSize ?? observation.opponentHandCount ?? (observation.opponentHand ?? []).length);
    const oppThreat = Number(observation.opponentThreat ?? 0);
    const ownLp = Number(observation.ownLp ?? 8000);
    const facingLethal = oppThreat >= ownLp && oppThreat > 0;
    const hasNegationSet = (observation.ownBackrow ?? []).some((b) => {
      const bRoles = new Set(knowledge?.byRuntimeCode?.[String(codeOf(b))]?.roles ?? []);
      return bRoles.has("negate") || bRoles.has("counter-trap") || codeOf(b) === 41426869;
    });
    if (backrow.own >= 3 && !heavyStormSpent && oppHandSize > 0 && !facingLethal && !hasNegationSet && canPassOrEnd) {
      return "AVOID_OVEREXTENSION_INTO_HEAVY_STORM";
    }

    const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
      || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
      || (memory?.commitments?.againstBurn === true);
    if (isAgainstBurn && backrow.own >= 2 && canPassOrEnd) {
      return "AVOID_OVERSETTING_BACKROW_AGAINST_BURN";
    }

    // Vía 1: Avoid setting backrow immediately before activating mass backrow removal in the same phase
    const hasActiveSweeperInHand = evaluated.some((other) => {
      if (other === entry) return false;
      const otherRoles = rolesOf(other);
      const otherCode = primaryCode(other);
      return ["activate", "spell"].includes(other.analysis?.role)
        && (otherRoles.has("backrow-sweeper") || otherCode === HEAVY_STORM_CODE || otherCode === GIANT_TRUNADE_CODE);
    });
    if (hasActiveSweeperInHand && backrow.opponent >= 1) {
      return "AVOID_SETTING_SPELL_BEFORE_HEAVY_STORM";
    }
  }

  if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
    const backrow = publicBackrowFacts(observation);
    const opponentMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) || 0;
    const targetPlan = publicMonsterTargetPlan(roles, observation);
    const positiveEngine = ["draw", "search", "advantage", "burn", "alternate-win"].some((value) => roles.has(value));
    const canRecycle = roles.has("recycle-board") && backrow.ownFaceUp > 0;

    // Vía 2: Spell Baiting Protocol
    // If opponent controls >= 2 unrevealed backrow cards, probe or strip backrow with utility spells
    // (MST, Trunade, Storm) before committing unrecoverable centerpiece spells.
    const isCenterpiece = roles.has("alternate-win")
      || [70828912, 31036355, 33508719].includes(primaryCode(entry));
    if (isCenterpiece && backrow.opponent >= 2 && !roles.has("backrow-removal") && !roles.has("backrow-sweeper")) {
      const hasBackrowProbeAvailable = evaluated.some((other) => {
        if (other === entry) return false;
        const otherRoles = rolesOf(other);
        const otherCode = primaryCode(other);
        return ["activate", "spell"].includes(other.analysis?.role)
          && (otherRoles.has("backrow-removal") || otherRoles.has("backrow-sweeper") || otherCode === 5318639);
      });
      if (hasBackrowProbeAvailable) {
        return "BAIT_OPPONENT_BACKROW_BEFORE_CENTERPIECE";
      }
    }
    if (roles.has("backrow-removal") && backrow.opponent === 0 && !canRecycle && !positiveEngine) return "NO_OPPOSING_BACKROW_VALUE";
    if (roles.has("monster-removal") && opponentMonsters === 0 && !positiveEngine) return "NO_OPPOSING_MONSTER_VALUE";
    if (roles.has("monster-removal") && targetPlan.constrained && targetPlan.opponentCount === 0 && !positiveEngine) return "NO_MATCHING_OPPONENT_TARGET";
    if (roles.has("position") && targetPlan.opponentCount === 0 && !positiveEngine) {
      const reusableFlip = targetPlan.own.some((card) =>
        (knowledge?.byRuntimeCode?.[String(codeOf(card))]?.roles?.includes("flip") || MILL_ENGINE_CODES.has(codeOf(card)))
        && !recentlySummonedFaceUp(memory, observation, codeOf(card)));
      if (!reusableFlip) return "NO_PROFITABLE_POSITION_TARGET";
    }
    if (roles.has("token") && (roles.has("summon-restriction") || roles.has("defense"))) {
      if (sameCardAlternatives.some((other) => other.analysis?.role === "spell-set")) {
        return "DEFENSIVE_TOKEN_SPELL_SHOULD_BE_SET";
      }
    }

    const activeCode = primaryCode(entry);
    const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();

    if ((roles.has("backrow-sweeper") || [GIANT_TRUNADE_CODE, HEAVY_STORM_CODE].includes(activeCode)) && backrow.opponent === 0 && !canRecycle && !isImmediateLethal(entry, observation)) return "NO_OPPOSING_BACKROW_VALUE";

    if (activeCode === DELINQUENT_DUO_CODE || activeName.includes("delinquent duo")) {
      const oppHand = Number(observation.opponentHandSize ?? observation.opponentHandCount ?? 0);
      if (oppHand === 0) return "DELINQUENT_DUO_REQUIRES_OPPONENT_HAND";
    }

    if (activeCode === SOUL_EXCHANGE_CODE || activeName.includes("soul exchange")) {
      if (opponentMonsters === 0) return "SOUL_EXCHANGE_NO_TARGET";
      const ownPower = Number(observation.ownBoardPower ?? 0);
      const oppLp = Number(observation.opponentLp ?? 8000);
      if (ownPower >= oppLp && ownPower > 0) return "SOUL_EXCHANGE_FORFEITS_LETHAL_BATTLE";
    }

    if (activeCode === GIANT_TRUNADE_CODE || activeName.includes("giant trunade")) {
      const hasActiveLock = (observation.ownBackrow ?? []).some((c) => isCardActiveFaceUp(c) && BATTLE_LOCK_CODES.has(codeOf(c)));
      const oppThreat = Number(observation.opponentThreat ?? 0);
      if (hasActiveLock && oppThreat >= 3000 && !isImmediateLethal(entry, observation)) {
        return "AVOID_BREAKING_OWN_BATTLE_LOCK_WITH_TRUNADE";
      }
    }

    if (activeCode === HEAVY_STORM_CODE || activeName.includes("heavy storm")) {
      const oppHasContinuousThreat = (observation.opponentBackrow ?? []).some((c) =>
        isCardActiveFaceUp(c) && (CONTINUOUS_THREAT_CODES.has(codeOf(c)) || BATTLE_LOCK_CODES.has(codeOf(c)))
      );
      if (!oppHasContinuousThreat && backrow.own >= backrow.opponent + 2 && !isImmediateLethal(entry, observation)) {
        return "HEAVY_STORM_AVOID_SELF_WIPE";
      }
    }

    if (activeCode === CARD_DESTRUCTION_CODE || activeName.includes("card destruction")) {
      const oppHand = Number(observation.opponentHandSize ?? observation.opponentHandCount ?? 0);
      const oppDeck = Number(observation.opponentDeckSize ?? 40);
      if (oppHand === 0 && oppDeck > 5) {
        return "AVOID_CARD_DESTRUCTION_EMPTY_OPPONENT_HAND";
      }
    }

    const progress = publicProgressSignature(observation);
    const repeatedWithoutProgress = [...(memory?.recent ?? [])].reverse().find((recent) => Number(recent.turn) === Number(observation.turn)
      && recent.role === "activate"
      && Number(recent.cardCode) === primaryCode(entry)
      && recent.progressSignature === progress);
    if (repeatedWithoutProgress && evaluated.some((other) => other !== entry && other.analysis?.role !== "activate")) {
      return "REPEATED_ACTIVATION_WITHOUT_PUBLIC_PROGRESS";
    }
  }

  if (role === "activate" && (roles.has("cost-lp-1000") || roles.has("cost-lp-800") || roles.has("cost-half-lp"))) {
    const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
      || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
      || (memory?.commitments?.againstBurn === true);
    const ownLp = Number(observation.ownLp) || 8000;
    const activeCode = primaryCode(entry);
    const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();
    const isReturn = activeCode === 27174286 || activeCode === 471890671 || activeCode === 27053506 || activeName.includes("return from the different dimension");
    if (isAgainstBurn && ownLp <= 4000 && !roles.has("negate") && !isReturn && !isImmediateLethal(entry, observation)) {
      return "AVOID_VOLUNTARY_LIFE_COST_AGAINST_BURN";
    }
  }

  if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
    const chainCode = primaryCode(entry);
    const chainName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();

    if (chainCode === TORRENTIAL_TRIBUTE_CODE || chainName.includes("torrential tribute")) {
      const publicChain = observation.publicChain ?? [];
      const lastChain = publicChain[publicChain.length - 1];
      const triggeredBySelf = lastChain ? controllerOf(lastChain) === Number(observation.player) : true;
      const ownMonsters = observation.ownMonsters ?? [];
      const oppMonsters = observation.opponentMonsters ?? [];
      const ownDominant = ownMonsters.length >= 2 && ownMonsters.every((m) => Number(m.attack ?? m.atk ?? 0) >= 1400) && oppMonsters.length <= 1;
      const canPass = evaluated.some((o) => o !== entry && o.analysis?.role === "pass-chain");
      if (triggeredBySelf && ownDominant && canPass) {
        return "TORRENTIAL_AVOID_SELF_WIPE_ON_DOMINANT_BOARD";
      }
      if (canPass && oppMonsters.length <= 1 && ownMonsters.length >= 1) {
        const hasFaceDownOwn = ownMonsters.some((m) => (Number(m.position ?? 0) & 1) === 0 || m.faceUp === false);
        const oppThreatAtk = Math.max(0, ...oppMonsters.map((m) => Number(m.attack ?? m.atk ?? 0)));
        const ownStrongestAtk = Math.max(0, ...ownMonsters.filter((m) => m.faceUp !== false).map((m) => Number(m.attack ?? m.atk ?? 0)));
        const isDangerousBoss = oppMonsters.some((m) => {
          const name = String(m?.name ?? "").toLowerCase();
          return name.includes("black luster") || name.includes("chaos sorcerer") || name.includes("jinzo") || name.includes("airknight") || Number(m.attack ?? 0) >= 2400;
        });
        if (hasFaceDownOwn && !isDangerousBoss) {
          return "TORRENTIAL_PRESERVE_OWN_FACE_DOWN_MONSTER";
        }
        if (ownStrongestAtk >= oppThreatAtk && !isDangerousBoss) {
          return "TORRENTIAL_AVOID_EQUAL_OR_WINNING_BOARD_WIPE";
        }
      }
    }

    if (roles.has("token") && (roles.has("summon-restriction") || roles.has("defense"))) {
      const phase = Number(observation.phase) || 0;
      const isBattlePhase = (phase & (OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE | OcgPhase.BATTLE)) !== 0;
      const isEndPhase = phase === OcgPhase.END;
      const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
      const chainEntries = observation.publicChain ?? [];
      const oppChaining = chainEntries.some((ch) => controllerOf(ch) !== Number(observation.player));
      if (canPass && !oppChaining && !isBattlePhase && !isEndPhase) {
        return "DO_NOT_CHAIN_DEFENSIVE_TOKENS_ON_EMPTY_OPENING";
      }
    }
  }

  if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
    if (roles.has("token") && (roles.has("summon-restriction") || roles.has("defense"))) {
      const sameCardAlternatives = evaluated.filter((other) => other !== entry && primaryCode(other) === primaryCode(entry));
      if (sameCardAlternatives.some((other) => other.analysis?.role === "spell-set")) {
        return "DEFENSIVE_TOKEN_SPELL_SHOULD_BE_SET";
      }
      if (observation.isOwnTurn && evaluated.some((other) => ["summon", "tribute-summon"].includes(other.analysis?.role))) {
        return "AVOID_PREMATURE_SCAPEGOAT_LOCKOUT";
      }
    }
  }

  const isRing = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("ring of destruction")
    || (roles.has("burn") && roles.has("destroy-removal") && roles.has("removal"));
  if (([OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message?.type) && role === "chain" && isRing)
    || (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate" && isRing)) {
    const ownLp = Number(observation.ownLp) || 8000;
    const oppLp = Number(observation.opponentLp) || 8000;
    const faceUpMonsters = [...(observation.opponentMonsters ?? []), ...(observation.ownMonsters ?? [])]
      .filter((m) => m?.faceUp === true);
    const safeTargets = faceUpMonsters.filter((m) => Number(m.attack ?? m.atk ?? 0) < ownLp || Number(m.attack ?? m.atk ?? 0) >= oppLp);
    const canPass = evaluated.some((other) => other !== entry);
    const facingDirectLethalInBattle = (Number(observation.phase) & (OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE)) !== 0
      && Number(observation.ownMonsterCount ?? observation.ownMonsters?.length ?? 0) === 0
      && Number(observation.opponentThreat) >= ownLp;
    if (canPass && !facingDirectLethalInBattle && (faceUpMonsters.length === 0 || safeTargets.length === 0)) {
      return "AVOID_SELF_LETHAL_RING";
    }
  }

  if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
    const owner = Number(observation.player ?? message.player ?? 0);
    const publicChain = observation.publicChain ?? [];
    const lastLink = publicChain[publicChain.length - 1];

    if (roles.has("negate") && lastLink && controllerOf(lastLink) === owner) {
      const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
      if (canPass) return "DO_NOT_NEGATE_OWN_CHAIN_LINK";
    }

    if (roles.has("draw-denial") || roles.has("negate")) {
      const duplicateInChain = publicChain.some((chain) => controllerOf(chain) === owner
        && codeOf(chain) === primaryCode(entry));
      const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
      if (duplicateInChain && canPass) return "DUPLICATE_NON_STACKING_CHAIN_EFFECT";
    }

    if ((roles.has("monster-removal") || roles.has("destroy-removal") || roles.has("battle-removal")) && !roles.has("negate")) {
      const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
      const ownRemovalInChain = publicChain.some((chain) => {
        if (controllerOf(chain) !== owner) return false;
        const chainRoles = new Set(knowledge?.byRuntimeCode?.[String(codeOf(chain))]?.roles ?? []);
        return (chainRoles.has("monster-removal") || chainRoles.has("destroy-removal")) && !chainRoles.has("negate");
      });
      const oppNegationInChain = publicChain.some((chain) => {
        if (controllerOf(chain) === owner) return false;
        const chainRoles = new Set(knowledge?.byRuntimeCode?.[String(codeOf(chain))]?.roles ?? []);
        return chainRoles.has("negate") || chainRoles.has("negate-activation");
      });
      if (canPass && ownRemovalInChain && !oppNegationInChain && !isImmediateLethal(entry, observation)) {
        return "AVOID_OVERKILL_CHAINING_REMOVAL_TO_OWN_REMOVAL";
      }
    }
  }

  if ([OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message?.type)
    && role === "chain" && roles.has("removal") && !roles.has("negate")) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const canDecline = evaluated.some((other) => other !== entry
      && ["pass-chain", "attack", "main-two", "end-phase"].includes(other.analysis?.role));
    const context = publicChainTargetContext(knowledge, observation, {
      owner,
      sourceCode: primaryCode(entry),
      sourceAlreadyChained: false,
    });
    const removalLike = ["backrow-removal", "backrow-sweeper", "monster-removal", "swing", "destroy-removal"]
      .some((value) => roles.has(value));
    const independentValue = ["draw", "search", "advantage", "draw-denial", "burn", "alternate-win"]
      .some((value) => roles.has(value));
    // Destroying a Normal Spell/Trap that is already on the chain does not
    // negate its effect. If it is the only public target, passing preserves
    // the discard/activation resource for a real threat.
    if (canDecline && removalLike && !independentValue
      && context.card?.roles?.includes("one-shot-effect")
      && context.otherTargetCount === 0) {
      return "REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT";
    }
  }

  if ([OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message?.type)
    && role === "chain" && roles.has("backrow-removal") && !roles.has("negate") && !roles.has("negate-activation")) {
    const canDecline = evaluated.some((other) => other !== entry
      && ["pass-chain", "attack", "main-two", "end-phase"].includes(other.analysis?.role));
    const independentValue = ["draw", "search", "advantage", "draw-denial", "burn", "alternate-win", "negate", "negate-activation", "counter-trap"]
      .some((value) => roles.has(value));
    if (canDecline && publicBackrowFacts(observation).opponent === 0 && !independentValue) {
      return "NO_OPPOSING_BACKROW_VALUE";
    }
  }

  if ([OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message?.type)
    && role === "chain" && roles.has("position")) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const canDecline = evaluated.some((other) => other !== entry
      && ["pass-chain", "attack", "main-two", "end-phase"].includes(other.analysis?.role));
    const respondingToOpponent = (observation.publicChain ?? []).some((chain) => controllerOf(chain) !== null
      && controllerOf(chain) !== owner);
    const targetPlan = publicMonsterTargetPlan(roles, observation);
    const repairsFreshFlip = targetPlan.own.some((card) => knowledge?.byRuntimeCode?.[String(codeOf(card))]?.roles?.includes("flip")
      && recentlySummonedFaceUp(memory, observation, codeOf(card)));
    if (canDecline && !respondingToOpponent && targetPlan.opponentCount === 0 && repairsFreshFlip) {
      return "NO_PROFITABLE_POSITION_TARGET";
    }
  }

  if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain"
    && [OcgPhase.MAIN1, OcgPhase.MAIN2].includes(Number(observation.phase))) {
    const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
    if (canPass) {
      const targetPlan = publicMonsterTargetPlan(roles, observation);
      const opponentMonsters = targetPlan.opponent;
      const strongestOpposingAttack = Math.max(0, ...opponentMonsters.filter((card) => card?.faceUp === true).map((card) => Number(card.attack) || 0));
      const ownPower = Number(observation.ownBoardPower) || 0;
      const opponentLp = Number(observation.opponentLp) || 8000;
      const worthwhileMonster = opponentMonsters.length > 0
        && (roles.has("swing") && opponentMonsters.length >= 2
          || opponentMonsters.length === 1 && ownPower >= opponentLp
          || strongestOpposingAttack >= 1000
          || strongestOpposingAttack >= Number(observation.ownLp));
      const selectedInstance = selectedActionInstance(message, entry, observation);
      const settingUpCounter = roles.has("counter-resource") && counterTotal(selectedInstance) === 0;
      const independentValue = settingUpCounter || ["draw", "search", "advantage", "draw-denial", "negate", "negate-activation", "counter-trap"].some((value) => roles.has(value));
      if (roles.has("monster-removal") && targetPlan.constrained && targetPlan.opponentCount === 0 && !independentValue) return "NO_MATCHING_OPPONENT_TARGET";
      if (roles.has("monster-removal") && !worthwhileMonster && !independentValue) return "NO_OPPOSING_MONSTER_VALUE";
      if (roles.has("backrow-removal") && publicBackrowFacts(observation).opponent === 0 && !independentValue) return "NO_OPPOSING_BACKROW_VALUE";
    }
  }

  if (role === "position-change") {
    const card = entry.analysis?.cards?.[0];
    const instance = selectedBoardInstance(message, entry.candidate, observation);
    const attack = Number(instance?.attack ?? instance?.atk ?? card?.atk ?? card?.attack ?? 0);
    const currentPos = Number(instance?.position ?? 0);
    const isChangingToAttack = (currentPos & OcgPosition.DEFENSE) !== 0;
    const canDoOther = evaluated.some((other) => other !== entry && ["battle-phase", "end-phase", "activate", "summon", "special-summon", "monster-set", "spell-set"].includes(other.analysis?.role));
    if (isChangingToAttack && canDoOther) {
      const cardRoles = new Set([...(card?.roles ?? []), ...(entry.roles ?? [])]);
      const hasSpecialAtk = cardRoles.has("absorb") || cardRoles.has("dynamic-atk") || cardRoles.has("variable-atk")
        || ["relinquished", "thousand-eyes restrict"].some((n) => String(card?.name ?? "").toLowerCase().includes(n));
      if (attack === 0 && !hasSpecialAtk) {
        return "AVOID_EXPOSING_ZERO_ATK_IN_ATTACK";
      }
      const oppMonsters = observation.opponentMonsters ?? [];
      const oppHasStronger = oppMonsters.some((m) => {
        const mPos = Number(m.position) || 0;
        const oppStat = (mPos & OcgPosition.ATTACK) !== 0 ? (Number(m.attack ?? m.atk) || 0) : (Number(m.defense ?? m.def) || 0);
        return oppStat > attack;
      });
      if (attack < 1400 && !hasSpecialAtk && oppHasStronger) {
        return "AVOID_SHIFTING_LOW_ATK_TO_ATTACK";
      }
    }
  }

  if (role === "attack") {
    const card = entry.analysis?.cards?.[0];
    const cardId = codeOf(card) || primaryCode(entry);
    const attack = Number(message?.attacks?.[Number(entry.candidate?.index)]?.attack ?? card?.attack ?? card?.atk) || 0;
    const attackerRoles = new Set([...(card?.roles ?? []), ...(entry.roles ?? [])]);
    const name = String(card?.name ?? "").toLowerCase();
    const isDamageStepBooster = attackerRoles.has("damage-step-boost") || name.includes("injection fairy lily");
    const isDirectAttacker = attackerRoles.has("direct-attacker") || name.includes("jinzo #7") || name.includes("inaba white rabbit");
    const hasBattleTrigger = attackerRoles.has("floater")
      || attackerRoles.has("search-on-death")
      || attackerRoles.has("death-trigger")
      || attackerRoles.has("grave-trigger")
      || attackerRoles.has("banish-removal")
      || attackerRoles.has("battle-removal")
      || isDamageStepBooster
      || isDirectAttacker
      || attackerRoles.has("position")
      || ["sangan", "mystic tomato", "shining angel", "mother grizzly", "giant germ", "nimble momonga", "d.d. warrior lady", "d.d. assailant", "gravekeeper's assailant"].some((val) => name.includes(val));
    const canEndOrM2 = evaluated.some((other) => other !== entry && ["main-two", "end-phase"].includes(other.analysis?.role));

    if (attack === 0 && !hasBattleTrigger && canEndOrM2) {
      return "NO_PROFITABLE_VISIBLE_ATTACK_TARGET";
    }

    if (entry.analysis?.reasons?.includes("ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET")
      && canEndOrM2) {
      if (!hasBattleTrigger) {
        return "NO_PROFITABLE_VISIBLE_ATTACK_TARGET";
      }
    }

  }

  if (message?.type === OcgMessageType.SELECT_CARD) {
    const selections = message.selects ?? message.select_cards ?? [];
    const owner = Number(observation.player ?? message.player ?? 0);
    const causal = sourceRoles(knowledge, message, memory, observation);
    if (causal.has("removal") && !causal.has("negate")) {
      const context = publicChainTargetContext(knowledge, observation, {
        owner,
        sourceCode: sourceCode(knowledge, message, memory, observation),
        sourceAlreadyChained: true,
      });
      const selectedActiveOneShot = context.card?.roles?.includes("one-shot-effect")
        && (entry.candidate?.indicies ?? []).some((index) => matchesPublicChainCard(selections[Number(index)], context.entry));
      const hasAlternativeOpponentTarget = evaluated.some((other) => other !== entry
        && (other.candidate?.indicies ?? []).some((index) => {
          const target = selections[Number(index)];
          return controllerOf(target) !== null
            && controllerOf(target) !== owner
            && !matchesPublicChainCard(target, context.entry);
        }));
      if (selectedActiveOneShot && hasAlternativeOpponentTarget) return "REMOVAL_TARGET_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT";
    }
    const source = sourceCode(knowledge, message, memory, observation);
    const sCode = source;
    const sourceCard = knowledge?.byRuntimeCode?.[String(source)] ?? publicCardSemantics(source);
    if (sourceCard?.name === "Ring of Destruction" || (causal.has("burn") && causal.has("destroy-removal") && causal.has("removal"))) {
      const selections = message.selects ?? message.select_cards ?? [];
      const ownLp = Number(observation.ownLp) || 8000;
      const oppLp = Number(observation.opponentLp) || 8000;
      for (const index of entry.candidate?.indicies ?? []) {
        const target = selections[Number(index)];
        const targetAtk = Number(target?.attack ?? target?.atk ?? 0);
        if (targetAtk >= ownLp && targetAtk < oppLp) {
          return "AVOID_SELF_LETHAL_RING";
        }
      }
    }
    if (causal.has("removal")) {
      const owner = Number(observation.player ?? message.player ?? 0);
      const isLavaGolemTarget = (entry.candidate?.indicies ?? []).some((idx) => {
        const t = selections[Number(idx)];
        return String(t?.name ?? "").toLowerCase().includes("lava golem");
      });
      if (!isLavaGolemTarget) {
        const current = selectionStats(message, entry.candidate, owner);
        const alternatives = evaluated.map((other) => selectionStats(message, other.candidate, owner));
        const bestOwn = Math.min(...alternatives.map((stats) => stats.own));
        const bestOpponent = Math.max(...alternatives.filter((stats) => stats.own === bestOwn).map((stats) => stats.opponent));
        if (current.own > bestOwn || (current.own === bestOwn && current.opponent < bestOpponent)) return "AVOID_SELF_TARGET_WHEN_OPPONENT_TARGET_EXISTS";
      }
    }
    if (causal.has("position") || causal.has("turn-face-down")) {
      const selectedIndices = entry.candidate?.indicies ?? [];
      const hasSelfNonFlip = selectedIndices.some((idx) => {
        const item = selections[Number(idx)];
        const targetCard = cardSemantics(knowledge, item);
        const targetController = controllerOf(item);
        const isOwn = targetController === owner;
        const isFlip = targetCard?.roles?.includes("flip");
        const isAbsorb = targetCard?.roles?.includes("absorb")
          || ["relinquished", "thousand-eyes restrict"].some((n) => String(targetCard?.name ?? "").toLowerCase().includes(n));
        return isOwn && !isFlip && !isAbsorb;
      });
      if (hasSelfNonFlip) {
        const hasBetterTarget = evaluated.some((other) => other !== entry && (other.candidate?.indicies ?? []).some((idx) => {
          const item = selections[Number(idx)];
          const targetCard = cardSemantics(knowledge, item);
          const targetController = controllerOf(item);
          const isAbsorb = targetCard?.roles?.includes("absorb")
            || ["relinquished", "thousand-eyes restrict"].some((n) => String(targetCard?.name ?? "").toLowerCase().includes(n));
          return (targetController !== null && targetController !== owner) || targetCard?.roles?.includes("flip") || isAbsorb;
        }));
        if (hasBetterTarget) {
          return "AVOID_TURNING_OWN_NON_FLIP_MONSTER_FACE_DOWN";
        }
      }
    }
    const isHandSelection = selections.some((s) => Number(s.location) === OcgLocation.HAND && controllerOf(s) === owner);
    if (isHandSelection) {
      const indexDiscardsSinister = (idx) => {
        const item = selections[Number(idx)];
        const card = cardSemantics(knowledge, item);
        const roles = new Set(card?.roles ?? []);
        return roles.has("sinister-engine") || roles.has("discard-fodder") || String(card?.name ?? "").toLowerCase() === "sinister serpent";
      };
      const hasAlternativeWithSinister = evaluated.some((other) => other !== entry
        && (other.candidate?.indicies ?? []).some(indexDiscardsSinister));
      const currentDiscardsSinister = (entry.candidate?.indicies ?? []).some(indexDiscardsSinister);
      if (hasAlternativeWithSinister && !currentDiscardsSinister) {
        const currentDiscardsHighValue = (entry.candidate?.indicies ?? []).some((idx) => {
          const item = selections[Number(idx)];
          const card = cardSemantics(knowledge, item);
          const roles = new Set(card?.roles ?? []);
          return roles.has("trinity") || roles.has("boss") || roles.has("draw") || roles.has("search") || roles.has("advantage");
        });
        if (currentDiscardsHighValue) {
          return "PRESERVE_HIGH_VALUE_WHEN_SINISTER_SERPENT_AVAILABLE";
        }
      }
    }

    if (sCode === CREATURE_SWAP_CODE || String(sourceCard?.name ?? "").toLowerCase().includes("creature swap")) {
      const selectedIndices = entry.candidate?.indicies ?? [];
      const givesBossOrBeater = selectedIndices.some((idx) => {
        const item = selections[Number(idx)];
        const c = cardSemantics(knowledge, item);
        const cRoles = new Set(c?.roles ?? []);
        return controllerOf(item) === owner && (cRoles.has("boss") || Number(item?.attack ?? item?.atk ?? c?.atk ?? 0) >= 1800);
      });
      if (givesBossOrBeater) {
        const hasLowerAlternative = evaluated.some((other) => other !== entry && !(other.candidate?.indicies ?? []).some((idx) => {
          const item = selections[Number(idx)];
          const c = cardSemantics(knowledge, item);
          const cRoles = new Set(c?.roles ?? []);
          return controllerOf(item) === owner && (cRoles.has("boss") || Number(item?.attack ?? item?.atk ?? c?.atk ?? 0) >= 1800);
        }));
        if (hasLowerAlternative) {
          return "CREATURE_SWAP_GIVE_LOWEST_VALUE";
        }
      }
    }

    if (NOBLEMAN_OF_CROSSOUT_CODES.has(sCode) || String(sourceCard?.name ?? "").toLowerCase().includes("nobleman of crossout")) {
      const selectedIndices = entry.candidate?.indicies ?? [];
      const targetsOwn = selectedIndices.some((idx) => controllerOf(selections[Number(idx)]) === owner);
      if (targetsOwn) {
        const hasOpponentTarget = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
          const item = selections[Number(idx)];
          return controllerOf(item) !== null && controllerOf(item) !== owner;
        }));
        if (hasOpponentTarget) {
          return "NOBLEMAN_TARGET_OPPONENT_FACE_DOWN";
        }
      }
    }

    if ([PREMATURE_BURIAL_CODE, CALL_OF_THE_HAUNTED_CODE].includes(sCode) || ["premature burial", "call of the haunted"].some((n) => String(sourceCard?.name ?? "").toLowerCase().includes(n))) {
      const selectedIndices = entry.candidate?.indicies ?? [];
      const revivesLowFlip = selectedIndices.some((idx) => {
        const item = selections[Number(idx)];
        const c = cardSemantics(knowledge, item);
        return controllerOf(item) === owner && Number(item?.attack ?? item?.atk ?? c?.atk ?? 0) <= 500;
      });
      if (revivesLowFlip) {
        const hasBeaterRevival = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
          const item = selections[Number(idx)];
          const c = cardSemantics(knowledge, item);
          return controllerOf(item) === owner && Number(item?.attack ?? item?.atk ?? c?.atk ?? 0) >= 1500;
        }));
        if (hasBeaterRevival) {
          return "PREFER_HIGH_IMPACT_REVIVAL";
        }
      }
    }
  }

  if (message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_SUM) {
    const selectedIndices = entry.candidate?.indicies ?? [];
    const selections = message.selects ?? [];
    const hasBossTribute = selectedIndices.some((idx) => {
      const item = selections[Number(idx)];
      const c = cardSemantics(knowledge, item);
      const cRoles = new Set(c?.roles ?? []);
      return cRoles.has("boss") || (Number(c?.atk ?? item?.attack ?? 0) >= 2400);
    });
    const sCode = sourceCode(knowledge, message, memory, observation);
    if (hasBossTribute) {
      const hasNonBossAlternative = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
        const item = selections[Number(idx)];
        const c = cardSemantics(knowledge, item);
        const cRoles = new Set(c?.roles ?? []);
        return cRoles.has("boss") || (Number(c?.atk ?? item?.attack ?? 0) >= 2400);
      }));
      if (hasNonBossAlternative) {
        return "AVOID_TRIBUTING_BOSS_MONSTER";
      }
    }
  }

  if ((message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_SUM)
    && entry.analysis?.components?.material < -7
    && evaluated.some((other) => Number(other.analysis?.components?.material) > Number(entry.analysis.components.material) + 2)) {
    return "PRESERVE_HIGH_VALUE_COST_MATERIAL";
  }

  if (role === "no" && evaluated.some((other) => other !== entry && other.analysis?.role === "yes")) {
    const sCode = sourceCode(knowledge, message, memory, observation);
    const sourceCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
    const isSinister = (entry.analysis?.cards ?? []).some((c) => String(c?.name ?? c).toLowerCase().includes("sinister serpent"))
      || (entry.analysis?.semanticRoles ?? []).includes("sinister-engine")
      || (entry.analysis?.semanticRoles ?? []).includes("infinite-recovery")
      || (sourceCard?.roles ?? []).includes("sinister-engine")
      || String(sourceCard?.name ?? "").toLowerCase().includes("sinister serpent");
    if (isSinister) {
      return "ALWAYS_RECOVER_SINISTER_SERPENT";
    }
  }

  return null;
}

/**
 * Enforces card-agnostic invariants before strategy or learned weights run.
 * OCGCore still supplies every legal response; this layer only rejects legal
 * actions that are dominated by another currently legal action.
 */
export function enforceDecisionGuardrails(knowledge, message, evaluated, context = {}) {
  const rejected = [];
  const allowed = [];
  for (const entry of evaluated) {
    const reason = rejectionReason(entry, evaluated, knowledge, message, context);
    if (reason) rejected.push({ ...entry, guardrail: reason });
    else allowed.push(entry);
  }
  const allRejected = allowed.length === 0 && evaluated.length > 0;
  return {
    allowed: allowed.length ? allowed : evaluated,
    rejected,
    allRejected,
    filterFailure: allRejected ? "ALL_CANDIDATES_REJECTED_BY_GUARDRAILS" : null,
  };
}

export const DECISION_GUARDRAIL_SCHEMA = 13;


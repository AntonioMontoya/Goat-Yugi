import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { publicCardSemantics } from "./card-semantics.js";
import { publicMonsterTargetPlan } from "./target-feasibility.js";

const MILL_ENGINE_CODES = new Set([
  81843628,  // Needle Worm
  33508719,  // Morphing Jar
  79106360,  // Morphing Jar #2
  504700188, // Cyber Jar
  15383415,  // Swarm of Scarabs
  41872150,  // Swarm of Locusts
  2694423,   // Medusa Worm
]);
const WAVE_MOTION_CANNON_CODE = 38992735;
const LAVA_GOLEM_CODE = 102380;
const BATTLE_LOCK_CODES = new Set([
  85742772, // Gravity Bind
  3136426,  // Level Limit - Area B
  44656491, // Messenger of Peace
]);

function codeOf(entry) {
  return Number(entry?.code ?? entry?.card ?? entry?.runtimeCode ?? entry?.id ?? 0);
}

function controllerOf(entry) {
  const value = entry?.controller ?? entry?.controler ?? entry?.player;
  return value === undefined || value === null ? null : Number(value);
}

function rolesOf(entry) {
  return new Set((entry?.analysis?.cards ?? []).flatMap((card) => card.roles ?? []));
}

function primaryCode(entry) {
  return Number(entry?.analysis?.cards?.[0]?.runtimeCode) || 0;
}

function isImmediateLethal(entry, observation = {}) {
  const card = entry?.analysis?.cards?.[0];
  return ["summon", "special-summon"].includes(entry?.analysis?.role)
    && Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) === 0
    && Number(card?.atk) > 0
    && Number(card.atk) >= Number(observation.opponentLp);
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

function rejectionReason(entry, evaluated, knowledge, message, { observation = {}, memory = {} } = {}) {
  const role = entry.analysis?.role;
  const roles = rolesOf(entry);
  const sameCardAlternatives = evaluated.filter((other) => other !== entry && primaryCode(other) === primaryCode(entry));

  if (role === "summon" && roles.has("flip") && !isImmediateLethal(entry, observation)
    && sameCardAlternatives.some((other) => other.analysis?.role === "monster-set")) {
    return "FLIP_VALUE_REQUIRES_SET";
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
    if (attack >= 1600 && attack > defense && defense < 1400
      && sameCardAlternatives.some((other) => other.analysis?.role === "summon")) {
      return "BEATER_SHOULD_BE_SUMMONED_IN_ATTACK";
    }
  }

  if (role === "position-change" && message?.type === OcgMessageType.SELECT_IDLECMD) {
    const instance = selectedActionInstance(message, entry, observation);
    const pos = Number(instance?.position) || 0;
    const card = entry.analysis?.cards?.[0];
    const attack = Number(card?.atk) || Number(instance?.attack) || 0;
    const defense = Number(card?.def) || Number(instance?.defense) || 0;
    if ((pos & OcgPosition.ATTACK) !== 0 && attack >= 1400 && attack > defense && defense < 1400
      && !roles.has("defense") && !roles.has("stall") && !roles.has("flip")) {
      return "AVOID_SWITCHING_BEATER_TO_DEFENSE";
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
    if (isMain1 && isPastTurn1 && canEnterBattle) {
      return "DEFER_DEFENSIVE_SET_TO_MAIN_PHASE_2";
    }
  }

  if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
    const backrow = publicBackrowFacts(observation);
    const opponentMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) || 0;
    const targetPlan = publicMonsterTargetPlan(roles, observation);
    const positiveEngine = ["draw", "search", "advantage", "burn", "alternate-win"].some((value) => roles.has(value));
    const canRecycle = roles.has("recycle-board") && backrow.ownFaceUp > 0;
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
      if (observation.isOwnTurn && evaluated.some((other) => ["summon", "tribute-summon"].includes(other.analysis?.role))) {
        return "AVOID_PREMATURE_SCAPEGOAT_LOCKOUT";
      }
    }
    if (roles.has("backrow-sweeper") && backrow.opponent === 0 && backrow.ownFaceDown > 0 && !canRecycle) return "SWEEPER_ONLY_HITS_OWN_COMMITMENT";
    const progress = publicProgressSignature(observation);
    const repeatedWithoutProgress = [...(memory?.recent ?? [])].reverse().find((recent) => Number(recent.turn) === Number(observation.turn)
      && recent.role === "activate"
      && Number(recent.cardCode) === primaryCode(entry)
      && recent.progressSignature === progress);
    if (repeatedWithoutProgress && evaluated.some((other) => other !== entry && other.analysis?.role !== "activate")) {
      return "REPEATED_ACTIVATION_WITHOUT_PUBLIC_PROGRESS";
    }
  }

  if (role === "special-summon") {
    const card = entry.analysis?.cards?.[0];
    const cardId = codeOf(card) || primaryCode(entry);
    if (cardId === LAVA_GOLEM_CODE) {
      const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
      const hasActiveLock = (observation.ownBackrow ?? []).some((c) => isCardActiveFaceUp(c) && BATTLE_LOCK_CODES.has(codeOf(c)))
        || (observation.opponentBackrow ?? []).some((c) => isCardActiveFaceUp(c) && BATTLE_LOCK_CODES.has(codeOf(c)));
      const oppLp = Number(observation.opponentLp) || 8000;
      if (!hasActiveLock && oppLp > 1000) {
        const canHold = evaluated.some((other) => other !== entry && other.analysis?.role !== "special-summon");
        if (canHold) return "LAVA_GOLEM_REQUIRES_LOCK";
      }
    }
  }

  if (["activate", "chain"].includes(role)) {
    const card = entry.analysis?.cards?.[0];
    const cardId = codeOf(card) || primaryCode(entry);
    if (cardId === WAVE_MOTION_CANNON_CODE) {
      const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
      const selected = message?.activates?.[Number(entry.candidate?.index)];
      const isFieldActivation = Number(selected?.location) === OcgLocation.SZONE
        || (observation.ownBackrow ?? []).some((c) => codeOf(c) === WAVE_MOTION_CANNON_CODE && isCardActiveFaceUp(c) && c?.sequence === selected?.sequence);
      if (isFieldActivation) {
        const instance = (observation.ownBackrow ?? []).find((c) => codeOf(c) === WAVE_MOTION_CANNON_CODE && isCardActiveFaceUp(c));
        const turnsActive = Number(instance?.turnsActive ?? instance?.turns ?? instance?.standbyCount ?? 0) || Math.max(1, Math.floor((Number(observation.turn) || 1) / 2));
        const estimatedDamage = turnsActive * 1000;
        const oppLp = Number(observation.opponentLp) || 8000;
        const isUnderThreat = (observation.publicChain ?? []).some((ch) => controllerOf(ch) !== Number(observation.player));
        if (estimatedDamage < oppLp && !isUnderThreat) {
          const canHold = evaluated.some((other) => other !== entry && ["end-phase", "to-bp", "pass-chain"].includes(other.analysis?.role));
          if (canHold) return "HOLD_WAVE_MOTION_UNTIL_LETHAL";
        }
      }
    }
  }

  if (role === "activate" && (roles.has("cost-lp-1000") || roles.has("cost-lp-800") || roles.has("cost-half-lp"))) {
    const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
      || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
      || (memory?.commitments?.againstBurn === true);
    const ownLp = Number(observation.ownLp) || 8000;
    if (isAgainstBurn && ownLp <= 4000 && !roles.has("negate")) {
      return "AVOID_VOLUNTARY_LIFE_COST_AGAINST_BURN";
    }
  }

  if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain"
    && roles.has("token") && (roles.has("summon-restriction") || roles.has("defense"))) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const context = publicChainTargetContext(knowledge, observation, { owner });
    const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
    const phase = Number(observation.phase) || 0;
    const isBattlePhase = (phase & (OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE | OcgPhase.BATTLE)) !== 0;
    const isEndPhase = phase === OcgPhase.END;
    const contextRoles = new Set(context.card?.roles ?? []);
    const isRemovalThreat = ["backrow-removal", "backrow-sweeper", "destroy-removal", "removal", "swing"].some((r) => contextRoles.has(r));
    if (canPass && !isRemovalThreat && !isBattlePhase && !isEndPhase) {
      return "DO_NOT_CHAIN_DEFENSIVE_TOKENS_ON_EMPTY_OPENING";
    }
  }

  if ([OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message?.type)
    && role === "chain" && (entry.analysis?.cards?.[0]?.name === "Ring of Destruction" || (roles.has("burn") && roles.has("destroy-removal") && roles.has("removal")))) {
    const ownLp = Number(observation.ownLp) || 8000;
    const oppLp = Number(observation.opponentLp) || 8000;
    const faceUpMonsters = [...(observation.opponentMonsters ?? []), ...(observation.ownMonsters ?? [])]
      .filter((m) => m?.faceUp === true);
    const safeTargets = faceUpMonsters.filter((m) => Number(m.attack ?? m.atk ?? 0) < ownLp || Number(m.attack ?? m.atk ?? 0) >= oppLp);
    const canPass = evaluated.some((other) => other !== entry && ["pass-chain", "attack", "main-two", "end-phase"].includes(other.analysis?.role));
    const facingDirectLethalInBattle = (Number(observation.phase) & (OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE)) !== 0
      && Number(observation.ownMonsterCount ?? observation.ownMonsters?.length ?? 0) === 0
      && Number(observation.opponentThreat) >= ownLp;
    if (canPass && !facingDirectLethalInBattle && faceUpMonsters.length > 0 && safeTargets.length === 0) {
      return "AVOID_SELF_LETHAL_RING";
    }
  }

  if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain" && roles.has("draw-denial")) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const duplicateInChain = (observation.publicChain ?? []).some((chain) => controllerOf(chain) === owner
      && codeOf(chain) === primaryCode(entry));
    const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
    if (duplicateInChain && canPass) return "DUPLICATE_NON_STACKING_CHAIN_EFFECT";
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
    && role === "chain" && roles.has("backrow-removal")) {
    const canDecline = evaluated.some((other) => other !== entry
      && ["pass-chain", "attack", "main-two", "end-phase"].includes(other.analysis?.role));
    const independentValue = ["draw", "search", "advantage", "draw-denial", "burn", "alternate-win"]
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
      const independentValue = settingUpCounter || ["draw", "search", "advantage", "draw-denial"].some((value) => roles.has(value));
      if (roles.has("monster-removal") && targetPlan.constrained && targetPlan.opponentCount === 0 && !independentValue) return "NO_MATCHING_OPPONENT_TARGET";
      if (roles.has("monster-removal") && !worthwhileMonster && !independentValue) return "NO_OPPOSING_MONSTER_VALUE";
      if (roles.has("backrow-removal") && publicBackrowFacts(observation).opponent === 0 && !independentValue) return "NO_OPPOSING_BACKROW_VALUE";
    }
  }

  if (role === "attack") {
    const card = entry.analysis?.cards?.[0];
    const cardId = codeOf(card) || primaryCode(entry);
    const isMillEngine = MILL_ENGINE_CODES.has(cardId) || roles.has("cost-discard-5") || roles.has("deck-consume-5");
    if (isMillEngine && !isImmediateLethal(entry, observation)) {
      const canEndOrM2 = evaluated.some((other) => other !== entry && ["main-two", "end-phase"].includes(other.analysis?.role));
      if (canEndOrM2) return "MILL_ENGINE_NEVER_ATTACKS";
    }

    if (entry.analysis?.reasons?.includes("ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET")
      && evaluated.some((other) => other !== entry && ["main-two", "end-phase"].includes(other.analysis?.role))) {
      return "NO_PROFITABLE_VISIBLE_ATTACK_TARGET";
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
    if (["removal", "position"].some((value) => causal.has(value))) {
      const owner = Number(observation.player ?? message.player ?? 0);
      const current = selectionStats(message, entry.candidate, owner);
      const alternatives = evaluated.map((other) => selectionStats(message, other.candidate, owner));
      const bestOwn = Math.min(...alternatives.map((stats) => stats.own));
      const bestOpponent = Math.max(...alternatives.filter((stats) => stats.own === bestOwn).map((stats) => stats.opponent));
      if (current.own > bestOwn || (current.own === bestOwn && current.opponent < bestOpponent)) return "AVOID_SELF_TARGET_WHEN_OPPONENT_TARGET_EXISTS";
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
  return {
    allowed: allowed.length ? allowed : evaluated,
    rejected: allowed.length ? rejected : [],
  };
}

export const DECISION_GUARDRAIL_SCHEMA = 8;


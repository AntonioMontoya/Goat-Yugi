import { OcgLocation, OcgMessageType, OcgPosition, SelectBattleCMDAction, SelectIdleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { actionCardEntries, strategyActionRole } from "./deck-strategy.js";
import { publicCardSemantics } from "./card-semantics.js";
import { enforceDecisionGuardrails, matchesPublicChainCard, publicChainTargetContext, publicProgressSignature } from "./decision-guardrails.js";
import { publicMonsterTargetPlan } from "./target-feasibility.js";

function codeOf(entry) { return Number(entry?.code ?? entry?.card ?? entry?.runtimeCode ?? entry?.id ?? 0); }
function controllerOf(entry) {
  const value = entry?.controller ?? entry?.controler ?? entry?.player;
  return value === undefined || value === null ? null : Number(value);
}
function faceUp(card) { return card?.faceUp === true || (Number(card?.position) & OcgPosition.FACEUP) !== 0; }
function bounded(value, minimum = -12, maximum = 12) { return Math.max(minimum, Math.min(maximum, Number(value) || 0)); }
function hasAny(roles, values) { return values.some((value) => roles.has(value)); }
function cardForCode(knowledge, value) { return knowledge?.byRuntimeCode?.[String(codeOf(value))] ?? publicCardSemantics(codeOf(value)) ?? null; }

function responseCards(knowledge, message, response) {
  return actionCardEntries(knowledge, message, response);
}

function selectedBoardInstance(message, response, observation = {}) {
  const entry = message?.pos_changes?.[Number(response?.index)];
  if (!entry) return null;
  const code = codeOf(entry);
  return (observation.ownMonsters ?? []).find((card) => Number(card.runtimeCode) === code
    && (entry.sequence === undefined || Number(card.sequence) === Number(entry.sequence)))
    ?? (observation.ownMonsters ?? []).find((card) => Number(card.runtimeCode) === code)
    ?? null;
}

function sourceCard(knowledge, message, memory = null, observation = {}) {
  const code = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  if (code) return cardForCode(knowledge, { code });
  const recent = recentActions(memory, observation);
  const decision = Number(observation?.decisions) || 0;
  const fallback = [...recent].reverse().find((action) => Number(action.cardCode)
    && ["activate", "chain", "position-change", "summon", "special-summon"].includes(action.role)
    && (!decision || !Number(action.decision) || decision - Number(action.decision) <= 4));
  return cardForCode(knowledge, { code: fallback?.cardCode });
}

function recentActions(memory, observation) {
  const turn = Number(observation?.turn) || 0;
  return (memory?.recent ?? []).filter((action) => Number(action.turn) === turn);
}

function wasJustSummonedFaceUp(memory, observation, cardCode) {
  return recentActions(memory, observation).some((action) => ["summon", "special-summon"].includes(action.role)
    && Number(action.cardCode) === Number(cardCode));
}

function wasJustDeployedOrExposed(memory, observation, cardCode) {
  return recentActions(memory, observation).some((action) => ["summon", "special-summon", "position-change"].includes(action.role)
    && Number(action.cardCode) === Number(cardCode));
}

function boardFacts(observation = {}) {
  const ownMonsters = observation.ownMonsters ?? [];
  const opponentMonsters = observation.opponentMonsters ?? [];
  return {
    ownMonsters,
    opponentMonsters,
    ownFaceUp: ownMonsters.filter(faceUp),
    opponentFaceUp: opponentMonsters.filter(faceUp),
    ownFaceDown: ownMonsters.filter((card) => !faceUp(card)),
    opponentFaceDown: opponentMonsters.filter((card) => !faceUp(card)),
    ownBackrow: Number(observation.ownBackrowCount ?? observation.ownBackrow?.length) || 0,
    opponentBackrow: Math.max(
      Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length) || 0,
      (observation.publicChain ?? []).some((entry) => Number(entry.controller) !== Number(observation.player)
        && [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(entry.location))) ? 1 : 0,
    ),
    ownPower: Number(observation.ownBoardPower) || 0,
    opponentPower: Number(observation.opponentThreat) || 0,
    ownLp: Number(observation.ownLp) || 8000,
    opponentLp: Number(observation.opponentLp) || 8000,
    ownDeckSize: Math.max(0, Number(observation.ownDeckSize) || 0),
    opponentDeckSize: Math.max(0, Number(observation.opponentDeckSize) || 0),
  };
}

function numericRole(roles, prefix) {
  let maximum = 0;
  for (const role of roles) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(role);
    if (match) maximum = Math.max(maximum, Number(match[1]) || 0);
  }
  return maximum;
}

function visibleCopyCount(observation, runtimeCode) {
  const zones = [observation.ownHand, observation.hand, observation.ownMonsters, observation.ownBackrow, observation.graveyard, observation.banished];
  return zones.flatMap((zone) => zone ?? []).filter((entry) => Number(entry?.runtimeCode ?? entry?.code) === Number(runtimeCode)).length;
}

function deckSafetyAdjustment(roles, card, observation, board) {
  const draw = numericRole(roles, "draw-count") || (roles.has("draw") ? 1 : 0);
  const consume = numericRole(roles, "deck-consume");
  let value = 0;
  if (draw && board.ownDeckSize) {
    if (board.ownDeckSize <= draw + 1) value -= 12;
    else if (board.ownDeckSize <= Math.max(5, draw + 3)) value -= 5;
  }
  if (consume && board.ownDeckSize) {
    if (board.ownDeckSize <= consume) value -= 14;
    else if (board.ownDeckSize + 2 < board.opponentDeckSize) value -= bounded((board.opponentDeckSize - board.ownDeckSize) * 0.9, 2, 7);
  }
  if (roles.has("search-copies") && card && visibleCopyCount(observation, card.runtimeCode) >= Number(card.count)) value -= 10;
  return value;
}

function intrinsicCardValue(card, observation = {}) {
  if (!card) return 0;
  const roles = new Set(card.roles ?? []);
  let value = card.kind === "MONSTER" ? bounded((Math.max(Number(card.atk) || 0, Number(card.def) || 0) - 700) / 850, 0, 2.2) : 0.6;
  if (hasAny(roles, ["draw", "search", "advantage"])) value += 2.8;
  if (hasAny(roles, ["interaction", "negate", "removal"])) value += Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) + Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length) > 0 ? 1.8 : 0.7;
  if (hasAny(roles, ["flip", "engine", "recovery"])) value += 1.5;
  if (roles.has("persistent-effect")) value += 2.2;
  if (roles.has("one-shot-effect")) value += 0.2;
  if (roles.has("boss")) value += observation.chaosReady ? 2.5 : 0.5;
  if (roles.has("lethal") && Number(observation.opponentLp) <= Number(card.atk)) value += 4;
  if (roles.has("cost-half-lp")) value -= Number(observation.ownLp) <= 2500 ? 1.5 : 0.5;
  return bounded(value, -2, 9);
}

function activationCost(roles, board) {
  let cost = 0;
  if (roles.has("cost-half-lp")) cost += board.ownLp <= 2500 ? 5 : board.ownLp <= 5000 ? 3.5 : 2.5;
  for (const role of roles) {
    const lp = /^cost-lp-(\d+)$/.exec(role);
    if (lp) cost += bounded(Number(lp[1]) / Math.max(1200, board.ownLp * 0.35), 0.2, 4);
    const discard = /^cost-discard-(\d+)$/.exec(role);
    if (discard) cost += Number(discard[1]) * 1.5;
  }
  if (roles.has("cost-tribute")) cost += 2;
  return cost;
}

/**
 * Projects a legal response into a compact, card-agnostic value model. The
 * evaluator reasons from public state, costs, stats and semantic roles derived
 * from card text. It never checks a card name or peeks at hidden information.
 */
export function projectResponseValue(knowledge, message, response, { observation = {}, memory = null } = {}) {
  const role = strategyActionRole(message, response);
  const cards = responseCards(knowledge, message, response);
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  const board = boardFacts(observation);
  const components = { material: 0, board: 0, tempo: 0, future: 0, safety: 0, coherence: 0 };
  const reasons = [];

  if (role === "summon" || role === "special-summon") {
    for (const card of cards) {
      const attack = Number(card.atk) || 0;
      const immediateLethal = !board.opponentMonsters.length && attack > 0 && attack >= board.opponentLp;
      components.board += bounded((attack - 1000) / 700, -1.5, 2.5);
      components.tempo += 1;
      if (card.roles?.includes("flip") && !immediateLethal) {
        components.future -= 3.5;
        reasons.push("FACEUP_SUMMON_DOES_NOT_ENABLE_FLIP_VALUE");
      }
      if (board.opponentPower > attack && board.opponentFaceUp.length) components.safety -= bounded((board.opponentPower - attack) / 900, 0, 2.5);
      if (immediateLethal) components.tempo += 6;
    }
  }

  if (role === "monster-set") {
    for (const card of cards) {
      const attack = Number(card.atk) || 0;
      const defense = Number(card.def) || 0;
      const isFlip = card.roles?.includes("flip");
      const isWall = defense > attack || hasAny(new Set(card.roles ?? []), ["defense", "stall"]);
      const isBeater = attack >= 1400 && attack > defense;

      components.board += bounded((defense - 700) / 800, -0.5, 2.2);
      if (isFlip) {
        components.future += 4.5;
        components.coherence += 2;
        reasons.push("SET_ENABLES_FUTURE_FLIP_VALUE");
      } else if (isBeater) {
        components.future -= 2.5;
        components.coherence -= 2;
        components.tempo -= 1.5;
        reasons.push("SETTING_BEATER_LOSES_PROACTIVE_PRESSURE");
      }
      if (isWall || defense >= 1400) components.safety += 1;
      else if (defense < 1000 && !isFlip) components.safety -= 1;
      if (hasAny(new Set(card.roles ?? []), ["defense", "stall"])) components.safety += 1.2;
      if (board.ownMonsters.length >= 3) components.coherence -= (board.ownMonsters.length - 2) * 1.4;
      if (board.ownFaceDown.length >= 2) components.future -= (board.ownFaceDown.length - 1) * 0.8;
      components.safety += deckSafetyAdjustment(new Set(card.roles ?? []), card, observation, board) * 0.35;
    }
  }

  if (role === "activate" || role === "chain") {
    const hasPublicChain = (observation.publicChain ?? []).length > 0;
    const respondingToOpponent = (observation.publicChain ?? []).some((entry) => Number(entry.controller) !== Number(observation.player));
    components.material -= 1;
    components.material -= activationCost(roles, board);
    components.safety += cards.reduce((sum, card) => sum + deckSafetyAdjustment(new Set(card.roles ?? []), card, observation, board), 0);
    if (hasAny(roles, ["draw", "search", "advantage"])) {
      components.material += 4;
      components.future += 1;
    }
    if (hasAny(roles, ["combo", "engine", "grave-setup"])) components.future += 1.5;
    if (roles.has("interaction")) {
      const targetPlan = publicMonsterTargetPlan(roles, observation);
      const opposingTargets = targetPlan.opponent;
      const strongestOpposingAttack = Math.max(0, ...opposingTargets.filter(faceUp).map((card) => Number(card.attack) || 0));
      const worthwhileRemovalTarget = opposingTargets.length > 0
        && (roles.has("swing") && opposingTargets.length >= 2
          || opposingTargets.length === 1 && board.ownPower >= board.opponentLp
          || strongestOpposingAttack >= 1000
          || strongestOpposingAttack >= board.ownLp);
      const monsterRelevant = roles.has("monster-removal") ? (worthwhileRemovalTarget ? opposingTargets.length : 0)
        : roles.has("position") ? opposingTargets.length : 0;
      const backrowRelevant = roles.has("backrow-removal") ? board.opponentBackrow : 0;
      const generalRelevant = !roles.has("monster-removal") && !roles.has("backrow-removal") && !roles.has("position") ? board.opponentMonsters.length + board.opponentBackrow : 0;
      const replyingToOwnChain = role === "chain" && hasPublicChain && !respondingToOpponent;
      const reusableFlipValue = roles.has("position") && targetPlan.own.some((card) => cardForCode(knowledge, card)?.roles?.includes("flip")
        && !wasJustSummonedFaceUp(memory, observation, codeOf(card)));
      // Some legal trigger windows create value without a visible target: for
      // example, placing a Spell Counter or denying the next Draw Phase.
      // They must not inherit the removal-only "empty target" penalty.
      const independentValue = hasAny(roles, ["counter-resource", "draw-denial"]) || reusableFlipValue ? 1 : 0;
      const relevantOpposingState = replyingToOwnChain && !independentValue ? 0 : monsterRelevant + backrowRelevant + generalRelevant + independentValue;
      components.tempo += relevantOpposingState ? 2.5 : -3;
      if (!relevantOpposingState) reasons.push(role === "chain" && hasPublicChain ? "CHAIN_NEEDS_IMMEDIATE_PUBLIC_JUSTIFICATION" : "INTERACTION_HAS_NO_VISIBLE_OPPOSING_VALUE");
      if (role === "chain" && !roles.has("negate")) {
        const activeChain = publicChainTargetContext(knowledge, observation, {
          owner: observation.player,
          sourceCode: Number(cards[0]?.runtimeCode) || 0,
          sourceAlreadyChained: false,
        });
        const removalLike = ["backrow-removal", "backrow-sweeper", "monster-removal", "swing", "destroy-removal"]
          .some((value) => roles.has(value));
        if (removalLike && activeChain.card?.roles?.includes("one-shot-effect")
          && activeChain.otherTargetCount === 0 && !independentValue) {
          // The card already has a resolving effect. Removing a Normal
          // Spell/Trap here does not negate it and only burns our resource.
          components.tempo -= 8;
          components.coherence -= 5;
          reasons.push("REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT");
        }
      }
    }
    if (roles.has("swing")) {
      const opposingTargets = roles.has("backrow-removal") ? board.opponentBackrow : board.opponentMonsters.length;
      const ownCollateral = roles.has("backrow-removal") ? board.ownBackrow : board.ownMonsters.length;
      components.material += bounded((opposingTargets - ownCollateral) * 1.4, -5, 5);
    }
    if (roles.has("position")) {
      const targetPlan = publicMonsterTargetPlan(roles, observation);
      const reusableOwnEngines = targetPlan.own.filter((entry) => {
        const card = cardForCode(knowledge, entry);
        return card?.roles?.includes("flip") && !wasJustSummonedFaceUp(memory, observation, entry.runtimeCode);
      });
      if (targetPlan.opponentCount && (role !== "chain" || respondingToOpponent || !hasPublicChain)) components.tempo += 2;
      else if (reusableOwnEngines.length) components.future += 1.5;
      else {
        components.coherence -= 4;
        reasons.push("POSITION_EFFECT_DOES_NOT_ADVANCE_CURRENT_STATE");
      }
    }
    if (hasAny(roles, ["defense", "stall"]) && (board.opponentPower > 0 || board.ownLp <= 3000)) components.safety += 2;
  }

  if (role === "spell-set") {
    components.material -= 0.25;
    const reactive = roles.has("reactive") || hasAny(roles, ["defense", "stall", "negate"]);
    components.future += reactive ? 2 : -1.5;
    components.safety += reactive ? 1 : 0;
    if (!reactive) { components.coherence -= 1.5; reasons.push("SETTING_A_NON_REACTIVE_CARD_HIDES_A_FUTURE_ACTION"); }
    if (board.ownBackrow >= 2) components.safety -= (board.ownBackrow - 1) * 1.1;
    if (board.ownBackrow >= 4) components.coherence -= 2;
  }

  if (role === "attack") {
    const attacker = cards[0];
    const attack = Number(attacker?.atk ?? message?.attacks?.[Number(response.index)]?.attack) || 0;
    const targetStats = board.opponentFaceUp.map((card) => (Number(card.position) & OcgPosition.ATTACK) !== 0
      ? Number(card.attack) || 0
      : Number(card.defense) || 0);
    const canDefeatVisible = targetStats.some((value) => attack >= value);
    const canConvertBattleEffect = roles.has("banish-removal") || roles.has("battle-removal");
    if (!targetStats.length || canDefeatVisible || board.opponentFaceDown.length || canConvertBattleEffect) components.tempo += 2;
    else {
      components.tempo -= 7;
      components.safety -= bounded((Math.min(...targetStats) - attack) / 500, 0.5, 3);
      reasons.push("ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET");
    }
    if (!board.opponentMonsters.length && attack >= board.opponentLp) components.tempo += 8;
  }

  if (role === "battle-phase") components.tempo += board.ownPower > 0 ? 1 : -0.5;
  if (role === "end-phase") components.tempo -= 0.5;
  if (role === "position-change") {
    const instance = selectedBoardInstance(message, response, observation);
    const currentPosition = Number(instance?.position) || 0;
    const attack = Number(cards[0]?.atk) || Number(instance?.attack) || 0;
    const defense = Number(cards[0]?.def) || Number(instance?.defense) || 0;
    const isBeater = attack >= 1400 && attack > defense;
    const isWall = defense > attack || roles.has("defense") || roles.has("stall");

    if ((currentPosition & OcgPosition.FACEDOWN) !== 0) {
      components.future += roles.has("flip") ? 3.5 : 0.3;
      components.tempo += roles.has("flip") || isBeater ? 1.5 : 0;
    } else if ((currentPosition & OcgPosition.ATTACK) !== 0) {
      if (isBeater && defense < 1400) {
        components.board -= bounded((attack - defense) / 600, 1.5, 3.5);
        components.tempo -= 2.5;
        components.safety -= 1.0;
        reasons.push("BEATER_DEFENSE_CHANGE_EXPOSES_WEAK_DEFENSE");
      } else {
        components.board += bounded((defense - attack) / 700, -2.5, 2.5);
        components.safety += (board.opponentPower > attack && (isWall || defense >= board.opponentPower)) ? 1.2 : -0.8;
        if (!board.opponentMonsters.length && attack > 0) components.tempo -= 3;
      }
    } else if ((currentPosition & OcgPosition.DEFENSE) !== 0) {
      components.board += bounded((attack - defense) / 700, -2.5, 2.5);
      components.tempo += !board.opponentMonsters.length || attack >= board.opponentPower || isBeater ? 2.5 : -1;
    } else components.future += 0.1;
    components.safety += cards.reduce((sum, card) => sum + deckSafetyAdjustment(new Set(card.roles ?? []), card, observation, board), 0);
  }
  if (role === "yes") components.coherence += hasAny(roles, ["engine", "combo", "interaction", "advantage"]) ? 1 : 0;
  if (role === "no") components.coherence -= hasAny(roles, ["engine", "combo", "interaction", "advantage"]) ? 1 : 0;

  const causalCard = sourceCard(knowledge, message, memory, observation);
  const causalRoles = new Set(causalCard?.roles ?? []);
  if (message?.type === OcgMessageType.SELECT_CARD && causalRoles.has("position")) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const selections = message.selects ?? message.select_cards ?? [];
    for (const index of response.indicies ?? []) {
      const entry = selections[Number(index)];
      const card = cardForCode(knowledge, entry);
      const controller = controllerOf(entry);
      if (controller !== null && controller !== owner) components.tempo += 3;
      else if (wasJustSummonedFaceUp(memory, observation, codeOf(entry))) {
        components.material -= 3;
        components.coherence -= 5;
        reasons.push("SPENDING_A_CARD_TO_REPAIR_THE_PREVIOUS_ACTION");
      } else if (card?.roles?.includes("flip")) components.future += 2;
      else components.coherence -= 2;
    }
  }

  if (message?.type === OcgMessageType.SELECT_CARD) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const selections = message.selects ?? message.select_cards ?? [];
    const activeChain = causalRoles.has("removal") && !causalRoles.has("negate")
      ? publicChainTargetContext(knowledge, observation, {
        owner,
        sourceCode: Number(causalCard?.runtimeCode) || 0,
        sourceAlreadyChained: true,
      })
      : null;
    for (const index of response.indicies ?? []) {
      const entry = selections[Number(index)];
      const card = cardForCode(knowledge, entry);
      const controller = controllerOf(entry);
      const location = Number(entry?.location) || 0;
      const intrinsic = intrinsicCardValue(card, observation);
      if (location === OcgLocation.HAND && controller === owner && causalRoles.has("draw")) {
        components.material -= intrinsic;
        reasons.push("DISCARD_LOWEST_FUTURE_VALUE");
      } else if ((location === OcgLocation.DECK && causalRoles.has("search")) || (location === OcgLocation.GRAVE && causalRoles.has("recovery"))) {
        components.future += intrinsic;
      } else if ((location === OcgLocation.MZONE || location === OcgLocation.SZONE) && causalRoles.has("removal")) {
        components.tempo += controller !== null && controller !== owner ? intrinsic + 1 : -intrinsic - 2;
        if (activeChain?.card?.roles?.includes("one-shot-effect") && matchesPublicChainCard(entry, activeChain.entry)) {
          components.tempo -= 8;
          components.coherence -= 5;
          reasons.push("REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT");
        }
        if (controller === owner && wasJustDeployedOrExposed(memory, observation, codeOf(entry))) {
          components.coherence -= 6;
          reasons.push("REMOVING_A_RESOURCE_JUST_DEPLOYED_OR_EXPOSED");
        }
      }
    }
  }

  if (message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_SUM) {
    const selections = message.selects ?? [];
    for (const index of response.indicies ?? []) {
      const card = cardForCode(knowledge, selections[Number(index)]);
      components.material -= intrinsicCardValue(card, observation);
    }
  }

  const value = Object.values(components).reduce((sum, component) => sum + component, 0);
  return { role, cards, components, reasons, value: bounded(value, -20, 20) };
}

function primaryCode(entry) { return Number(entry.analysis.cards?.[0]?.runtimeCode) || 0; }

/** Removes only responses dominated by another legal route to the same card. */
export function reasonAboutResponses(knowledge, message, candidates, context = {}) {
  const evaluated = candidates.map((candidate) => ({ candidate, analysis: projectResponseValue(knowledge, message, candidate, context), dominated: false }));
  const guarded = enforceDecisionGuardrails(knowledge, message, evaluated, context);
  for (const current of guarded.allowed) {
    const code = primaryCode(current);
    if (!code) continue;
    const semanticRoles = new Set(current.analysis.cards?.[0]?.roles ?? []);
    // A lower immediate board score must not erase the only route that turns
    // on a persistent engine. Conversely, FLIP value needs the set route.
    if (semanticRoles.has("continuous-engine") && ["summon", "special-summon", "activate"].includes(current.analysis.role)) continue;
    if (semanticRoles.has("flip") && current.analysis.role === "monster-set") continue;
    if (semanticRoles.has("multi-attack") && ["summon", "special-summon"].includes(current.analysis.role)) continue;
    const alternatives = guarded.allowed.filter((other) => other !== current && primaryCode(other) === code);
    if (alternatives.some((other) => other.analysis.value >= current.analysis.value + 2.5)) current.dominated = true;
  }
  const undominated = guarded.allowed.filter((entry) => !entry.dominated);
  const coherent = undominated.filter((entry) => entry.analysis.components.coherence > -4.5);
  const pool = coherent.length ? coherent : undominated.length ? undominated : evaluated;
  const bestProjected = Math.max(...pool.map((entry) => entry.analysis.value));
  const viable = pool.filter((entry) => entry.analysis.value >= bestProjected - 6 || entry.analysis.value >= 0);
  const selected = viable.length ? viable : pool;
  selected.rejectedByGuardrails = guarded.rejected;
  return selected;
}

export function rememberResponse(memory, knowledge, message, response, observation = {}) {
  const next = memory ?? { recent: [] };
  const analysis = projectResponseValue(knowledge, message, response, { observation, memory: next });
  const turn = Number(observation.turn) || 0;
  next.recent = (next.recent ?? []).filter((entry) => Number(entry.turn) >= turn - 1);
  next.recent.push({ turn, decision: Number(observation.decisions) || 0, role: analysis.role, cardCode: Number(analysis.cards?.[0]?.runtimeCode) || 0, roles: [...new Set(analysis.cards.flatMap((card) => card.roles ?? []))], value: analysis.value, progressSignature: publicProgressSignature(observation) });
  if (next.recent.length > 16) next.recent = next.recent.slice(-16);
  return next;
}

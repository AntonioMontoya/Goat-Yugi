import { strategyActionRole } from "./deck-strategy.js";
import { evaluateBackrowThreats } from "./negative-inference.js";

function clamp(value, minimum = -12, maximum = 12) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function rolesOf(analysis) {
  return new Set((analysis?.cards ?? []).flatMap((card) => card.roles ?? []));
}

function styleFor(knowledge, observation, opponentModel, persona = {}) {
  const archetype = String(knowledge?.archetype ?? knowledge?.plan?.archetype ?? "").toLowerCase();
  if (opponentModel?.ready && /combo|burn/.test(String(opponentModel.top?.archetype ?? "").toLowerCase())) return "disrupt";
  if (/combo|deck-out|reasoning|empty/.test(archetype)) return "assemble";
  if (/aggro|warrior|beatdown/.test(archetype)) return "pressure";
  if (/burn|lockdown/.test(archetype)) return "burn";
  if (/chaos/.test(archetype)) return "midrange";
  if (/control|lock|stall/.test(archetype)) return "control";
  return persona.defaultStyle ?? "balanced";
}

function boardStateAdjustment(boardRelation, role, roles, observation) {
  let value = 0;
  if (boardRelation === "behind") {
    if (["defense", "interaction", "removal", "draw", "recovery"].some((item) => roles.has(item))) value += 0.8;
    if (role === "end-phase") value -= 0.5;
  } else if (boardRelation === "ahead") {
    if (["battle-phase", "attack", "special-summon"].includes(role)) value += 0.8;
    if (roles.has("lethal") && Number(observation?.opponentLp) <= 2500) value += 1.0;
  }
  return value;
}

function sequenceAdjustment(role, roles, memory = {}) {
  const previous = memory.recent?.at(-1);
  if (!previous) return 0;
  const previousRoles = new Set(previous.roles ?? []);
  let value = 0;
  if (["draw", "search", "engine"].some((item) => previousRoles.has(item)) && ["summon", "special-summon", "activate"].includes(role)) value += 0.9;
  if (["removal", "backrow-removal", "monster-removal"].some((item) => previousRoles.has(item)) && ["battle-phase", "attack"].includes(role)) value += 1.4;
  if (previous.role === "monster-set" && previousRoles.has("flip") && roles.has("position")) value -= 2.5;
  if (previous.role === "summon" && roles.has("position")) value -= 3.5;
  if (previous.role === role && ["spell-set", "monster-set"].includes(role)) value -= 0.35;
  return value;
}

/** Vía 1: Evaluates 2-step forward phase interactions between currently available legal candidates. */
function forwardLookaheadAdjustment(entry, evaluated = [], observation = {}) {
  const role = entry.analysis?.role;
  const roles = new Set(entry.roles ?? (entry.analysis?.cards ?? []).flatMap((c) => c.roles ?? []));
  let value = 0;

  // 1. Anti-synergy collision: Setting backrow while mass backrow wipe is available in current candidates
  if (role === "spell-set") {
    const hasBackrowWipeAvailable = evaluated.some((other) => {
      if (other === entry) return false;
      const otherRoles = new Set((other.analysis?.cards ?? []).flatMap((c) => c.roles ?? []));
      const otherCode = Number(other.analysis?.cards?.[0]?.runtimeCode ?? other.candidate?.card ?? 0);
      return (otherRoles.has("backrow-sweeper") || otherCode === 19613556 || otherCode === 42703248)
        && ["activate", "spell"].includes(other.analysis?.role);
    });
    if (hasBackrowWipeAvailable && Number(observation?.opponentBackrowCount ?? 0) >= 1) {
      value -= 4.5;
    }
  }

  // 2. Information First: Draw / Search / Thinning before committing Normal Summon or permanent sets
  if (["activate", "spell"].includes(role) && (roles.has("draw") || roles.has("search") || roles.has("engine"))) {
    const hasUncommittedSummon = evaluated.some((other) => other !== entry && ["summon", "monster-set"].includes(other.analysis?.role));
    if (hasUncommittedSummon) {
      value += 1.8;
    }
  } else if (["summon", "monster-set"].includes(role)) {
    const hasUnplayedDrawOrSearch = evaluated.some((other) => {
      if (other === entry) return false;
      const otherRoles = new Set((other.analysis?.cards ?? []).flatMap((c) => c.roles ?? []));
      return ["activate", "spell"].includes(other.analysis?.role) && (otherRoles.has("draw") || otherRoles.has("search"));
    });
    if (hasUnplayedDrawOrSearch) {
      value -= 1.2;
    }
  }

  // 3. Pre-Battle Removal: Prioritize resolving monster removal before entering Battle Phase against threats
  if (["activate", "spell"].includes(role) && (roles.has("monster-removal") || roles.has("removal"))) {
    const oppMonsters = Number(observation?.opponentMonsterCount ?? 0);
    const oppThreat = Number(observation?.opponentThreat ?? 0);
    const ownPower = Number(observation?.ownBoardPower ?? 0);
    const hasBattlePhasePending = evaluated.some((other) => other !== entry && other.analysis?.role === "battle-phase");
    if (hasBattlePhasePending && oppMonsters > 0 && oppThreat >= ownPower) {
      value += 2.0;
    }
  }

  // 4. Combo Enablement: Floater summon enabling Creature Swap
  if (role === "summon" && (roles.has("floater") || roles.has("search-on-death"))) {
    const hasCreatureSwap = evaluated.some((other) => {
      const otherCode = Number(other.analysis?.cards?.[0]?.runtimeCode ?? 0);
      return otherCode === 31036355;
    });
    if (hasCreatureSwap) {
      value += 1.6;
    }
  }

  // 5. Mass Wipe before Board Commitment
  if (["activate", "spell"].includes(role) && (roles.has("backrow-removal") || roles.has("backrow-sweeper"))) {
    const hasFollowUpSummon = evaluated.some((other) => other !== entry && ["summon", "special-summon"].includes(other.analysis?.role));
    if (hasFollowUpSummon) {
      value += 1.5;
    }
  }

  return value;
}

function predictionAdjustment(role, roles, observation, opponentModel, negativeInference = null) {
  const risks = opponentModel?.risks ?? {};
  const backrow = Number(observation?.opponentBackrowCount) || 0;
  const ownMonsters = Number(observation?.ownMonsterCount) || 0;
  let value = 0;
  const interactionRisk = clamp((risks.interaction ?? 0) * 5 + backrow * 0.17, 0, 2.2);
  const sweepRisk = clamp((risks.swing ?? 0) * 8, 0, 2.5);

  // Vía 3: Bayesian threats evaluation
  const threats = negativeInference ? evaluateBackrowThreats(negativeInference, observation) : null;
  const heavyStormRisk = threats?.handProbabilities?.heavyStorm ?? 0;
  const snatchStealRisk = threats?.handProbabilities?.snatchSteal ?? 0;

  // Only penalize overextension if we already have 3+ monsters AND we do not have lethal or swarm/combo plans
  if (["summon", "special-summon"].includes(role) && ownMonsters >= 3 && !roles.has("lethal") && !roles.has("swarm") && !roles.has("combo")) {
    value -= clamp((interactionRisk + sweepRisk) * 0.35, 0, 1.2);
  }
  if (role === "spell-set" && Number(observation?.ownBackrowCount) >= 2) {
    const stormPenalty = heavyStormRisk > 0.2 ? clamp(heavyStormRisk * 4.0, 0, 3.2) : 0;
    value -= Math.max(clamp((risks["backrow-removal"] ?? 0) * 8, 0, 2.8), stormPenalty);
  }
  if (roles.has("backrow-removal") && backrow) value += interactionRisk * 1.25;
  if (roles.has("negate") && opponentModel?.ready && /combo|burn/.test(String(opponentModel.top?.archetype ?? "").toLowerCase())) value += 1.6;

  // If opponent has high probability of Snatch Steal and we consider summoning a solitary boss
  if (roles.has("boss") && ["summon", "special-summon"].includes(role) && snatchStealRisk > 0.28 && ownMonsters === 0) {
    value -= clamp(snatchStealRisk * 2.5, 0, 1.8);
  }

  return value;
}

function styleAdjustment(style, role, roles, observation) {
  let value = 0;
  if (style === "pressure") {
    if (["summon", "special-summon", "battle-phase", "attack"].includes(role)) value += 1.1;
    if (role === "end-phase") value -= 1.2;
  } else if (style === "control") {
    if (["spell-set", "monster-set", "chain"].includes(role) || roles.has("interaction")) value += 0.9;
    if (roles.has("swing") && Number(observation?.opponentMonsterCount) + Number(observation?.opponentBackrowCount) < 2) value -= 1.5;
  } else if (style === "midrange") {
    if (["summon", "interaction", "removal"].includes(role) || roles.has("engine")) value += 0.8;
    if (roles.has("boss") && Number(observation?.opponentThreat) < 1500) value -= 0.5;
  } else if (style === "assemble") {
    if (["draw", "search", "engine", "combo", "grave-setup"].some((item) => roles.has(item))) value += 1.2;
    if (role === "battle-phase" && Number(observation?.ownBoardPower) < 1800) value -= 0.7;
  } else if (style === "burn") {
    if (roles.has("burn") || roles.has("stall") || role === "spell-set") value += 1.2;
    if (["summon", "special-summon"].includes(role) && Number(observation?.ownMonsterCount) >= 2) value -= 1.5;
  } else if (style === "recover") {
    if (["defense", "interaction", "removal", "draw", "recovery"].some((item) => roles.has(item))) value += 1.5;
    if (role === "end-phase") value -= 1;
  } else if (style === "convert") {
    if (["battle-phase", "attack", "special-summon"].includes(role)) value += 1.5;
    if (roles.has("lethal") && Number(observation?.opponentLp) <= 2000) value += 1.2;
  } else if (style === "disrupt") {
    if (["interaction", "negate", "removal"].some((item) => roles.has(item))) value += 1.4;
  }
  return value;
}

/** Scores one legal action as part of a public-information multi-step plan. */
export function planStrategicResponses(knowledge, message, evaluated, { observation = {}, memory = {}, opponentModel = null, persona = {}, planningScale = 0.3, negativeInference = null } = {}) {
  const style = styleFor(knowledge, observation, opponentModel, persona);
  const ownLp = Number(observation?.ownLp) || 8000;
  const oppLp = Number(observation?.opponentLp) || 8000;
  const boardRelation = Number(observation?.opponentThreat) > Number(observation?.ownBoardPower) + 800 || ownLp + 1800 < oppLp
    ? "behind"
    : Number(observation?.ownBoardPower) > Number(observation?.opponentThreat) + 1000 || oppLp <= 2600
      ? "ahead"
      : "even";
  return evaluated.map((entry) => {
    const role = entry.analysis?.role ?? strategyActionRole(message, entry.candidate);
    const roles = rolesOf(entry.analysis);
    const sequence = sequenceAdjustment(role, roles, memory);
    const lookahead = forwardLookaheadAdjustment(entry, evaluated, observation);
    const prediction = predictionAdjustment(role, roles, observation, opponentModel, negativeInference);
    const styleValue = styleAdjustment(style, role, roles, observation);
    const boardAdj = boardStateAdjustment(boardRelation, role, roles, observation);
    const personaValue = Number(persona.roleWeights?.[role] ?? 0) + [...roles].reduce((sum, item) => sum + Number(persona.roleWeights?.[item] ?? 0), 0);
    const planningAdjustment = (sequence + lookahead + prediction + styleValue + personaValue + boardAdj) * Math.max(0, Math.min(1.5, Number(planningScale) || 0));
    const score = Number(entry.baseScore ?? 0) + planningAdjustment;
    return { ...entry, role, roles: [...roles], score, components: { sequence, lookahead, prediction, style: styleValue, persona: personaValue, board: boardAdj }, playstyle: style };
  }).sort((left, right) => right.score - left.score);
}

export function currentPlaystyle(knowledge, observation, opponentModel, persona) {
  return styleFor(knowledge, observation, opponentModel, persona);
}


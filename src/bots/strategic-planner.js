import { strategyActionRole } from "./deck-strategy.js";

function clamp(value, minimum = -12, maximum = 12) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function rolesOf(analysis) {
  return new Set((analysis?.cards ?? []).flatMap((card) => card.roles ?? []));
}

function styleFor(knowledge, observation, opponentModel, persona = {}) {
  const archetype = String(knowledge?.archetype ?? "").toLowerCase();
  const ownLp = Number(observation?.ownLp) || 8000;
  const opponentLp = Number(observation?.opponentLp) || 8000;
  const behind = Number(observation?.opponentThreat) > Number(observation?.ownBoardPower) + 800 || ownLp + 1800 < opponentLp;
  const ahead = Number(observation?.ownBoardPower) > Number(observation?.opponentThreat) + 1000 || opponentLp <= 2600;
  if (behind) return "recover";
  if (ahead) return "convert";
  if (/combo|deck-out|reasoning|empty/.test(archetype)) return "assemble";
  if (/aggro|warrior|beatdown|burn/.test(archetype)) return "pressure";
  if (/control|lock|stall/.test(archetype)) return "control";
  if (opponentModel?.ready && /combo|burn/.test(String(opponentModel.top?.archetype ?? "").toLowerCase())) return "disrupt";
  return persona.defaultStyle ?? "balanced";
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

function predictionAdjustment(role, roles, observation, opponentModel) {
  const risks = opponentModel?.risks ?? {};
  const backrow = Number(observation?.opponentBackrowCount) || 0;
  const ownMonsters = Number(observation?.ownMonsterCount) || 0;
  let value = 0;
  const interactionRisk = clamp((risks.interaction ?? 0) * 5 + backrow * 0.17, 0, 2.2);
  const sweepRisk = clamp((risks.swing ?? 0) * 8, 0, 2.5);
  if (["summon", "special-summon"].includes(role) && ownMonsters >= 2) value -= interactionRisk + sweepRisk;
  if (role === "spell-set" && Number(observation?.ownBackrowCount) >= 2) value -= clamp((risks["backrow-removal"] ?? 0) * 8, 0, 2.8);
  if (roles.has("backrow-removal") && backrow) value += interactionRisk * 1.25;
  if (roles.has("negate") && opponentModel?.ready && /combo|burn/.test(String(opponentModel.top?.archetype ?? "").toLowerCase())) value += 1.6;
  if (role === "battle-phase" && backrow && !roles.has("backrow-removal")) value -= interactionRisk * 0.4;
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
  } else if (style === "assemble") {
    if (["draw", "search", "engine", "combo", "grave-setup"].some((item) => roles.has(item))) value += 1.2;
    if (role === "battle-phase" && Number(observation?.ownBoardPower) < 1800) value -= 0.7;
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
export function planStrategicResponses(knowledge, message, evaluated, { observation = {}, memory = {}, opponentModel = null, persona = {}, planningScale = 0.3 } = {}) {
  const style = styleFor(knowledge, observation, opponentModel, persona);
  return evaluated.map((entry) => {
    const role = entry.analysis?.role ?? strategyActionRole(message, entry.candidate);
    const roles = rolesOf(entry.analysis);
    const sequence = sequenceAdjustment(role, roles, memory);
    const prediction = predictionAdjustment(role, roles, observation, opponentModel);
    const styleValue = styleAdjustment(style, role, roles, observation);
    const personaValue = Number(persona.roleWeights?.[role] ?? 0) + [...roles].reduce((sum, item) => sum + Number(persona.roleWeights?.[item] ?? 0), 0);
    const planningAdjustment = (sequence + prediction + styleValue + personaValue) * Math.max(0, Math.min(1.5, Number(planningScale) || 0));
    const score = Number(entry.baseScore ?? 0) + planningAdjustment;
    return { ...entry, role, roles: [...roles], score, components: { sequence, prediction, style: styleValue, persona: personaValue }, playstyle: style };
  }).sort((left, right) => right.score - left.score);
}

export function currentPlaystyle(knowledge, observation, opponentModel, persona) {
  return styleFor(knowledge, observation, opponentModel, persona);
}

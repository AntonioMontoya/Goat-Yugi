import { OcgMessageType, OcgPhase } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import knowledgeIndex from "../../docs/yu-gi-oh-base/knowledge-index.json" with { type: "json" };
import { hashString } from "../engine/rng.js";

// This module is deliberately small and deterministic.  The documents remain
// the human source of truth; this adapter exposes only public, GOAT-safe facts
// that the decision and training layers are allowed to consume.
export const GOAT_BASE_KNOWLEDGE_SCHEMA = 1;
export const GOAT_BASE_KNOWLEDGE_FINGERPRINT = hashString(JSON.stringify({
  schema: knowledgeIndex.schema_version,
  format: knowledgeIndex.format,
  allowed: knowledgeIndex.allowed_mechanics,
  excluded: knowledgeIndex.excluded_mechanics,
  principles: knowledgeIndex.principles,
  reasonCodes: knowledgeIndex.reason_codes,
}));

const PRINCIPLE_IDS = Object.freeze((knowledgeIndex.principles ?? []).map((item) => item.id));
const REASON_CODES = Object.freeze([...(knowledgeIndex.reason_codes ?? [])]);

export const GOAT_BASE_RULES = Object.freeze({
  schema: GOAT_BASE_KNOWLEDGE_SCHEMA,
  sourceSchema: knowledgeIndex.schema_version,
  fingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
  format: knowledgeIndex.format?.name ?? "TCG GOAT",
  banlistCutoff: knowledgeIndex.format?.banlist_cutoff ?? "2005-04",
  cardPoolCutoff: knowledgeIndex.format?.card_pool_cutoff ?? "The Lost Millennium (TLM)",
  rulesAuthority: knowledgeIndex.format?.rules_authority ?? "OCGCore MODE_GOAT",
  allowedMechanics: Object.freeze([...(knowledgeIndex.allowed_mechanics ?? [])]),
  excludedMechanics: Object.freeze([...(knowledgeIndex.excluded_mechanics ?? [])]),
  principleIds: PRINCIPLE_IDS,
  reasonCodes: REASON_CODES,
});

const DAMAGE_STEP_PHASES = new Set([
  OcgPhase.BATTLE_START,
  OcgPhase.BATTLE_STEP,
  OcgPhase.DAMAGE,
  OcgPhase.DAMAGE_CAL,
  OcgPhase.BATTLE,
]);

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function phaseIsDamageStep(phase) {
  const value = numeric(phase);
  return value !== null && DAMAGE_STEP_PHASES.has(value) && value >= OcgPhase.DAMAGE;
}

/** Classifies only from public state; absent information is never invented. */
export function classifyGoatState(observation = {}) {
  const ownLp = numeric(observation.ownLp);
  const opponentLp = numeric(observation.opponentLp);
  const ownPower = numeric(observation.ownBoardPower);
  const opponentThreat = numeric(observation.opponentThreat);
  if ([ownLp, opponentLp, ownPower, opponentThreat].some((value) => value === null)) return "UNCERTAIN";
  if (opponentLp > 0 && ownPower >= opponentLp && (numeric(observation.opponentMonsterCount, 0) ?? 0) === 0) return "LETHAL";
  if (ownLp <= 1500 || opponentThreat >= ownLp) return "SURVIVAL";
  if (ownPower > opponentThreat + 1000 || ownLp > opponentLp + 1800) return "AHEAD";
  if (opponentThreat > ownPower + 1000 || ownLp + 1800 < opponentLp) return "BEHIND";
  return "EVEN";
}

/** Maps an OCGCore request to the thinking window described by the manuals. */
export function classifyGoatWindow(message = {}, observation = {}) {
  const type = numeric(message?.type);
  let window = "OPEN_STATE";
  if (type === OcgMessageType.SELECT_CHAIN) window = "CHAIN_RESPONSE";
  else if ([OcgMessageType.SELECT_CARD, OcgMessageType.SELECT_TRIBUTE, OcgMessageType.SELECT_SUM, OcgMessageType.SELECT_UNSELECT_CARD].includes(type)) window = "MATERIAL_OR_CARD_SELECTION";
  else if ([OcgMessageType.SELECT_EFFECTYN, OcgMessageType.SELECT_YESNO, OcgMessageType.SELECT_OPTION].includes(type)) window = "EFFECT_RESPONSE";
  else if (type === OcgMessageType.SELECT_BATTLECMD) window = "BATTLE_WINDOW";
  else if (type === OcgMessageType.SELECT_IDLECMD) window = "PHASE_PRIORITY";
  else if ([OcgMessageType.SELECT_POSITION, OcgMessageType.SELECT_PLACE, OcgMessageType.SELECT_DISFIELD].includes(type)) window = "MATERIAL_OR_CARD_SELECTION";
  const damageStep = phaseIsDamageStep(observation?.phase) && ["BATTLE_WINDOW", "CHAIN_RESPONSE", "EFFECT_RESPONSE"].includes(window);
  return { window: damageStep ? "DAMAGE_STEP" : window, damageStep, mandatory: message?.forced === true };
}

/** Enriches an observation with the public GOAT state/window contract. */
export function normalizeGoatObservation(observation = {}, message = {}) {
  const window = classifyGoatWindow(message, observation);
  return {
    ...observation,
    goatState: observation.goatState ?? classifyGoatState(observation),
    goatWindow: observation.goatWindow ?? window.window,
    goatMandatory: observation.goatMandatory === true || window.mandatory,
    goatDamageStep: observation.goatDamageStep === true || window.damageStep,
    goatChainDepth: Math.max(0, Math.min(8, numeric(observation.publicChain?.length, numeric(observation.chainDepth, 0)) ?? 0)),
    goatRespondingToOpponent: observation.goatRespondingToOpponent === true || (observation.isOwnTurn === false && window.window === "CHAIN_RESPONSE"),
    goatKnowledgeSchema: GOAT_BASE_KNOWLEDGE_SCHEMA,
    goatKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
    hiddenInformationSafe: true,
  };
}

/** Stable tokens used by both the frozen planner and the learned policy. */
export function baseKnowledgeFeatures(_knowledge, observation = {}, entry = {}) {
  const state = observation.goatState ?? classifyGoatState(observation);
  const window = observation.goatWindow ?? "OPEN_STATE";
  const reasons = entry?.analysis?.reasons ?? entry?.reasons ?? [];
  const tokens = [
    "base:format:tcg-goat",
    `base:state:${state}`,
    `base:window:${window}`,
    `base:mandatory:${observation.goatMandatory === true}`,
    `base:damage-step:${observation.goatDamageStep === true}`,
    `base:chain-depth:${Math.min(4, Math.max(0, numeric(observation.goatChainDepth, 0) ?? 0))}`,
    `base:responding:${observation.goatRespondingToOpponent === true}`,
  ];
  for (const principle of PRINCIPLE_IDS) tokens.push(`base:principle:${principle}`);
  for (const code of normalizeReasonCodes(reasons, { actionRole: entry?.role, observation })) tokens.push(`base:reason:${code}`);
  return [...new Set(tokens)];
}

const REASON_MAP = Object.freeze({
  ONLY_LEGAL_RESPONSE: "MANDATORY_EFFECT",
  FLIP_VALUE_REQUIRES_SET: "SET_TO_PROTECT",
  FACEUP_SUMMON_DOES_NOT_ENABLE_FLIP_VALUE: "SET_TO_PROTECT",
  SET_ENABLES_FUTURE_FLIP_VALUE: "FLIP_FOR_VALUE",
  REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT: "DO_NOT_NEGATE_BY_DESTROYING",
  NO_OPPOSING_BACKROW_VALUE: "TARGET_RELEVANT",
  NO_OPPOSING_MONSTER_VALUE: "TARGET_RELEVANT",
  NO_MATCHING_OPPONENT_TARGET: "TARGET_RELEVANT",
  PRESERVE_HIGH_VALUE_COST_MATERIAL: "PRESERVE_ADVANTAGE",
  REMOVING_A_RESOURCE_JUST_DEPLOYED_OR_EXPOSED: "PRESERVE_ADVANTAGE",
  ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET: "SAFE_TEMPO",
  NO_PROFITABLE_POSITION_TARGET: "TARGET_RELEVANT",
  CHAIN_NEEDS_IMMEDIATE_PUBLIC_JUSTIFICATION: "OPEN_STATE",
  HIDDEN_INFO_LIMIT: "HIDDEN_INFO_LIMIT",
});

export function normalizeReasonCodes(reasons = [], { actionRole = "", observation = {} } = {}) {
  const allowed = new Set(REASON_CODES);
  const result = [];
  for (const reason of reasons ?? []) {
    const key = String(reason ?? "");
    const code = REASON_MAP[key] ?? (allowed.has(key) ? key : null);
    if (code && allowed.has(code) && !result.includes(code)) result.push(code);
  }
  if (observation.goatDamageStep === true && allowed.has("DAMAGE_STEP_FILTER") && !result.includes("DAMAGE_STEP_FILTER")) result.push("DAMAGE_STEP_FILTER");
  if (["pass-chain", "end-phase"].includes(actionRole) && allowed.has("UNCERTAIN_PASS") && !result.includes("UNCERTAIN_PASS")) result.push("UNCERTAIN_PASS");
  if (!result.length && observation.goatMandatory === true && allowed.has("MANDATORY_EFFECT")) result.push("MANDATORY_EFFECT");
  return result;
}

/** A bounded local teaching hint; terminal results remain authoritative. */
export function decisionTrainingSignal({ actionRole = "", projectedValue = 0, reasons = [], observation = {} } = {}) {
  const state = observation.goatState ?? classifyGoatState(observation);
  let signal = Math.max(-0.25, Math.min(0.25, Number(projectedValue || 0) / 40));
  if (["AHEAD", "LETHAL"].includes(state) && ["pass-chain", "end-phase", "battle-phase"].includes(actionRole)) signal += 0.08;
  if (["BEHIND", "SURVIVAL"].includes(state) && ["pass-chain", "end-phase"].includes(actionRole)) signal -= 0.1;
  if (reasons.includes("REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT")) signal -= 0.2;
  return Math.max(-0.35, Math.min(0.35, signal));
}

export { knowledgeIndex };

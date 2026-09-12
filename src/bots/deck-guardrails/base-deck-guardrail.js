import { getDeckProfile } from "../../decks/deck-profiles.js";

/**
 * Common helper functions for deck-specific guardrails.
 */
export function codeOf(card) {
  return Number(card?.runtimeCode ?? card?.code ?? card?.card ?? card?.id ?? 0);
}

export function controllerOf(entry) {
  const value = entry?.controller ?? entry?.controler ?? entry?.player;
  return value === undefined || value === null ? null : Number(value);
}

export function primaryCode(entry) {
  return Number(entry?.analysis?.cards?.[0]?.runtimeCode) || 0;
}

export function isImmediateLethal(entry, observation = {}) {
  const card = entry?.analysis?.cards?.[0];
  return ["summon", "special-summon"].includes(entry?.analysis?.role)
    && Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) === 0
    && Number(card?.atk) > 0
    && Number(card.atk) >= Number(observation.opponentLp);
}

export function sourceCode(knowledge, message, memory = {}, observation = {}) {
  const directCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  if (directCode) return directCode;
  const turn = Number(observation.turn) || 0;
  const decision = Number(observation.decisions) || 0;
  const recent = [...(memory?.recent ?? [])].reverse().find((entry) => Number(entry.turn) === turn
    && Number(entry.cardCode)
    && (!decision || !Number(entry.decision) || decision - Number(entry.decision) <= 4));
  return Number(recent?.cardCode) || 0;
}

export function createDeckGuardrail({ id, tier = "Tier 2", playstyle = "midrange", riskTolerance = 0.5, evaluate }) {
  const profile = getDeckProfile(id);
  const resolvedTier = profile?.tier ?? tier;
  const resolvedPlaystyle = profile?.playstyle ?? playstyle;
  const resolvedRiskTolerance = profile?.riskTolerance ?? riskTolerance;

  const guardrailFn = function(entry, evaluated, knowledge, message, context) {
    return evaluate(entry, evaluated, knowledge, message, context, {
      tier: resolvedTier,
      playstyle: resolvedPlaystyle,
      riskTolerance: resolvedRiskTolerance,
    });
  };

  guardrailFn.deckId = id;
  guardrailFn.tier = resolvedTier;
  guardrailFn.playstyle = resolvedPlaystyle;
  guardrailFn.riskTolerance = resolvedRiskTolerance;

  return guardrailFn;
}

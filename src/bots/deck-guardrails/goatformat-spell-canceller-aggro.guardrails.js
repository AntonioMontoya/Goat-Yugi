import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SPELL_CANCELLER_CODES = new Set([84636849]);
const LIGHT_INTERVENTION_CODES = new Set([60417395]);
const WANGHU_CODES = new Set([83986578]);

export default createDeckGuardrail({
  id: "goatformat-spell-canceller-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Spell Canceller: Debe estar boca arriba para anular magias, prohibir Set defensivo
    if (SPELL_CANCELLER_CODES.has(code) || name.includes("spell canceller")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "SPELL_CANCELLER_MUST_BE_FACE_UP";
      }

      if (role === "summon" && (observation.ownMonsters ?? []).length === 0) {
        return "SPELL_CANCELLER_REQUIRES_ONE_TRIBUTE";
      }
    }

    // 2. Light of Intervention: Bloquear seteo boca abajo de monstruos rivales
    if (LIGHT_INTERVENTION_CODES.has(code) || name.includes("light of intervention")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") return null;
    }

    // 3. King Tiger Wanghu: Invocación normal prioritaria en Ataque
    if (WANGHU_CODES.has(code) || name.includes("wanghu")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "WANGHU_PREFER_ATTACK_SUMMON";
      }
    }

    return null;
  }
});

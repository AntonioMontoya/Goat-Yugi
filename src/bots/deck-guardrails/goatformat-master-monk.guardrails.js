import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MASTER_MONK_CODES = new Set([4981418]);
const MONK_FIGHTER_CODES = new Set([600684]);
const KAMINOTE_CODES = new Set([13893596]);

export default createDeckGuardrail({
  id: "goatformat-master-monk",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Monk Fighter: Invocación boca arriba para servir de tributo a Master Monk
    if (MONK_FIGHTER_CODES.has(code) || name.includes("monk fighter")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "MONK_FIGHTER_PREFER_FACE_UP_FOR_MASTER_MONK";
      }
    }

    // 2. Master Monk: Invocación especial tributando Monk Fighter y prohibición de Set
    if (MASTER_MONK_CODES.has(code) || name.includes("master monk")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "MASTER_MONK_MUST_BE_FACE_UP";
      }
      if (role === "special-summon") {
        return null; // Prioridad para poner al doble atacante de 1900 en mesa
      }
    }

    // 3. Kaminote Blow: Activar en Main Phase 1 si Master Monk o Monk Fighter van a combatir
    if (KAMINOTE_CODES.has(code) || name.includes("kaminote blow")) {
      if (role === "activate") return null;
    }

    return null;
  }
});

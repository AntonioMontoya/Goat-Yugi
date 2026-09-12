import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const UI_LV3_CODES = new Set([34827041]);
const UI_LV5_CODES = new Set([70732890]);
const UI_LV7_CODES = new Set([97570038]);

export default createDeckGuardrail({
  id: "goatformat-ultimate-insect",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Ultimate Insect LV3: Activar en Standby Phase para evolucionar a LV5 y aplicar debuff
    if (UI_LV3_CODES.has(code) || name.includes("ultimate insect lv3")) {
      if (role === "activate") return null; // Prioridad evolucionar
    }

    // 2. Ultimate Insect LV5: Prohibir tributo manual innecesario (debe salir de LV3 para tener efecto de debuff)
    if (UI_LV5_CODES.has(code) || name.includes("ultimate insect lv5")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "UI_LV5_MUST_BE_FACE_UP";
      }
      if (role === "activate") return null; // Evolucionar a LV7 en Standby
    }

    // 3. Ultimate Insect LV7: Prohibir tributo manual de 2 monstruos
    if (UI_LV7_CODES.has(code) || name.includes("ultimate insect lv7")) {
      if (role === "summon" && (observation.ownMonsters ?? []).length < 2) {
        return "SUMMON_UI_LV7_VIA_LV5";
      }
      if (role === "monster-set") return "UI_LV7_CANNOT_BE_SET";
    }

    // 4. Reclutadores (Flying Kamakiri #1, Howling Insect): Priorizar Set
    if (name.includes("kamakiri") || name.includes("howling insect")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "RECRUITER_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

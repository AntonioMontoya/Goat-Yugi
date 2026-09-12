import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const RISING_AIR_CODES = new Set([45778938]); // Rising Air Current
const SILPHEED_CODES = new Set([73001017]);
const SPEAR_DRAGON_CODES = new Set([31553716]);
const SLATE_WARRIOR_CODES = new Set([78636495]);

export default createDeckGuardrail({
  id: "goatformat-wind-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Rising Air Current: Activar en zona de campo para +500 ATK a todos los viento
    if (RISING_AIR_CODES.has(code) || name.includes("rising air current")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_RISING_AIR_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Spear Dragon y Slate Warrior: Invocación en Ataque con 1900 ATK (2400 bajo campo)
    if (SPEAR_DRAGON_CODES.has(code) || SLATE_WARRIOR_CODES.has(code) || name.includes("spear dragon") || name.includes("slate warrior")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "WIND_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Silpheed: Invocación especial desterrando 1 VIENTO del cementerio
    if (SILPHEED_CODES.has(code) || name.includes("silpheed")) {
      if (role === "special-summon") return null;
    }

    // 4. Flying Kamakiri #1: Priorizar Set defensivo
    if (name.includes("kamakiri")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "KAMAKIRI_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

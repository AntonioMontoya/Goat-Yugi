import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HEART_UNDERDOG_CODES = new Set([35762283]);
const SKILL_DRAIN_CODES = new Set([82732705]);

export default createDeckGuardrail({
  id: "goatformat-vanilla-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Monstruos Normales de 1800-1900 ATK: Invocación ofensiva en Posición de Ataque
    if (name.includes("soldier") || name.includes("elf") || name.includes("knight") || name.includes("luster dragon") || name.includes("mad dog") || name.includes("neo bug")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "VANILLA_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 2. Heart of the Underdog: Activar de inmediato boca arriba
    if (HEART_UNDERDOG_CODES.has(code) || name.includes("heart of the underdog")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_HEART_OF_UNDERDOG_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 3. Skill Drain: Activar para anular efectos rivales (el mazo propio no tiene efectos que anular)
    if (SKILL_DRAIN_CODES.has(code) || name.includes("skill drain")) {
      if (role === "activate" || role === "chain") return null;
    }

    return null;
  }
});

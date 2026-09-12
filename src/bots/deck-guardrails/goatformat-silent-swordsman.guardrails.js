import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SS_LV3_CODES = new Set([1995985]);
const SS_LV5_CODES = new Set([74388798]);
const SS_LV7_CODES = new Set([37267041]);
const LEVEL_UP_CODES = new Set([25290459]);
const ROYAL_DECREE_CODES = new Set([51452091]);

export default createDeckGuardrail({
  id: "goatformat-silent-swordsman",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Silent Swordsman LV3: Prohibir Set defensivo, invocar en Ataque
    if (SS_LV3_CODES.has(code) || name.includes("silent swordsman lv3")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "SS_LV3_PREFER_ATTACK_SUMMON";
      }
    }

    // 2. Level Up!: Activar proactivamente para evolucionar a LV5 o LV7
    if (LEVEL_UP_CODES.has(code) || name.includes("level up!")) {
      if (role === "activate") return null;
    }

    // 3. Silent Swordsman LV7: Prohibir invocación normal desde mano sin Level Up
    if (SS_LV7_CODES.has(code) || name.includes("silent swordsman lv7")) {
      if (role === "summon") {
        return "SUMMON_LV7_VIA_LEVEL_UP_OR_LV5";
      }
    }

    // 4. Royal Decree: Activar para sellar trampas junto con la inmunidad/bloqueo de magias
    if (ROYAL_DECREE_CODES.has(code) || name.includes("royal decree")) {
      if (role === "activate" || role === "chain") return null;
    }

    return null;
  }
});

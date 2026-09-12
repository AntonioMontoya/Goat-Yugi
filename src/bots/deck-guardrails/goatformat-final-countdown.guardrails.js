import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const FINAL_COUNTDOWN_CODES = new Set([95308449, 504700170]);
const WALL_REVEALING_LIGHT_CODES = new Set([17078030, 504700171]);

export default createDeckGuardrail({
  id: "goatformat-final-countdown",
  tier: "Tier 3",
  playstyle: "lockdown",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Final Countdown: Highest priority activation on Turn 1 / as soon as in hand
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (FINAL_COUNTDOWN_CODES.has(code) || name.includes("final countdown")) {
        return null; // Top priority
      }
    }

    // 2. Wall of Revealing Light Activation
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (WALL_REVEALING_LIGHT_CODES.has(code) || name.includes("wall of revealing light")) {
        return null;
      }
    }

    return null;
  }
});

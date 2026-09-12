import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const AZTEC_CODES = new Set([13039848, 504700160]);
const CROSS_COUNTER_CODES = new Set([37043180, 504700161]);
const STAUNCH_DEFENDER_CODES = new Set([92854392, 504700162]);

export default createDeckGuardrail({
  id: "goatformat-wall-stall",
  tier: "Tier 3",
  playstyle: "lockdown",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Aztec & Walls: Never switch to attack position
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "position-change") {
      if (AZTEC_CODES.has(code) || name.includes("aztecs") || name.includes("gardna") || name.includes("gear golem")) {
        return "DEFENSIVE_WALLS_MUST_REMAIN_IN_DEFENSE";
      }
    }

    // 2. Wall Summon: Must always be set face-down
    if (role === "summon" && (AZTEC_CODES.has(code) || name.includes("aztecs") || name.includes("gardna") || name.includes("gear golem") || name.includes("wall"))) {
      const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
      if (hasSetAlt && !isImmediateLethal(entry, context.observation ?? {})) {
        return "WALL_MONSTERS_MUST_BE_SET";
      }
    }

    // 3. Attack veto: Low/Zero ATK walls must never declare attack
    if (role === "attack" && (AZTEC_CODES.has(code) || name.includes("aztecs") || name.includes("gardna") || name.includes("gear golem") || name.includes("wall"))) {
      const atk = Number(card?.atk ?? card?.attack ?? 0);
      if (atk < 1400) {
        return "WALL_MONSTERS_NEVER_ATTACK";
      }
    }

    return null;
  }
});

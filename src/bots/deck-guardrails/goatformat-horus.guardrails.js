import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HORUS_LV4_CODES = new Set([75830094, 11224103]);
const HORUS_LV6_CODES = new Set([11224103, 504700015, 1492176996]);
const HORUS_LV8_CODES = new Set([48229808, 1492176997]);
const ROYAL_DECREE_CODES = new Set([51452091, 51452092]);
const CYBER_STEIN_CODES = new Set([69015963, 1096735174]);
const MIRAGE_DRAGON_CODES = new Set([15960641, 138615465]);
const KYCOO_CODES = new Set([23267382, 31]);

function isHorusCard(c) {
  if (!c) return false;
  const name = String(c.name ?? "").toLowerCase();
  const code = codeOf(c);
  return HORUS_LV4_CODES.has(code) || HORUS_LV6_CODES.has(code) || HORUS_LV8_CODES.has(code) || name.includes("horus the black flame");
}

export default createDeckGuardrail({
  id: "goatformat-horus",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const ownLp = Number(observation.ownLp) || 8000;

    // 1. Royal Decree Lock Activation:
    // If we have Royal Decree set or can activate it, prioritize activation once we establish board presence
    // (especially with Horus LV6 or LV8) to lock out opponent's Ring, Mirror Force, Sakuretsu, and Call.
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (ROYAL_DECREE_CODES.has(code) || name.includes("royal decree")) {
        return null; // High priority chain
      }
    }

    // 2. Horus LV4 / LV6 Level Up Protection:
    // In Battle Phase, prioritize Horus LV4 attacking weaker monsters to ensure it destroys them and levels up in End Phase.
    if (message?.type === OcgMessageType.SELECT_BATTLECMD && role === "attack") {
      if (isHorusCard(card)) {
        // Ensure attack target has lower ATK/DEF
        return null;
      }
    }

    // 3. Cyber-Stein: Only activate if LP >= 5000 and King Dragun or TER brings massive swing
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (CYBER_STEIN_CODES.has(code) || name.includes("cyber-stein")) {
        if (ownLp < 5000) {
          return "NOT_ENOUGH_LP_FOR_CYBER_STEIN";
        }
      }
    }

    // 4. Kycoo Banish Suppression:
    // Keep Kycoo attacking to purge opponent's GY targets and block BLS/Chaos Sorcerer.
    if (message?.type === OcgMessageType.SELECT_BATTLECMD && role === "attack") {
      if (KYCOO_CODES.has(code) || name.includes("kycoo")) {
        return null;
      }
    }

    return null;
  }
});

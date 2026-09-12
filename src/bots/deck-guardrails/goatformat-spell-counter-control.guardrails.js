import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LIBRARY_CODES = new Set([3395226, 504700100]);
const MARIONETTE_CODES = new Set([41838644, 504700101]);
const ANTI_SPELL_CODES = new Set([53112492, 504700102]);

export default createDeckGuardrail({
  id: "goatformat-spell-counter-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Royal Magical Library: High DEF monster (2000 DEF, 0 ATK) must be set in defense
    if (role === "summon" && (LIBRARY_CODES.has(code) || name.includes("royal magical library"))) {
      const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
      if (hasSetAlt) {
        return "ROYAL_MAGICAL_LIBRARY_SET_IN_DEFENSE";
      }
    }

    // 2. Magical Marionette: Only remove counters if opponent controls a target monster
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (MARIONETTE_CODES.has(code) || name.includes("magical marionette")) {
        const oppMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0);
        if (oppMonsters === 0) {
          return "MARIONETTE_REQUIRES_OPPONENT_TARGET";
        }
      }
    }

    return null;
  }
});

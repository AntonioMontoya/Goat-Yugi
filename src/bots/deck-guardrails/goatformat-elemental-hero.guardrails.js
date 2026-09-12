import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const KING_OF_SWAMP_CODES = new Set([79109599, 504700030]);
const POLYMERIZATION_CODES = new Set([24094653, 504700031]);
const HERO_SIGNAL_CODES = new Set([22020907, 504700032]);

export default createDeckGuardrail({
  id: "goatformat-elemental-hero",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. King of the Swamp: Discard to search Polymerization if not in hand
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (KING_OF_SWAMP_CODES.has(code) || name.includes("king of the swamp")) {
        const hasPolyInHand = (observation.ownHand ?? []).some((h) => {
          const hName = String(h?.name ?? "").toLowerCase();
          return POLYMERIZATION_CODES.has(codeOf(h)) || hName.includes("polymerization");
        });
        if (!hasPolyInHand) return null; // High priority search
      }
    }

    // 2. Polymerization: Avoid dumping hand into unprobed backrow
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (POLYMERIZATION_CODES.has(code) || name.includes("polymerization")) {
        const oppBackrow = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);
        if (oppBackrow >= 2 && !isImmediateLethal(entry, observation)) {
          const hasBackrowClear = evaluated.some((o) => {
            const oCode = primaryCode(o);
            return [19613556, 5318639].includes(oCode) && ["activate", "spell"].includes(o.analysis?.role);
          });
          if (hasBackrowClear) {
            return "ELEMENTAL_HERO_CLEAR_BACKROW_BEFORE_FUSION";
          }
        }
      }
    }

    // 3. Clayman: High DEF monster (2000 DEF, 800 ATK) should be set in defense
    if (role === "summon" && (code === 84327329 || name.includes("clayman"))) {
      const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
      if (hasSetAlt && !isImmediateLethal(entry, observation)) {
        return "CLAYMAN_SET_IN_DEFENSE";
      }
    }

    return null;
  }
});

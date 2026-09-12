import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const THE_CREATOR_CODES = new Set([61505339, 504700060]);
const CREATOR_INCARNATE_CODES = new Set([97588916, 504700061]);
const SAFE_RETURN_CODES = new Set([57953380, 504700062]);
const SACRED_CRANE_CODES = new Set([30914564, 504700063]);
const SINISTER_CODES = new Set([8131171, 9]);
const THUNDER_CODES = new Set([31560081, 15]);

export default createDeckGuardrail({
  id: "goatformat-creator",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Safe Return: Activate before activating The Creator to draw cards on revive
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (THE_CREATOR_CODES.has(code) || name.includes("the creator")) {
        const hasUnplayedSafeReturn = evaluated.some((o) => {
          const oCode = primaryCode(o);
          return (SAFE_RETURN_CODES.has(oCode) || String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("card of safe return"))
            && ["activate", "spell"].includes(o.analysis?.role);
        });
        if (hasUnplayedSafeReturn) {
          return "CREATOR_ACTIVATE_SAFE_RETURN_FIRST";
        }
      }
    }

    // 2. Creator Incarnate: Only tribute if The Creator is in hand
    if (role === "activate" && (CREATOR_INCARNATE_CODES.has(code) || name.includes("creator incarnate"))) {
      const hasCreatorInHand = (observation.ownHand ?? []).some((h) => THE_CREATOR_CODES.has(codeOf(h)) || String(h?.name ?? "").toLowerCase().includes("the creator"));
      if (!hasCreatorInHand) {
        return "CREATOR_INCARNATE_REQUIRES_CREATOR_IN_HAND";
      }
    }

    // 3. Discard optimization: Prefer Sinister Serpent / Thunder Dragon over power spells
    if (message?.type === OcgMessageType.SELECT_DISCARD || message?.type === OcgMessageType.SELECT_CARD) {
      const isPowerSpell = [19613556, 55144522, 72892473, 5318639].includes(code); // Storm, Pot, Destruction, MST
      const hasSinisterOrThunder = evaluated.some((o) => {
        const oCode = primaryCode(o);
        return SINISTER_CODES.has(oCode) || THUNDER_CODES.has(oCode);
      });
      if (isPowerSpell && hasSinisterOrThunder) {
        return "CREATOR_PREFER_DISCARDING_RECURSIVE_AMMO";
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const BANISHER_CODES = new Set([61528027, 504700150]);
const GREN_MAJU_CODES = new Set([3659803, 504700151]);
const SOUL_RELEASE_CODES = new Set([5758500, 504700152]);

export default createDeckGuardrail({
  id: "goatformat-banish-turbo",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Banisher of the Light: Prefer Defense Position (2000 DEF)
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "summon") {
      if (BANISHER_CODES.has(code) || name.includes("banisher of the light")) {
        const canSet = evaluated.some((other) => other !== entry && other.analysis?.role === "monster-set");
        if (canSet && !isImmediateLethal(context)) return "BANISHER_PREFER_DEFENSE_POSITION";
      }
    }

    // 2. Gren Maju Da Eiza: Scaling Threshold (Requires >= 5 banished cards for 2000+ ATK)
    if (role === "summon" && (GREN_MAJU_CODES.has(code) || name.includes("gren maju"))) {
      const ownBanished = (observation.banished ?? observation.ownBanished ?? []).length;
      const oppBanished = (observation.opponentBanished ?? []).length;
      const totalBanished = ownBanished + oppBanished;
      if (totalBanished < 5 && !isImmediateLethal(entry, observation)) {
        const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSetAlt) return "GREN_MAJU_LOW_ATK_PREFER_SET";
        return "GREN_MAJU_REQUIRES_BANISHED_THRESHOLD";
      }
    }

    return null;
  }
});

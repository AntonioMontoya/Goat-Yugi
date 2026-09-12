import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";

const CLOWN_MONSTER_CODES = new Set([
  13215230, 1587221869, // Dream Clown
  58268433, 1381027191, // Blade Rabbit
  93889755, 1751008316, // Crass Clown
]);

const CLOWN_SUPPORT_CODES = new Set([
  34646691, 33055770,   // Stumbling
  66526672, 389861540,  // Labyrinth of Nightmare
]);

export default createDeckGuardrail({
  id: "goatformat-clown-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};

    if (role === "summon") {
      const isClown = CLOWN_MONSTER_CODES.has(primaryCode(entry))
        || ["dream clown", "blade rabbit", "crass clown"].some((n) => String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes(n));
      if (isClown && !isImmediateLethal(entry, observation)) {
        const allBack = [...(observation.ownBackrow ?? []), ...(observation.opponentBackrow ?? [])];
        const hasClownSupport = allBack.some((b) => {
          const bCode = codeOf(b);
          const isFaceUp = (Number(b.position ?? 0) & OcgPosition.FACEUP) !== 0 || b.faceUp === true;
          return isFaceUp && (CLOWN_SUPPORT_CODES.has(bCode) || ["stumbling", "labyrinth of nightmare"].some((n) => String(b?.name ?? "").toLowerCase().includes(n)));
        });
        const sameCardAlternatives = evaluated.filter((other) => other !== entry && primaryCode(other) === primaryCode(entry));
        const canSetInstead = sameCardAlternatives.some((other) => other.analysis?.role === "monster-set");
        if (!hasClownSupport && canSetInstead) {
          return "CLOWN_CONTROL_PREFER_SET_OR_ACTIVE_SUPPORT";
        }
      }
    }

    return null;
  },
});

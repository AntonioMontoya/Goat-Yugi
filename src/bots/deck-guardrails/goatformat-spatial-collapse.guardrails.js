import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";

const SPATIAL_COLLAPSE_CODES = new Set([20644748, 1952610242]);

export default createDeckGuardrail({
  id: "goatformat-spatial-collapse",
  tier: "Tier 3",
  playstyle: "lockdown",
  riskTolerance: 0.80,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};

    if (role === "activate") {
      const activeCode = primaryCode(entry);
      const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();
      if (SPATIAL_COLLAPSE_CODES.has(activeCode) || activeName.includes("spatial collapse")) {
        const ownCount = Number(observation.ownMonsterCount ?? observation.ownMonsters?.length ?? 0);
        const oppCount = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0);
        if (oppCount > ownCount && !isImmediateLethal(entry, observation)) {
          return "SPATIAL_COLLAPSE_REQUIRE_MONSTER_ADVANTAGE";
        }
      }
    }

    return null;
  },
});

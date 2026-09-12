import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const PANDEMONIUM_CODES = new Set([94585852, 504700090]);
const TERRORKING_CODES = new Set([35975813, 504700091]);
const FALLING_DOWN_CODES = new Set([32919136, 504700092]);
const ROYAL_DECREE_CODES = new Set([51452091, 51452092]);

export default createDeckGuardrail({
  id: "goatformat-archfiend",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Terrorking Archfiend: Cannot be Normal/Flip Summoned without another Archfiend on field
    if (role === "summon" && (TERRORKING_CODES.has(code) || name.includes("terrorking archfiend"))) {
      const hasOtherArchfiend = (observation.ownMonsters ?? []).some((m) => {
        const mName = String(m?.name ?? "").toLowerCase();
        return mName.includes("archfiend") && (m?.faceUp || (Number(m?.position) & 1) !== 0);
      });
      if (!hasOtherArchfiend) {
        const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSetAlt) return "TERRORKING_REQUIRES_ARCHFIEND_ON_FIELD_PREFER_SET";
        return "TERRORKING_REQUIRES_ARCHFIEND_ON_FIELD";
      }
    }

    // 2. Falling Down: Requires Archfiend on field and opponent monster target
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (FALLING_DOWN_CODES.has(code) || name.includes("falling down")) {
        const hasArchfiend = (observation.ownMonsters ?? []).some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return mName.includes("archfiend") && (m?.faceUp || (Number(m?.position) & 1) !== 0);
        });
        const oppMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0);
        if (!hasArchfiend || oppMonsters === 0) {
          return "FALLING_DOWN_REQUIRES_ARCHFIEND_AND_TARGET";
        }
      }
    }

    return null;
  }
});

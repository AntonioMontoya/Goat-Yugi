import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ARSENAL_BUG_CODES = new Set([23058851, 35058851]);
const PINCH_HOPPER_CODES = new Set([26185991, 504700021]);
const SCORPION_CODES = new Set([88032456, 504700022]);
const SCARABS_CODES = new Set([15383415, 504700023]);
const LOCUSTS_CODES = new Set([41872150, 504700024]);

export default createDeckGuardrail({
  id: "goatformat-insect",
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

    // 1. Arsenal Bug: Veto summoning alone in ATK without other Insect (drops to 1000 ATK)
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "summon") {
      if (ARSENAL_BUG_CODES.has(code) || name.includes("arsenal bug")) {
        const hasOtherInsect = ownMonsters.some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return mName.includes("insect") || mName.includes("beetle") || mName.includes("hopper") || mName.includes("scorpion");
        });
        if (!hasOtherInsect && !isImmediateLethal(context)) {
          const canSet = evaluated.some((other) => other !== entry && other.analysis?.role === "monster-set");
          if (canSet) return "ARSENAL_BUG_NEEDS_INSECT_SUPPORT_PREFER_SET";
        }
      }
    }

    // 2. Pinch Hopper: Don't suicide attack or sacrifice if no Insect in hand to summon
    if (PINCH_HOPPER_CODES.has(code) || name.includes("pinch hopper")) {
      const handHasInsect = (observation.ownHand ?? []).some((h) => {
        const hName = String(h?.name ?? "").toLowerCase();
        return (hName.includes("insect") || hName.includes("scorpion") || hName.includes("arsenal bug")) && !PINCH_HOPPER_CODES.has(codeOf(h));
      });
      if (role === "attack" && !handHasInsect) {
        const oppMonsters = (observation.opponentMonsters ?? []).filter((m) => m?.faceUp);
        const wouldDie = oppMonsters.some((m) => Number(m.attack ?? m.atk ?? 0) > 1000);
        if (wouldDie) {
          return "PINCH_HOPPER_AVOID_EMPTY_HAND_SUICIDE";
        }
      }
    }

    // 3. Swarm of Scarabs / Locusts: Re-set in MP2 after activating effect
    const phase = Number(observation.phase) || 0;
    const isMain2 = (phase & OcgPhase.MAIN2) !== 0 || phase === OcgPhase.MAIN2 || phase === 8;
    if (isMain2 && role === "position-change" && (SCARABS_CODES.has(code) || LOCUSTS_CODES.has(code) || name.includes("swarm of"))) {
      // Re-setting face-down in MP2 is optimal play for flip-flop monsters
      return null;
    }

    return null;
  }
});

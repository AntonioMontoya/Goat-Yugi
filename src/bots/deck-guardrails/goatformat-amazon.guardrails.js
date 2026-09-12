import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SWORDS_WOMAN_CODES = new Set([15951532, 504700130]);
const ARCHERS_CODES = new Set([67987611, 504700131]);
const SPELLCASTER_CODES = new Set([72520073, 504700132]);

export default createDeckGuardrail({
  id: "goatformat-amazon",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Amazoness Swords Woman: Maximize damage reflection
    if (role === "attack" && (SWORDS_WOMAN_CODES.has(code) || name.includes("swords woman"))) {
      const oppMonsters = observation.opponentMonsters ?? [];
      const oppFaceUpAttack = oppMonsters.filter((m) => (Number(m?.position) & 1) !== 0 && Number(m?.attack ?? m?.atk ?? 0) > 1500);
      const hasSuperiorAttackTarget = oppFaceUpAttack.length > 0;
      // If there is an attack-position monster with superior ATK, attacking an inferior or defense monster wastes reflection
      if (entry.analysis?.reasons?.includes("ATTACK_INTO_DEFENSE") && hasSuperiorAttackTarget) {
        return "SWORDS_WOMAN_PREFER_SUPERIOR_ATTACK_TARGET";
      }
    }

    // 2. Amazoness Archers Trigger: Always activate when legal on opponent attack
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (ARCHERS_CODES.has(code) || name.includes("amazoness archers")) {
        return null;
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, createDeckGuardrail } from "./base-deck-guardrail.js";

const WAVE_MOTION_CANNON_CODE = 38992735;
const LAVA_GOLEM_CODE = 102380;
const BATTLE_LOCK_CODES = new Set([85742772, 3136426, 44656491]); // Gravity Bind, Level Limit, Messenger of Peace

export default createDeckGuardrail({
  id: "goatformat-burn",
  tier: "Tier 3",
  playstyle: "burn",
  riskTolerance: 0.80,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const cardId = codeOf(card) || primaryCode(entry);

    // 1. Hold Wave-Motion Cannon until lethal or under threat
    if (["activate", "chain"].includes(role) && cardId === WAVE_MOTION_CANNON_CODE) {
      const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
      const selected = message?.activates?.[Number(entry.candidate?.index)];
      const isFieldActivation = Number(selected?.location) === OcgLocation.SZONE
        || (observation.ownBackrow ?? []).some((c) => codeOf(c) === WAVE_MOTION_CANNON_CODE && isCardActiveFaceUp(c) && c?.sequence === selected?.sequence);
      if (isFieldActivation) {
        const instance = (observation.ownBackrow ?? []).find((c) => codeOf(c) === WAVE_MOTION_CANNON_CODE && isCardActiveFaceUp(c));
        const turnsActive = Number(instance?.turnsActive ?? instance?.turns ?? instance?.standbyCount ?? 0) || Math.max(1, Math.floor((Number(observation.turn) || 1) / 2));
        const estimatedDamage = turnsActive * 1000;
        const oppLp = Number(observation.opponentLp) || 8000;
        const isUnderThreat = (observation.publicChain ?? []).some((ch) => controllerOf(ch) !== Number(observation.player));
        if (estimatedDamage < oppLp && !isUnderThreat) {
          const canHold = evaluated.some((other) => other !== entry && ["end-phase", "to-bp", "pass-chain"].includes(other.analysis?.role));
          if (canHold) return "HOLD_WAVE_MOTION_UNTIL_LETHAL";
        }
      }
    }

    // 2. Lava Golem requires battle lock
    if (role === "special-summon" && cardId === LAVA_GOLEM_CODE) {
      const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
      const hasActiveLock = (observation.ownBackrow ?? []).some((c) => isCardActiveFaceUp(c) && BATTLE_LOCK_CODES.has(codeOf(c)))
        || (observation.opponentBackrow ?? []).some((c) => isCardActiveFaceUp(c) && BATTLE_LOCK_CODES.has(codeOf(c)));
      const oppLp = Number(observation.opponentLp) || 8000;
      if (!hasActiveLock && oppLp > 1000) {
        const canHold = evaluated.some((other) => other !== entry && other.analysis?.role !== "special-summon");
        if (canHold) return "LAVA_GOLEM_REQUIRES_LOCK";
      }
    }

    return null;
  },
});

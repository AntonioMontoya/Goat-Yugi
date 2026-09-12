import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MUDORA_CODES = new Set([82103466]);
const VENUS_CODES = new Set([64734921]);
const SHINE_BALL_CODES = new Set([39552864]);

export default createDeckGuardrail({
  id: "goatformat-fairy-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Mudora: Invocación en Ataque prioritaria para aprovechar el boost de Hadas en cementerio
    if (MUDORA_CODES.has(code) || name.includes("mudora")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "MUDORA_PREFER_ATTACK_SUMMON";
      }
    }

    // 2. The Agent of Creation - Venus: Desplegar Mystical Shine Balls
    if (VENUS_CODES.has(code) || name.includes("venus")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      if (role === "activate" && ownLp > 1000) return null;
    }

    // 3. Shining Angel: Priorizar Set defensivo
    if (name.includes("shining angel")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "ANGEL_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

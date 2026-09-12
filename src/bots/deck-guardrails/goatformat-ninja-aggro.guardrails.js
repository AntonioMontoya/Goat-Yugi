import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const TRANSFORMATION_CODES = new Set([70865988]);
const BIG_KOALA_CODES = new Set([42129512]);
const SASUKE_CODES = new Set([4838048]);
const STRIKE_NINJA_CODES = new Set([41006930]);

export default createDeckGuardrail({
  id: "goatformat-ninja-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Ninjitsu Art of Transformation: Set en retaguardia y activación para traer a Big Koala (2700 ATK)
    if (TRANSFORMATION_CODES.has(code) || name.includes("transformation")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasNinja = ownMonsters.some((m) => {
          const mCode = codeOf(m);
          const mName = String(m?.name ?? "").toLowerCase();
          return (SASUKE_CODES.has(mCode) || STRIKE_NINJA_CODES.has(mCode) || mName.includes("ninja")) && !m.faceDown;
        });
        if (hasNinja) return null; // Invocación demoledora de Big Koala
      }
    }

    // 2. Big Koala: Prohibir invocación normal por 2 sacrificios o Set defensivo
    if (BIG_KOALA_CODES.has(code) || name.includes("big koala")) {
      if (role === "monster-set" || role === "summon") {
        return "SUMMON_BIG_KOALA_VIA_TRANSFORMATION";
      }
    }

    // 3. Ninjas (Sasuke, Strike Ninja): Prohibir Set defensivo, invocar en Ataque
    if (SASUKE_CODES.has(code) || STRIKE_NINJA_CODES.has(code) || name.includes("ninja")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "NINJA_PREFER_ATTACK_SUMMON";
      }
    }

    return null;
  }
});

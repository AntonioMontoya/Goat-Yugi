import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const EMISSARY_CODES = new Set([75043725, 100883224]); // Emissary of the Afterlife
const SONIC_DUCK_CODES = new Set([48649353, 1114020160]); // Sonic Duck
const DARK_FACTORY_CODES = new Set([90928333, 909645543]); // Dark Factory of Mass Production
const MOBIUS_CODES = new Set([4929256, 815295895]); // Mobius the Frost Monarch
const DUSTSHOOT_CODES = new Set([42233562, 1924046397]); // Trap Dustshoot

export default createDeckGuardrail({
  id: "goatformat-emissary-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Sonic Duck: Beater principal de 1700 ATK
    if (SONIC_DUCK_CODES.has(code) || name.includes("sonic duck")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "SONIC_DUCK_PREFER_ATTACK_SUMMON";
      }
    }

    // 2. Dark Factory of Mass Production: Recuperar 2 Sonic Ducks del cementerio
    if (DARK_FACTORY_CODES.has(code) || name.includes("dark factory")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_DARK_FACTORY";
      }
    }

    // 3. Mobius the Frost Monarch: Invocación por tributo para destruir 2 magias/trampas
    if (MOBIUS_CODES.has(code) || name.includes("mobius")) {
      if (role === "tribute-summon") {
        return null;
      }
    }

    // 4. Trap Dustshoot: Retornar monstruo cuando rival tenga >= 4 cartas
    if (DUSTSHOOT_CODES.has(code) || name.includes("dustshoot")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") {
        const oppHand = Number(observation.opponentHandCount ?? 0);
        if (oppHand < 4) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_DUSTSHOOT_UNTIL_OPPONENT_HAND_GE_4";
        }
      }
    }

    return null;
  }
});

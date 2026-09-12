import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const BLADE_KNIGHT_CODES = new Set([39774685, 1939596702]); // Blade Knight
const SKILLED_DARK_CODES = new Set([73752131, 386828130]); // Skilled Dark Magician
const DEKOICHI_CODES = new Set([87621407, 448641072]); // Dekoichi
const CHAOS_SORCERER_CODES = new Set([9596126, 651970296]); // Chaos Sorcerer
const DUSTSHOOT_CODES = new Set([42233562, 1924046397]); // Trap Dustshoot

export default createDeckGuardrail({
  id: "goatformat-chaos-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Blade Knight y Skilled Dark Magician: Beaters de 1900-2000 ATK
    if (BLADE_KNIGHT_CODES.has(code) || SKILLED_DARK_CODES.has(code) || name.includes("blade knight") || name.includes("skilled dark")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "CHAOS_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 2. Dekoichi: Robo por efecto Flip. Priorizar Set en defensa
    if (DEKOICHI_CODES.has(code) || name.includes("dekoichi")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "DEKOICHI_PREFER_SET_DEFENSE";
      }
    }

    // 3. Chaos Sorcerer: Desterrar monstruos boca arriba
    if (CHAOS_SORCERER_CODES.has(code) || name.includes("chaos sorcerer")) {
      if (role === "special-summon") return null;
      if (role === "activate") return null; // Activar destierro de monstruos rivales
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

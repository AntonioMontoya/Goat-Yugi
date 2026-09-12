import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const GORILLA_CODES = new Set([39168895, 165860383]); // Berserk Gorilla
const GRACEFUL_DICE_CODES = new Set([74131780, 527953185]); // Graceful Dice
const NEEDLE_WALL_CODES = new Set([38299233, 1535259446]); // Needle Wall
const MOMONGA_CODES = new Set([22567609, 1243908078]); // Nimble Momonga
const ROULETTE_CODES = new Set([40575313, 1826847723]); // Roulette Barrel

export default createDeckGuardrail({
  id: "goatformat-dice-re-roll",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.60,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Berserk Gorilla: PROHIBIDO COLOCAR EN DEFENSA
    if (GORILLA_CODES.has(code) || name.includes("berserk gorilla")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "NEVER_SET_BERSERK_GORILLA";
      }
    }

    // 2. Graceful Dice: Magia de juego rápido para potenciar ATK en combate
    if (GRACEFUL_DICE_CODES.has(code) || name.includes("graceful dice")) {
      const phase = observation.phase;
      if (role === "activate") {
        const isBattle = phase === OcgPhase.PHASE_BATTLE || phase === OcgPhase.PHASE_DAMAGE || phase === OcgPhase.PHASE_DAMAGE_CAL;
        const lethal = isImmediateLethal(entry, observation);
        if (!isBattle && !lethal) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_GRACEFUL_DICE_FOR_COMBAT";
        }
        return null;
      }
    }

    // 3. Needle Wall: Trampa continua para destruir monstruos rivales en Standby
    if (NEEDLE_WALL_CODES.has(code) || name.includes("needle wall")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") return null;
    }

    // 4. Nimble Momonga: Flotador y ganancia de 1000 LP
    if (MOMONGA_CODES.has(code) || name.includes("momonga")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MOMONGA_PREFER_SET_DEFENSE";
      }
    }

    // 5. Roulette Barrel: Destrucción por dados
    if (ROULETTE_CODES.has(code) || name.includes("roulette")) {
      if (role === "activate") return null;
    }

    return null;
  }
});

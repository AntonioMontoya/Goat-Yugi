import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LIMITER_CODES = new Set([23171610, 909009755]); // Limiter Removal
const CHASER_CODES = new Set([79575620, 2]); // Mechanicalchaser
const XHEAD_CODES = new Set([62651957, 1927113637]); // X-Head Cannon
const DEKOICHI_CODES = new Set([87621407, 448641072]); // Dekoichi
const TURTLE_CODES = new Set([23205979, 123752463]); // UFO Turtle
const DRILLAGO_CODES = new Set([99050989, 1380340131]); // Drillago

export default createDeckGuardrail({
  id: "goatformat-machine-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Limiter Removal: Duplica ATK de máquinas en campo pero las destruye en la End Phase
    if (LIMITER_CODES.has(code) || name.includes("limiter removal")) {
      const phase = observation.phase;
      // Prohibir activación en Main Phase 1 fuera de combate para no autodestruir el campo en vano
      if (role === "activate") {
        const isBattle = phase === OcgPhase.PHASE_BATTLE || phase === OcgPhase.PHASE_DAMAGE || phase === OcgPhase.PHASE_DAMAGE_CAL;
        const lethal = isImmediateLethal(entry, observation);
        if (!isBattle && !lethal) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_LIMITER_REMOVAL_FOR_BATTLE_OR_LETHAL";
        }
        return null;
      }
    }

    // 2. Mechanicalchaser y X-Head Cannon: Beaters principales 1800-1850 ATK
    if (CHASER_CODES.has(code) || XHEAD_CODES.has(code) || name.includes("mechanicalchaser") || name.includes("x-head")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "MACHINE_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Dekoichi: Efecto Flip para robar carta. Priorizar Set en defensa
    if (DEKOICHI_CODES.has(code) || name.includes("dekoichi")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "DEKOICHI_PREFER_SET_DEFENSE";
      }
    }

    // 4. UFO Turtle: Reclutador de máquinas. Priorizar Set en defensa
    if (TURTLE_CODES.has(code) || name.includes("turtle")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "UFO_TURTLE_PREFER_SET_DEFENSE";
      }
    }

    // 5. Drillago: Atacante directo si rival sólo tiene monstruos >= 1600 ATK
    if (DRILLAGO_CODES.has(code) || name.includes("drillago")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "DRILLAGO_PREFER_ATTACK_SUMMON";
      }
    }

    return null;
  }
});

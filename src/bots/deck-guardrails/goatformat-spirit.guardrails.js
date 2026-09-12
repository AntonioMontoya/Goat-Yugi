import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SUSA_SOLDIER_CODES = new Set([40473581]);
const ASURA_PRIEST_CODES = new Set([47529357]);
const TSUKUYOMI_CODES = new Set([34853266]);
const DEFENSIVE_TRAPS = new Set([
  44095762, // Mirror Force
  53582587, // Torrential Tribute
  70828912, // Sakuretsu Armor
  73915051, // Scapegoat
  77754944  // Widespread Ruin
]);

export default createDeckGuardrail({
  id: "goatformat-spirit",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.60,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Monstruos Spirit (Asura Priest, Susa Soldier, Tsukuyomi): Prohibir Set defensivo
    if (ASURA_PRIEST_CODES.has(code) || SUSA_SOLDIER_CODES.has(code) || TSUKUYOMI_CODES.has(code) || name.includes("asura") || name.includes("susa") || name.includes("tsukuyomi")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "SPIRIT_PREFER_FACE_UP_SUMMON";
      }
    }

    // 2. Susa Soldier: Invocación normal de 2000 ATK prioritaria para superar monstruos estándar
    if (SUSA_SOLDIER_CODES.has(code) || name.includes("susa soldier")) {
      if (role === "summon") return null;
    }

    // 3. Mandato de defensa de retaguardia: Los Spirits regresan a la mano al final del turno
    // Se debe colocar obligatoriamente trampas defensivas antes de pasar turno
    if ((role === "main-two" || role === "end-phase" || role === "to-next-phase") && observation.isOwnTurn) {
      const hand = observation.ownHand ?? [];
      const hasDefensiveTrap = hand.some((c) => {
        const cCode = codeOf(c);
        const cName = String(c?.name ?? "").toLowerCase();
        return DEFENSIVE_TRAPS.has(cCode) || cName.includes("sakuretsu") || cName.includes("scapegoat") || cName.includes("widespread");
      });
      if (hasDefensiveTrap) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (canSet) return "SET_DEFENSE_TRAP_BEFORE_SPIRIT_RETURNS_TO_HAND";
      }
    }

    return null;
  }
});

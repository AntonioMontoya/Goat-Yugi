import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const PIXIE_KNIGHT_CODES = new Set([79777180, 165840205]); // Pixie Knight
const PWWB_CODES = new Set([63356631, 679732937]); // Phoenix Wing Wind Blast
const ANGEL_CODES = new Set([44428367, 29157826]); // Shining Angel
const THUNDER_DRAGON_CODES = new Set([31786629, 15]); // Thunder Dragon

export default createDeckGuardrail({
  id: "goatformat-pixie-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.45,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Pixie Knight: Al ser destruido en batalla recupera una magia del cementerio al tope del mazo
    if (PIXIE_KNIGHT_CODES.has(code) || name.includes("pixie knight")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "PIXIE_KNIGHT_PREFER_SET_DEFENSE";
      }
    }

    // 2. Thunder Dragon: Activar en mano para adelgazar el mazo y obtener munición de descarte / luz en GY
    if (THUNDER_DRAGON_CODES.has(code) || name.includes("thunder dragon")) {
      if (role === "activate") {
        return null; // Prioridad alta de activación
      }
    }

    // 3. Shining Angel: Reclutador de luz para tutorear Pixie Knight o D.D. Warrior Lady
    if (ANGEL_CODES.has(code) || name.includes("shining angel")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "SHINING_ANGEL_PREFER_SET";
      }
    }

    // 4. Phoenix Wing Wind Blast: Congelar robo rival enviando carta clave al tope
    if (PWWB_CODES.has(code) || name.includes("wind blast")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") return null;
    }

    return null;
  }
});

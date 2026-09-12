import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const PHOENIX_CODES = new Set([61441708]);
const HAND_OF_NEPHTHYS_CODES = new Set([98446407]);
const APPRENTICE_CODES = new Set([21481146]);

export default createDeckGuardrail({
  id: "goatformat-sacred-phoenix",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Sacred Phoenix of Nephthys: Prohibir Set y regular tributo
    if (PHOENIX_CODES.has(code) || name.includes("sacred phoenix")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "PHOENIX_MUST_BE_FACE_UP";
      }
    }

    // 2. Hand of Nephthys: Prioridad a tributar para invocar al Fénix desde Deck
    if (HAND_OF_NEPHTHYS_CODES.has(code) || name.includes("hand of nephthys")) {
      if (role === "activate") {
        return null; // Prioridad para disparar la invocación especial de 2400 ATK
      }
    }

    // 3. Apprentice Magician: Set defensivo para buscar Hand of Nephthys
    if (APPRENTICE_CODES.has(code) || name.includes("apprentice magician")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "APPRENTICE_PREFER_SET_DEFENSE";
      }
    }

    // 4. Gestión de retaguardia: Si el Fénix está en el cementerio listo para renacer, no sobrecargar trampas
    const gy = observation.ownGraveyard ?? [];
    const phoenixInGy = gy.some((c) => PHOENIX_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("phoenix"));
    if (phoenixInGy && role === "spell-set") {
      const spells = observation.ownSpells ?? [];
      if (spells.length >= 2) {
        return "HOLD_TRAPS_BEFORE_PHOENIX_WIPES_FIELD";
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MANTICORE_CODES = new Set([77084837]);
const CARD_SAFE_RETURN_CODES = new Set([57953380]);
const BERSERK_GORILLA_CODES = new Set([39168895]);

export default createDeckGuardrail({
  id: "goatformat-manticore-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Manticore of Darkness: Prohibir Set y activar reanimación en End Phase
    if (MANTICORE_CODES.has(code) || name.includes("manticore")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "MANTICORE_MUST_BE_FACE_UP";
      }

      if (role === "activate" || role === "special-summon") {
        return null; // Prioridad revivir en End Phase con 2300 ATK
      }
    }

    // 2. Card of Safe Return: Activar boca arriba de inmediato para robar con la resurrección de Manticore
    if (CARD_SAFE_RETURN_CODES.has(code) || name.includes("card of safe return")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_SAFE_RETURN_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 3. Berserk Gorilla: Prohibir cambio a defensa que lo autodestruiría
    if (BERSERK_GORILLA_CODES.has(code) || name.includes("berserk gorilla")) {
      if (role === "pos-change" && entry.analysis?.targetPosition === OcgPosition.DEFENSE) {
        return "BERSERK_GORILLA_CANNOT_CHANGE_TO_DEFENSE";
      }
    }

    return null;
  }
});

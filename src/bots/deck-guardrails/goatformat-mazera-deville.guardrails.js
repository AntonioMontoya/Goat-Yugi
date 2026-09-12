import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MAZERA_DEVILLE_CODES = new Set([6133894]);
const WARRIOR_OF_ZERA_CODES = new Set([66073051]);
const PANDEMONIUM_CODES = new Set([94585852]);

export default createDeckGuardrail({
  id: "goatformat-mazera-deville",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Pandemonium: Activar en zona de campo, nunca setear boca abajo
    if (PANDEMONIUM_CODES.has(code) || name.includes("pandemonium")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_PANDEMONIUM_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Warrior of Zera: Invocación boca arriba para servir como tributo de Mazera
    if (WARRIOR_OF_ZERA_CODES.has(code) || name.includes("warrior of zera")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "ZERA_PREFER_FACE_UP_FOR_MAZERA";
      }
    }

    // 3. Mazera DeVille: Invocación especial de 2800 ATK y descarte de 3 cartas rivales
    if (MAZERA_DEVILLE_CODES.has(code) || name.includes("mazera deville")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "special-summon");
        if (canSummon) return "MAZERA_DEVILLE_CANNOT_BE_SET";
      }
      if (role === "special-summon") return null; // Prioridad máxima de invocación demoledora
    }

    return null;
  }
});

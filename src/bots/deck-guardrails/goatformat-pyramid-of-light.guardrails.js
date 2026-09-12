import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const PYRAMID_CODES = new Set([53569894]);
const SPHINX_CODES = new Set([
  15013468, // Andro Sphinx
  51402177, // Sphinx Teleia
  87997872  // Theinen the Great Sphinx
]);

export default createDeckGuardrail({
  id: "goatformat-pyramid-of-light",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const hasPyramidActive = ownBackrow.some(
      (s) => (PYRAMID_CODES.has(codeOf(s)) || String(s?.name ?? "").toLowerCase().includes("pyramid of light")) && !s.faceDown
    );

    // 1. Pyramid of Light: Gestión de activación continua y LP
    if (PYRAMID_CODES.has(code) || name.includes("pyramid of light")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      if (role === "spell-set") {
        return null; // Colocar en retaguardia
      }
      if (role === "activate" || role === "chain") {
        if (ownLp <= 1000) return "PYRAMID_OF_LIGHT_LP_TOO_LOW";
        return null;
      }
    }

    // 2. Monstruos Sphinx de Nivel 10: Invocación especial en Ataque con Pyramid of Light
    if (SPHINX_CODES.has(code) || name.includes("sphinx")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "SPHINX_MUST_BE_FACE_UP";
      }

      if (hasPyramidActive) {
        if (role === "special-summon" || role === "summon") return null; // Máxima prioridad a bajar titanes de 3000+ ATK
        if (role === "attack") return null;
      }

      if (!hasPyramidActive && role === "summon" && (observation.ownMonsters ?? []).length < 2) {
        return "SPHINX_REQUIRE_PYRAMID_OR_TWO_TRIBUTES";
      }
    }

    // 3. Proteger la pirámide con Fake Trap o Solemn antes de pasar de turno
    if ((role === "main-two" || role === "end-phase" || role === "to-next-phase") && observation.isOwnTurn) {
      const hand = observation.ownHand ?? [];
      const hasProtection = hand.some((c) => {
        const cName = String(c?.name ?? "").toLowerCase();
        return cName.includes("fake trap") || cName.includes("solemn");
      });
      if (hasProtection) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (canSet) return "SET_PROTECTION_TRAPS_FOR_PYRAMID";
      }
    }

    return null;
  }
});

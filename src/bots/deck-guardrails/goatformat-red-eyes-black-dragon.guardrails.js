import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const RED_EYES_CODES = new Set([74677422]);
const CHICK_CODES = new Set([36261276]); // Black Dragon's Chick
const INFERNO_FIRE_BLAST_CODES = new Set([52684508]);

export default createDeckGuardrail({
  id: "goatformat-red-eyes-black-dragon",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Black Dragon's Chick: Invocación y activación prioritaria para invocar Red-Eyes
    if (CHICK_CODES.has(code) || name.includes("chick")) {
      if (role === "summon" || role === "activate") {
        return null; // Acelerar la salida de Red-Eyes
      }
    }

    // 2. Red-Eyes Black Dragon: Prohibir setearlo y restringir invocación normal de 2 sacrificios si hay Chick
    if (RED_EYES_CODES.has(code) || name.includes("red-eyes black dragon")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "RED_EYES_MUST_BE_FACE_UP";
      }

      if (role === "summon" && (observation.ownMonsters ?? []).length < 2) {
        return "RED_EYES_REQUIRE_CHICK_OR_TWO_TRIBUTES";
      }
    }

    // 3. Inferno Fire Blast: Activar prioritariamente si inflige daño letal (2400 burn) o en Main 2
    if (INFERNO_FIRE_BLAST_CODES.has(code) || name.includes("inferno fire blast")) {
      const oppLp = Number(observation.opponentLp ?? 8000);
      if (role === "activate") {
        if (oppLp <= 2400) return null; // Letal garantizado
        if (observation.phase === OcgPhase.MAIN2) return null;
      }
    }

    return null;
  }
});

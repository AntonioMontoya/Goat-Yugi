import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ZORC_CODES = new Set([97642679]);
const CONTRACT_ABYSS_CODES = new Set([69026240]);

export default createDeckGuardrail({
  id: "goatformat-zorc",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Dark Master - Zorc: Gestión de invocación y tiro de dado seguro
    if (ZORC_CODES.has(code) || name.includes("zorc")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "ZORC_MUST_BE_FACE_UP";
      }

      if (role === "activate") {
        const oppMonsters = (observation.opponentMonsters ?? []).length;
        // No arriesgar el dado si el oponente no tiene monstruos en campo
        if (oppMonsters === 0) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_ZORC_DICE_WHEN_OPPONENT_EMPTY";
        }
        return null;
      }
    }

    // 2. Contract with the Abyss: Invocación ritual
    if (CONTRACT_ABYSS_CODES.has(code) || name.includes("contract with the abyss")) {
      if (role === "activate") return null;
    }

    // 3. Manju / Senju / Sonic Bird: Invocación prioritaria para buscar piezas
    if (name.includes("manju") || name.includes("senju") || name.includes("sonic bird")) {
      if (role === "summon") return null;
    }

    // 4. Thunder Dragon: Descartar de inmediato para alimentar cementerio LIGHT
    if (name.includes("thunder dragon") && role === "activate") {
      return null;
    }

    return null;
  }
});

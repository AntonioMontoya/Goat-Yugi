import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const DORIADO_CODES = new Set([69293721]);
const FUH_RIN_KA_ZAN_CODES = new Set([16430187]);
const BLESSING_CODES = new Set([41587307]);

export default createDeckGuardrail({
  id: "goatformat-doriado",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Fuh-Rin-Ka-Zan: Activar únicamente si Elemental Mistress Doriado está boca arriba en campo
    if (FUH_RIN_KA_ZAN_CODES.has(code) || name.includes("fuh-rin-ka-zan")) {
      if (role === "spell-set") {
        return null; // Prioridad colocarla para que esté lista
      }
      if (role === "activate" || role === "chain") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasDoriadoFaceUp = ownMonsters.some((m) => {
          const mCode = codeOf(m);
          const mName = String(m?.name ?? "").toLowerCase();
          return (DORIADO_CODES.has(mCode) || mName.includes("doriado")) && !m.faceDown;
        });

        if (hasDoriadoFaceUp) {
          return null; // Condición cumplida: activar efecto demoledor
        }
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_FUH_RIN_KA_ZAN_UNTIL_DORIADO_FACE_UP";
      }
    }

    // 2. Elemental Mistress Doriado: Prohibir setear o cambiar a boca abajo si Fuh-Rin-Ka-Zan está en juego
    if (DORIADO_CODES.has(code) || name.includes("doriado")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "DORIADO_MUST_BE_FACE_UP";
      }
    }

    // 3. Manju / Senju: Invocación prioritaria para buscar piezas del ritual
    if (name.includes("manju") || name.includes("senju")) {
      if (role === "summon") return null;
    }

    // 4. Mask of Darkness: Set defensivo para reciclar Fuh-Rin-Ka-Zan o Solemn
    if (name.includes("mask of darkness")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MASK_OF_DARKNESS_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

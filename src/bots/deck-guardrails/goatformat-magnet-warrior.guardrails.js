import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const VALKYRION_CODES = new Set([75347539]);
const DARK_FACTORY_CODES = new Set([90928333]);
const ROCK_BOMBARDMENT_CODES = new Set([20474741]);

export default createDeckGuardrail({
  id: "goatformat-magnet-warrior",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Valkyrion the Magna Warrior: Gestión de 3500 ATK y prohibición de Set
    if (VALKYRION_CODES.has(code) || name.includes("valkyrion")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "VALKYRION_MUST_BE_FACE_UP";
      }

      if (role === "special-summon") {
        return null; // Prioridad máxima para poner en mesa al beater de 3500 ATK
      }

      // No desensamblar a Valkyrion en Main 1 si puede golpear con 3500
      if (role === "activate" && observation.phase === OcgPhase.MAIN1) {
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_VALKYRION_SPLIT_FOR_BATTLE_OR_CHAIN";
      }
    }

    // 2. Dark Factory of Mass Production: Recuperar Magnet Warriors normales del cementerio
    if (DARK_FACTORY_CODES.has(code) || name.includes("dark factory")) {
      if (role === "activate") return null;
    }

    // 3. Rock Bombardment: Enviar Magnet Warrior al cementerio para alimentar Dark Factory
    if (ROCK_BOMBARDMENT_CODES.has(code) || name.includes("rock bombardment")) {
      if (role === "activate" || role === "chain") return null;
    }

    return null;
  }
});

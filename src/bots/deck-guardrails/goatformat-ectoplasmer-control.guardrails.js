import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ECTOPLASMER_CODES = new Set([97342942, 1687162608]); // Ectoplasmer
const MALICE_DOLL_CODES = new Set([40410110, 436516279]); // Malice Doll of Demise
const COSR_CODES = new Set([57953380, 1211722853]); // Card of Safe Return
const MOBIUS_CODES = new Set([4929256, 815295895]); // Mobius the Frost Monarch

export default createDeckGuardrail({
  id: "goatformat-ectoplasmer-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Ectoplasmer: Tributo obligatorio en End Phase para infligir la mitad del ATK como daño
    if (ECTOPLASMER_CODES.has(code) || name.includes("ectoplasmer")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_ECTOPLASMER_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Card of Safe Return: Robar carta al revivir monstruos del cementerio (Malice Doll / Revival Jam)
    if (COSR_CODES.has(code) || name.includes("card of safe return")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_COSR_PRIORITY";
      }
      if (role === "activate") return null;
    }

    // 3. Malice Doll of Demise: 1600 ATK que revive automáticamente en la siguiente Standby si fue tributado por Ectoplasmer
    if (MALICE_DOLL_CODES.has(code) || name.includes("malice doll")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "MALICE_DOLL_PREFER_ATTACK_SUMMON";
      }
    }

    // 4. Mobius the Frost Monarch: Tributo para destruir 2 magias/trampas
    if (MOBIUS_CODES.has(code) || name.includes("mobius")) {
      if (role === "tribute-summon") {
        return null;
      }
    }

    return null;
  }
});

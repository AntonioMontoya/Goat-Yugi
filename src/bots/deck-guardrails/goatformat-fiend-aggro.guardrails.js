import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const NECROFEAR_CODES = new Set([31829185, 1338494222]); // Dark Necrofear
const HA_DES_CODES = new Set([53982768, 404077296]); // Dark Ruler Ha Des
const GIANT_ORC_CODES = new Set([73698449, 1393347900]); // Giant Orc
const GIANT_GERM_CODES = new Set([95178994, 869434931]); // Giant Germ
const NIGHT_ASSAILANT_CODES = new Set([41398771, 313719195]); // Night Assailant

export default createDeckGuardrail({
  id: "goatformat-fiend-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Dark Necrofear: Invocación especial desterrando 3 Demonios del cementerio
    if (NECROFEAR_CODES.has(code) || name.includes("necrofear")) {
      if (role === "special-summon") {
        return null; // Prioridad máxima de invocación boss
      }
    }

    // 2. Dark Ruler Ha Des: 2450 ATK. Anula efectos flip y de cementerio destruidos por demonios
    if (HA_DES_CODES.has(code) || name.includes("ha des")) {
      if (role === "tribute-summon") {
        return null; // Priorizar tributo de monstruos usados/germs
      }
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "tribute-summon");
        if (canSummon) return "HA_DES_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Giant Orc: Beater de 2200 ATK de nivel 4
    if (GIANT_ORC_CODES.has(code) || name.includes("giant orc")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "GIANT_ORC_PREFER_ATTACK_SUMMON";
      }
    }

    // 4. Giant Germ y Night Assailant: Reclutamiento/daño o remoción flip en defensa
    if (GIANT_GERM_CODES.has(code) || NIGHT_ASSAILANT_CODES.has(code) || name.includes("giant germ") || name.includes("night assailant")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "FIEND_FLOAT_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

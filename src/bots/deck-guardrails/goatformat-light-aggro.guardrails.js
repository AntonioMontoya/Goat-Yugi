import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LUMINOUS_SPARK_CODES = new Set([81777047]);
const SOUL_PURITY_CODES = new Set([15653824]);
const BLADE_KNIGHT_CODES = new Set([39507162]);

export default createDeckGuardrail({
  id: "goatformat-light-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Luminous Spark: Activar en zona de campo para +500 ATK a todos los LUZ
    if (LUMINOUS_SPARK_CODES.has(code) || name.includes("luminous spark")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_LUMINOUS_SPARK_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Blade Knight: Invocación en Ataque para aprovechar su efecto y 2100 ATK bajo campo
    if (BLADE_KNIGHT_CODES.has(code) || name.includes("blade knight")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "BLADE_KNIGHT_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Soul of Purity and Light: Invocación especial desterrando 2 LUZ del cementerio
    if (SOUL_PURITY_CODES.has(code) || name.includes("soul of purity")) {
      if (role === "special-summon") return null;
      if (role === "summon") return "SUMMON_SOUL_OF_PURITY_VIA_SPECIAL_SUMMON";
    }

    // 4. Thunder Dragon: Descartar inmediatamente para poblar cementerio con 2 LUZ
    if (name.includes("thunder dragon") && role === "activate") return null;

    return null;
  }
});

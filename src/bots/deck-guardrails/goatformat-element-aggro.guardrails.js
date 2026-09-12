import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HOMUNCULUS_CODES = new Set([43417563, 834600002]); // Homunculus the Alchemic Being
const ELEMENT_DRAGON_CODES = new Set([30398342, 614655182]); // Element Dragon
const ELEMENT_SAURUS_CODES = new Set([89960008, 1135523842]); // Element Saurus
const MASKED_DRAGON_CODES = new Set([39111158, 578701387]); // Masked Dragon

export default createDeckGuardrail({
  id: "goatformat-element-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Homunculus: Cambia de atributo para otorgar +500 ATK a Element Dragon/Saurus o doble ataque
    if (HOMUNCULUS_CODES.has(code) || name.includes("homunculus")) {
      if (role === "activate") {
        // Priorizar activación de cambio de atributo para activar sinergias
        return null;
      }
    }

    // 2. Element Dragon y Element Saurus: Beaters de 1500 (2000 bajo FUEGO) con doble ataque/negación
    if (ELEMENT_DRAGON_CODES.has(code) || ELEMENT_SAURUS_CODES.has(code) || name.includes("element dragon") || name.includes("element saurus")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "ELEMENT_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Masked Dragon: Reclutador de FUEGO que además activa la sinergia de los Element Monsters
    if (MASKED_DRAGON_CODES.has(code) || name.includes("masked dragon")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MASKED_DRAGON_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

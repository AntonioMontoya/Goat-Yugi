import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MOKEY_CODES = new Set([27288416]);
const SMACKDOWN_CODES = new Set([9663732]);
const VENUS_CODES = new Set([64734921]);

export default createDeckGuardrail({
  id: "goatformat-mokey-mokey-smackdown",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const hasSmackdown = ownBackrow.some((c) => SMACKDOWN_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("smackdown"));

    // 1. Mokey Mokey Smackdown: Activar de inmediato boca arriba
    if (SMACKDOWN_CODES.has(code) || name.includes("mokey mokey smackdown")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_SMACKDOWN_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Mokey Mokey: Posicionamiento según presencia de Smackdown
    if (MOKEY_CODES.has(code) || name === "mokey mokey") {
      if (hasSmackdown) {
        if (role === "monster-set") {
          const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
          if (canSummon) return "MOKEY_MOKEY_MUST_BE_FACE_UP_FOR_3000_ATK";
        }
        if (role === "attack") return null;
      }
      if (!hasSmackdown && role === "summon" && !isImmediateLethal(entry, observation)) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MOKEY_MOKEY_PREFER_SET_WITHOUT_SMACKDOWN";
      }
    }

    // 3. The Agent of Creation - Venus: Activar efecto para desplegar Shine Balls
    if (VENUS_CODES.has(code) || name.includes("venus")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      if (role === "activate" && ownLp > 1000) {
        return null; // Prioridad para poblar el campo con Hadas
      }
    }

    return null;
  }
});

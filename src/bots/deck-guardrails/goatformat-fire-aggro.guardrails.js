import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MOLTEN_DESTRUCTION_CODES = new Set([19384334]);
const SOLAR_FLARE_CODES = new Set([45985838]);
const SPIRIT_OF_FLAMES_CODES = new Set([13522325]);

export default createDeckGuardrail({
  id: "goatformat-fire-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Molten Destruction: Activar en zona de campo para +500 ATK a todos los fuego
    if (MOLTEN_DESTRUCTION_CODES.has(code) || name.includes("molten destruction")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_MOLTEN_DESTRUCTION_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Solar Flare Dragon: Debe estar boca arriba para bloqueo de ataques y 500 burn en End Phase
    if (SOLAR_FLARE_CODES.has(code) || name.includes("solar flare dragon")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "SOLAR_FLARE_MUST_BE_FACE_UP";
      }
    }

    // 3. Spirit of Flames: Invocación especial desterrando 1 FUEGO del cementerio
    if (SPIRIT_OF_FLAMES_CODES.has(code) || name.includes("spirit of flames")) {
      if (role === "special-summon") return null;
    }

    // 4. Reclutadores (UFO Turtle, Masked Dragon): Priorizar Set defensivo
    if (name.includes("turtle") || name.includes("masked dragon")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "RECRUITER_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

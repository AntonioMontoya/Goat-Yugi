import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SHINATO_CODES = new Set([86327225]);
const SHINATOS_ARK_CODES = new Set([63901069]);
const ROYAL_DECREE_CODES = new Set([51452091]);

export default createDeckGuardrail({
  id: "goatformat-shinato",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Shinato's Ark & Shinato: Prioridad de Invocación Ritual de 3300 ATK
    if (SHINATOS_ARK_CODES.has(code) || name.includes("shinato's ark")) {
      if (role === "activate") return null;
    }

    if (SHINATO_CODES.has(code) || name.includes("shinato, king")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "SHINATO_MUST_BE_FACE_UP";
      }

      // Prioridad de ataque sobre monstruos en Posición de Defensa para infligir burn equivalente al ATK
      if (role === "attack") {
        const target = entry.analysis?.target;
        if (target && target.position === OcgPosition.DEFENSE) {
          return null; // Prioridad máxima para disparar el daño letal de efecto
        }
      }
    }

    // 2. Royal Decree: Activar para neutralizar trampas antes del ataque de Shinato
    if (ROYAL_DECREE_CODES.has(code) || name.includes("royal decree")) {
      if (role === "activate" || role === "chain") return null;
    }

    // 3. Manju / Senju / Sonic Bird: Invocación prioritaria para buscar piezas rituales
    if (name.includes("manju") || name.includes("senju") || name.includes("sonic bird")) {
      if (role === "summon") return null;
    }

    return null;
  }
});

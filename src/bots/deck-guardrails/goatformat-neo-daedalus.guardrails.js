import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const NEO_DAEDALUS_CODES = new Set([37721209]);
const DAEDALUS_CODES = new Set([37721209, 37721208, 37721200]); // Levia-Dragon Daedalus
const ALO_CODES = new Set([295517]); // A Legendary Ocean

export default createDeckGuardrail({
  id: "goatformat-neo-daedalus",
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
    const hasAlo = ownBackrow.some((c) => ALO_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("legendary ocean") || String(c?.name ?? "").toLowerCase().includes("umi"));

    // 1. A Legendary Ocean: Activar en zona de campo, nunca setear
    if (ALO_CODES.has(code) || name.includes("legendary ocean") || name.includes("umi")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_ALO_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Ocean Dragon Lord - Neo-Daedalus y Levia-Dragon Daedalus: Invocación en ataque y efectos de barrido
    if (NEO_DAEDALUS_CODES.has(code) || name.includes("neo-daedalus") || name.includes("daedalus")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "DAEDALUS_MUST_BE_FACE_UP";
      }

      // Activar efecto de barrido si ALO/Umi está presente en campo (victoria inmediata)
      if (role === "activate" && hasAlo) {
        return null; // Destrucción masiva prioritaria
      }
    }

    // 3. Mother Grizzly: Priorizar Set defensivo para buscar piezas del mazo
    if (name.includes("mother grizzly")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "GRIZZLY_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

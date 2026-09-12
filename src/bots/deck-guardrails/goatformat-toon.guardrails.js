import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const TOON_WORLD_CODES = new Set([15259703]);
const MAGIC_REFLECTOR_CODES = new Set([98495314]);
const TOON_GEMINI_ELF_CODES = new Set([42386471]);
const TOON_TABLE_CODES = new Set([86318356]);
const ROYAL_DECREE_CODES = new Set([51452091]);

export default createDeckGuardrail({
  id: "goatformat-toon",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Toon World: Gestión de activación continua y LP
    if (TOON_WORLD_CODES.has(code) || name.includes("toon world")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate && ownLp > 1000) return "ACTIVATE_TOON_WORLD_INSTEAD_OF_SET";
      }
      if (role === "activate") {
        if (ownLp <= 1000) return "TOON_WORLD_LP_TOO_LOW";
        return null;
      }
    }

    // 2. Magic Reflector: Blindar Toon World inmediatamente
    if (MAGIC_REFLECTOR_CODES.has(code) || name.includes("magic reflector")) {
      if (role === "activate") return null;
    }

    // 3. Toon Table of Contents: Rotar inmediatamente
    if (TOON_TABLE_CODES.has(code) || name.includes("toon table")) {
      if (role === "activate") return null;
    }

    // 4. Toon Gemini Elf: Prohibir setearlo, convocar en ataque de 1900
    if (TOON_GEMINI_ELF_CODES.has(code) || name.includes("toon gemini elf")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "TOON_GEMINI_ELF_PREFER_ATTACK_SUMMON";
      }
    }

    // 5. Royal Decree: Activar para permitir ataques directos seguros sin trampas
    if (ROYAL_DECREE_CODES.has(code) || name.includes("royal decree")) {
      if (role === "activate" || role === "chain") return null;
    }

    return null;
  }
});

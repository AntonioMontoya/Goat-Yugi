import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ALO_CODES = new Set([295517]); // A Legendary Ocean
const MERMAID_KNIGHT_CODES = new Set([24128274]);
const ABYSS_SOLDIER_CODES = new Set([18318842, 1647195381]);
const DAEDALUS_CODES = new Set([37721209, 37721208, 37721200]);

export default createDeckGuardrail({
  id: "goatformat-water-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. A Legendary Ocean: Activar en zona de campo, nunca setear boca abajo
    if (ALO_CODES.has(code) || name.includes("legendary ocean")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_ALO_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Mermaid Knight y Abyss Soldier: Invocación en Ataque, prohibir Set defensivo
    if (MERMAID_KNIGHT_CODES.has(code) || ABYSS_SOLDIER_CODES.has(code) || name.includes("mermaid knight") || name.includes("abyss soldier")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "WATER_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Levia-Dragon Daedalus: 1 solo tributo bajo ALO y activación de barrido
    if (DAEDALUS_CODES.has(code) || name.includes("daedalus")) {
      if (role === "monster-set") return "DAEDALUS_MUST_BE_FACE_UP";
      if (role === "activate") {
        const ownSpells = observation.ownSpells ?? [];
        const hasAlo = ownSpells.some((c) => ALO_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("legendary ocean"));
        if (hasAlo) return null;
      }
    }

    // 4. Mother Grizzly: Priorizar Set defensivo
    if (name.includes("mother grizzly")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "GRIZZLY_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const BUGROTH_CODES = new Set([4035199]);
const ALO_CODES = new Set([295517]); // A Legendary Ocean
const LIMITER_REMOVAL_CODES = new Set([2317163]);
const TRUNADE_CODES = new Set([42703248, 79093857]);

export default createDeckGuardrail({
  id: "goatformat-bugroth-otk",
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
    const oppBackrow = (observation.opponentBackrow ?? observation.opponentSpells ?? []).length;
    const hasAlo = ownBackrow.some((c) => ALO_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("legendary ocean") || String(c?.name ?? "").toLowerCase().includes("umi"));

    // 1. A Legendary Ocean: Prioridad de activación en zona de campo
    if (ALO_CODES.has(code) || name.includes("legendary ocean") || name.includes("umi")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_ALO_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Amphibious Bugroth MK-3: Invocar en Ataque si ALO está activo para ataque directo
    if (BUGROTH_CODES.has(code) || name.includes("bugroth")) {
      if (hasAlo) {
        if (role === "monster-set") {
          const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
          if (canSummon) return "BUGROTH_SUMMON_ATTACK_UNDER_OCEAN";
        }
        if (role === "summon") return null;
        if (role === "attack") return null; // Prioridad absoluta a atacar directamente
      }
      if (!hasAlo && role === "summon" && !isImmediateLethal(entry, observation)) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "BUGROTH_PREFER_SET_WITHOUT_OCEAN";
      }
    }

    // 3. Limiter Removal: Reservar para fase de batalla con máquinas atacantes
    if (LIMITER_REMOVAL_CODES.has(code) || name.includes("limiter removal")) {
      if (role === "activate" || role === "chain") {
        if (observation.phase !== OcgPhase.BATTLE && observation.phase !== OcgPhase.DAMAGE) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_LIMITER_REMOVAL_FOR_BATTLE_PHASE";
        }
        return null;
      }
    }

    // 4. Giant Trunade / Heavy Storm: Limpiar antes del asalto directo
    if (TRUNADE_CODES.has(code) || name.includes("giant trunade") || name.includes("heavy storm")) {
      if (oppBackrow > 0 && role === "activate") {
        return null;
      }
    }

    // 5. Mother Grizzly: Priorizar Set defensivo para reclutar Bugroth al ser destruida
    if (name.includes("mother grizzly") || name.includes("dekoichi")) {
      if (role === "summon" && (observation.turn ?? 1) <= 3) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "RECRUITER_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ZALOOG_CODES = new Set([76862289, 57429940]); // Don Zaloog
const REAPER_CODES = new Set([23205979, 13]); // Spirit Reaper
const DROP_OFF_CODES = new Set([55737443, 960713225]); // Drop Off
const TOMATO_CODES = new Set([83011277, 12]); // Mystic Tomato
const MEFIST_CODES = new Set([46820049, 359730353]); // Mefist the Infernal General

export default createDeckGuardrail({
  id: "goatformat-hand-assault",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Don Zaloog: Descarta carta de la mano al infligir daño de batalla
    if (ZALOOG_CODES.has(code) || name.includes("zaloog")) {
      if (role === "monster-set") {
        const oppMonsters = observation.opponentMonsters ?? [];
        if (oppMonsters.length === 0) {
          const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
          if (canSummon) return "ZALOOG_PREFER_ATTACK_SUMMON_FOR_HAND_RIP";
        }
      }
    }

    // 2. Spirit Reaper: Inmune a batalla y descarta en ataque directo
    if (REAPER_CODES.has(code) || name.includes("spirit reaper")) {
      if (role === "summon") {
        const oppMonsters = observation.opponentMonsters ?? [];
        if (oppMonsters.length > 0) {
          const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (canSet) return "REAPER_PREFER_SET_DEFENSE";
        }
      }
    }

    // 3. Drop Off: Descarta la carta robada por el rival en la Draw Phase
    if (DROP_OFF_CODES.has(code) || name.includes("drop off")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") return null; // Prioridad alta al robar rival
    }

    // 4. Mystic Tomato: Reclutador de Don Zaloog y Spirit Reaper
    if (TOMATO_CODES.has(code) || name.includes("tomato")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "TOMATO_PREFER_SET_DEFENSE";
      }
    }

    // 5. Mefist the Infernal General: Tributo con daño perforante y descarte de mano
    if (MEFIST_CODES.has(code) || name.includes("mefist")) {
      if (role === "tribute-summon") return null;
    }

    return null;
  }
});

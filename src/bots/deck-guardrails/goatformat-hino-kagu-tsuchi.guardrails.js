import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HINO_CODES = new Set([75646520]);
const FLAME_RULER_CODES = new Set([94412545]);
const TRUNADE_CODES = new Set([42703248, 79093857]);

export default createDeckGuardrail({
  id: "goatformat-hino-kagu-tsuchi",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const oppBackrow = observation.opponentBackrow ?? observation.opponentSpells ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];

    // 1. Hino-Kagu-Tsuchi: Tributar e invocar solo con seguridad de backrow (al ser Spirit deja campo vacío)
    if (HINO_CODES.has(code) || name.includes("hino-kagu-tsuchi")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "HINO_CANNOT_BE_SET";
      }

      if (role === "summon") {
        const hand = observation.ownHand ?? [];
        const hasSweep = hand.some((c) => TRUNADE_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("trunade") || String(c?.name ?? "").toLowerCase().includes("heavy storm"));

        // Si el oponente tiene trampas activas y tenemos barrido, limpiar primero
        if (oppBackrow.length > 0 && hasSweep) {
          const canSweep = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
          if (canSweep) return "CLEAR_BACKROW_BEFORE_HINO_TRIBUTE";
        }

        // Si no tenemos protección defensiva en mesa y el rival tiene monstruos agresivos, retener
        const hasDefensiveTrap = ownBackrow.some((s) => !s.faceDown || true);
        if (oppMonsters.length >= 2 && ownBackrow.length === 0 && !isImmediateLethal(entry, observation)) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "summon");
          if (canWait) return "HOLD_HINO_UNTIL_DEFENSIVE_COVER_SET";
        }
      }
    }

    // 2. Flame Ruler: Preservar para tributo doble de Hino-Kagu-Tsuchi
    if (FLAME_RULER_CODES.has(code) || name.includes("flame ruler")) {
      if (role === "summon" && (observation.turn ?? 1) <= 2) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "FLAME_RULER_PREFER_SET_DEFENSE";
      }
    }

    // 3. Reclutadores defensivos (UFO Turtle, Gravekeeper's Spy): Priorizar Set
    if (name.includes("ufo turtle") || name.includes("gravekeeper")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "RECRUITER_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

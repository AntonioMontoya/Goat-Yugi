import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ASURA_PRIEST_CODES = new Set([47529357]);
const OJAMA_TRIO_CODES = new Set([29843091]);
const KOTETSU_CODES = new Set([73594093]);
const TRUNADE_CODES = new Set([42703248, 79093857]);
const EQUIP_CODES = new Set([61127349, 83746708, 56747793]); // Big Bang Shot, Mage Power, United We Stand

export default createDeckGuardrail({
  id: "goatformat-asura-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Asura Priest: Convocatoria con barrido de retaguardia previo o letal inmediato
    if (ASURA_PRIEST_CODES.has(code) || name.includes("asura priest")) {
      const oppBackrow = (observation.opponentSpells ?? []).length;
      const hand = observation.ownHand ?? [];
      const hasSweep = hand.some((c) => TRUNADE_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("trunade") || String(c?.name ?? "").toLowerCase().includes("heavy storm"));

      if (role === "summon" && oppBackrow > 0 && hasSweep) {
        const canSweepFirst = evaluated.some((o) => o !== entry && (TRUNADE_CODES.has(primaryCode(o)) || o.analysis?.role === "activate"));
        if (canSweepFirst) return "CLEAR_BACKROW_BEFORE_SUMMONING_ASURA";
      }

      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "ASURA_PRIEST_CANNOT_BE_SET";
      }
    }

    // 2. Ojama Trio: No activar sin Asura Priest, Panda o Just Desserts en mano/campo
    if (OJAMA_TRIO_CODES.has(code) || name.includes("ojama trio")) {
      if (role === "activate" || role === "chain") {
        const hand = observation.ownHand ?? [];
        const monsters = observation.ownMonsters ?? [];
        const hasSynergy = [...hand, ...monsters].some((c) => {
          const cName = String(c?.name ?? "").toLowerCase();
          return cName.includes("asura") || cName.includes("panda") || cName.includes("desserts");
        });
        if (!hasSynergy) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_OJAMA_TRIO_UNTIL_ASURA_OR_PANDA_AVAILABLE";
        }
      }
    }

    // 3. Iron Blacksmith Kotetsu: Priorizar Set defensivo para buscar equipos OTK
    if (KOTETSU_CODES.has(code) || name.includes("kotetsu")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "KOTETSU_PREFER_SET_DEFENSE";
      }
    }

    // 4. Cartas de Equipo (Big Bang Shot / Mage Power / United We Stand): Priorizar Asura Priest
    if (EQUIP_CODES.has(code) || name.includes("big bang") || name.includes("mage power") || name.includes("united we stand")) {
      if (role === "activate") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasAsura = ownMonsters.some((m) => ASURA_PRIEST_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("asura"));
        if (hasAsura) return null;
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const TRUESDALE_CODES = new Set([69992868]); // Fairy King Truesdale
const LORD_POISON_CODES = new Set([43641473]); // Lord Poison
const LEKUNGA_CODES = new Set([62397231]); // Lekunga
const GRIZZLY_CODES = new Set([856395]); // Mother Grizzly
const SALVAGE_CODES = new Set([96947648]); // Salvage
const ABYSS_SOLDIER_CODES = new Set([18318842]); // Abyss Soldier

export default createDeckGuardrail({
  id: "goatformat-plant-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.60,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Fairy King Truesdale: En posición de defensa otorga +500 ATK/DEF a todas las plantas
    if (TRUESDALE_CODES.has(code) || name.includes("truesdale")) {
      if (role === "tribute-summon" || role === "summon") {
        // Salvo letal inmediato, invocar/colocar en defensa para buff continuo a plantas
        if (isImmediateLethal(entry, observation)) return null;
        const canSetOrDef = evaluated.some((o) => o !== entry && (o.analysis?.role === "monster-set" || o.analysis?.position === OcgPosition.POS_FACEUP_DEFENSE));
        if (canSetOrDef) return "TRUESDALE_PREFER_DEFENSE_AURA";
      }
    }

    // 2. Lord Poison: Motor de flotado. Cuando es destruido en batalla revive una planta del cementerio
    if (LORD_POISON_CODES.has(code) || name.includes("lord poison")) {
      if (role === "monster-set") return null;
      if (role === "summon") {
        const oppMonsters = observation.opponentMonsters ?? [];
        const hasStrongerOpp = oppMonsters.some((m) => Number(m?.atk ?? 0) >= 1500);
        if (hasStrongerOpp) {
          const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (canSet) return "LORD_POISON_PREFER_SET_AGAINST_STRONGER_OPPONENT";
        }
      }
    }

    // 3. Mother Grizzly: Reclutador de agua (Lord Poison, Lekunga, Sinister, Abyss Soldier)
    if (GRIZZLY_CODES.has(code) || name.includes("grizzly")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MOTHER_GRIZZLY_PREFER_SET";
      }
    }

    // 4. Lekunga: Generador de fichas Planta desterrando 2 AGUA del cementerio
    if (LEKUNGA_CODES.has(code) || name.includes("lekunga")) {
      if (role === "activate") {
        // Priorizar activar efecto para generar ficha planta y presencia en campo
        return null;
      }
    }

    // 5. Salvage: Recuperar 2 monstruos de AGUA con <= 1500 ATK
    if (SALVAGE_CODES.has(code) || name.includes("salvage")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_SALVAGE_WHEN_TARGETS_AVAILABLE";
      }
    }

    return null;
  }
});

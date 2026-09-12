import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const PLASMA_ZONE_CODES = new Set([3775012]); // Mystic Plasma Zone
const SKILLED_DARK_CODES = new Set([73752131]);
const KYCOO_CODES = new Set([88264978]);
const DDV_CODES = new Set([5851097]); // Deck Devastation Virus

export default createDeckGuardrail({
  id: "goatformat-dark-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Mystic Plasma Zone: Activar en zona de campo para +500 ATK a todos los OSCURIDAD
    if (PLASMA_ZONE_CODES.has(code) || name.includes("mystic plasma zone")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_PLASMA_ZONE_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Skilled Dark Magician y Kycoo: Invocación en Ataque con 1800-1900 ATK (2300-2400 bajo campo)
    if (SKILLED_DARK_CODES.has(code) || KYCOO_CODES.has(code) || name.includes("skilled dark") || name.includes("kycoo")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "DARK_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Deck Devastation Virus: Activar cuando un monstruo propio alcance >= 2000 ATK
    if (DDV_CODES.has(code) || name.includes("deck devastation virus")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasTribute = ownMonsters.some((m) => Number(m?.atk ?? 0) >= 2000);
        if (hasTribute) return null;
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_DDV_UNTIL_2000_ATK_MONSTER_ON_FIELD";
      }
    }

    // 4. Mystic Tomato: Priorizar Set defensivo
    if (name.includes("tomato")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "TOMATO_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

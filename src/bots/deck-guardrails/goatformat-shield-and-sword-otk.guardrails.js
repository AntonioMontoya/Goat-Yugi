import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SHIELD_SWORD_CODES = new Set([52097685]);
const GARDNA_CODES = new Set([65240384]);
const TRUNADE_CODES = new Set([42703248, 79093857]);

export default createDeckGuardrail({
  id: "goatformat-shield-and-sword-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Shield & Sword: Activar solo si hay monstruos propios boca arriba con alta defensa
    if (SHIELD_SWORD_CODES.has(code) || name.includes("shield & sword") || name.includes("shield and sword")) {
      if (role === "activate") {
        const ownMonsters = observation.ownMonsters ?? [];
        // Debe haber al menos un monstruo boca arriba en campo propio
        const hasFaceUpDefender = ownMonsters.some((m) => {
          const mDef = Number(m?.def ?? 0);
          return mDef >= 2000;
        });

        if (!hasFaceUpDefender) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_SHIELD_AND_SWORD_UNTIL_FACE_UP_HIGH_DEF";
        }
      }
    }

    // 2. Big Shield Gardna: Prohibir invocación normal en Ataque (100 ATK)
    if (GARDNA_CODES.has(code) || name.includes("gardna")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "GARDNA_PREFER_SET_DEFENSE";
      }
    }

    // 3. Murallas defensivas (Gravekeeper's Spy/Guard, Gear Golem): Set defensivo
    if (name.includes("gravekeeper") || name.includes("gear golem")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "DEFENDER_PREFER_SET_DEFENSE";
      }
    }

    // 4. Trunade / Heavy Storm: Limpiar antes de cambiar stats y atacar
    if (TRUNADE_CODES.has(code) || name.includes("giant trunade") || name.includes("heavy storm")) {
      const oppBackrow = (observation.opponentSpells ?? []).length;
      if (oppBackrow > 0 && role === "activate") return null;
    }

    return null;
  }
});

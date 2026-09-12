import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const PALADIN_CODES = new Set([73398797]);
const BLUE_EYES_CODES = new Set([89631139]);
const RITUAL_SPELL_CODES = new Set([4388680]);

export default createDeckGuardrail({
  id: "goatformat-paladin-of-white-dragon",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Paladin of White Dragon: Gestión de ataque y tributo diferido a Main 2
    if (PALADIN_CODES.has(code) || name.includes("paladin of white dragon")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && (o.analysis?.role === "summon" || o.analysis?.role === "special-summon"));
        if (canSummon) return "PALADIN_MUST_BE_FACE_UP";
      }

      // Priorizar atacar monstruos defensivos boca abajo para destruirlos sin volteo
      if (role === "attack") {
        const target = entry.analysis?.target;
        if (target && target.faceDown) {
          return null; // Prioridad máxima para borrar flip monsters rivales
        }
      }

      // No tributar en Main 1 si podemos atacar primero, ya que Blue-Eyes no puede atacar el turno que es invocado por Paladin
      if (role === "activate" && observation.phase === OcgPhase.MAIN1) {
        const canAttack = (observation.opponentMonsters ?? []).length > 0 || Number(observation.opponentMonsterCount ?? 0) === 0;
        if (canAttack) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_PALADIN_TRIBUTE_UNTIL_AFTER_ATTACK";
        }
      }
    }

    // 2. Blue-Eyes White Dragon: Prohibir invocación normal de 2 tributos en mano
    if (BLUE_EYES_CODES.has(code) || name.includes("blue-eyes white dragon")) {
      if (role === "summon") {
        return "SUMMON_BLUE_EYES_VIA_PALADIN_EFFECT";
      }
    }

    // 3. Manju / Senju / Sonic Bird: Invocación prioritaria para buscar piezas rituales
    if (name.includes("manju") || name.includes("senju") || name.includes("sonic bird")) {
      if (role === "summon") return null;
    }

    return null;
  }
});

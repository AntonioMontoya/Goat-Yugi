import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const WAVE_MOTION_CODES = new Set([38992735, 1923069886]); // Wave-Motion Cannon
const JAM_BREEDING_CODES = new Set([21770260, 214267426]); // Jam Breeding Machine
const LEVEL_LIMIT_CODES = new Set([31305911, 266999288]); // Level Limit - Area B
const SKILL_DRAIN_CODES = new Set([82732705, 1768996512]); // Skill Drain
const HORN_OF_HEAVEN_CODES = new Set([98069388, 314725060]); // Horn of Heaven
const SHARE_PAIN_CODES = new Set([56830749, 223807713]); // Share the Pain

export default createDeckGuardrail({
  id: "goatformat-jam-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.35,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const ownLp = Number(observation.ownLp ?? 8000);
    const oppLp = Number(observation.opponentLp ?? 8000);

    // 1. Wave-Motion Cannon: Win condition de daño acumulativo. Detonar si es letal, ante peligro o si hay daño alto
    if (WAVE_MOTION_CODES.has(code) || name.includes("wave-motion cannon")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_WAVE_MOTION_CANNON_PRIORITY";
      }
      if (role === "activate") {
        const location = entry.analysis?.location;
        if (location === OcgLocation.LOCATION_SZONE || role === "activate") {
          const counters = Number(card?.counters ?? 0);
          const isLethal = counters * 1000 >= oppLp;
          const isDanger = ownLp <= 2000 || oppMonsters.length >= 2;
          if (isLethal || (counters >= 3 && isDanger) || counters >= 5) {
            return null; // Permitir detonación para infligir gran daño
          }
          if (!isLethal && counters < 3 && !isDanger) {
            const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
            if (canWait) return "HOLD_WAVE_MOTION_UNTIL_LETHAL";
          }
        }
        return null;
      }
    }

    // 2. Jam Breeding Machine: Activar SOLO si hay cerrojo defensivo para no auto-bloquearse
    if (JAM_BREEDING_CODES.has(code) || name.includes("jam breeding")) {
      const hasStallActive = ownBackrow.some((s) => {
        const sName = String(s?.name ?? "").toLowerCase();
        return sName.includes("level limit") || sName.includes("gravity bind") || sName.includes("wall of revealing") || sName.includes("messenger");
      });
      if (!hasStallActive && (role === "activate" || role === "spell-set")) {
        const canHold = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate" && o.analysis?.role !== "spell-set");
        if (canHold) return "HOLD_JAM_BREEDING_UNTIL_STALL_ACTIVE";
      }
      if (hasStallActive && role === "activate") return null;
    }

    // 3. Level Limit - Area B y Skill Drain: Cerrojos continuos del campo
    if (LEVEL_LIMIT_CODES.has(code) || SKILL_DRAIN_CODES.has(code) || name.includes("level limit") || name.includes("skill drain")) {
      if (role === "spell-set" && (LEVEL_LIMIT_CODES.has(code) || name.includes("level limit"))) {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_LEVEL_LIMIT_IMMEDIATELY";
      }
    }

    // 4. Horn of Heaven y Share the Pain: Requieren tributo de token Slime/Oveja
    if (HORN_OF_HEAVEN_CODES.has(code) || SHARE_PAIN_CODES.has(code) || name.includes("horn of heaven") || name.includes("share the pain")) {
      const ownMonsters = observation.ownMonsters ?? [];
      if (role === "activate" || role === "chain") {
        if (ownMonsters.length === 0) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_TRIBUTE_CARD_UNTIL_TOKEN_AVAILABLE";
        }
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SPHINX_CODES = new Set([75560629, 340014840]); // Guardian Sphinx
const GOLEM_SENTRY_CODES = new Set([387312570]); // Golem Sentry
const MEDUSA_CODES = new Set([1296654887]); // Medusa Worm
const JUJITSU_CODES = new Set([27957342, 1559501920]); // Legendary Jujitsu Master
const GIANT_RAT_CODES = new Set([97023549, 1733987405]); // Giant Rat
const LACOODA_CODES = new Set([504081810]); // Des Lacooda

export default createDeckGuardrail({
  id: "goatformat-earth-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.40,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Guardian Sphinx, Golem Sentry, Medusa Worm, Des Lacooda: PACMAN loop (voltearse boca abajo tras resolver)
    if (SPHINX_CODES.has(code) || GOLEM_SENTRY_CODES.has(code) || MEDUSA_CODES.has(code) || LACOODA_CODES.has(code)
        || name.includes("sphinx") || name.includes("golem sentry") || name.includes("medusa worm") || name.includes("des lacooda")) {
      if (role === "activate") {
        // Priorizar efecto de voltearse boca abajo en Main Phase
        return null;
      }
      if (role === "summon" && (MEDUSA_CODES.has(code) || GOLEM_SENTRY_CODES.has(code) || name.includes("medusa") || name.includes("golem sentry"))) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "FLIP_ROCK_PREFER_SET_DEFENSE";
      }
    }

    // 2. Legendary Jujitsu Master: 1800 DEF que devuelve al atacante al tope del mazo
    if (JUJITSU_CODES.has(code) || name.includes("jujitsu")) {
      if (role === "summon") {
        if (isImmediateLethal(entry, observation)) return null;
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "JUJITSU_MASTER_MUST_BE_SET_IN_DEFENSE";
      }
    }

    // 3. Giant Rat: Reclutador de monstruos TIERRA
    if (GIANT_RAT_CODES.has(code) || name.includes("giant rat")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "GIANT_RAT_PREFER_SET";
      }
    }

    return null;
  }
});

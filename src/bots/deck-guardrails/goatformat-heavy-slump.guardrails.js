import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HEAVY_SLUMP_CODES = new Set([60100907, 1108980955]);
const ABYSS_SOLDIER_CODES = new Set([18318842, 1647195381]);
const GOLEM_SENTRY_CODES = new Set([41248270, 387312570]);
const TRUNADE_CODES = new Set([42703248, 79093857]);

export default createDeckGuardrail({
  id: "goatformat-heavy-slump",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.40,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Heavy Slump: Activación prioritaria e inmediata cuando el rival tiene >= 8 cartas en mano
    if (HEAVY_SLUMP_CODES.has(code) || name.includes("heavy slump")) {
      const oppHandCount = Number(observation.opponentHandCount ?? observation.opponentHand?.length ?? 0);
      if (oppHandCount >= 8) {
        if (role === "activate" || role === "chain") return null; // Prioridad máxima de resolución
      } else {
        const canPass = evaluated.some((o) => o !== entry && (o.analysis?.role === "pass" || o.analysis?.role === "to-next-phase"));
        if (canPass) return "HOLD_HEAVY_SLUMP_UNTIL_OPP_HAND_REACHES_8";
      }
    }

    // 2. Bouncers: Golem Sentry y Nightmare Penguin priorizan Set defensivo
    if (GOLEM_SENTRY_CODES.has(code) || name.includes("golem sentry") || name.includes("nightmare penguin") || name.includes("guard")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "BOUNCER_PREFER_SET_DEFENSE";
      }
    }

    // 3. Giant Trunade: Activar para devolver magias/trampas a la mano del rival inflando su mano hacia 8 cartas
    if (TRUNADE_CODES.has(code) || name.includes("giant trunade")) {
      const oppSpells = (observation.opponentSpells ?? []).length;
      const oppHand = Number(observation.opponentHandCount ?? 0);
      if (oppHand + oppSpells >= 7 && role === "activate") {
        return null;
      }
    }

    // 4. Colocar Heavy Slump y contra-trampas antes de finalizar turno
    if ((role === "main-two" || role === "end-phase" || role === "to-next-phase") && observation.isOwnTurn) {
      const hand = observation.ownHand ?? [];
      const hasSlumpOrTrap = hand.some((c) => {
        const cCode = codeOf(c);
        return HEAVY_SLUMP_CODES.has(cCode) || [67, 1761048143].includes(cCode);
      });
      if (hasSlumpOrTrap) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (canSet) return "SET_HEAVY_SLUMP_BEFORE_END_PHASE";
      }
    }

    return null;
  }
});

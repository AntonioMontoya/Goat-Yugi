import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const REASONING_CODES = new Set([58577036]);
const MONSTER_GATE_CODES = new Set([43040603]);
const DIMENSION_FUSION_CODES = new Set([23557835, 1119297377]);
const TRUNADE_CODES = new Set([42703248, 79093857]);
const BOSS_CODES = new Set([72989439, 40737112, 77585513]); // BLS, DMoC, Jinzo

export default createDeckGuardrail({
  id: "goatformat-reasoning-gate-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Reasoning & Monster Gate: Prioridad de activación en Main Phase 1
    if (REASONING_CODES.has(code) || name.includes("reasoning")) {
      if (role === "activate") return null;
    }

    if (MONSTER_GATE_CODES.has(code) || name.includes("monster gate")) {
      if (role === "activate") {
        // Verificar que no se tribute un boss valioso como Jinzo o DMoC
        const ownMonsters = observation.ownMonsters ?? [];
        const hasTributeFodder = ownMonsters.some((m) => {
          const mCode = codeOf(m);
          const mName = String(m?.name ?? "").toLowerCase();
          return !BOSS_CODES.has(mCode) && !mName.includes("chaos") && !mName.includes("jinzo");
        });
        if (!hasTributeFodder && ownMonsters.length > 0) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "DO_NOT_SACRIFICE_BOSS_FOR_GATE";
        }
        return null;
      }
    }

    // 2. Dimension Fusion: Chequeo de LP y umbral de monstruos desterrados
    if (DIMENSION_FUSION_CODES.has(code) || name.includes("dimension fusion")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      const banishedCount = (observation.ownBanished ?? []).length;
      if (role === "activate") {
        if (ownLp <= 2000) return "DIMENSION_FUSION_LP_TOO_LOW";
        if (banishedCount < 2 && !isImmediateLethal(entry, observation)) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_DIMENSION_FUSION_UNTIL_MULTIPLE_BANISHED";
        }
      }
    }

    // 3. Trunade / Heavy Storm: Limpiar antes de abrir la invasión OTK
    if (TRUNADE_CODES.has(code) || name.includes("giant trunade") || name.includes("heavy storm")) {
      const oppBackrow = (observation.opponentSpells ?? []).length;
      if (oppBackrow > 0 && role === "activate") return null;
    }

    return null;
  }
});

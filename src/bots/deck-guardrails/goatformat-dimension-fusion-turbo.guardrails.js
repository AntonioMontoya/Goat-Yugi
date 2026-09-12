import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const DIMENSION_FUSION_CODES = new Set([23557835, 1119297377]);
const BAZOO_CODES = new Set([40133511, 30238598]);
const DMOC_CODES = new Set([40737112, 385612863]);
const TRUNADE_CODES = new Set([42703248, 79093857]);

export default createDeckGuardrail({
  id: "goatformat-dimension-fusion-turbo",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);

    // 1. Dimension Fusion: Gestión de riesgo y letal
    if (DIMENSION_FUSION_CODES.has(code) || name.includes("dimension fusion")) {
      if (role === "activate") {
        if (ownLp <= 2000) return "DIMENSION_FUSION_LP_TOO_LOW";
        const ownBanishedCount = (observation.ownBanished ?? []).length;
        if (ownBanishedCount < 2 && !isImmediateLethal(entry, observation)) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_DIMENSION_FUSION_UNTIL_MULTIPLE_MONSTERS_BANISHED";
        }
      }
    }

    // 2. Bazoo the Soul-Eater: Priorizar destierro de monstruos en cementerio para alimentar ataque y Dimension Fusion
    if (BAZOO_CODES.has(code) || name.includes("bazoo")) {
      if (role === "activate" && (role === "main-one" || observation.phase === OcgPhase.MAIN1)) {
        return null;
      }
    }

    // 3. Trunade / Heavy Storm: Limpiar retaguardia rival antes de activar Dimension Fusion
    if (TRUNADE_CODES.has(code) || name.includes("giant trunade")) {
      const hand = observation.ownHand ?? [];
      const hasDimFusion = hand.some((c) => DIMENSION_FUSION_CODES.has(codeOf(c)));
      const oppBackrow = (observation.opponentSpells ?? []).length;
      if (hasDimFusion && oppBackrow > 0 && role === "activate") {
        return null; // Priorizar barrer antes de la invasión
      }
    }

    // 4. Dark Magician of Chaos: Recuperar prioritariamente Dimension Fusion o Pot of Greed
    if (DMOC_CODES.has(code) || name.includes("dark magician of chaos")) {
      if (message?.type === OcgMessageType.SELECT_CARD) {
        // La selección del hechizo a recuperar prioriza Dimension Fusion
        return null;
      }
    }

    return null;
  }
});

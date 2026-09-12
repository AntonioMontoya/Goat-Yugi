import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const FUSION_GATE_CODES = new Set([33550694]);
const DIMENSION_FUSION_CODES = new Set([23557835, 1119297377]);
const ROYAL_DECREE_CODES = new Set([51452091]);
const HIGH_LEVEL_MONSTERS = new Set([46986414, 78193831]); // Dark Magician, Buster Blader

export default createDeckGuardrail({
  id: "goatformat-fusion-gate-turbo",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const oppBackrow = observation.opponentBackrow ?? observation.opponentSpells ?? [];
    const hasDecreeActive = ownBackrow.some(
      (s) => (ROYAL_DECREE_CODES.has(codeOf(s)) || String(s?.name ?? "").toLowerCase().includes("royal decree")) && !s.faceDown
    );

    // 1. Fusion Gate: Activar en zona de campo, nunca setear
    if (FUSION_GATE_CODES.has(code) || name.includes("fusion gate")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_FUSION_GATE_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Monstruos de Nivel Alto (Dark Magician, Buster Blader): Prohibir invocaciones normales sin tributo
    if (HIGH_LEVEL_MONSTERS.has(code) || name.includes("dark magician") || name.includes("buster blader")) {
      if (role === "summon" && (observation.ownMonsters ?? []).length < 2) {
        return "RESERVE_FUSION_MATERIALS_FOR_FUSION_GATE";
      }
    }

    // 3. King of the Swamp: No invocar en Ataque con 500 ATK
    if (name.includes("king of the swamp")) {
      if (role === "summon" && !isImmediateLethal(entry, observation)) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "KING_OF_SWAMP_PREFER_SET_DEFENSE";
      }
    }

    // 4. Dimension Fusion: Gestionar LP y verificar que haya monstruos desterrados
    if (DIMENSION_FUSION_CODES.has(code) || name.includes("dimension fusion")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      const banishedCount = (observation.banished ?? observation.ownBanished ?? []).length;
      if (role === "activate") {
        if (ownLp <= 2000) return "DIMENSION_FUSION_LP_TOO_LOW";
        if (banishedCount < 2 && !isImmediateLethal(entry, observation)) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_DIMENSION_FUSION_UNTIL_BANISHED_TARGETS_AVAILABLE";
        }
        return null;
      }
    }

    // 5. Royal Decree: Máxima prioridad de activación para neutralizar trampas enemigas
    if (ROYAL_DECREE_CODES.has(code) || name.includes("royal decree")) {
      if (role === "activate" || role === "chain") return null;
      if (role === "spell-set") return null;
    }

    // 6. Thunder Dragon: Descartar de inmediato para llenar mano y preparar materiales
    if (name.includes("thunder dragon") && role === "activate") {
      return null;
    }

    return null;
  }
});

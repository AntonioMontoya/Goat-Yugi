import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const REVERSAL_QUIZ_CODES = new Set([6590496, 943401292]);
const FUHMA_SHURIKEN_CODES = new Set([9373534, 338388237]);
const SPELLBOOK_ORGANIZATION_CODES = new Set([8362883]);
const WALL_OF_REVEALING_LIGHT_CODES = new Set([17078030, 88263217]);
const SOLEMN_CODES = new Set([41420027, 67]);

export default createDeckGuardrail({
  id: "goatformat-reversal-quiz-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.95,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const oppLp = Number(observation.opponentLp ?? 8000);

    // 1. Reversal Quiz: Activar si Fuhma Shuriken / Black Pendant está en campo
    if (REVERSAL_QUIZ_CODES.has(code) || name.includes("reversal quiz")) {
      const hasBurnEquipOnField = ownBackrow.some((s) => {
        const sCode = codeOf(s);
        const sName = String(s?.name ?? "").toLowerCase();
        return FUHMA_SHURIKEN_CODES.has(sCode) || sName.includes("fuhma shuriken") || sName.includes("black pendant");
      });
      // Si Fuhma Shuriken está en mano pero no en campo, priorizar setearlo antes de activar Quiz
      const hand = observation.ownHand ?? [];
      const hasBurnEquipInHand = hand.some((c) => {
        const cCode = codeOf(c);
        const cName = String(c?.name ?? "").toLowerCase();
        return FUHMA_SHURIKEN_CODES.has(cCode) || cName.includes("fuhma shuriken") || cName.includes("black pendant");
      });
      if (!hasBurnEquipOnField && hasBurnEquipInHand) {
        const canSetEquip = evaluated.some((o) => o !== entry && (o.analysis?.role === "spell-set"));
        if (canSetEquip) return "SET_BURN_EQUIP_BEFORE_REVERSAL_QUIZ";
      }
      if (hasBurnEquipOnField || ownLp < oppLp || ownLp <= 2000) {
        if (role === "activate") return null;
      }
    }

    // 2. Fuhma Shuriken / Black Pendant: Colocar en la zona de magia/trampa para detonarlo con Quiz
    if (FUHMA_SHURIKEN_CODES.has(code) || name.includes("fuhma shuriken") || name.includes("black pendant")) {
      if (role === "spell-set") return null; // Prioridad alta de colocación
    }

    // 3. Spellbook Organization: Activar para ordenar el tope del mazo antes de Quiz
    if (SPELLBOOK_ORGANIZATION_CODES.has(code) || name.includes("spellbook organization")) {
      if (role === "activate" || role === "chain") return null;
    }

    // 4. Reducción de LP con Wall of Revealing Light para situar LP <= 700
    if (WALL_OF_REVEALING_LIGHT_CODES.has(code) || name.includes("wall of revealing light")) {
      if (role === "activate" && ownLp > 700) {
        return null;
      }
    }

    // 5. Threatening Roar: Encadenar ante declaración de batalla para preservar LP hasta armar el combo
    if (name.includes("threatening roar")) {
      if (role === "chain" && (observation.phase === OcgPhase.BATTLE || message?.type === OcgMessageType.SELECT_CHAIN)) {
        return null;
      }
    }

    return null;
  }
});

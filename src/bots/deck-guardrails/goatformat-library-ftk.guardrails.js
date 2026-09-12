import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LIBRARY_CODES = new Set([70791372, 843261533]);
const TOON_TABLE_CODES = new Set([89997728, 1556289504]);
const THUNDER_DRAGON_CODES = new Set([31709826, 15]);
const TRUNADE_CODES = new Set([42703248, 79093857]);
const CONVULSION_CODES = new Set([62966332, 1000574999]);
const ARCHFIENDS_OATH_CODES = new Set([40737112, 176525229]);
const REVERSAL_QUIZ_CODES = new Set([6590496, 943401292]);
const BLACK_PENDANT_CODES = new Set([65810489, 1051122050]);
const RELOAD_CODES = new Set([22589918, 1984483372]);

export default createDeckGuardrail({
  id: "goatformat-library-ftk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.90, // FTK requiere máxima agresividad y no pasar turno si se puede ciclar
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const ownMonsters = observation.ownMonsters ?? [];
    const hasLibraryOnField = ownMonsters.some(
      (m) => (LIBRARY_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("royal magical library")) && !m.faceDown
    );
    const hasLibraryInHand = (observation.ownHand ?? []).some(
      (c) => LIBRARY_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("royal magical library")
    );

    // 1. Royal Magical Library: Invocación SIEMPRE boca arriba (para acumular contadores)
    if (LIBRARY_CODES.has(code) || name.includes("royal magical library")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "LIBRARY_MUST_BE_SUMMONED_FACE_UP_FOR_COUNTERS";
      }
      if (role === "summon") return null;
      // Prioridad absoluta de activación: Quitar 3 contadores para robar
      if (role === "activate" && (role === "main-one" || observation.phase === OcgPhase.MAIN1)) {
        return null;
      }
    }

    // 2. Retención de cantrips si Library está en mano (para que se beneficien de contadores)
    if (!hasLibraryOnField && hasLibraryInHand) {
      if (TOON_TABLE_CODES.has(code) || name.includes("toon table") || name.includes("reload") || TRUNADE_CODES.has(code) || name.includes("giant trunade")) {
        if (role === "activate") {
          const canSummonLibrary = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
          if (canSummonLibrary) return "SUMMON_LIBRARY_BEFORE_CANTRIPS";
        }
      }
    }

    // 3. Adelgazamiento inicial con Thunder Dragon
    if (THUNDER_DRAGON_CODES.has(code) || name.includes("thunder dragon")) {
      if (role === "activate") return null;
    }
    if (TOON_TABLE_CODES.has(code) || name.includes("toon table of contents")) {
      if (role === "activate" && (hasLibraryOnField || !hasLibraryInHand)) return null;
    }

    // 4. Cadena continua de Hechizos en Main Phase 1: Prohibir pasar de fase si hay magias jugables
    if ((role === "to-bp" || role === "to-ep" || role === "pass") && observation.isOwnTurn && observation.phase === OcgPhase.MAIN1) {
      const hand = observation.ownHand ?? [];
      const hasPlayableSpell = hand.some((c) => {
        const cName = String(c?.name ?? "").toLowerCase();
        return cName.includes("pot of greed") || cName.includes("graceful charity")
          || cName.includes("upstart") || (hasLibraryOnField && cName.includes("toon table"))
          || cName.includes("convulsion") || cName.includes("archfiend's oath")
          || (hasLibraryOnField && cName.includes("giant trunade")) || (hasLibraryOnField && cName.includes("reload"));
      });
      if (hasPlayableSpell) {
        const canActivate = evaluated.some((o) => o !== entry && (o.analysis?.role === "activate" || o.analysis?.role === "spell-set"));
        if (canActivate) return "FTK_CONTINUE_CHAINING_SPELLS_BEFORE_PASSING";
      }
    }

    // 5. Giant Trunade: Activar cuando hay magias continuas/equipos propios en campo para reciclarlos
    if (TRUNADE_CODES.has(code) || name.includes("giant trunade")) {
      const ownSpellsCount = ownBackrow.filter((s) => s && s.faceUp !== false).length;
      if (ownSpellsCount >= 2 && role === "activate") {
        return null;
      }
    }

    // 6. Reversal Quiz: SOLO activar cuando Black Pendant esté en mano o campo para infligir los 500 LP letales
    if (REVERSAL_QUIZ_CODES.has(code) || name.includes("reversal quiz")) {
      const handAndField = (observation.ownHand ?? []).concat(ownBackrow);
      const hasBlackPendant = handAndField.some((c) => {
        const cCode = codeOf(c);
        return BLACK_PENDANT_CODES.has(cCode) || String(c?.name ?? "").toLowerCase().includes("black pendant");
      });
      if (!hasBlackPendant) {
        const canPassOrOther = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canPassOrOther) return "HOLD_REVERSAL_QUIZ_UNTIL_BLACK_PENDANT_READY";
      }
    }

    return null;
  }
});

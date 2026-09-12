import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LAST_TURN_CODES = new Set([28597546, 1439783696]);
const JOWGEN_CODES = new Set([41855169, 921425211]);
const WALL_OF_REVEALING_LIGHT_CODES = new Set([17078030, 88263217]);
const SOLEMN_CODES = new Set([41420027, 67]);
const CAT_OF_ILL_OMEN_CODES = new Set([24140059, 1874001325]);

export default createDeckGuardrail({
  id: "goatformat-last-turn",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.85, // Requiere manipular LP agresivamente a <= 1000
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const ownMonsters = observation.ownMonsters ?? [];
    const hasSetLastTurn = ownBackrow.some((s) => {
      const sCode = codeOf(s);
      return LAST_TURN_CODES.has(sCode) || String(s?.name ?? "").toLowerCase().includes("last turn");
    });
    const hasJowgenOnField = ownMonsters.some((m) => {
      const mCode = codeOf(m);
      return (JOWGEN_CODES.has(mCode) || String(m?.name ?? "").toLowerCase().includes("jowgen")) && !m.faceDown;
    });

    // 1. Jowgen the Spiritualist: Mantener en campo boca arriba para el bloqueo de Last Turn
    if (JOWGEN_CODES.has(code) || name.includes("jowgen")) {
      if (role === "attack") {
        return "JOWGEN_NEVER_ATTACKS";
      }
      if (hasSetLastTurn) {
        if (role === "monster-set") {
          const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
          if (canSummon) return "SUMMON_JOWGEN_FACE_UP_FOR_LAST_TURN_LOCK";
        }
        if (role === "summon") return null;
      }
    }

    // 2. Wall of Revealing Light: Pagar a <= 1000 SOLO si Last Turn ya está en mesa
    if (WALL_OF_REVEALING_LIGHT_CODES.has(code) || name.includes("wall of revealing light")) {
      if (role === "activate") {
        if (hasSetLastTurn && ownLp > 1000) {
          return null; // Disparar reducción precisa a <= 1000 para habilitar Last Turn
        }
        if (!hasSetLastTurn && ownLp <= 2000) {
          return "HOLD_WALL_LP_DROP_UNTIL_LAST_TURN_SET";
        }
        return null;
      }
    }

    // 3. Last Turn: Selección exclusiva de Jowgen the Spiritualist
    if (message?.type === OcgMessageType.SELECT_CARD) {
      if (hasJowgenOnField && !(JOWGEN_CODES.has(code) || name.includes("jowgen"))) {
        const canSelectJowgen = evaluated.some((o) => o !== entry && (JOWGEN_CODES.has(primaryCode(o) || codeOf(o.analysis?.cards?.[0]))));
        if (canSelectJowgen) return "MUST_SELECT_JOWGEN_FOR_LAST_TURN";
      }
    }

    // 4. A Cat of Ill Omen: Buscar prioritariamente Last Turn
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "flip-summon") {
      if (CAT_OF_ILL_OMEN_CODES.has(code) || name.includes("cat of ill omen")) {
        return null;
      }
    }

    // 5. Prioridad absoluta de colocar Last Turn y contra-trampas antes de pasar turno
    if ((role === "main-two" || role === "end-phase" || role === "to-next-phase" || role === "to-bp") && observation.isOwnTurn) {
      const hand = observation.ownHand ?? [];
      const hasTrapToSet = hand.some((c) => {
        const cCode = codeOf(c);
        return LAST_TURN_CODES.has(cCode) || SOLEMN_CODES.has(cCode) || WALL_OF_REVEALING_LIGHT_CODES.has(cCode);
      });
      if (hasTrapToSet) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (canSet) return "SET_LAST_TURN_AND_COUNTER_TRAPS_BEFORE_EP";
      }
    }

    return null;
  }
});

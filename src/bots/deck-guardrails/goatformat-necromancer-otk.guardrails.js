import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const NECROMANCER_CODES = new Set([14315573]);
const OPTI_CAMO_CODES = new Set([44763025]);
const MERCHANT_CODES = new Set([52340444]);

export default createDeckGuardrail({
  id: "goatformat-necromancer-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const gy = observation.graveyard ?? observation.ownGraveyard ?? [];
    const monsterCountInGy = gy.filter((c) => {
      const info = knowledge?.byRuntimeCode?.[String(codeOf(c))];
      return info?.kind === "monster" || info?.type === "monster" || c.type === "monster" || c.kind === 1;
    }).length;

    // 1. Chaos Necromancer: Gestión estricta de invocación por umbral de cementerio
    if (NECROMANCER_CODES.has(code) || name.includes("chaos necromancer")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "NECROMANCER_CANNOT_BE_SET";
      }

      if (role === "summon") {
        // Si hay menos de 8 monstruos en el cementerio y no es letal directo, retener en mano
        if (monsterCountInGy < 8 && !isImmediateLethal(entry, observation)) {
          const hasOtherPlay = evaluated.some((o) => o !== entry && o.analysis?.role !== "summon");
          if (hasOtherPlay) return "HOLD_CHAOS_NECROMANCER_UNTIL_GRAVEYARD_FULL";
        }
        if (monsterCountInGy >= 8) return null; // Prioridad alta de invocación ofensiva
      }
    }

    // 2. Magical Merchant: Máxima prioridad de colocación defensiva boca abajo
    if (MERCHANT_CODES.has(code) || name.includes("magical merchant")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MERCHANT_PREFER_SET_DEFENSE";
      }
    }

    // 3. Opti-Camouflage Armor: Equipar exclusivamente a Chaos Necromancer (Nivel 1) para OTK directo
    if (OPTI_CAMO_CODES.has(code) || name.includes("opti-camouflage")) {
      if (role === "activate") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasNecro = ownMonsters.some((m) => !m.faceDown && (NECROMANCER_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("necromancer")));
        if (hasNecro) return null;
        return "HOLD_OPTI_CAMO_FOR_NECROMANCER";
      }
    }

    // 4. Reclutadores (Tomato, Rat, Turtle, Apprentice): Priorizar Set
    if (name.includes("tomato") || name.includes("rat") || name.includes("turtle") || name.includes("apprentice")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "RECRUITER_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

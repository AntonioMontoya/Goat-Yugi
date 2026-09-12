import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SEALMASTER_CODES = new Set([81480460]);
const TALISMAN_CODES = new Set([20264158]); // Talisman of Spell Sealing

export default createDeckGuardrail({
  id: "goatformat-sealmaster",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Talisman of Spell Sealing: Set prioritario y activación solo con Sealmaster Meisei boca arriba
    if (TALISMAN_CODES.has(code) || name.includes("talisman of spell sealing")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasSealmaster = ownMonsters.some((m) => {
          const mCode = codeOf(m);
          const mName = String(m?.name ?? "").toLowerCase();
          return (SEALMASTER_CODES.has(mCode) || mName.includes("sealmaster")) && !m.faceDown;
        });

        if (hasSealmaster) return null; // Bloquear todas las magias del juego
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_TALISMAN_UNTIL_SEALMASTER_FACE_UP";
      }
    }

    // 2. Sealmaster Meisei: Invocación boca arriba para activar el Talisman
    if (SEALMASTER_CODES.has(code) || name.includes("sealmaster meisei")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "SEALMASTER_PREFER_FACE_UP_FOR_TALISMAN";
      }
    }

    return null;
  }
});

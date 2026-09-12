import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const FLAME_SPRITE_CODES = new Set([90434926, 504700190]);
const MUCUS_YOLK_CODES = new Set([40107111, 504700191]);

export default createDeckGuardrail({
  id: "goatformat-direct-attack",
  tier: "Tier 3",
  playstyle: "lockdown",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Direct Attackers: Require stall lock (Gravity Bind, Level Limit, Messenger) before exposing in attack
    if (role === "summon" && (FLAME_SPRITE_CODES.has(code) || MUCUS_YOLK_CODES.has(code) || name.includes("raging flame") || name.includes("mucus yolk"))) {
      const ownBackrow = context.observation?.ownBackrow ?? [];
      const hasLock = ownBackrow.some((c) => {
        const cCode = Number(c?.code ?? c?.runtimeCode ?? 0);
        return [85742772, 3136426, 44656491, 72302403].includes(cCode) && (c?.faceUp || (Number(c?.position) & 1) !== 0);
      });
      const oppMonsters = Number(context.observation?.opponentMonsterCount ?? 0);
      if (!hasLock && oppMonsters > 0) {
        const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSetAlt) return "DIRECT_ATTACKER_NEEDS_LOCK_PREFER_SET";
      }
    }

    return null;
  }
});

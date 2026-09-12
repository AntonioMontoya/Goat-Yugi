import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const FLIP_CODES = new Set([
  31560081, 1018917, // Magician of Faith
  13143275, 4236425, // Mask of Darkness
  87621407, 448641072, // Dekoichi
]);
const TIME_SEAL_CODES = new Set([35316708, 14316719]);
const SOLEMN_CODES = new Set([41420027, 67]);
const CRITICAL_THREAT_CODES = new Set([
  5318639, // Mystical Space Typhoon
  19613556, // Heavy Storm
  42703248, // Giant Trunade
  504700116, 71044499, // Nobleman of Crossout
  44763025, // Delinquent Duo
  55144522, // Pot of Greed
  79571449, // Graceful Charity
  45986603, // Snatch Steal
  38992735, // Wave-Motion Cannon
  72302403, // Swords of Revealing Light
]);

export default createDeckGuardrail({
  id: "flip-control",
  tier: "Tier 2",
  playstyle: "control",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);
    const ownBackrow = observation.ownBackrow ?? [];


    // 2. Solemn Judgment proactive negation:
    // Protect crucial flip setup against Nobleman of Crossout, Heavy Storm, etc.
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "pass-chain") {
      const publicChain = observation.publicChain ?? [];
      const lastLink = publicChain[publicChain.length - 1];
      const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
      const tName = String(lastCard?.name ?? "").toLowerCase();
      const isCriticalThreat = (lastLink && CRITICAL_THREAT_CODES.has(Number(lastLink.code)))
        || tName.includes("nobleman of crossout")
        || tName.includes("heavy storm")
        || tName.includes("mystical space")
        || tName.includes("snatch steal")
        || tName.includes("delinquent duo")
        || tName.includes("pot of greed")
        || tName.includes("graceful charity")
        || tName.includes("blade knight")
        || tName.includes("chaos sorcerer")
        || tName.includes("black luster")
        || tName.includes("wave-motion")
        || tName.includes("giant trunade");
      if (isCriticalThreat && ownLp > 1000) {
        const canSolemn = evaluated.some((o) => o !== entry && o.analysis?.role === "chain"
          && (SOLEMN_CODES.has(primaryCode(o) || codeOf(o.analysis?.cards?.[0])) || String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("solemn judgment")));
        if (canSolemn) {
          return "SOLEMN_JUDGMENT_MUST_NEGATE_CRITICAL_THREAT";
        }
      }
    }

    // 3. Anti-Burn Backrow Cap:
    if (role === "spell-set") {
      const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
        || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
        || (memory?.commitments?.againstBurn === true);
      if (isAgainstBurn && ownBackrow.length >= 2) {
        return "FLIP_CONTROL_CAP_BACKROW_AGAINST_BURN";
      }
    }

    return null;
  },
});

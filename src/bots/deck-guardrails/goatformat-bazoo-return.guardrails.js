import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const BAZOO_CODES = new Set([40133511, 30238598]);
const RETURN_CODES = new Set([27174286, 471890671]);
const SOLEMN_CODES = new Set([41420027, 67]);
const JAR_CODES = new Set([34124316, 33508719]);

export default createDeckGuardrail({
  id: "goatformat-bazoo-return",
  tier: "Tier 2",
  playstyle: "aggro",
  riskTolerance: 0.55,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);
    const ownBackrow = observation.ownBackrow ?? [];

    // 1. Bazoo: Preserve GY fuel unless pushing for lethal or destroying threats
    if (role === "activate") {
      if (BAZOO_CODES.has(code) || name.includes("bazoo the soul-eater")) {
        const isLethal = isImmediateLethal(entry, observation) || Number(observation.opponentLp ?? 8000) <= 2500;
        const phase = Number(observation.phase) || 0;
        if (phase === OcgPhase.MAIN2 && !isLethal) {
          return "BAZOO_PRESERVE_GRAVEYARD_FUEL";
        }
        const oppMonsters = observation.opponentMonsters ?? [];
        if (oppMonsters.length === 0 && !isLethal) {
          const backrowOpp = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);
          if (backrowOpp > 0) return "BAZOO_PRESERVE_GRAVEYARD_FUEL";
        }
      }
    }

    // 2. Cyber Jar & Morphing Jar: Always set face-down
    if (role === "summon") {
      if (JAR_CODES.has(code) || name.includes("jar")) {
        const hasSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSet && !isImmediateLethal(entry, observation)) {
          return "JAR_PREFER_SET_DEFENSE";
        }
      }
    }

    // 3. Return from the Different Dimension timing:
    if (role === "activate" || role === "chain") {
      if (RETURN_CODES.has(code) || name.includes("return from the different dimension")) {
        const ownBanished = observation.banished ?? [];
        const banishedCount = ownBanished.length;
        const oppThreat = Number(observation.opponentThreat ?? 0);
        const isOpponentTurn = !observation.isOwnTurn;

        if (banishedCount < 2 && !isImmediateLethal(entry, observation) && !(isOpponentTurn && oppThreat >= ownLp)) {
          return "BAZOO_RETURN_NEED_MORE_BANISHED_MONSTERS";
        }

        if (ownLp <= 1000 && !isImmediateLethal(entry, observation) && !(isOpponentTurn && oppThreat >= ownLp)) {
          return "BAZOO_RETURN_LP_TOO_LOW";
        }

        if (isOpponentTurn) {
          const phase = Number(observation.phase) || 0;
          const isBattlePhase = (phase & OcgPhase.BATTLE) !== 0 || phase === OcgPhase.BATTLE || phase === 8;
          if (!isBattlePhase || oppThreat < ownLp) {
            return "BAZOO_RETURN_HOLD_FOR_LETHAL_BATTLE_DEFENSE";
          }
        }
      }
    }

    // 4. Solemn Judgment proactive negation:
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "pass-chain") {
      const publicChain = observation.publicChain ?? [];
      const lastLink = publicChain[publicChain.length - 1];
      const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
      const tName = String(lastCard?.name ?? "").toLowerCase();
      const isCriticalThreat = tName.includes("heavy storm")
        || tName.includes("snatch steal")
        || tName.includes("delinquent duo")
        || tName.includes("pot of greed")
        || tName.includes("graceful charity")
        || tName.includes("mirage dragon")
        || tName.includes("kycoo")
        || tName.includes("jinzo")
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

    // 5. Anti-Burn Backrow Cap:
    if (role === "spell-set") {
      const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
        || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
        || (memory?.commitments?.againstBurn === true);
      if (isAgainstBurn && ownBackrow.length >= 2) {
        return "BAZOO_RETURN_CAP_BACKROW_AGAINST_BURN";
      }
    }

    return null;
  },
});

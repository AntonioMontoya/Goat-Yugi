import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const RETURN_CODES = new Set([27174286, 471890671]);
const SOLEMN_CODES = new Set([41420027, 67]);
const THUNDER_DRAGON_CODES = new Set([504700054, 31786629, 15]);
const SPY_CODES = new Set([504700044, 24317029, 7]);
const GUARD_CODES = new Set([37101832, 46317099]);
const DEKOICHI_CODES = new Set([87621407, 448641072]);
const DIMENSION_FUSION_CODES = new Set([23557835, 1119297377]);

export default createDeckGuardrail({
  id: "goatformat-chaos-return",
  tier: "Tier 2",
  playstyle: "combo",
  riskTolerance: 0.60,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);

    // 1. Gravekeeper's Spy & Guard: ALWAYS SET, NEVER NORMAL SUMMON IN ATTACK
    if (role === "summon") {
      const isGK = SPY_CODES.has(code) || GUARD_CODES.has(code) || name.includes("gravekeeper's spy") || name.includes("gravekeeper's guard");
      if (isGK) {
        const hasSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSet && !isImmediateLethal(entry, observation)) {
          return "CHAOS_RETURN_SET_GRAVEKEEPERS_DEFENSE";
        }
      }

      // Dekoichi prefers Set for flip draw
      if (DEKOICHI_CODES.has(code) || name.includes("dekoichi")) {
        const oppMonsters = observation.opponentMonsters ?? [];
        if (oppMonsters.length > 0) {
          const hasSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (hasSet && !isImmediateLethal(entry, observation)) {
            return "CHAOS_RETURN_PREFER_SET_DEKOICHI";
          }
        }
      }
    }

    // 2. Prevent oversetting multiple copies of Return when banished count is 0
    if (role === "spell-set") {
      const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
        || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
        || (context.memory?.commitments?.againstBurn === true);
      const ownBackrow = observation.ownBackrow ?? [];
      if (isAgainstBurn && ownBackrow.length >= 2) {
        return "CHAOS_RETURN_CAP_BACKROW_AGAINST_BURN";
      }

      if (RETURN_CODES.has(code) || name.includes("return from the different dimension")) {
        const ownBanished = observation.banished ?? [];
        const returnsAlreadySet = ownBackrow.filter((b) => {
          const bc = codeOf(b);
          const bn = String(b?.name ?? "").toLowerCase();
          return RETURN_CODES.has(bc) || bn.includes("return");
        }).length;
        if (ownBanished.length === 0 && returnsAlreadySet >= 1) {
          return "CHAOS_RETURN_DO_NOT_CLOG_BACKROW_WITHOUT_BANISHED";
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

        // Require at least 2 banished monsters unless we must block lethal or have immediate lethal
        if (banishedCount < 2 && !isImmediateLethal(entry, observation) && !(isOpponentTurn && oppThreat >= ownLp)) {
          return "CHAOS_RETURN_NEED_MORE_BANISHED_MONSTERS";
        }

        // If LP is low (<= 1500), only activate if lethal push or urgent survival
        if (ownLp <= 1500 && !isImmediateLethal(entry, observation) && !(isOpponentTurn && oppThreat >= ownLp)) {
          return "CHAOS_RETURN_LP_TOO_LOW";
        }

        // On own turn: strictly hold Return for immediate lethal push or massive game-ending swing!
        // Paying half LP for temporary monsters that vanish at End Phase without winning is suicide.
        if (!isOpponentTurn) {
          const totalBanishedAtk = ownBanished.reduce((sum, c) => sum + Number(c?.attack ?? c?.atk ?? 0), 0);
          const oppLp = Number(observation.opponentLp ?? 8000);
          const hasDecisivePush = totalBanishedAtk >= oppLp || (banishedCount >= 3 && totalBanishedAtk >= 4500);
          if (!isImmediateLethal(entry, observation) && !hasDecisivePush) {
            return "CHAOS_RETURN_HOLD_FOR_LETHAL_TURN";
          }
        }

        // On opponent's turn: hold for battle phase or lethal defense
        if (isOpponentTurn) {
          const phase = Number(observation.phase) || 0;
          const isMain1 = (phase & OcgPhase.MAIN1) !== 0 || phase === OcgPhase.MAIN1 || phase === 4;
          if (isMain1 && oppThreat < ownLp) {
            return "CHAOS_RETURN_HOLD_FOR_BATTLE_OR_END_PHASE";
          }
          if (oppThreat < 2000 && oppThreat < ownLp) {
            return "CHAOS_RETURN_HOLD_AGAINST_MINOR_THREAT";
          }
        }
      }

      if (DIMENSION_FUSION_CODES.has(code) || name.includes("dimension fusion")) {
        if (ownLp <= 2000) return "DIMENSION_FUSION_COST_TOO_HIGH";
        const oppBanished = observation.opponentBanished ?? [];
        const oppBanishedAtk = oppBanished.reduce((sum, c) => sum + (Number(c?.attack ?? c?.atk ?? 0)), 0);
        if (oppBanishedAtk >= ownLp && oppBanished.length >= 2 && !isImmediateLethal(entry, observation)) {
          return "DIMENSION_FUSION_AVOID_FEEDING_OPPONENT_LETHAL";
        }
      }

      // Solemn Judgment preservation in low LP
      if (SOLEMN_CODES.has(code) || name.includes("solemn judgment")) {
        if (ownLp <= 1500 && !isImmediateLethal(entry, observation)) {
          const publicChain = observation.publicChain ?? [];
          const lastLink = publicChain[publicChain.length - 1];
          const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
          const tName = String(lastCard?.name ?? "").toLowerCase();
          const isHighThreat = tName.includes("heavy storm") || tName.includes("giant trunade")
            || tName.includes("snatch") || tName.includes("black luster")
            || tName.includes("wave-motion") || tName.includes("delinquent")
            || tName.includes("pot of greed");
          const oppThreat = Number(observation.opponentThreat ?? 0);
          if (!isHighThreat && oppThreat < ownLp) {
            const canPass = evaluated.some((o) => o !== entry && o.analysis?.role === "pass-chain");
            if (canPass) return "SOLEMN_JUDGMENT_PRESERVE_CRITICAL_LP";
          }
        }
      }
    }

    // 4. Solemn Judgment proactive negation:
    // When opponent activates a game-winning card or summons a critical threat,
    // NEVER pass chain if Solemn Judgment is available!
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

    return null;
  },
});

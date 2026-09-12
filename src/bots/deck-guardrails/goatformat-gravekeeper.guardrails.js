import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const NECROVALLEY_CODES = new Set([47355498, 135106001]);
const TERRAFORMING_CODES = new Set([504700121, 354412801]);
const SPY_CODES = new Set([504700044, 24317029, 7]);
const GUARD_CODES = new Set([37101832, 46317099]);
const ASSAILANT_CODES = new Set([25262697, 504228896]);
const SPEAR_SOLDIER_CODES = new Set([63695531, 349041765]);
const MY_BODY_CODES = new Set([504700189, 1697777317]);
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
  id: "goatformat-gravekeeper",
  tier: "Tier 2",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);
    const ownHand = observation.ownHand ?? [];
    const ownBackrow = observation.ownBackrow ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];

    const necrovalleyActive = ownBackrow.some((b) => {
      const bc = codeOf(b);
      const bn = String(b?.name ?? "").toLowerCase();
      return (NECROVALLEY_CODES.has(bc) || bn.includes("necrovalley")) && b?.faceUp === true;
    });

    // 1. Spy & Guard: Always set face-down! (2000-2500 DEF wall)
    if (role === "summon") {
      const isWall = SPY_CODES.has(code) || GUARD_CODES.has(code)
        || name.includes("gravekeeper's spy") || name.includes("gravekeeper's guard");
      if (isWall) {
        const hasSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSet && !isImmediateLethal(entry, observation)) {
          return "GRAVEKEEPER_SET_DEFENSIVE_WALL";
        }
      }
    }

    // Spear Soldier & Assailant: Summon in Attack under Necrovalley (2000 ATK) or when field is completely empty
    if (role === "monster-set") {
      const isAttacker = SPEAR_SOLDIER_CODES.has(code) || ASSAILANT_CODES.has(code)
        || name.includes("spear soldier") || name.includes("assailant");
      if (isAttacker) {
        const oppFaceUp = oppMonsters.filter((m) => m && m.faceUp !== false);
        const oppMaxAtk = Math.max(0, ...oppFaceUp.map((m) => Number(m.attack ?? m.atk ?? 0)));
        const shouldAttackSummon = necrovalleyActive
          ? (oppFaceUp.length === 0 || 2000 >= oppMaxAtk)
          : (oppMonsters.length === 0);
        if (shouldAttackSummon) {
          const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
          if (canSummon && !isImmediateLethal(entry, observation)) {
            return "GRAVEKEEPER_SUMMON_BEATER_ATTACK";
          }
        }
      }
    }

    // 2. Necrovalley & Terraforming management
    if (role === "activate") {
      if (NECROVALLEY_CODES.has(code) || name.includes("necrovalley")) {
        if (necrovalleyActive) {
          return "NECROVALLEY_ALREADY_ACTIVE";
        }
      }
      if (TERRAFORMING_CODES.has(code) || name.includes("terraforming")) {
        const hasNecroInHand = ownHand.some((c) => {
          const cc = codeOf(c);
          const cn = String(c?.name ?? "").toLowerCase();
          return NECROVALLEY_CODES.has(cc) || cn.includes("necrovalley");
        });
        if (necrovalleyActive || hasNecroInHand) {
          return "TERRAFORMING_ALREADY_HAVE_NECROVALLEY";
        }
      }
    }

    // 3. Solemn Judgment proactive negation:
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "pass-chain") {
      const publicChain = observation.publicChain ?? [];
      const lastLink = publicChain[publicChain.length - 1];
      const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
      const tName = String(lastCard?.name ?? "").toLowerCase();
      const isCriticalThreat = (lastLink && CRITICAL_THREAT_CODES.has(Number(lastLink.code)))
        || tName.includes("heavy storm")
        || tName.includes("mystical space typhoon")
        || tName.includes("snatch steal")
        || tName.includes("delinquent duo")
        || tName.includes("pot of greed")
        || tName.includes("graceful charity")
        || tName.includes("mirage dragon")
        || tName.includes("kycoo")
        || tName.includes("jinzo")
        || tName.includes("black luster")
        || tName.includes("wave-motion")
        || tName.includes("giant trunade")
        || tName.includes("nobleman of crossout")
        || tName.includes("gravity bind")
        || tName.includes("level limit")
        || tName.includes("stealth bird")
        || tName.includes("des koala")
        || tName.includes("secret barrel")
        || tName.includes("just desserts")
        || tName.includes("ceasefire");
      if (isCriticalThreat && ownLp > 200) {
        const canSolemn = evaluated.some((o) => o !== entry && o.analysis?.role === "chain"
          && (SOLEMN_CODES.has(primaryCode(o) || codeOf(o.analysis?.cards?.[0])) || String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("solemn judgment")));
        if (canSolemn) {
          return "SOLEMN_JUDGMENT_MUST_NEGATE_CRITICAL_THREAT";
        }
      }
    }

    // 4. Anti-Burn Backrow Cap:
    if (role === "spell-set") {
      const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
        || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
        || (memory?.commitments?.againstBurn === true);
      if (isAgainstBurn && ownBackrow.length >= 2) {
        return "GRAVEKEEPER_CAP_BACKROW_AGAINST_BURN";
      }
    }

    return null;
  },
});

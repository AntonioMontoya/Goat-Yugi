import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const STRIKE_NINJA_CODES = new Set([41006930, 66741715]);
const ROTA_CODES = new Set([504700055, 32807846, 40]);
const EXILED_FORCE_CODES = new Set([74131780, 26574095]);
const SPY_CODES = new Set([504700044, 24317029, 7]);
const RETURN_CODES = new Set([27174286, 471890671]);
const SOLEMN_CODES = new Set([41420027, 67]);

export default createDeckGuardrail({
  id: "goatformat-strike-ninja",
  tier: "Tier 2",
  playstyle: "midrange",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);
    const ownHand = observation.ownHand ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];

    // 1. ROTA Priority:
    // If opponent controls a floodgate or high threat (Mirage Dragon, Jinzo, Berserk Gorilla, BLS),
    // prioritize searching Exiled Force to eliminate it!
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      if (ROTA_CODES.has(sCode) || sName.includes("reinforcement of the army")) {
        const hasThreat = oppMonsters.some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          const mAtk = Number(m?.attack ?? m?.atk ?? 0);
          return mAtk >= 1700 || mName.includes("mirage dragon") || mName.includes("jinzo") || mName.includes("kycoo");
        });
        const cardTarget = entry.analysis?.cards?.[0];
        const tCode = codeOf(cardTarget);
        const tName = String(cardTarget?.name ?? "").toLowerCase();
        if (hasThreat && !EXILED_FORCE_CODES.has(tCode) && !tName.includes("exiled force")) {
          const canSearchExiled = evaluated.some((o) => {
            const oc = codeOf(o.analysis?.cards?.[0]);
            const on = String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase();
            return EXILED_FORCE_CODES.has(oc) || on.includes("exiled force");
          });
          if (canSearchExiled) {
            return "ROTA_SEARCH_EXILED_FORCE_REMOVAL";
          }
        }
      }

      // Mystic Tomato: When opponent controls a monster with ATK >= 1600,
      // recruit Newdoria (to destroy attacker upon battle destruction) or another Tomato rather than Dekoichi
      const TOMATO_CODES = new Set([504700142, 83011277, 12]);
      const NEWDORIA_CODES = new Set([4335645, 29697828]);
      if (TOMATO_CODES.has(sCode) || sName.includes("mystic tomato")) {
        const hasThreat = oppMonsters.some((m) => Number(m?.attack ?? m?.atk ?? 0) >= 1600);
        const cardTarget = entry.analysis?.cards?.[0];
        const tName = String(cardTarget?.name ?? "").toLowerCase();
        if (hasThreat && tName.includes("dekoichi")) {
          const canRecruitDefender = evaluated.some((o) => {
            const oc = codeOf(o.analysis?.cards?.[0]);
            const on = String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase();
            return NEWDORIA_CODES.has(oc) || on.includes("newdoria") || TOMATO_CODES.has(oc) || on.includes("tomato");
          });
          if (canRecruitDefender) {
            return "TOMATO_RECRUIT_NEWDORIA_OR_FLOATER";
          }
        }
      }
    }

    // 2. Exiled Force: NEVER set face-down! It has 1000 DEF and dies without using effect.
    if (role === "monster-set") {
      if (EXILED_FORCE_CODES.has(code) || name.includes("exiled force")) {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) {
          return "EXILED_FORCE_DO_NOT_SET";
        }
      }
    }

    // 3. Strike Ninja Evasion Discipline:
    // Only dodge when targeted by removal or when facing non-mitigable battle damage
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (STRIKE_NINJA_CODES.has(code) || name.includes("strike ninja")) {
        const publicChain = observation.publicChain ?? [];
        const lastLink = publicChain[publicChain.length - 1];
        const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
        const ctName = String(lastCard?.name ?? "").toLowerCase();
        const isOpponentAction = lastLink ? lastLink.controller !== Number(observation.player) : false;

        const isRemoval = isOpponentAction && (ctName.includes("sakuretsu") || ctName.includes("mirror force")
          || ctName.includes("ring of destruction") || ctName.includes("smashing ground")
          || ctName.includes("snatch steal") || ctName.includes("torrential")
          || ctName.includes("book of moon") || ctName.includes("compulsory")
          || ctName.includes("nobleman") || ctName.includes("raigeki break")
          || ctName.includes("chaos sorcerer") || ctName.includes("black luster")
          || ctName.includes("tribe-infecting") || ctName.includes("exiled force")
          || ctName.includes("d.d. warrior") || ctName.includes("thousand-eyes")
          || ctName.includes("tsukuyomi"));

        const phase = Number(observation.phase) || 0;
        const isBattle = (phase & (OcgPhase.BATTLE_START | OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE | OcgPhase.DAMAGE_CAL | OcgPhase.BATTLE)) !== 0
          || [8, 16, 32, 64, 128].includes(phase);
        const isOpponentTurn = !observation.isOwnTurn;
        const ownMonstersCount = Number(observation.ownMonsterCount ?? observation.ownMonsters?.length ?? 1);
        const oppThreat = Number(observation.opponentThreat ?? 0);
        const canPass = evaluated.some((o) => o !== entry && o.analysis?.role === "pass-chain");

        // Check if opponent controls a stronger monster in battle that would destroy Strike Ninja (1700 ATK)
        const oppStrongerMonster = oppMonsters.some((m) => {
          const mPos = Number(m.position) || 0;
          const mAtk = Number(m.attack ?? m.atk ?? 0);
          return (mPos & OcgPosition.ATTACK) !== 0 && mAtk > 1700;
        });
        const isBattleThreat = isOpponentTurn && isBattle && oppStrongerMonster;

        // If dodging would leave the field empty against direct lethal or critical damage (leaving <= 2000 LP), DO NOT DODGE!
        const leavesDirectDanger = ownMonstersCount <= 1 && (oppThreat >= ownLp || (oppThreat >= 2000 && (ownLp - oppThreat) <= 2000));
        if (isOpponentTurn && isBattle && leavesDirectDanger && canPass) {
          return "STRIKE_NINJA_AVOID_EXPOSING_DIRECT_LETHAL";
        }

        // If neither removal nor stronger monster battle threat is incoming, hold evasion!
        if (!isRemoval && !isBattleThreat && canPass) {
          return "STRIKE_NINJA_HOLD_EVASION_FOR_REAL_THREAT";
        }
      }

      // Solemn Judgment preservation:
      // In Strike Ninja, paying half LP is extremely dangerous alongside 2 Return from the Different Dimension.
      // Strictly reserve Solemn for high-impact game changers or when LP is safe.
      if (SOLEMN_CODES.has(code) || name.includes("solemn judgment")) {
        const publicChain = observation.publicChain ?? [];
        const lastLink = publicChain[publicChain.length - 1];
        const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
        const tName = String(lastCard?.name ?? "").toLowerCase();
        const isHighThreat = tName.includes("heavy storm") || tName.includes("giant trunade")
          || tName.includes("snatch steal") || tName.includes("black luster")
          || tName.includes("chaos sorcerer") || tName.includes("jinzo")
          || tName.includes("pot of greed") || tName.includes("delinquent duo")
          || tName.includes("wave-motion") || tName.includes("ring of destruction")
          || isImmediateLethal(entry, observation);
        const canPass = evaluated.some((o) => o !== entry && o.analysis?.role === "pass-chain");

        if (canPass) {
          if (!isHighThreat && ownLp <= 4000) {
            return "SOLEMN_JUDGMENT_PRESERVE_CRITICAL_LP";
          }
          if (!isHighThreat && (Number(observation.turn ?? 1) <= 2 || oppMonsters.length === 0)) {
            return "SOLEMN_JUDGMENT_HOLD_FOR_DECISIVE_CARDS";
          }
        }
      }
    }

    // 4. Set Preference for Walls:
    if (role === "summon") {
      const isWall = SPY_CODES.has(code) || name.includes("spy");
      if (isWall) {
        if (oppMonsters.length > 0) {
          const hasSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (hasSet && !isImmediateLethal(entry, observation)) {
            return "STRIKE_NINJA_PREFER_SET_FLOATERS";
          }
        }
      }
    }

    // 5. Return from the Different Dimension:
    if (role === "activate" || role === "chain") {
      if (RETURN_CODES.has(code) || name.includes("return from the different dimension")) {
        const ownBanished = observation.banished ?? [];
        const banishedCount = ownBanished.length;
        const oppThreat = Number(observation.opponentThreat ?? 0);
        const isOpponentTurn = !observation.isOwnTurn;

        if (banishedCount < 2 && !isImmediateLethal(entry, observation) && !(isOpponentTurn && oppThreat >= ownLp)) {
          return "STRIKE_NINJA_NEED_MORE_BANISHED_MONSTERS";
        }

        if (ownLp <= 1000 && !isImmediateLethal(entry, observation) && !(isOpponentTurn && oppThreat >= ownLp)) {
          return "STRIKE_NINJA_RETURN_LP_TOO_LOW";
        }

        // On opponent's turn in MP1: hold Return for Battle Phase or End Phase
        if (isOpponentTurn) {
          const phase = Number(observation.phase) || 0;
          const isMain1 = (phase & OcgPhase.MAIN1) !== 0 || phase === OcgPhase.MAIN1 || phase === 4;
          if (isMain1 && oppThreat < ownLp) {
            return "STRIKE_NINJA_HOLD_FOR_BATTLE_OR_END_PHASE";
          }
        }
      }
    }

    // 6. Anti-Burn Backrow Cap:
    if (role === "spell-set") {
      const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
        || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
        || (memory?.commitments?.againstBurn === true);
      const ownBackrow = observation.ownBackrow ?? [];
      if (isAgainstBurn && ownBackrow.length >= 2) {
        return "STRIKE_NINJA_CAP_BACKROW_AGAINST_BURN";
      }
    }

    // 7. Solemn Judgment proactive negation:
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

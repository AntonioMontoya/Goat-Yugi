import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, controllerOf, primaryCode, sourceCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";

const EXILED_FORCE_CODE = 74131780;
const ROTA_CODE = 44095762;

function resolveCardName(knowledge, item) {
  if (!item) return "";
  const direct = String(item.name ?? "");
  if (direct) return direct.toLowerCase();
  const c = codeOf(item);
  const fromK = knowledge?.byRuntimeCode?.[String(c)];
  return String(fromK?.name ?? "").toLowerCase();
}

const CONTINUOUS_LOCK_NAMES = ["gravity bind", "level limit - area b", "messenger of peace", "wave-motion cannon"];
function isContinuousLockOrThreat(knowledge, item) {
  const name = resolveCardName(knowledge, item);
  return CONTINUOUS_LOCK_NAMES.some((lock) => name.includes(lock));
}

export default createDeckGuardrail({
  id: "warrior",
  tier: "Tier 2",
  playstyle: "aggro",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};

    // 1. Exiled Force: Target high value monsters rather than weak tokens
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const source = sourceCode(knowledge, message, memory, observation);
      const sourceName = resolveCardName(knowledge, { code: source });
      if (source === EXILED_FORCE_CODE || sourceName.includes("exiled force")) {
        const owner = Number(observation.player ?? message.player ?? 0);
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const targetsWeakOrToken = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          return controllerOf(item) !== owner && Number(item?.attack ?? item?.atk ?? 0) <= 500;
        });
        if (targetsWeakOrToken) {
          const hasHighThreatTarget = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            return controllerOf(item) !== owner && Number(item?.attack ?? item?.atk ?? 0) >= 1400;
          }));
          if (hasHighThreatTarget) {
            return "EXILED_FORCE_TARGET_HIGH_VALUE_MONSTER";
          }
        }
      }

      // 2. ROTA Toolbox target selection based on opposing board state
      if (source === ROTA_CODE || sourceName.includes("reinforcement of the army")) {
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIdx = (entry.candidate?.indicies ?? [])[0];
        const chosen = selections[Number(selectedIdx)];
        const chosenName = resolveCardName(knowledge, chosen);

        const oppMonsters = observation.opponentMonsters ?? [];
        const oppFaceDown = oppMonsters.some((m) => m && !m.faceUp);
        const oppHighThreat = oppMonsters.some((m) => m && m.faceUp && (Number(m.attack ?? m.atk ?? 0) >= 1900));
        const oppEmpty = (Number(observation.opponentMonsterCount ?? oppMonsters.length) === 0);

        // A. If opponent has face-down monster, prioritize Mystic Swordsman LV2
        if (oppFaceDown) {
          const hasMystic = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
            return resolveCardName(knowledge, selections[Number(idx)]).includes("mystic swordsman");
          }));
          if (hasMystic && !chosenName.includes("mystic swordsman")) {
            return "ROTA_PREFER_MYSTIC_SWORDSMAN_AGAINST_FACE_DOWN";
          }
        }

        // B. If opponent has high threat (>= 1900 ATK), prioritize Zombyra (2100 ATK), Exiled Force, or D.D. Warrior Lady
        if (oppHighThreat && !oppFaceDown) {
          const hasAnswer = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
            const n = resolveCardName(knowledge, selections[Number(idx)]);
            return n.includes("zombyra") || n.includes("exiled force") || n.includes("d.d. warrior lady");
          }));
          if (hasAnswer && !chosenName.includes("zombyra") && !chosenName.includes("exiled force") && !chosenName.includes("d.d. warrior lady")) {
            return "ROTA_PREFER_HIGH_THREAT_REMOVAL";
          }
        }

        // C. If opponent has empty field, prioritize tempo beater (Don Zaloog / Blade Knight)
        if (oppEmpty) {
          const hasTempoBeater = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
            const n = resolveCardName(knowledge, selections[Number(idx)]);
            return n.includes("don zaloog") || n.includes("blade knight");
          }));
          if (hasTempoBeater && (chosenName.includes("mystic swordsman") || chosenName.includes("exiled force"))) {
            return "ROTA_PREFER_TEMPO_BEATER_ON_EMPTY_FIELD";
          }
        }
      }
    }

    // 3. Mystic Swordsman LV2: Avoid attacking face-up monsters with higher ATK
    if (role === "attack") {
      const card = entry.analysis?.cards?.[0];
      const attackerName = resolveCardName(knowledge, card);
      if (attackerName.includes("mystic swordsman")) {
        const attackIdx = Number(entry.candidate?.index ?? 0);
        const target = message?.attacks?.[attackIdx];
        const targetAtk = Number(target?.attack ?? target?.atk ?? 0);
        const targetFaceUp = target?.faceUp === true || (Number(target?.position ?? 0) & OcgPosition.FACEUP) !== 0;
        if (targetFaceUp && targetAtk > 900) {
          const canDoOther = evaluated.some((other) => other !== entry && ["main-two", "end-phase"].includes(other.analysis?.role));
          if (canDoOther && !isImmediateLethal(entry, observation)) {
            return "MYSTIC_SWORDSMAN_AVOID_ATTACKING_STRONGER_FACEUP";
          }
        }
      }
    }

    // 4. Blade Knight: Set backrow to reach <= 1 card in hand before battle for +400 ATK bonus
    if (observation.isOwnTurn && observation.phase === OcgPhase.MAIN1 && role === "battle-phase") {
      const ownMonsters = observation.ownMonsters ?? [];
      const controlsBladeKnight = ownMonsters.some((m) => m && m.faceUp && resolveCardName(knowledge, m).includes("blade knight"));
      const ownHandCount = Number(observation.ownHandCount ?? observation.hand?.length ?? 0);
      if (controlsBladeKnight && ownHandCount === 2) {
        const canSetBackrow = evaluated.some((other) => other !== entry && other.analysis?.role === "spell-set");
        if (canSetBackrow) {
          return "BLADE_KNIGHT_SET_BACKROW_FOR_ATK_BOOST";
        }
      }
    }

    // 5. Breaker the Magical Warrior: Prioritize destroying active locks/burn before battle
    if (observation.isOwnTurn && observation.phase === OcgPhase.MAIN1 && (role === "battle-phase" || role === "end-phase")) {
      const oppBackrow = observation.opponentBackrow ?? [];
      const hasLock = oppBackrow.some((b) => b && b.faceUp && isContinuousLockOrThreat(knowledge, b));
      if (hasLock) {
        const canPopBreaker = evaluated.some((other) => other !== entry && other.analysis?.role === "activate"
          && resolveCardName(knowledge, other.analysis?.cards?.[0]).includes("breaker"));
        if (canPopBreaker) {
          return "BREAKER_POP_LOCK_BEFORE_BATTLE";
        }
      }
    }

    // 6. D.D. Warrior Lady: Crash to banish opposing boss (>= 2000 ATK) instead of passing
    if ((role === "main-two" || role === "end-phase") && observation.isOwnTurn) {
      const oppMonsters = observation.opponentMonsters ?? [];
      const hasOppBoss = oppMonsters.some((m) => m && m.faceUp && (Number(m.attack ?? m.atk ?? 0) >= 2000));
      if (hasOppBoss && Number(observation.ownLp ?? 8000) > 2000) {
        const canCrashDDWL = evaluated.some((other) => other !== entry && other.analysis?.role === "attack"
          && resolveCardName(knowledge, other.analysis?.cards?.[0]).includes("d.d. warrior lady"));
        if (canCrashDDWL) {
          return "DD_WARRIOR_LADY_CRASH_TO_BANISH_BOSS";
        }
      }

      // 7. Zombyra the Dark: Attack opposing beaters (1500-2000 ATK) instead of passing
      const oppBeaters = oppMonsters.filter((m) => m && m.faceUp
        && (Number(m.position ?? 0) & OcgPosition.ATTACK) !== 0
        && Number(m.attack ?? m.atk ?? 0) >= 1500
        && Number(m.attack ?? m.atk ?? 0) <= 2000);
      if (oppBeaters.length > 0) {
        const canAttackZombyra = evaluated.some((other) => other !== entry && other.analysis?.role === "attack"
          && resolveCardName(knowledge, other.analysis?.cards?.[0]).includes("zombyra"));
        if (canAttackZombyra) {
          return "ZOMBYRA_ATTACK_OPPONENT_BEATER";
        }
      }
    }

    // 8. Solemn Judgment: Prioritize negating game-winning cards (Heavy Storm, Snatch Steal, etc.)
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "pass-chain") {
      const chainEntries = observation.publicChain ?? [];
      const lastChain = chainEntries[chainEntries.length - 1];
      const chainName = resolveCardName(knowledge, lastChain);
      const isGameEnding = chainName.includes("heavy storm")
        || chainName.includes("snatch steal")
        || chainName.includes("delinquent duo")
        || chainName.includes("pot of greed");
      if (isGameEnding && Number(observation.ownLp ?? 8000) > 1000) {
        const canSolemn = evaluated.some((other) => other !== entry && other.analysis?.role === "chain"
          && resolveCardName(knowledge, other.analysis?.cards?.[0]).includes("solemn judgment"));
        if (canSolemn) {
          return "SOLEMN_JUDGMENT_MUST_NEGATE_GAME_WINNING_CARD";
        }
      }
    }

    return null;
  },
});

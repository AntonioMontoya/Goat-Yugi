import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SCAPEGOAT_CODE = 73915051;
const BLS_CODE = 72989416;
const CREATURE_SWAP_CODE = 31036355;
const SUMMONED_SKULL_CODE = 70781052;
const PARSHATH_CODE = 18036057;

export default createDeckGuardrail({
  id: "reasoning-gate",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const roles = new Set(entry.analysis?.cards?.[0]?.roles ?? []);
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const ownLp = Number(observation.ownLp) || 8000;
    const oppThreat = Number(observation.opponentThreat) || 0;
    const ownHand = observation.ownHand ?? [];

    // 1. Scapegoat in SELECT_IDLECMD: Never activate in Main Phase!
    // Tokens cannot be tributed for Summoned Skull (2500 ATK) or Parshath.
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (code === SCAPEGOAT_CODE || name.includes("scapegoat") || roles.has("token")) {
        const sameCardAlternatives = evaluated.filter((other) => other !== entry && primaryCode(other) === primaryCode(entry));
        if (sameCardAlternatives.some((other) => other.analysis?.role === "spell-set")) {
          return "DEFENSIVE_TOKEN_SPELL_SHOULD_BE_SET";
        }
        const hasOtherAction = evaluated.some((other) => other !== entry && other.analysis?.role !== "activate");
        if (hasOtherAction) {
          return "DO_NOT_ACTIVATE_TOKEN_SPELL_IN_IDLE";
        }
      }
    }

    // 1b. Creature Swap in SELECT_IDLECMD: Do not activate unless we have low-value fodder or opponent has superior threat
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (code === CREATURE_SWAP_CODE || name.includes("creature swap")) {
        const hasFodder = ownMonsters.some((m) => {
          const mAtk = Number(m?.attack ?? m?.atk ?? 0);
          const mName = String(m?.name ?? "").toLowerCase();
          return mAtk <= 1000 || mName.includes("serpent") || mName.includes("sangan") || mName.includes("token") || mName.includes("reaper");
        });
        const ownMaxAtk = Math.max(0, ...ownMonsters.map((m) => Number(m?.attack ?? m?.atk ?? 0)));
        const oppMaxAtk = Math.max(0, ...oppMonsters.map((m) => Number(m?.attack ?? m?.atk ?? 0)));
        const oppHasBiggerThreat = oppMaxAtk > ownMaxAtk && oppMaxAtk >= 2000;
        if (!hasFodder && !oppHasBiggerThreat) {
          const hasAlternative = evaluated.some((other) => other !== entry && other.analysis?.role !== "activate");
          if (hasAlternative) {
            return "AVOID_ACTIVATING_CREATURE_SWAP_WITHOUT_FODDER";
          }
        }
      }
    }

    // 2. Scapegoat in Battle Phase: Hold if we have tribute monsters in hand (Summoned Skull, Parshath) unless lethal!
    if ([OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message?.type) && role === "chain"
      && (code === SCAPEGOAT_CODE || name.includes("scapegoat") || roles.has("token"))) {
      const phase = Number(observation.phase) || 0;
      const isBattlePhase = (phase & (OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE | OcgPhase.BATTLE)) !== 0
        || message?.type === OcgMessageType.SELECT_BATTLECMD;
      const canPass = evaluated.some((other) => other !== entry && ["pass-chain", "main-two", "end-phase"].includes(other.analysis?.role));

      if (canPass && observation.isOwnTurn) {
        return "AVOID_ACTIVATING_SCAPEGOAT_ON_OWN_TURN";
      }
      if (canPass && !isBattlePhase) {
        return "DO_NOT_CHAIN_DEFENSIVE_TOKENS_OUTSIDE_BATTLE";
      }

      // Avoid feeding piercing monsters
      const isPiercingThreat = oppMonsters.some((m) => {
        const mName = String(m?.name ?? "").toLowerCase();
        return (mName.includes("airknight") || mName.includes("battle ox")) && m?.faceUp !== false;
      });
      if (canPass && isPiercingThreat) {
        return "AVOID_FEEDING_PIERCING_THREAT";
      }

      // If we hold tribute monsters in hand, do not clog monster zones unless incoming attack is lethal!
      const hasTributeMonster = ownHand.some((c) => Number(c?.level ?? 0) >= 5);
      const isLethalThreat = oppThreat >= ownLp;
      if (canPass && hasTributeMonster && !isLethalThreat) {
        return "HOLD_DEFENSIVE_TOKENS_FOR_TRIBUTE_SUMMON";
      }

      const oppAttackerCount = oppMonsters.filter((m) => m && m.faceUp !== false).length;
      const isCriticalLp = ownLp <= 2500;
      const isHeavyMultiAttack = oppAttackerCount >= 2 && oppThreat >= 2800;
      const isUnderThreat = isLethalThreat || isCriticalLp || isHeavyMultiAttack;
      if (canPass && !isUnderThreat) {
        return "HOLD_DEFENSIVE_TOKENS_FOR_EMERGENCY";
      }
    }

    // 3. Tribute Selection: Avoid tributing BLS or 1900 beaters; prefer Sinister, Sangan, Spy
    if (message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_SUM) {
      const selectedIndices = entry.candidate?.indicies ?? [];
      const selections = message.selects ?? [];
      const tributesHighValue = selectedIndices.some((idx) => {
        const item = selections[Number(idx)];
        const itemCode = codeOf(item);
        const itemName = String(item?.name ?? "").toLowerCase();
        return itemCode === BLS_CODE || itemName.includes("black luster") || (Number(item?.attack ?? 0) >= 1850);
      });
      if (tributesHighValue) {
        const hasAlternative = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
          const item = selections[Number(idx)];
          return codeOf(item) === BLS_CODE || Number(item?.attack ?? 0) >= 1850;
        }));
        if (hasAlternative) {
          return "AVOID_TRIBUTING_BEATER_OR_BOSS_FOR_SUMMON";
        }
      }
    }

    // 4. Beater Normal Summon: Prefer Attack Summon over Setting face-down
    if (role === "monster-set") {
      const isBeater = Number(card?.attack ?? card?.atk ?? 0) >= 1850
        || name.includes("breaker the magical warrior")
        || name.includes("d.d. warrior lady");
      if (isBeater) {
        const canSummon = evaluated.some((other) => other !== entry && other.analysis?.role === "summon" && (other.candidate?.index === entry.candidate?.index));
        if (canSummon) {
          return "BEATER_PREFER_ATTACK_SUMMON";
        }
      }
    }

    // 5. Creature Swap target selection: Prefer giving Sinister, Sangan, or Token over high ATK beaters
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sName = String(knowledge?.byRuntimeCode?.[String(sCode)]?.name ?? "").toLowerCase();
      if (sCode === CREATURE_SWAP_CODE || sName.includes("creature swap")) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const givesBoss = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          const itemCode = codeOf(item);
          const itemName = String(item?.name ?? "").toLowerCase();
          return itemCode === BLS_CODE || itemName.includes("black luster") || Number(item?.attack ?? 0) >= 1800;
        });
        if (givesBoss) {
          const hasLowValueTarget = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            return Number(item?.attack ?? 0) >= 1800;
          }));
          if (hasLowValueTarget) {
            return "CREATURE_SWAP_GIVE_LOW_VALUE_MONSTER";
          }
        }
      }
    }

    return null;
  },
});

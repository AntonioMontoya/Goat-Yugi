import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const METAMORPHOSIS_CODE = 46411259;
const TER_CODE = 63519819;
const SKILL_DRAIN_CODE = 82732705;
const TSUKUYOMI_CODE = 34853266;
const BOOK_OF_MOON_CODE = 14087893;
const MST_CODE = 89189982;
const BREAKER_CODE = 71413901;
const WAVE_MOTION_CODE = 38992735;

export default createDeckGuardrail({
  id: "goat-control",
  tier: "Tier 1",
  playstyle: "control",
  riskTolerance: 0.25,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const roles = new Set(entry.analysis?.cards?.[0]?.roles ?? []);

    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];
    const ownMonsters = observation.ownMonsters ?? [];

    const isSkillDrainActive = oppBackrow.some((c) => {
      const code = codeOf(c);
      const name = String(c?.name ?? knowledge?.byRuntimeCode?.[String(code)]?.name ?? "").toLowerCase();
      const faceUp = c?.faceUp !== false && (Number(c?.position ?? 0) & OcgPosition.FACEDOWN) === 0;
      return faceUp && (code === SKILL_DRAIN_CODE || name.includes("skill drain"));
    });

    const isContinuousBurnActive = oppBackrow.some((c) => {
      const code = codeOf(c);
      const name = String(c?.name ?? knowledge?.byRuntimeCode?.[String(code)]?.name ?? "").toLowerCase();
      const faceUp = c?.faceUp !== false && (Number(c?.position ?? 0) & OcgPosition.FACEDOWN) === 0;
      return faceUp && (code === WAVE_MOTION_CODE || name.includes("wave-motion"));
    });

    // 1. Scapegoat in MP1 locks out Normal Summon
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (roles.has("token") && (roles.has("summon-restriction") || roles.has("defense"))) {
        const sameCardAlternatives = evaluated.filter((other) => other !== entry && primaryCode(other) === primaryCode(entry));
        if (sameCardAlternatives.some((other) => other.analysis?.role === "spell-set")) {
          return "DEFENSIVE_TOKEN_SPELL_SHOULD_BE_SET";
        }
        if (observation.isOwnTurn && evaluated.some((other) => ["summon", "tribute-summon"].includes(other.analysis?.role))) {
          return "AVOID_PREMATURE_SCAPEGOAT_LOCKOUT";
        }
      }
    }

    // 2. Scapegoat chain on empty opening OR against burn traps
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain"
      && roles.has("token") && (roles.has("summon-restriction") || roles.has("defense"))) {
      const phase = Number(observation.phase) || 0;
      const isBattlePhase = (phase & (OcgPhase.BATTLE_STEP | OcgPhase.DAMAGE | OcgPhase.BATTLE)) !== 0;
      const isEndPhase = phase === OcgPhase.END;
      const canPass = evaluated.some((other) => other !== entry && other.analysis?.role === "pass-chain");
      const chainEntries = observation.publicChain ?? [];
      const oppChaining = chainEntries.some((ch) => controllerOf(ch) !== Number(observation.player));

      if (canPass && !oppChaining && !isBattlePhase && !isEndPhase) {
        return "DO_NOT_CHAIN_DEFENSIVE_TOKENS_ON_EMPTY_OPENING";
      }

      // Avoid feeding Just Desserts / Ceasefire burn lethal
      if (canPass && (isContinuousBurnActive || Number(observation.ownLp ?? 8000) <= 2500)) {
        if (!isBattlePhase) {
          return "GOAT_AVOID_SCAPEGOAT_AGAINST_BURN";
        }
      }
    }

    // 3. Metamorphosis: Do NOT summon TER under Skill Drain
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      const activeCode = primaryCode(entry);
      const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();
      if (activeCode === METAMORPHOSIS_CODE || activeName.includes("metamorphosis")) {
        if (isSkillDrainActive) {
          const onlyHasLevel1Tribute = ownMonsters.every((m) => Number(m?.level ?? 1) === 1);
          if (onlyHasLevel1Tribute) {
            return "GOAT_NO_METAMORPHOSIS_TER_UNDER_SKILL_DRAIN";
          }
        }
      }
    }

    // 4. Metamorphosis: Preserve boss monster (Level 8 / 2800+ ATK like BLS)
    if (message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_SUM) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      if (sCode === METAMORPHOSIS_CODE || String(sCard?.name ?? "").toLowerCase().includes("metamorphosis")) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const tributesBoss = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          return Number(c?.level ?? item?.level ?? 0) >= 8 || Number(c?.atk ?? item?.attack ?? 0) >= 2800;
        });
        if (tributesBoss) {
          const hasLesserTribute = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
            return Number(c?.level ?? item?.level ?? 0) >= 8 || Number(c?.atk ?? item?.attack ?? 0) >= 2800;
          }));
          if (hasLesserTribute) {
            return "PRESERVE_BOSS_FROM_METAMORPHOSIS";
          }
        }
      }
    }

    // 5. Tsukuyomi / Book of Moon targeting: Reset own equipped TER OR break opponent TER
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isTsukuyomiOrBook = sCode === TSUKUYOMI_CODE || sCode === BOOK_OF_MOON_CODE
        || sName.includes("tsukuyomi") || sName.includes("book of moon");

      if (isTsukuyomiOrBook) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const selectedItems = selectedIndices.map((idx) => selections[Number(idx)]);

        // 5a. Check if opponent has a face-up TER locking the field
        const oppTerIndex = selections.findIndex((item) => {
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          const isOpp = controllerOf(item) !== Number(observation.player);
          const isTer = codeOf(item) === TER_CODE || String(c?.name ?? item?.name ?? "").toLowerCase().includes("thousand-eyes restrict");
          const isFaceUp = (Number(item?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && item?.faceUp !== false;
          return isOpp && isTer && isFaceUp;
        });

        if (oppTerIndex >= 0 && !selectedIndices.includes(oppTerIndex)) {
          const canTargetOppTer = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(oppTerIndex));
          if (canTargetOppTer) {
            return "GOAT_TSUKUYOMI_BREAK_OPPONENT_TER_LOCK";
          }
        }

        // 5b. Reset own equipped TER to steal another monster
        const ownEquippedTerIndex = selections.findIndex((item) => {
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          const isOwn = controllerOf(item) === Number(observation.player);
          const isTer = codeOf(item) === TER_CODE || String(c?.name ?? item?.name ?? "").toLowerCase().includes("thousand-eyes restrict");
          const isFaceUp = (Number(item?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && item?.faceUp !== false;
          const hasEquip = (item?.equipCards?.length ?? 0) > 0 || Number(item?.attack ?? c?.atk ?? 0) > 0;
          return isOwn && isTer && isFaceUp && hasEquip;
        });

        if (ownEquippedTerIndex >= 0 && !selectedIndices.includes(ownEquippedTerIndex)) {
          const canTargetOwnTer = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(ownEquippedTerIndex));
          if (canTargetOwnTer && oppMonsters.length > 0) {
            return "GOAT_TSUKUYOMI_TER_RESET_COMBO";
          }
        }
      }
    }

    // 6. Spell/Trap removal priority: target continuous threats over generic backrow
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isRemoval = sCode === MST_CODE || sCode === BREAKER_CODE
        || sName.includes("mystical space typhoon") || sName.includes("breaker");

      if (isRemoval) {
        const selections = message.selects ?? [];
        const continuousThreatIndex = selections.findIndex((item) => {
          const code = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(code)];
          const name = String(c?.name ?? item?.name ?? "").toLowerCase();
          const isOpp = controllerOf(item) !== Number(observation.player);
          const isFaceUp = (Number(item?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && item?.faceUp !== false;
          return isOpp && isFaceUp && (code === SKILL_DRAIN_CODE || code === WAVE_MOTION_CODE || name.includes("skill drain") || name.includes("wave-motion") || name.includes("gravity bind") || name.includes("level limit"));
        });

        if (continuousThreatIndex >= 0) {
          const selectedIndices = entry.candidate?.indicies ?? [];
          if (!selectedIndices.includes(continuousThreatIndex)) {
            const canTargetContinuous = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(continuousThreatIndex));
            if (canTargetContinuous) {
              return "GOAT_PRESERVE_ST_REMOVAL_FOR_CONTINUOUS_THREATS";
            }
          }
        }
      }
    }

    return null;
  },
});

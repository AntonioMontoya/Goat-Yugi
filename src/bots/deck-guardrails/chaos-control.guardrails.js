import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, sourceCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";

const METAMORPHOSIS_CODE = 46411259;
const TER_CODE = 63519819;
const SKILL_DRAIN_CODE = 82732705;
const TSUKUYOMI_CODE = 34853266;
const BOOK_OF_MOON_CODE = 14087893;
const CHAOS_SORCERER_CODE = 651970296;
const BLS_CODE = 72989439;

export default createDeckGuardrail({
  id: "chaos-control",
  tier: "Tier 2",
  playstyle: "control",
  riskTolerance: 0.35,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];
    const ownMonsters = observation.ownMonsters ?? [];

    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Flip / Utility Monsters: Always SET, never normal summon in Attack
    if (role === "summon" && (name.includes("merchant") || name.includes("mimic") || name.includes("faith"))) {
      const hasSetAlternative = evaluated.some((other) => other !== entry && other.analysis?.role === "set");
      if (hasSetAlternative && !isImmediateLethal(entry, observation)) {
        return "CHAOS_CONTROL_SET_FLIP_MONSTERS";
      }
    }

    // 2. Skilled White Magician: Prefer Face-Up Attack summon over Set
    if (role === "set" && name.includes("skilled white")) {
      const hasSummonAlternative = evaluated.some((other) => other !== entry && other.analysis?.role === "summon");
      if (hasSummonAlternative) {
        return "CHAOS_CONTROL_PREFER_SKILLED_WHITE_ATTACK";
      }
    }

    // 3. Chaos Sorcerer: Banish Priority & Lethal Discipline
    if (message?.type === OcgMessageType.SELECT_IDLECMD) {
      if (role === "activate" && (code === CHAOS_SORCERER_CODE || name.includes("chaos sorcerer"))) {
        // Do NOT banish if we have immediate direct lethal by attacking
        if (isImmediateLethal(entry, observation)) {
          return "CHAOS_SORCERER_PRESERVE_ATTACK_FOR_LETHAL";
        }
      }
    }

    // 4. Chaos Sorcerer: Target Selection Priority
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      if (sCode === CHAOS_SORCERER_CODE || sName.includes("chaos sorcerer") || name.includes("chaos sorcerer")) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        // Avoid banishing a 0-ATK token if there is an opponent boss/threat monster face-up
        const bigThreatIndex = selections.findIndex((item) => {
          const isOpp = controllerOf(item) !== Number(observation.player);
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          const atk = Number(c?.atk ?? item?.attack ?? 0);
          const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
          const isBoss = atk >= 1900 || iName.includes("monarch") || iName.includes("vampire") || iName.includes("soldier") || iName.includes("restrict");
          return isOpp && isBoss;
        });
        if (bigThreatIndex >= 0 && !selectedIndices.includes(bigThreatIndex)) {
          const canTargetBoss = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(bigThreatIndex));
          if (canTargetBoss) {
            return "CHAOS_SORCERER_PRIORITIZE_BOSS_BANISH";
          }
        }
      }
    }

    // 5. Chaos Graveyard Banish Cost: Preserve Magician of Faith for recursion
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isChaosSummon = sCode === CHAOS_SORCERER_CODE || sCode === BLS_CODE || sName.includes("chaos") || sName.includes("black luster");
      if (isChaosSummon) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const banishesFaith = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          return String(c?.name ?? item?.name ?? "").toLowerCase().includes("magician of faith");
        });
        if (banishesFaith) {
          const hasOtherLight = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
            return String(c?.name ?? item?.name ?? "").toLowerCase().includes("magician of faith");
          }));
          if (hasOtherLight) {
            return "CHAOS_PRESERVE_FAITH_IN_GRAVEYARD";
          }
        }
      }
    }

    // 6. Tsukuyomi / Book of Moon: TER Loop (Reset Own TER or Break Opponent TER)
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isTsukuyomiOrBook = sCode === TSUKUYOMI_CODE || sCode === BOOK_OF_MOON_CODE
        || sName.includes("tsukuyomi") || sName.includes("book of moon");

      if (isTsukuyomiOrBook) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];

        // Break opponent TER lock
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
            return "CHAOS_CONTROL_BREAK_OPPONENT_TER";
          }
        }

        // Reset own equipped TER
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
            return "CHAOS_CONTROL_TER_RESET_COMBO";
          }
        }
      }
    }

    // 7. Asura Priest: Avoid suicide into 1900+ ATK face-up beater without support
    if (role === "summon" && (code === 2863439 || name.includes("asura priest"))) {
      const hasStrongBeater = oppMonsters.some((m) => {
        const c = knowledge?.byRuntimeCode?.[String(codeOf(m))];
        const atk = Number(c?.atk ?? m?.attack ?? 0);
        const faceUp = (Number(m?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && m?.faceUp !== false;
        return faceUp && atk >= 1800;
      });
      const hasBattleSupport = (observation.ownHand ?? []).some((h) => {
        const hName = String(h?.name ?? "").toLowerCase();
        return hName.includes("book of moon") || hName.includes("snatch");
      });
      if (hasStrongBeater && !hasBattleSupport && evaluated.some((other) => other !== entry)) {
        return "ASURA_AVOID_EXPOSURE_AGAINST_SUPERIOR_BEATER";
      }
    }

    return null;
  },
});

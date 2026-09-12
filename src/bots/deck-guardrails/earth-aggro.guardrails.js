import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";

const GIGANTES_CODE = 47606319;
const LILY_CODE = 73059002;
const GIANT_RAT_CODE = 97017120;
const DUSTSHOOT_CODE = 34643200;
const DD_ASSAILANT_CODE = 70074904;
const TER_CODE = 63519819;
const WAVE_MOTION_CODE = 38992735;
const GRAVITY_BIND_CODE = 8574277;
const LEVEL_LIMIT_CODE = 3136426;

export default createDeckGuardrail({
  id: "earth-aggro",
  tier: "Tier 2",
  playstyle: "aggro",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownBackrow = observation.ownBackrow ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];
    const ownLp = Number(observation.ownLp ?? 8000);

    // 1. S/T Removal Priority (MST, Dust Tornado, Heavy Storm):
    // Prioritize destroying continuous locks/threats (Wave-Motion, Gravity Bind, Level Limit, TER equip, Snatch Steal)
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isRemoval = sName.includes("mystical space") || sName.includes("dust tornado") || sName.includes("heavy storm");

      if (isRemoval) {
        const selections = message.selects ?? [];
        const continuousLockIndex = selections.findIndex((item) => {
          const cCode = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(cCode)];
          const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
          const isOpp = controllerOf(item) !== Number(observation.player);
          return isOpp && (cCode === WAVE_MOTION_CODE || cCode === GRAVITY_BIND_CODE || cCode === LEVEL_LIMIT_CODE
            || iName.includes("wave-motion") || iName.includes("gravity bind") || iName.includes("level limit") || iName.includes("snatch"));
        });

        if (continuousLockIndex >= 0) {
          const selectedIndices = entry.candidate?.indicies ?? [];
          if (!selectedIndices.includes(continuousLockIndex)) {
            const canTargetLock = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(continuousLockIndex));
            if (canTargetLock) {
              return "EARTH_AGGRO_PRIORITIZE_LOCK_REMOVAL";
            }
          }
        }
      }
    }

    // 2. Removal on Thousand-Eyes Restrict (Smashing Ground / Exiled Force / Target Selection)
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const selections = message.selects ?? [];
      const oppTerIndex = selections.findIndex((item) => {
        const isOpp = controllerOf(item) !== Number(observation.player);
        const cCode = codeOf(item);
        const c = knowledge?.byRuntimeCode?.[String(cCode)];
        const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
        return isOpp && (cCode === TER_CODE || iName.includes("thousand-eyes restrict"));
      });
      if (oppTerIndex >= 0) {
        const selectedIndices = entry.candidate?.indicies ?? [];
        if (!selectedIndices.includes(oppTerIndex)) {
          const canTargetTer = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(oppTerIndex));
          if (canTargetTer) {
            return "EARTH_PRIORITIZE_REMOVING_OPPONENT_TER";
          }
        }
      }
    }

    // 3. Giant Rat: Prefer Set in Defense over Normal Summon in Attack
    if (role === "summon" && (code === GIANT_RAT_CODE || name.includes("giant rat"))) {
      const hasSetAlternative = evaluated.some((o) => o !== entry && o.analysis?.role === "set");
      if (hasSetAlternative && !isImmediateLethal(entry, observation)) {
        return "EARTH_AGGRO_PREFER_SET_GIANT_RAT";
      }
    }

    // 4. Injection Fairy Lily: Pay 2000 LP if it wins battle against high-threat monster or gives direct lethal
    if (role === "yes" && (code === LILY_CODE || name.includes("injection fairy lily"))) {
      if (ownLp <= 2000) {
        // Cannot pay or leaves exactly 0 LP
        const canDecline = evaluated.some((o) => o !== entry && o.analysis?.role === "no");
        if (canDecline) {
          return "LILY_AVOID_LETHAL_LP_PAYMENT";
        }
      }
    }

    // 5. Banish Fuel Selection for Gigantes / The Rock Spirit: Preserve D.D. Assailant for revival
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      if (sCode === GIGANTES_CODE || sName.includes("gigantes") || sName.includes("rock spirit")) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const banishesAssailant = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          return codeOf(item) === DD_ASSAILANT_CODE || String(c?.name ?? item?.name ?? "").toLowerCase().includes("assailant");
        });
        if (banishesAssailant) {
          const hasOtherEarth = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
            return codeOf(item) === DD_ASSAILANT_CODE || String(c?.name ?? item?.name ?? "").toLowerCase().includes("assailant");
          }));
          if (hasOtherEarth) {
            return "EARTH_PRESERVE_ASSAILANT_IN_GRAVEYARD";
          }
        }
      }
    }

    // 6. Trap Dustshoot: Activate in Draw/Standby Phase when opponent has >= 4 cards
    if (message?.type === OcgMessageType.SELECT_CHAIN || message?.type === OcgMessageType.SELECT_IDLECMD) {
      if (code === DUSTSHOOT_CODE || name.includes("trap dustshoot")) {
        const oppHandCount = Number(observation.opponentHandCount ?? observation.opponentHand?.length ?? 0);
        if (oppHandCount < 4) {
          return "TRAP_DUSTSHOOT_REQUIRES_4_CARDS";
        }
      }
    }

    return null;
  },
});

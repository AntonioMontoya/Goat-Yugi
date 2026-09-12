import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";

const ZABORG_CODE = 51945556;
const MOBIUS_CODE = 4929256;
const THESTALOS_CODE = 26202165;
const BRAIN_CONTROL_CODE = 87910978;
const APPRENTICE_MAGICIAN_CODE = 8861947;

export default createDeckGuardrail({
  id: "goatformat-monarch",
  tier: "Tier 2",
  playstyle: "control",
  riskTolerance: 0.40,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry);
    const name = String(card?.name ?? "").toLowerCase();
    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];
    const ownHand = observation.ownHand ?? [];

    // 1. Avoid tribute summoning Zaborg when opponent controls 0 monsters (forces destroying self)
    if (role === "summon" || role === "tribute-summon") {
      if (code === ZABORG_CODE || name.includes("zaborg")) {
        const oppCount = Number(observation.opponentMonsterCount ?? oppMonsters.length ?? 0);
        const hasAlternative = evaluated.some((other) => other !== entry);
        if (oppCount === 0 && !isImmediateLethal(entry, observation) && hasAlternative) {
          return "AVOID_SUICIDAL_ZABORG_SUMMON";
        }
      }
    }

    // 2. Apprentice Magician & Old Vindictive: Always Set, never normal summon in Attack
    if (role === "summon" && (code === APPRENTICE_MAGICIAN_CODE || name.includes("apprentice") || name.includes("vindictive"))) {
      const hasSetAlternative = evaluated.some((other) => other !== entry && other.analysis?.role === "set");
      if (hasSetAlternative && !isImmediateLethal(entry, observation)) {
        return "MONARCH_PREFER_SET_APPRENTICE";
      }
    }

    // 3. Mobius targeting own backrow when clean opponent target exists
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const source = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(source)];
      const sourceName = String(sCard?.name ?? "").toLowerCase();
      const owner = Number(observation.player ?? message.player ?? 0);
      const selections = message.selects ?? message.select_cards ?? [];
      if (source === MOBIUS_CODE || sourceName.includes("mobius") || name.includes("mobius")) {
        const selectedIndices = entry.candidate?.indicies ?? [];
        const hasOwnBackrow = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          return controllerOf(item) === owner && [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(item?.location));
        });
        if (hasOwnBackrow) {
          const hasCleanAlternative = evaluated.some((other) => other !== entry && !(other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            return controllerOf(item) === owner && [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(item?.location));
          }));
          if (hasCleanAlternative) {
            return "MOBIUS_AVOID_TARGETING_OWN_BACKROW";
          }
        }
      }
    }

    // 4. Mobius optional trigger without opposing backrow
    if (role === "yes" && evaluated.some((other) => other !== entry && other.analysis?.role === "no")) {
      const source = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(source)];
      const sourceName = String(sCard?.name ?? "").toLowerCase();
      if (source === MOBIUS_CODE || sourceName.includes("mobius") || name.includes("mobius")) {
        const oppBackrowLength = Number(observation.opponentBackrowCount ?? oppBackrow.length ?? 0);
        if (oppBackrowLength === 0) {
          return "MOBIUS_NO_OPPOSING_TARGET";
        }
      }
    }

    // 5. Tribute Selection: Prioritize tributing opponent's stolen monster (via Brain Control / Snatch Steal)
    if (message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isMonarchSummon = sCode === ZABORG_CODE || sCode === MOBIUS_CODE || sCode === THESTALOS_CODE
        || sName.includes("monarch") || sName.includes("zaborg") || sName.includes("mobius") || sName.includes("thestalos");

      if (isMonarchSummon) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        // Check if there is a stolen monster available to tribute
        const stolenMonsterIndex = selections.findIndex((item) => {
          const isStolen = Boolean(item?.isStolen || item?.isControlChanged || (item?.equipCards ?? []).some((eq) => String(eq?.name ?? "").toLowerCase().includes("snatch")));
          return isStolen;
        });
        if (stolenMonsterIndex >= 0 && !selectedIndices.includes(stolenMonsterIndex)) {
          const canTributeStolen = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(stolenMonsterIndex));
          if (canTributeStolen) {
            return "MONARCH_PRIORITIZE_STOLEN_MONSTER_AS_TRIBUTE";
          }
        }
      }
    }

    // 6. Brain Control Activation Discipline: Do not pay 800 LP without Tribute follow-up or Lethal
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (code === BRAIN_CONTROL_CODE || name.includes("brain control")) {
        const hasTributeInHand = ownHand.some((c) => {
          const cName = String(c?.name ?? "").toLowerCase();
          return cName.includes("monarch") || cName.includes("zaborg") || cName.includes("mobius") || cName.includes("thestalos") || cName.includes("metamorphosis");
        });
        const hasAlternative = evaluated.some((other) => other !== entry);
        if (!hasTributeInHand && !isImmediateLethal(entry, observation) && hasAlternative) {
          return "BRAIN_CONTROL_REQUIRES_TRIBUTE_FOLLOWUP";
        }
      }
    }

    return null;
  },
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, createDeckGuardrail } from "./base-deck-guardrail.js";

function isAbsorbCard(card) {
  const name = String(card?.name ?? "").toLowerCase();
  const roles = new Set(card?.roles ?? []);
  return roles.has("absorb") || ["relinquished", "thousand-eyes restrict"].some((n) => name.includes(n));
}

export default createDeckGuardrail({
  id: "goatformat-relinquished-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};

    // 1. Prioritize absorption in MP1 before entering Battle Phase
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "battle-phase") {
      const unequippedAbsorb = (observation.ownMonsters ?? []).some((m) => {
        const isFaceUp = m?.faceUp === true || (Number(m?.position) & OcgPosition.FACEUP) !== 0;
        return isFaceUp && isAbsorbCard(m) && (Number(m?.attack ?? m?.atk ?? 0) === 0);
      });
      const oppMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) || 0;
      const canActivateAbsorb = evaluated.some((other) => other !== entry && other.analysis?.role === "activate" && other.analysis?.cards?.[0]?.roles?.includes("absorb"));
      if (unequippedAbsorb && oppMonsters > 0 && canActivateAbsorb) {
        return "PRIORITIZE_ABSORPTION_BEFORE_BATTLE";
      }
    }

    // 2. Absorb highest threat target (do not absorb 0 ATK when threats exist)
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sourceCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
      const sourceCard = knowledge?.byRuntimeCode?.[String(sourceCode)];
      if (isAbsorbCard(sourceCard)) {
        const owner = Number(observation.player ?? message.player ?? 0);
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const targetsZeroAtk = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          return controllerOf(item) !== owner && Number(item?.attack ?? item?.atk ?? 0) === 0;
        });
        if (targetsZeroAtk) {
          const hasHigherTarget = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            return controllerOf(item) !== owner && Number(item?.attack ?? item?.atk ?? 0) >= 1000;
          }));
          if (hasHigherTarget) {
            return "ABSORB_HIGHEST_THREAT_TARGET";
          }
        }
      }
    }

    // 3. Choose defense position for unequipped Relinquished/TER
    if (message?.type === OcgMessageType.SELECT_POSITION) {
      const card = entry.analysis?.cards?.[0];
      const attack = Number(card?.atk) || 0;
      const pos = Number(entry.candidate?.position) || 0;
      const hasOpponentThreats = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0) > 0 || Number(observation.opponentThreat) > 0;
      if (isAbsorbCard(card) && attack === 0 && hasOpponentThreats && (pos & OcgPosition.FACEUP_ATTACK) !== 0) {
        const canChooseDefense = evaluated.some((other) => (Number(other.candidate?.position) & OcgPosition.DEFENSE) !== 0);
        if (canChooseDefense) {
          return "AVOID_EXPOSING_UNEQUIPPED_ABSORB_IN_ATTACK";
        }
      }
    }

    return null;
  },
});

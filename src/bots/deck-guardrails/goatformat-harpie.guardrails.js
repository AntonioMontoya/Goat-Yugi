import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HUNTING_GROUND_CODES = new Set([679985622, 75782277]);
const ELEGANT_EGOTIST_CODES = new Set([1285474116, 504700157, 90219263]);
const TRIANGLE_SPARK_CODES = new Set([1245718006, 32298781]);
const HARPIE_LADY_SISTERS_CODES = new Set([534208603, 12206212]);
const HARPIE_LADY_1_CODES = new Set([1616656033, 91932350]);
const BIRDFACE_CODES = new Set([1908996011, 504700073, 45547649, 45458027]);
const SILPHEED_CODES = new Set([441329671, 73001017, 73005017]);
const KAMAKIRI_CODES = new Set([248049423, 504700145, 84834865]);

function isHarpieMonster(c) {
  if (!c) return false;
  const name = String(c.name ?? "").toLowerCase();
  const code = codeOf(c);
  return HARPIE_LADY_1_CODES.has(code)
    || HARPIE_LADY_SISTERS_CODES.has(code)
    || name.includes("harpie lady")
    || name.includes("harpie lady sisters")
    || name.includes("cyber harpie");
}

function isHarpieLadySisters(c) {
  if (!c) return false;
  const name = String(c.name ?? "").toLowerCase();
  const code = codeOf(c);
  return HARPIE_LADY_SISTERS_CODES.has(code) || name.includes("sisters");
}

export default createDeckGuardrail({
  id: "goatformat-harpie",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];
    const ownBackrow = observation.ownBackrow ?? [];

    const oppBackrowCount = Number(observation.opponentBackrowCount ?? oppBackrow.length);

    // Check if Harpies' Hunting Ground is currently active on field
    const isHuntingGroundActive = ownBackrow.some((s) => {
      const sName = String(s?.name ?? "").toLowerCase();
      const sCode = codeOf(s);
      return (HUNTING_GROUND_CODES.has(sCode) || sName.includes("hunting ground")) && s?.faceUp !== false;
    });

    // 1. MANDATORY Hunting Ground Safety: If Hunting Ground is active, opponent has 0 backrow,
    // AND we have face-down backrow of our own that would be forced to be destroyed!
    if (message?.type === OcgMessageType.SELECT_IDLECMD && (role === "summon" || role === "special-summon")) {
      const hasOwnFacedownBackrow = ownBackrow.some((s) => s && s.faceUp === false);
      if (isHarpieMonster(card) && isHuntingGroundActive && oppBackrowCount === 0 && hasOwnFacedownBackrow) {
        const hasAlternativeMonster = evaluated.some((other) =>
          other !== entry
          && (other.analysis?.role === "summon" || other.analysis?.role === "monster-set")
          && !isHarpieMonster(other.analysis?.cards?.[0])
        );
        if (hasAlternativeMonster && !isImmediateLethal(entry, observation)) {
          return "AVOID_SELF_POPPING_BACKROW_WITH_HUNTING_GROUND";
        }
      }
    }

    // 2. Triangle Ecstasy Spark Priority:
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (TRIANGLE_SPARK_CODES.has(code) || name.includes("triangle ecstasy spark")) {
        const hasSistersOnField = ownMonsters.some((m) => isHarpieLadySisters(m) && m?.faceUp !== false);
        if (hasSistersOnField) {
          return null; // Top priority
        } else {
          return "HOLD_TRIANGLE_SPARK_WITHOUT_SISTERS";
        }
      }
    }

    // 3. Elegant Egotist Swarm:
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (ELEGANT_EGOTIST_CODES.has(code) || name.includes("elegant egotist")) {
        const hasHarpieOnField = ownMonsters.some((m) => isHarpieMonster(m) && m?.faceUp !== false);
        if (!hasHarpieOnField) {
          return "ELEGANT_EGOTIST_REQUIRES_HARPIE_LADY_ON_FIELD";
        }
      }
    }

    // Elegant Egotist Swarm Priority: Never enter Battle Phase or End Phase if Egotist can be activated
    if ((role === "battle-phase" || role === "end-phase") && ownMonsters.length < 5) {
      const hasHarpieOnField = ownMonsters.some((m) => isHarpieMonster(m) && m?.faceUp !== false);
      const hasEgotistActivation = evaluated.some((other) =>
        other !== entry
        && ["activate", "spell"].includes(other.analysis?.role)
        && (ELEGANT_EGOTIST_CODES.has(primaryCode(other)) || String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("elegant egotist"))
      );
      if (hasHarpieOnField && hasEgotistActivation) {
        return "ACTIVATE_ELEGANT_EGOTIST_BEFORE_LEAVING_MAIN_PHASE";
      }
    }

    // 4. Harpie Lady Sisters: Cannot be Normal Summoned or Set
    if ((role === "summon" || role === "monster-set") && (HARPIE_LADY_SISTERS_CODES.has(code) || isHarpieLadySisters(card))) {
      return "HARPIE_LADY_SISTERS_CANNOT_BE_NORMAL_SUMMONED";
    }

    // 5. Target Selection in SELECT_CARD
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const selections = message.selects ?? message.select_cards ?? [];
      const sCode = sourceCode(knowledge, message, context?.memory, observation);

      // 5A. Hunting Ground: Always target opponent's backrow if available
      if (isHuntingGroundActive) {
        const oppSelections = selections.filter((s) => Number(s.controller) !== Number(observation.player ?? 0));
        if (oppSelections.length > 0) {
          const hasTargetedOwn = (entry.candidate?.indicies ?? []).some((idx) => {
            const s = selections[Number(idx)];
            return Number(s?.controller) === Number(observation.player ?? 0);
          });
          if (hasTargetedOwn) {
            return "HARPIE_HUNTING_GROUND_TARGET_OPPONENT_BACKROW";
          }
        }
      }

      // 5B. Recruiter Search (Flying Kamakiri #1 or Birdface): Prioritize Harpie Lady 1
      const isRecruiter = KAMAKIRI_CODES.has(sCode) || BIRDFACE_CODES.has(sCode);
      if (isRecruiter) {
        const hasHarpie1 = selections.some((c) => HARPIE_LADY_1_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("harpie lady 1"));
        if (hasHarpie1) {
          const selectsHarpie1 = (entry.candidate?.indicies ?? []).some((idx) => {
            const c = selections[Number(idx)];
            return HARPIE_LADY_1_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("harpie lady 1");
          });
          if (!selectsHarpie1) {
            return "RECRUITER_PRIORITIZE_HARPIE_LADY_1";
          }
        }
      }

      // 5C. Elegant Egotist Summons:
      // If we hold Triangle Ecstasy Spark, prioritize Harpie Lady Sisters; otherwise Harpie Lady 1
      if (ELEGANT_EGOTIST_CODES.has(sCode)) {
        const hand = observation.ownHand ?? [];
        const holdsTriangleSpark = hand.some((c) => TRIANGLE_SPARK_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("triangle"));
        if (holdsTriangleSpark) {
          const hasSisters = selections.some((c) => isHarpieLadySisters(c));
          if (hasSisters) {
            const selectsSisters = (entry.candidate?.indicies ?? []).some((idx) => isHarpieLadySisters(selections[Number(idx)]));
            if (!selectsSisters) return "EGOTIST_PRIORITIZE_SISTERS_FOR_TRIANGLE_SPARK";
          }
        }
      }
    }

    return null;
  }
});

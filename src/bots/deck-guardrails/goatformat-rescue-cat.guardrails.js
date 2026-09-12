import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const RESCUE_CAT_CODES = new Set([504700179, 14878871, 736513608]);
const LAST_WILL_CODES = new Set([504700147, 85602018, 90965879]);
const SWEEPER_CODES = new Set([42703248, 79093857, 19613556, 34]);
const MILUS_RADIANT_CODES = new Set([7489323, 770341966]);
const SANGAN_CODES = new Set([504700178, 26202165, 8]);
const LILY_CODES = new Set([504700138, 79575620, 885484181]);
const LEVEL_LIMIT_CODES = new Set([3136426, 266999288]);

export default createDeckGuardrail({
  id: "goatformat-rescue-cat",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const turn = Number(observation.turn ?? 1);

    // 1. Backrow Sweepers before Rescue Cat activation
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (RESCUE_CAT_CODES.has(code) || name.includes("rescue cat")) {
        // Crucial: On Turn 1, never activate Rescue Cat since monsters cannot attack and will be destroyed at End Phase!
        if (turn <= 1) {
          return "RESCUE_CAT_AVOID_ACTIVATION_ON_TURN_1";
        }

        const oppBackrow = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);
        const hasUnplayedTrunadeOrStorm = evaluated.some((other) => {
          if (other === entry) return false;
          const oCode = primaryCode(other) || codeOf(other.analysis?.cards?.[0]);
          const oName = String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase();
          return (SWEEPER_CODES.has(oCode) || oName.includes("giant trunade") || oName.includes("heavy storm"))
            && ["activate", "spell"].includes(other.analysis?.role);
        });
        if (hasUnplayedTrunadeOrStorm && oppBackrow >= 1) {
          return "RESCUE_CAT_CLEAR_BACKROW_BEFORE_POP";
        }
      }
    }

    // Never leave Main Phase without popping Rescue Cat or activating Last Will / Level Limit
    if (role === "battle-phase" || role === "end-phase") {
      const ownMonsters = observation.ownMonsters ?? [];
      const hasCatOnField = ownMonsters.some((m) => (RESCUE_CAT_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("rescue cat")) && m?.faceUp !== false);
      const hasCatActivation = evaluated.some((other) =>
        other !== entry
        && other.analysis?.role === "activate"
        && (RESCUE_CAT_CODES.has(primaryCode(other)) || String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("rescue cat"))
      );
      if (turn > 1 && hasCatOnField && hasCatActivation) {
        return "ACTIVATE_RESCUE_CAT_BEFORE_LEAVING_MAIN_PHASE";
      }

      const ownBackrow = observation.ownBackrow ?? [];
      const hasLevelLimitOnField = ownBackrow.some((s) => LEVEL_LIMIT_CODES.has(codeOf(s)) && s?.faceUp !== false);
      const hasLevelLimitActivation = evaluated.some((other) =>
        other !== entry
        && ["activate", "spell"].includes(other.analysis?.role)
        && (LEVEL_LIMIT_CODES.has(primaryCode(other)) || String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("level limit"))
      );
      if (!hasLevelLimitOnField && hasLevelLimitActivation) {
        return "ACTIVATE_LEVEL_LIMIT_BEFORE_LEAVING_MAIN_PHASE";
      }

      const hasWillActivation = evaluated.some((other) =>
        other !== entry
        && ["activate", "spell"].includes(other.analysis?.role)
        && (LAST_WILL_CODES.has(primaryCode(other)) || String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("last will"))
      );
      if (hasWillActivation) {
        return "ACTIVATE_LAST_WILL_BEFORE_BATTLE";
      }
    }

    // 2. Normal Summon of Rescue Cat: On turn 1, prefer setting floaters; on turn 2+, clear backrow first
    if (role === "summon" && (RESCUE_CAT_CODES.has(code) || name.includes("rescue cat"))) {
      if (turn <= 1) {
        const hasSetAlternative = evaluated.some((other) => other !== entry && other.analysis?.role === "monster-set");
        if (hasSetAlternative) {
          return "RESCUE_CAT_PREFER_SET_ON_TURN_1";
        }
      }

      const oppBackrow = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);
      const hasSweeper = evaluated.some((other) => {
        const oCode = primaryCode(other) || codeOf(other.analysis?.cards?.[0]);
        const oName = String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase();
        return (SWEEPER_CODES.has(oCode) || oName.includes("giant trunade") || oName.includes("heavy storm"))
          && ["activate", "spell"].includes(other.analysis?.role);
      });
      if (hasSweeper && oppBackrow >= 1) {
        return "RESCUE_CAT_CLEAR_BACKROW_BEFORE_SUMMON";
      }
    }

    // 3. On Turn 2+, prefer summoning Rescue Cat over setting random passive monsters
    if (role === "monster-set" && turn > 1) {
      const hasRescueCatSummon = evaluated.some((other) =>
        other !== entry
        && other.analysis?.role === "summon"
        && (RESCUE_CAT_CODES.has(primaryCode(other)) || String(other.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("rescue cat"))
      );
      if (hasRescueCatSummon) {
        return "RESCUE_CAT_PREFER_COMBO_SUMMON_OVER_SET";
      }
    }

    // 4. Source-Aware Selection in SELECT_CARD
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const selections = message.selects ?? message.select_cards ?? [];
      const sCode = sourceCode(knowledge, message, context?.memory, observation);

      // 4A. Rescue Cat Swarm: Pair at least 1 Milus Radiant (+500 ATK) with a beatstick (Wombat / Panda)
      const isRescueCat = RESCUE_CAT_CODES.has(sCode)
        || (Number(message.min) === 2 && Number(message.max) === 2 && selections.some((c) => MILUS_RADIANT_CODES.has(codeOf(c))));
      if (isRescueCat) {
        const hasMilus = selections.some((c) => MILUS_RADIANT_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("milus"));
        if (hasMilus) {
          const selectedIndices = entry.candidate?.indicies ?? [];
          const selectedMilusCount = selectedIndices.filter((idx) => {
            const c = selections[Number(idx)];
            return MILUS_RADIANT_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("milus");
          }).length;
          if (selectedMilusCount < 1) {
            return "RESCUE_CAT_PRIORITIZE_MILUS_RADIANT";
          }
          const hasBeatstick = selections.some((c) => {
            const code = codeOf(c);
            const name = String(c?.name ?? "").toLowerCase();
            return (name.includes("wombat") || name.includes("panda") || code === 9637706 || code === 9817927);
          });
          if (hasBeatstick && selectedMilusCount > 1) {
            return "RESCUE_CAT_PAIR_MILUS_WITH_BEATSTICK";
          }
        }
      }

      // 4B. Sangan Search: Strictly prioritize Rescue Cat from deck
      if (SANGAN_CODES.has(sCode)) {
        const hasCat = selections.some((c) => RESCUE_CAT_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("rescue cat"));
        if (hasCat) {
          const selectsCat = (entry.candidate?.indicies ?? []).some((idx) => {
            const c = selections[Number(idx)];
            return RESCUE_CAT_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("rescue cat");
          });
          if (!selectsCat) {
            return "SANGAN_PRIORITIZE_RESCUE_CAT";
          }
        }
      }

      // 4C. Last Will Resolution: Prioritize Injection Fairy Lily for decisive combat punch
      if (LAST_WILL_CODES.has(sCode)) {
        const ownLp = Number(observation.ownLp ?? 8000);
        const hasLily = selections.some((c) => LILY_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("lily"));
        if (hasLily && ownLp >= 2500) {
          const selectsLily = (entry.candidate?.indicies ?? []).some((idx) => {
            const c = selections[Number(idx)];
            return LILY_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("lily");
          });
          if (!selectsLily) {
            return "LAST_WILL_PRIORITIZE_LILY_FOR_LETHAL";
          }
        }
      }
    }

    // 5. Injection Fairy Lily: Always pay 2000 LP in battle if we have enough LP, but avoid self-lethal
    if ((role === "yes" || role === "no") && (LILY_CODES.has(code) || name.includes("lily") || name.includes("injection"))) {
      const ownLp = Number(observation.ownLp ?? 8000);
      if (role === "no" && ownLp > 2000) {
        return "LILY_ALWAYS_BOOST_IN_BATTLE";
      }
      if (role === "yes" && ownLp <= 2000) {
        return "LILY_AVOID_SUICIDE_LP_PAYMENT";
      }
    }

    return null;
  }
});

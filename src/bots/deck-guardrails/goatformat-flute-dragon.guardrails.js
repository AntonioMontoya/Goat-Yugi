import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const LORD_OF_D_CODES = new Set([17985575, 17985550, 284585007]);
const FLUTE_CODE = 43973174;
const MIRAGE_DRAGON_CODES = new Set([15960641, 138615465]);
const TYRANT_DRAGON_CODES = new Set([94568601, 504700164, 968998776]);
const HORUS_LV6_CODES = new Set([11224103, 504700015, 1492176996]);
const LUSTER_DRAGON_CODES = new Set([11091375, 106323101]);
const BEHEMOTH_CODES = new Set([43586926, 782018313]);
const STAMPING_DESTRUCTION_CODES = new Set([81385346, 423211928]);
const CYBER_STEIN_CODES = new Set([69015963, 1096735174]);
const MYSTIC_TOMATO_CODES = new Set([83011277, 504700142, 12]);
const SANGAN_CODES = new Set([26202165, 504700178, 8]);
const DEFENSIVE_TRAP_CODES = new Set([
  49587034, 56120475, 63, // Sakuretsu Armor
  44095762, 60,           // Mirror Force
  53582587, 61,           // Torrential Tribute
  83555666, 62,           // Ring of Destruction
  97077563, 64,           // Call of the Haunted
]);

function isDragonMonster(c) {
  if (!c) return false;
  const name = String(c.name ?? "").toLowerCase();
  const code = codeOf(c);
  if (name.includes("flute") || name.includes("stamping")) return false;
  return TYRANT_DRAGON_CODES.has(code)
    || HORUS_LV6_CODES.has(code)
    || LUSTER_DRAGON_CODES.has(code)
    || MIRAGE_DRAGON_CODES.has(code)
    || BEHEMOTH_CODES.has(code)
    || name.includes("tyrant dragon")
    || name.includes("horus the black flame")
    || name.includes("luster dragon")
    || name.includes("mirage dragon")
    || name.includes("twin-headed behemoth");
}

function isDefensiveTrap(c) {
  const code = codeOf(c);
  const name = String(c?.name ?? "").toLowerCase();
  return DEFENSIVE_TRAP_CODES.has(code)
    || name.includes("sakuretsu")
    || name.includes("mirror force")
    || name.includes("torrential")
    || name.includes("ring of destruction")
    || name.includes("call of the haunted");
}

export default createDeckGuardrail({
  id: "goatformat-flute-dragon",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const ownHand = observation.ownHand ?? [];
    const ownBackrow = observation.ownBackrow ?? [];
    const ownLp = Number(observation.ownLp) || 8000;
    const oppLp = Number(observation.opponentLp) || 8000;

    const hasLordOfD = ownMonsters.some((m) => {
      const mc = codeOf(m);
      const mn = String(m?.name ?? "").toLowerCase();
      return (LORD_OF_D_CODES.has(mc) || mn.includes("lord of d")) && m?.faceUp !== false;
    });

    const dragonsInHand = ownHand.filter(isDragonMonster);

    const hasFluteInHand = ownHand.some((c) => {
      const cc = codeOf(c);
      const cn = String(c?.name ?? "").toLowerCase();
      return cc === FLUTE_CODE || cn.includes("flute of summoning dragon");
    });

    const hasDefensiveTrapsInHand = ownHand.some(isDefensiveTrap);

    // 1. DEFENSIVE BACKROW SETTING (Balanced: 1-2 traps, prevents Heavy Storm wipe):
    // Prioritize setting up to 2 defensive traps before ending turn
    if (message?.type === OcgMessageType.SELECT_IDLECMD && (role === "end-phase" || role === "to-ep")) {
      const ownBackCount = ownBackrow.length;
      if (ownBackCount < 2 && hasDefensiveTrapsInHand) {
        const hasSpellSetAction = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (hasSpellSetAction) {
          return "SET_DEFENSIVE_TRAPS_BEFORE_ENDING_TURN";
        }
      }
    }

    // 2. COMBO EXECUTION PRIORITY:
    // If Lord of D. is face-up and we hold Flute + real Dragon monster in hand, activate Flute before BP or EP!
    if (message?.type === OcgMessageType.SELECT_IDLECMD && (role === "battle-phase" || role === "to-bp" || role === "end-phase" || role === "to-ep")) {
      if (hasLordOfD && hasFluteInHand && dragonsInHand.length > 0) {
        const canActivateFlute = evaluated.some((o) => {
          if (o === entry || o.analysis?.role !== "activate") return false;
          const oCode = primaryCode(o) || codeOf(o.analysis?.cards?.[0]);
          const oName = String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase();
          return oCode === FLUTE_CODE || oName.includes("flute of summoning dragon");
        });
        if (canActivateFlute) {
          return "EXECUTE_FLUTE_COMBO_BEFORE_PHASE_CHANGE";
        }
      }
    }

    // 3. THE FLUTE OF SUMMONING DRAGON ACTIVATION CONDITIONS:
    if (role === "activate" && (code === FLUTE_CODE || name.includes("flute of summoning dragon"))) {
      if (!hasLordOfD) {
        return "CANNOT_ACTIVATE_FLUTE_WITHOUT_LORD_OF_D";
      }
      if (dragonsInHand.length === 0) {
        return "HOLD_FLUTE_UNTIL_DRAGONS_IN_HAND";
      }
    }

    // 4. LORD OF D. NORMAL SUMMON:
    if (role === "summon" && (LORD_OF_D_CODES.has(code) || name.includes("lord of d"))) {
      const hasCombo = hasFluteInHand && dragonsInHand.length > 0;
      if (!hasCombo) {
        // If we have another beater to summon (Luster, Mirage, Breaker, Tomato, Behemoth), prefer the beater
        const hasBeaterSummon = evaluated.some((o) => {
          if (o === entry || o.analysis?.role !== "summon") return false;
          const oCode = primaryCode(o) || codeOf(o.analysis?.cards?.[0]);
          const oName = String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase();
          return !LORD_OF_D_CODES.has(oCode) && !oName.includes("lord of d") && !CYBER_STEIN_CODES.has(oCode) && !oName.includes("cyber-stein");
        });
        if (hasBeaterSummon) {
          return "PREFER_SUMMON_BEATER_OVER_LORD_OF_D";
        }

        // Only set Lord of D. in defense if opponent has face-up beaters > 1200 ATK AND we have no traps
        const oppThreats = oppMonsters.filter((m) => {
          const atk = Number(m?.attack ?? m?.atk ?? 0);
          return atk > 1200 && m?.faceUp !== false;
        });
        if (oppThreats.length > 0 && ownBackrow.length === 0 && !hasDefensiveTrapsInHand) {
          const hasSetOption = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (hasSetOption) {
            return "SET_LORD_OF_D_IN_DEFENSE_AGAINST_THREATS";
          }
        }
      }
    }

    // 5. NORMAL SUMMON DRAGON BEATERS:
    if ((role === "monster-set" || role === "set") && (
      LUSTER_DRAGON_CODES.has(code) || MIRAGE_DRAGON_CODES.has(code)
      || name.includes("luster dragon") || name.includes("mirage dragon")
    )) {
      const oppHasStronger = oppMonsters.some((m) => {
        const atk = Number(m?.attack ?? m?.atk ?? 0);
        return atk > 1900 && m?.faceUp !== false;
      });
      if (!oppHasStronger) {
        const hasSummonAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (hasSummonAlt) {
          return "PREFER_SUMMON_DRAGON_BEATER_OVER_SET";
        }
      }
    }

    // 6. MIRAGE DRAGON: Keep in Attack mode for Trap lockdown during Battle Phase
    if (role === "to-defense" || role === "pos-change") {
      if (MIRAGE_DRAGON_CODES.has(code) || name.includes("mirage dragon")) {
        const canStayAttack = evaluated.some((o) => o !== entry);
        if (canStayAttack) {
          return "KEEP_MIRAGE_DRAGON_IN_ATTACK_FOR_TRAP_LOCK";
        }
      }
    }

    // 7. CYBER-STEIN SAFETY (Clutch activation only):
    // Pay 5000 LP only when opponent has lethal board / big threat (>= 2400 ATK) to absorb with TER,
    // or when we can push for game (oppLp <= 3200). Never pay on empty/weak board.
    if (CYBER_STEIN_CODES.has(code) || name.includes("cyber-stein")) {
      if (role === "summon" || ["activate", "chain"].includes(role)) {
        const oppHasBigThreat = oppMonsters.some((m) => {
          const atk = Number(m?.attack ?? m?.atk ?? 0);
          return atk >= 2400 && m?.faceUp !== false;
        });
        const isLethalPush = oppLp <= 3200;
        if (ownLp <= 5000 || (!isLethalPush && !oppHasBigThreat)) {
          const canPass = evaluated.some((o) => o !== entry);
          if (canPass) {
            return "CYBER_STEIN_SAVE_LP_FOR_DRAGONS";
          }
        }
      }
    }

    // 8. STAMPING DESTRUCTION:
    if (role === "activate" && (STAMPING_DESTRUCTION_CODES.has(code) || name.includes("stamping destruction"))) {
      const hasDragonsOnField = ownMonsters.some((m) => {
        const race = String(m?.race ?? "").toLowerCase();
        const mn = String(m?.name ?? "").toLowerCase();
        return (race.includes("dragon") || mn.includes("dragon") || isDragonMonster(m)) && m?.faceUp !== false;
      });
      if (!hasDragonsOnField) {
        return "CANNOT_ACTIVATE_STAMPING_WITHOUT_DRAGON";
      }
    }

    // 9. FLUTE OF SUMMONING DRAGON SELECTIONS (SELECT_CARD):
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isFlute = sCode === FLUTE_CODE || sName.includes("flute of summoning dragon");

      if (isFlute) {
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];

        const bossIdx = selections.findIndex((item) => {
          const cCode = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
          const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
          return TYRANT_DRAGON_CODES.has(cCode) || HORUS_LV6_CODES.has(cCode)
            || cName.includes("tyrant dragon") || cName.includes("horus the black flame");
        });

        if (bossIdx >= 0 && !selectedIndices.includes(bossIdx)) {
          const canPickBoss = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(bossIdx));
          if (canPickBoss) {
            return "FLUTE_PRIORITIZE_HIGH_ATK_BOSS_DRAGON";
          }
        }
      }
    }

    // 10. SANGAN SEARCH TARGET SELECTION (SELECT_CARD):
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isSangan = SANGAN_CODES.has(sCode) || sName.includes("sangan");

      if (isSangan) {
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const lordOfDIdx = selections.findIndex((item) => {
          const cCode = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
          const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
          return LORD_OF_D_CODES.has(cCode) || cName.includes("lord of d");
        });
        const beaterIdx = selections.findIndex((item) => {
          const cCode = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
          const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
          return BEHEMOTH_CODES.has(cCode) || cName.includes("behemoth") || MYSTIC_TOMATO_CODES.has(cCode) || cName.includes("tomato");
        });

        if (hasFluteInHand && !hasLordOfD && lordOfDIdx >= 0) {
          if (!selectedIndices.includes(lordOfDIdx)) {
            const canPickLord = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(lordOfDIdx));
            if (canPickLord) return "SANGAN_SEARCH_LORD_OF_D_FOR_FLUTE";
          }
        } else if (beaterIdx >= 0) {
          if (!selectedIndices.includes(beaterIdx) && !selectedIndices.includes(lordOfDIdx)) {
            const canPickBeater = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(beaterIdx));
            if (canPickBeater) return "SANGAN_SEARCH_RESILIENT_MONSTER";
          }
        }
      }
    }

    // 11. MYSTIC TOMATO RECRUITER SELECTION (SELECT_CARD):
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isTomato = MYSTIC_TOMATO_CODES.has(sCode) || sName.includes("mystic tomato");

      if (isTomato) {
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];

        const oppAttackers = oppMonsters.filter((m) => {
          const isAtk = (Number(m?.position ?? 0) & 1) !== 0 && m?.faceUp !== false;
          const atk = Number(m?.attack ?? m?.atk ?? 0);
          return isAtk && atk > 1200;
        });
        const isSafeForLordOfD = oppAttackers.length <= 1;

        const lordOfDIdx = selections.findIndex((item) => {
          const cCode = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
          const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
          return LORD_OF_D_CODES.has(cCode) || cName.includes("lord of d");
        });

        if (hasFluteInHand && !hasLordOfD && isSafeForLordOfD && lordOfDIdx >= 0) {
          if (!selectedIndices.includes(lordOfDIdx)) {
            const canPickLord = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(lordOfDIdx));
            if (canPickLord) {
              return "MYSTIC_TOMATO_RECRUIT_LORD_OF_D_FOR_FLUTE";
            }
          }
        }
      }
    }

    // 12. EXTRA DECK SELECTION (Cyber-Stein):
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const selections = message.selects ?? message.select_cards ?? [];
      const selectedIndices = entry.candidate?.indicies ?? [];
      const terIdx = selections.findIndex((item) => {
        const cCode = codeOf(item);
        const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
        const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
        return cCode === 63519819 || cCode === 504700102 || cName.includes("thousand-eyes");
      });
      const beaterIdx = selections.findIndex((item) => {
        const cCode = codeOf(item);
        const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
        const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
        return cName.includes("king dragun") || cName.includes("b. skull") || cName.includes("dark paladin");
      });

      if (terIdx >= 0 && beaterIdx >= 0 && oppMonsters.length === 0) {
        if (selectedIndices.includes(terIdx)) {
          const canPickBeater = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(beaterIdx));
          if (canPickBeater) {
            return "DO_NOT_SUMMON_TER_ON_EMPTY_FIELD";
          }
        }
      }
    }

    // 13. STAMPING DESTRUCTION TARGETING:
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isStamping = STAMPING_DESTRUCTION_CODES.has(sCode) || sName.includes("stamping destruction");

      if (isStamping) {
        const selections = message.selects ?? message.select_cards ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const floodgateIdx = selections.findIndex((item) => {
          const cCode = codeOf(item);
          const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
          const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
          const isOpp = controllerOf(item) !== Number(observation.player);
          const isFaceUp = (Number(item?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && item?.faceUp !== false;
          return isOpp && isFaceUp && (
            cName.includes("skill drain") || cName.includes("gravity bind")
            || cName.includes("level limit") || cName.includes("wave-motion")
            || cName.includes("call of the haunted")
          );
        });

        if (floodgateIdx >= 0 && !selectedIndices.includes(floodgateIdx)) {
          const canPickFloodgate = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(floodgateIdx));
          if (canPickFloodgate) {
            return "STAMPING_DESTRUCTION_TARGET_FLOODGATE";
          }
        }
      }
    }

    return null;
  },
});

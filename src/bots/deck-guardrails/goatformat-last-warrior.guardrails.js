import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const LAST_WARRIOR_CODE = 86099788;
const TER_CODES = new Set([63519819, 504700102]);
const FUSILIER_CODE = 51632798;
const SWIFT_GAIA_CODES = new Set([16589042, 6368038]);
const METAMORPHOSIS_CODE = 46411259;
const CYBER_STEIN_CODE = 69015963;
const WAVE_MOTION_CODE = 38992735;
const IMT_CODE = 36261276; // Interdimensional Matter Transporter
const SOLEMN_CODE = 41420027;
const SPELL_SHIELD_CODE = 38275183;
const NIGHTMARE_WHEEL_CODE = 54704216;

export default createDeckGuardrail({
  id: "goatformat-last-warrior",
  tier: "Tier 3",
  playstyle: "lockdown",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const ownLp = Number(observation.ownLp) || 8000;
    const oppLp = Number(observation.opponentLp) || 8000;
    const oppThreat = Number(observation.opponentThreat) || 0;

    const hasLastWarrior = ownMonsters.some((m) => {
      const mc = codeOf(m);
      const mn = String(m?.name ?? "").toLowerCase();
      return (mc === LAST_WARRIOR_CODE || mn.includes("last warrior")) && m?.faceUp !== false;
    });

    // 1. Metamorphosis Priority on Level 7 (Last Warrior) or Level 1 (Thousand-Eyes Restrict)
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (code === METAMORPHOSIS_CODE || name.includes("metamorphosis")) {
        const hasLevel7Fodder = ownMonsters.some((m) => {
          const mc = codeOf(m);
          const mn = String(m?.name ?? "").toLowerCase();
          const lvl = Number(m?.level ?? 0);
          return (mc === FUSILIER_CODE || SWIFT_GAIA_CODES.has(mc) || mn.includes("fusilier") || mn.includes("gaia") || lvl === 7)
            && m?.faceUp !== false;
        });
        const hasLevel1Fodder = ownMonsters.some((m) => {
          const mc = codeOf(m);
          const mn = String(m?.name ?? "").toLowerCase();
          const lvl = Number(m?.level ?? 0);
          return (mc === CYBER_STEIN_CODE || mn.includes("token") || mn.includes("stein") || lvl === 1);
        });
        const oppHasMonster = oppMonsters.length > 0;
        const canUseTER = hasLevel1Fodder && oppHasMonster;

        // If we don't have Level 7 (Last Warrior) nor Level 1 with opponent monster to steal (TER), hold Metamorphosis
        if (!hasLevel7Fodder && !canUseTER) {
          const hasAlternative = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (hasAlternative) {
            return "HOLD_METAMORPHOSIS_FOR_VALUABLE_TARGET";
          }
        }
      }
    }

    // 2. Fusilier Dragon: When holding Metamorphosis, prefer Normal Summon (without tribute) over Setting
    if ((role === "monster-set" || role === "set") && (code === FUSILIER_CODE || name.includes("fusilier"))) {
      const hasMetaInHand = observation.ownHand?.some((c) => {
        const cc = codeOf(c);
        const cn = String(c?.name ?? "").toLowerCase();
        return cc === METAMORPHOSIS_CODE || cn.includes("metamorphosis");
      });
      if (hasMetaInHand) {
        const hasSummonAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (hasSummonAlt) {
          return "FUSILIER_SUMMON_FOR_METAMORPHOSIS_COMBO";
        }
      }
    }

    // 3. Cyber-Stein Safety:
    // Only pay 5000 LP if safe from immediate loss and we don't already have The Last Warrior
    if (role === "activate" && (code === CYBER_STEIN_CODE || name.includes("cyber-stein"))) {
      if (ownLp <= 5000) {
        return "CYBER_STEIN_INSUFFICIENT_LP";
      }
      if (hasLastWarrior) {
        return "CYBER_STEIN_ALREADY_HAVE_LAST_WARRIOR";
      }
      if ((ownLp - 5000) <= oppThreat && oppThreat > 0) {
        const canPass = evaluated.some((o) => o !== entry);
        if (canPass) {
          return "CYBER_STEIN_PAYMENT_EXPOSES_LETHAL";
        }
      }
    }

    // 4. The Last Warrior Field Presence: Do not attempt Normal Summon or Set when Last Warrior is active
    if (hasLastWarrior && (role === "summon" || role === "monster-set")) {
      const hasOtherAction = evaluated.some((o) => o !== entry && !["summon", "monster-set"].includes(o.analysis?.role));
      if (hasOtherAction) {
        return "LAST_WARRIOR_LOCKDOWN_ACTIVE_DO_NOT_SUMMON";
      }
    }

    // 5. Wave-Motion Cannon:
    // Only hold if activating FROM FIELD (SZONE). Activating from HAND to start charging is always allowed!
    if (role === "activate" && (code === WAVE_MOTION_CODE || name.includes("wave-motion"))) {
      const selected = message?.activates?.[Number(entry.candidate?.index)];
      const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
      const isFieldActivation = Number(selected?.location) === OcgLocation.SZONE
        || (observation.ownBackrow ?? []).some((c) => codeOf(c) === WAVE_MOTION_CODE && isCardActiveFaceUp(c) && c?.sequence === selected?.sequence);

      if (isFieldActivation) {
        const instance = (observation.ownBackrow ?? []).find((c) => codeOf(c) === WAVE_MOTION_CODE && isCardActiveFaceUp(c));
        const turnsActive = Number(instance?.turnsActive ?? instance?.turns ?? instance?.standbyCount ?? 0) || Math.max(1, Math.floor((Number(observation.turn) || 1) / 2));
        const burnDamage = turnsActive * 1000;
        const isLethalBurn = burnDamage >= oppLp;
        if (!isLethalBurn && turnsActive < 4) {
          const canHold = evaluated.some((o) => o !== entry && (o.analysis?.role !== "activate" || primaryCode(o) !== code));
          if (canHold) {
            return "CHARGE_WAVE_MOTION_CANNON";
          }
        }
      }
    }

    // 6. Defensive Backrow Setting Priority:
    // In Main Phase, if the bot is about to pass turn to End Phase, ensure it sets vital protection traps
    // (Solemn Judgment, Spell Shield Type-8, Nightmare Wheel, IMT) if backrow slots are available (< 5).
    if (message?.type === OcgMessageType.SELECT_IDLECMD && (role === "end-phase" || role === "to-ep")) {
      const ownBackCount = observation.ownBackrow?.length ?? 0;
      if (ownBackCount < 5) {
        const hasProtectionInHand = (observation.ownHand ?? []).some((c) => {
          const cc = codeOf(c);
          const cn = String(c?.name ?? "").toLowerCase();
          return cc === SOLEMN_CODE || cc === SPELL_SHIELD_CODE || cn.includes("solemn") || cn.includes("spell shield")
            || cc === NIGHTMARE_WHEEL_CODE || cn.includes("nightmare wheel") || cc === IMT_CODE || cn.includes("interdimensional");
        });
        const hasSpellSetAction = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (hasProtectionInHand && hasSpellSetAction) {
          return "SET_DEFENSIVE_TRAPS_BEFORE_ENDING_TURN";
        }
      }
    }

    // 7. Counter-Trap / Protection Chains: Save The Last Warrior from removal or board threats
    if (message?.type === OcgMessageType.SELECT_CHAIN) {
      const publicChain = observation.publicChain ?? [];
      const lastLink = publicChain[publicChain.length - 1];
      const lastCard = lastLink ? (knowledge?.byRuntimeCode?.[String(lastLink.code)] ?? publicCardSemantics(lastLink.code)) : null;
      const tName = String(lastCard?.name ?? "").toLowerCase();
      const isOpponentAction = lastLink ? lastLink.controller !== Number(observation.player) : false;

      const isCriticalThreat = isOpponentAction && (
        tName.includes("smashing") || tName.includes("fissure") || tName.includes("ring of destruction")
        || tName.includes("sakuretsu") || tName.includes("mirror force") || tName.includes("snatch")
        || tName.includes("compulsory") || tName.includes("raigeki break") || tName.includes("heavy storm")
        || tName.includes("mystical space typhoon") || tName.includes("creature swap")
      );

      // 7a. Interdimensional Matter Transporter
      if (role === "chain" && (code === IMT_CODE || name.includes("interdimensional"))) {
        const isThreatToWarrior = isCriticalThreat && hasLastWarrior;
        const canPass = evaluated.some((o) => o !== entry && o.analysis?.role === "pass-chain");
        if (!isThreatToWarrior && canPass) {
          return "HOLD_IMT_FOR_LAST_WARRIOR_PROTECTION";
        }
      }

      // 7b. Force Solemn Judgment / Spell Shield Type-8 when critical threat targets Last Warrior or clears field
      if (role === "pass-chain" && isCriticalThreat && hasLastWarrior) {
        const canNegate = evaluated.some((o) => {
          if (o.analysis?.role !== "chain") return false;
          const oc = primaryCode(o) || codeOf(o.analysis?.cards?.[0]);
          const on = String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase();
          return oc === SOLEMN_CODE || oc === SPELL_SHIELD_CODE || on.includes("solemn") || on.includes("spell shield");
        });
        if (canNegate) {
          return "MUST_NEGATE_CRITICAL_THREAT_TO_LAST_WARRIOR";
        }
      }
    }

    // 8. Fusion Monster Selection (Cyber-Stein / Extra Deck):
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const selections = message.selects ?? [];
      const selectedIndices = entry.candidate?.indicies ?? [];
      const lastWarriorIdx = selections.findIndex((item) => {
        const cCode = codeOf(item);
        const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
        const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
        return cCode === LAST_WARRIOR_CODE || cName.includes("last warrior");
      });
      const terIdx = selections.findIndex((item) => {
        const cCode = codeOf(item);
        const c = knowledge?.byRuntimeCode?.[String(cCode)] ?? publicCardSemantics(cCode);
        const cName = String(c?.name ?? item?.name ?? "").toLowerCase();
        return TER_CODES.has(cCode) || cName.includes("thousand-eyes");
      });

      if (lastWarriorIdx >= 0 && terIdx >= 0) {
        // Both Last Warrior and TER are selectable (Cyber-Stein fusion pool)
        const oppHighThreat = oppMonsters.some((m) => {
          const c = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
          const atk = Number(c?.atk ?? m?.attack ?? m?.atk ?? 0);
          const isFaceUp = (Number(m?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && m?.faceUp !== false;
          return isFaceUp && atk > 2350;
        });

        if (oppHighThreat) {
          if (!selectedIndices.includes(terIdx)) {
            const canPickTer = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(terIdx));
            if (canPickTer) {
              return "CYBER_STEIN_PREFER_TER_AGAINST_HIGH_ATK";
            }
          }
        } else {
          if (!selectedIndices.includes(lastWarriorIdx)) {
            const canPickLW = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(lastWarriorIdx));
            if (canPickLW) {
              return "CYBER_STEIN_PREFER_LAST_WARRIOR_LOCKDOWN";
            }
          }
        }
      }
    }

    // 9. Targeting Priority: TER monster steal & Nightmare Wheel
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isTer = TER_CODES.has(sCode) || sName.includes("thousand-eyes");
      const isNightmareWheel = sCode === NIGHTMARE_WHEEL_CODE || sName.includes("nightmare wheel");

      if (isTer || isNightmareWheel) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        let bestIdx = -1;
        let highestAtk = -1;
        selections.forEach((item, idx) => {
          if (controllerOf(item) !== Number(observation.player)) {
            const c = knowledge?.byRuntimeCode?.[String(codeOf(item))] ?? publicCardSemantics(codeOf(item));
            const atk = Number(c?.atk ?? item?.attack ?? item?.atk ?? 0);
            if (atk > highestAtk) {
              highestAtk = atk;
              bestIdx = idx;
            }
          }
        });
        if (bestIdx >= 0 && !selectedIndices.includes(bestIdx)) {
          const canPickBest = evaluated.some((o) => (o.candidate?.indicies ?? []).includes(bestIdx));
          if (canPickBest) {
            return isTer ? "TER_TARGET_STRONGEST_OPPONENT_MONSTER" : "NIGHTMARE_WHEEL_FREEZE_STRONGEST_MONSTER";
          }
        }
      }
    }

    return null;
  },
});

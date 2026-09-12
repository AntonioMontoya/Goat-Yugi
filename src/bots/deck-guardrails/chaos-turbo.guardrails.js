import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const THUNDER_DRAGON_CODE = 15;
const THUNDER_DRAGON_RUNTIME = 31560081;
const RAIGEKI_BREAK_CODE = 1864389416;
const RAIGEKI_BREAK_ID = 62;
const SINISTER_SERPENT_CODE = 9;
const SINISTER_SERPENT_RUNTIME = 81309177;
const NIGHT_ASSAILANT_CODE = 313719195;
const NIGHT_ASSAILANT_RUNTIME = 41398771;
const CHAOS_SORCERER_CODE = 651970296;
const BLS_CODE = 14;
const BLS_RUNTIME = 72989439;
const SKILL_DRAIN_CODE = 82732705;
const SKILL_DRAIN_RUNTIME = 1768996512;
const WAVE_MOTION_CODE = 38992735;
const WAVE_MOTION_RUNTIME = 1923069886;

const RECURRING_THREAT_CODES = new Set([
  56882916, // Vampire Lord
  6850209,  // Pyramid Turtle
  34022290, // Mystic Tomato
  95929069, // Shining Angel
  26202165, // Sangan
  81309177, // Sinister Serpent
  9,
  47431224, // Sacred Phoenix
]);

const RECURRING_THREAT_NAMES = [
  "vampire lord",
  "pyramid turtle",
  "mystic tomato",
  "shining angel",
  "sangan",
  "sinister serpent",
  "phoenix",
];

const CONTINUOUS_THREAT_NAMES = [
  "skill drain",
  "wave-motion cannon",
  "gravity bind",
  "level limit",
  "snatch steal",
  "call of the haunted",
  "messenger of peace",
];

export default createDeckGuardrail({
  id: "chaos-turbo",
  tier: "Tier 1",
  playstyle: "midrange",
  riskTolerance: 0.30,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const ownHand = observation.ownHand ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];

    // 1. Thunder Dragon Acceleration in MP1
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      const activeCode = primaryCode(entry);
      const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();
      const isThunderDragon = activeCode === THUNDER_DRAGON_CODE || activeCode === THUNDER_DRAGON_RUNTIME || activeName.includes("thunder dragon");

      if (isThunderDragon) {
        const lightCountInGrave = (observation.ownGraveyard ?? []).filter((c) => {
          const cardInfo = knowledge?.byRuntimeCode?.[String(codeOf(c))];
          return cardInfo?.attribute === "LIGHT" || String(cardInfo?.name ?? "").toLowerCase().includes("thunder dragon");
        }).length;

        if (lightCountInGrave < 2) {
          return null; // Prioritize activating to thin deck & load LIGHT
        }
      }
    }

    // 2. Raigeki Break Discard Cost Selection: discard recurring value
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_HAND) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isRaigekiBreak = sCode === RAIGEKI_BREAK_CODE || sCode === RAIGEKI_BREAK_ID || sName.includes("raigeki break");

      if (isRaigekiBreak) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];

        const synergyIndex = selections.findIndex((item) => {
          const code = codeOf(item);
          const name = String(item?.name ?? knowledge?.byRuntimeCode?.[String(code)]?.name ?? "").toLowerCase();
          return code === SINISTER_SERPENT_CODE || code === SINISTER_SERPENT_RUNTIME || name.includes("sinister serpent")
            || code === NIGHT_ASSAILANT_CODE || code === NIGHT_ASSAILANT_RUNTIME || name.includes("night assailant")
            || code === THUNDER_DRAGON_CODE || code === THUNDER_DRAGON_RUNTIME || name.includes("thunder dragon");
        });

        if (synergyIndex >= 0 && !selectedIndices.includes(synergyIndex)) {
          const canDiscardSynergy = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(synergyIndex));
          if (canDiscardSynergy) {
            return "CHAOS_TURBO_RAIGEKI_BREAK_DISCARD_SYNERGY";
          }
        }
      }
    }

    // 3. Raigeki Break Targeting: prioritize continuous floodgates / burn
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isRaigekiBreak = sCode === RAIGEKI_BREAK_CODE || sCode === RAIGEKI_BREAK_ID || sName.includes("raigeki break");

      if (isRaigekiBreak) {
        const selections = message.selects ?? [];
        const continuousIndex = selections.findIndex((item) => {
          const code = codeOf(item);
          const name = String(item?.name ?? knowledge?.byRuntimeCode?.[String(code)]?.name ?? "").toLowerCase();
          const isOpp = controllerOf(item) !== Number(observation.player);
          const isFaceUp = (Number(item?.position ?? 0) & OcgPosition.FACEDOWN) === 0 && item?.faceUp !== false;
          return isOpp && isFaceUp && (code === SKILL_DRAIN_CODE || code === SKILL_DRAIN_RUNTIME || code === WAVE_MOTION_CODE || code === WAVE_MOTION_RUNTIME || CONTINUOUS_THREAT_NAMES.some((n) => name.includes(n)));
        });

        if (continuousIndex >= 0) {
          const selectedIndices = entry.candidate?.indicies ?? [];
          if (!selectedIndices.includes(continuousIndex)) {
            const canTargetContinuous = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(continuousIndex));
            if (canTargetContinuous) {
              return "CHAOS_TURBO_RAIGEKI_BREAK_CONTINUOUS_PRIORITY";
            }
          }
        }
      }
    }

    // 4. Chaos Sorcerer / BLS banish effect: prioritize recurring threats
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      const isChaosBanish = sCode === CHAOS_SORCERER_CODE || sCode === BLS_CODE || sCode === BLS_RUNTIME
        || sName.includes("chaos sorcerer") || sName.includes("black luster soldier");

      if (isChaosBanish) {
        const selections = message.selects ?? [];
        const recurringIndex = selections.findIndex((item) => {
          const code = codeOf(item);
          const name = String(item?.name ?? knowledge?.byRuntimeCode?.[String(code)]?.name ?? "").toLowerCase();
          const isOpp = controllerOf(item) !== Number(observation.player);
          return isOpp && (RECURRING_THREAT_CODES.has(code) || RECURRING_THREAT_NAMES.some((n) => name.includes(n)));
        });

        if (recurringIndex >= 0) {
          const selectedIndices = entry.candidate?.indicies ?? [];
          if (!selectedIndices.includes(recurringIndex)) {
            const canTargetRecurring = evaluated.some((other) => (other.candidate?.indicies ?? []).includes(recurringIndex));
            if (canTargetRecurring) {
              return "CHAOS_TURBO_BANISH_RECURRING_THREATS";
            }
          }
        }
      }
    }

    // 5. Avoid attacking face-down with low-ATK monsters (Dekoichi, Night Assailant, Faith)
    if (message?.type === OcgMessageType.SELECT_BATTLECMD && role === "attack") {
      const attackerCode = primaryCode(entry);
      const attackerCard = entry.analysis?.cards?.[0];
      const attackerAtk = Number(attackerCard?.atk ?? 0);
      const hasFaceDownOppMonster = oppMonsters.some((m) => (Number(m?.position ?? 0) & OcgPosition.FACEDOWN) !== 0 || m?.faceUp === false);

      if (hasFaceDownOppMonster && attackerAtk <= 1400 && oppMonsters.length > 0) {
        const canToEp = evaluated.some((other) => other.analysis?.role === "to-ep" || other.analysis?.role === "to-mp2");
        if (canToEp) {
          return "CHAOS_TURBO_NO_SUICIDE_ATTACK_INTO_FACE_DOWN";
        }
      }
    }

    return null;
  },
});

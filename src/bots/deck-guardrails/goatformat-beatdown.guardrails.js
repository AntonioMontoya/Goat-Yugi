import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";

const BERSERK_GORILLA_CODE = 39111158;
const MIRAGE_DRAGON_CODE = 15960641;
const SLATE_WARRIOR_CODE = 78636495;
const KYCOO_CODE = 77542832;

function isBerserkGorilla(entry, knowledge) {
  const card = entry?.analysis?.cards?.[0];
  const code = primaryCode(entry) || codeOf(card) || Number(card?.runtimeCode ?? 0);
  const name = String(card?.name ?? knowledge?.byRuntimeCode?.[String(code)]?.name ?? "").toLowerCase();
  return code === 39168895 || code === 39111158 || name.includes("berserk gorilla");
}

export default createDeckGuardrail({
  id: "goatformat-beatdown",
  tier: "Tier 2",
  playstyle: "aggro",
  riskTolerance: 0.55,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];

    const isMirageDragonOnField = ownMonsters.some((m) => {
      const mCode = codeOf(m);
      const mName = String(m?.name ?? knowledge?.byRuntimeCode?.[String(mCode)]?.name ?? "").toLowerCase();
      const faceUp = m?.faceUp !== false && (Number(m?.position ?? 0) & OcgPosition.FACEDOWN) === 0;
      return faceUp && (mCode === MIRAGE_DRAGON_CODE || mName.includes("mirage dragon"));
    });

    // 1. Berserk Gorilla: Never switch to Defense and never Set
    if (role === "monster-set" || role === "set" || role === "pos-change" || role === "to-defense") {
      if (isBerserkGorilla(entry, knowledge)) {
        return "BERSERK_GORILLA_CANNOT_BE_DEFENSE";
      }
    }
    if (message?.type === OcgMessageType.SELECT_POSITION && isBerserkGorilla(entry, knowledge)) {
      const pos = Number(entry.candidate?.position) || 0;
      if ((pos & OcgPosition.DEFENSE) !== 0) {
        return "BERSERK_GORILLA_CANNOT_BE_DEFENSE";
      }
    }

    // 2. Mirage Dragon Trap-Lock: Attack boldly when Mirage Dragon is active
    if (isMirageDragonOnField && role === "attack") {
      // Opponent cannot activate battle traps, so pass-to-MP2 when viable targets exist is discouraged
    }

    // 3. Slate Warrior: Set face-down in Defense on Turn 1 / Opening when going first
    if (role === "summon" && (code === SLATE_WARRIOR_CODE || name.includes("slate warrior"))) {
      const isTurn1 = Number(observation.turnNumber ?? 1) <= 2;
      const oppMonsterCount = Number(observation.opponentMonsterCount ?? 0);
      const hasSetAlternative = evaluated.some((o) => o !== entry && o.analysis?.role === "set");
      if (isTurn1 && oppMonsterCount === 0 && hasSetAlternative) {
        return "SLATE_WARRIOR_PREFER_FIRST_TURN_SET";
      }
    }

    // 4. Equip Spells (United We Stand / Mage Power): Do not equip to Goblin Attack Force if it will shift to DEF
    if (role === "activate" && (name.includes("united we stand") || name.includes("mage power"))) {
      const target = entry.analysis?.target;
      const tName = String(target?.name ?? "").toLowerCase();
      if (tName.includes("goblin attack")) {
        const otherBeaterExists = ownMonsters.some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return !mName.includes("goblin attack") && (m?.faceUp !== false);
        });
        if (otherBeaterExists) {
          return "BEATDOWN_AVOID_EQUIPPING_SHIFTING_ATTACKER";
        }
      }
    }

    return null;
  },
});

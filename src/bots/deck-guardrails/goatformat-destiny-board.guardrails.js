import { createDeckGuardrail } from "./base-deck-guardrail.js";

const DESTINY_BOARD_CODES = new Set([94212438, 504700120]);
const SPIRIT_MESSAGE_CODES = new Set([94772232, 31893528, 30170981, 67287533, 31890399, 67284908, 90351989, 57624336]);
const EMERGENCY_PROVISIONS_CODES = new Set([53046408, 42578427, 783545606]);
const STALL_MONSTER_CODES = new Set([504700038, 23205979, 504700042, 24140059]); // Spirit Reaper, A Cat of Ill Omen

function primaryCode(entry) {
  return Number(entry?.analysis?.cards?.[0]?.runtimeCode ?? entry?.candidate?.card ?? 0);
}

export default createDeckGuardrail({
  id: "goatformat-destiny-board",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.90,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const { observation = {} } = context;
    const role = entry.analysis?.role;
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry);
    const name = String(card?.name ?? "").toLowerCase();
    const ownBackrow = observation.ownBackrow ?? [];

    const destinyBoardActive = ownBackrow.some((c) => {
      const cCode = Number(c?.code ?? c?.runtimeCode ?? 0);
      const cName = String(c?.name ?? "").toLowerCase();
      return (DESTINY_BOARD_CODES.has(cCode) || cName.includes("destiny board")) && (c?.faceUp || (Number(c?.position) & 1) !== 0);
    });

    // 1. If Destiny Board is active, we MUST preserve at least 1 free S/T zone per remaining letter
    if (destinyBoardActive) {
      const currentMessages = ownBackrow.filter((c) => {
        const cCode = Number(c?.code ?? c?.runtimeCode ?? 0);
        const cName = String(c?.name ?? "").toLowerCase();
        return SPIRIT_MESSAGE_CODES.has(cCode) || cName.includes("spirit message");
      }).length;
      const messagesNeeded = Math.max(1, 4 - currentMessages);
      const currentOccupied = ownBackrow.length;
      const freeZones = Math.max(0, 5 - currentOccupied);

      if (role === "spell-set") {
        if (freeZones <= messagesNeeded) {
          return "DESTINY_BOARD_PRESERVE_FREE_ZONES_FOR_MESSAGES";
        }
      }

      if (role === "activate") {
        const isContinuous = (entry.roles ?? []).includes("continuous") || (entry.roles ?? []).includes("continuous-spell");
        const isProvisions = EMERGENCY_PROVISIONS_CODES.has(code) || name.includes("emergency provisions");
        if (isContinuous && freeZones <= messagesNeeded && !isProvisions) {
          const oppThreat = Number(observation.opponentThreat ?? 0);
          const ownLp = Number(observation.ownLp ?? 8000);
          if (oppThreat < ownLp) {
            return "DESTINY_BOARD_AVOID_CLOGGING_ZONES_WITH_CONTINUOUS";
          }
        }
      }
    }

    // 2. Spirit Message spells in hand should NEVER be manually set (Destiny Board places them from hand or deck)
    if (role === "spell-set" && (SPIRIT_MESSAGE_CODES.has(code) || name.includes("spirit message"))) {
      return "DESTINY_BOARD_NEVER_MANUALLY_SET_SPIRIT_MESSAGE";
    }

    // 3. Wall Stance: Defensive posture for stall monsters (Spirit Reaper, Cat of Ill Omen)
    if (role === "summon" && (STALL_MONSTER_CODES.has(code) || name.includes("cat of ill omen") || name.includes("spirit reaper"))) {
      const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
      if (hasSetAlt) {
        return "DESTINY_BOARD_SET_STALL_MONSTER";
      }
    }

    return null;
  },
});

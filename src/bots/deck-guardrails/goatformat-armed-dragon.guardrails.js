import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const ARMED_LV3_CODES = new Set([980973, 504700010]);
const ARMED_LV5_CODES = new Set([46384672, 504700011]);
const ARMED_LV7_CODES = new Set([73879377, 504700012]);
const MASKED_DRAGON_CODES = new Set([39191387, 504700140]);
const STAMPING_DESTRUCTION_CODES = new Set([81385346, 423211928]);
const SINISTER_SERPENT_CODES = new Set([8131171, 9]);
const THUNDER_DRAGON_CODES = new Set([31560081, 15]);

function isArmedDragon(c) {
  if (!c) return false;
  const name = String(c.name ?? "").toLowerCase();
  const code = codeOf(c);
  return ARMED_LV3_CODES.has(code) || ARMED_LV5_CODES.has(code) || ARMED_LV7_CODES.has(code) || name.includes("armed dragon");
}

function isDiscardFodder(c) {
  if (!c) return false;
  const name = String(c.name ?? "").toLowerCase();
  const code = codeOf(c);
  return SINISTER_SERPENT_CODES.has(code)
    || THUNDER_DRAGON_CODES.has(code)
    || name.includes("sinister serpent")
    || name.includes("thunder dragon");
}

export default createDeckGuardrail({
  id: "goatformat-armed-dragon",
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
    const ownSpells = observation.ownSpells ?? [];

    // 1. Armed Dragon LV5 / LV7 Optimal Discard Ammo:
    // When activating discard removal effects, prioritize Sinister Serpent or Thunder Dragon!
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_DISCARD) {
      if (isDiscardFodder(card)) {
        return null; // Top discard choice
      }
      // Avoid discarding key high-level dragons if fodder is available
      if (isArmedDragon(card)) {
        const hasFodderInHand = (observation.ownHand ?? []).some((h) => isDiscardFodder(h));
        if (hasFodderInHand) {
          return "PREFER_FODDER_DISCARD_OVER_ARMED_DRAGON";
        }
      }
    }

    // 2. Stamping Destruction:
    // Activate Stamping Destruction if we control a face-up Dragon and opponent has backrow
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (STAMPING_DESTRUCTION_CODES.has(code) || name.includes("stamping destruction")) {
        const hasDragonOnField = ownMonsters.some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return isArmedDragon(m) || mName.includes("dragon") || mName.includes("behemoth");
        });
        if (!hasDragonOnField) {
          return "CANNOT_ACTIVATE_STAMPING_WITHOUT_DRAGON";
        }
        return null;
      }
    }

    // 3. Masked Dragon Recruitment:
    // Recruit Armed Dragon LV3 in defense position on opponent's turn to ensure survival into our Standby Phase
    if (message?.type === OcgMessageType.SELECT_IDLECMD && (role === "summon" || role === "monster-set")) {
      if (ARMED_LV3_CODES.has(code) || name.includes("armed dragon lv3")) {
        // Set or summon LV3 safely
        return null;
      }
    }

    return null;
  }
});

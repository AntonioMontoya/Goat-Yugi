import { OCGCORE_CARD_ENTRIES } from "../data/ocgcore-assets.js";
import { OCGCORE_SCRIPT_SOURCES } from "../data/ocgcore-script-sources.js";
import { HISTORICAL_SCRIPT_OVERRIDES } from "../data/historical-script-overrides.js";
import { CARDS } from "./cards.js";

const RULES = Object.freeze([
  { id: "flip-trigger", text: /\bFLIP\s*:/i, lua: /EVENT_FLIP|EFFECT_TYPE_FLIP/ },
  { id: "normal-summon-trigger", text: /when this card is Normal Summoned/i, lua: /EVENT_SUMMON_SUCCESS/ },
  { id: "flip-summon-trigger", text: /when this card is Flip Summoned/i, lua: /EVENT_FLIP_SUMMON_SUCCESS/ },
  { id: "special-summon-trigger", text: /when this card is Special Summoned/i, lua: /EVENT_SPSUMMON_SUCCESS/ },
  { id: "standby-phase", text: /(?:during|in) (?:each of )?(?:your|the) Standby Phase/i, lua: /PHASE_STANDBY/ },
  { id: "attack-declaration", text: /when (?:an?|your|your opponent'?s) monster(?:s)? (?:declares? an attack|attacks)/i, lua: /EVENT_ATTACK_ANNOUNCE|EVENT_BE_BATTLE_TARGET|EVENT_BATTLE_CONFIRM/ },
  { id: "battle-damage", text: /inflicts? battle damage/i, lua: /EVENT_BATTLE_DAMAGE|EVENT_PRE_BATTLE_DAMAGE|EFFECT_CHANGE_BATTLE_DAMAGE/ },
  { id: "battle-destruction", text: /(?:when|if) this card is destroyed (?:and sent to the Graveyard )?(?:as a result of|by) battle/i, lua: /REASON_BATTLE|EVENT_BATTLE_DESTROYED|EVENT_BATTLED|EVENT_TO_GRAVE[\s\S]*REASON_DESTROY/ },
  { id: "draw-operation", text: /\bdraw \d+ cards?\b/i, lua: /Duel\.Draw\s*\(/ },
  { id: "damage-operation", text: /\binflict \d+ damage\b|inflict damage .* equal to/i, lua: /Duel\.Damage\s*\(/ },
  { id: "recover-operation", text: /increase your Life Points|gain \d+ Life Points/i, lua: /Duel\.Recover\s*\(/ },
  { id: "lp-cost", text: /\bPay \d+ Life Points?\b/i, lua: /PayLPCost|CheckLPCost|SetCost/ },
]);

const cardByName = new Map(CARDS.map((card) => [card.name, card]));

function sourceFor(entry) {
  return HISTORICAL_SCRIPT_OVERRIDES[entry.script] ?? OCGCORE_SCRIPT_SOURCES[entry.script] ?? null;
}

export function auditTextAgainstLua(text, source) {
  return RULES
    .filter((rule) => rule.text.test(String(text ?? "")) && !rule.lua.test(String(source ?? "")))
    .map((rule) => rule.id);
}

export function auditCardTextContracts() {
  const candidates = [];
  let checked = 0;
  for (const entry of OCGCORE_CARD_ENTRIES) {
    const card = cardByName.get(entry.name);
    const source = sourceFor(entry);
    if (!card || !source) continue;
    checked += 1;
    const missingSignals = auditTextAgainstLua(card.text, source);
    if (missingSignals.length) candidates.push({
      name: card.name,
      runtimeCode: entry.runtimeCode,
      script: entry.script,
      missingSignals,
      text: card.text,
      historicalOverride: entry.historicalOverride || Boolean(HISTORICAL_SCRIPT_OVERRIDES[entry.script]),
    });
  }
  return {
    command: "cards:text-contract-audit",
    checked,
    rules: RULES.map((rule) => rule.id),
    candidates,
    candidateCount: candidates.length,
    passed: candidates.length === 0,
    note: "Los candidatos son diferencias estáticas texto-script que necesitan una prueba OCGCore dirigida; no son fallos confirmados.",
  };
}

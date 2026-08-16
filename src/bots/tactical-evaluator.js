import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { actionCardEntries, strategyActionRole } from "./deck-strategy.js";
import { publicCardSemantics } from "./card-semantics.js";

function codeOf(entry) { return Number(entry?.runtimeCode ?? entry?.code ?? 0); }
function faceUp(entry) { return entry?.faceUp === true || (Number(entry?.position) & OcgPosition.FACEUP) !== 0; }

function recentSource(knowledge, memory, role) {
  const entry = [...(memory?.recent ?? [])].reverse().find((item) => item.role === role && Number(item.cardCode));
  return knowledge?.byRuntimeCode?.[String(entry?.cardCode ?? 0)] ?? null;
}

function battleTargetValue(knowledge, message, response, observation, memory, opponentModel) {
  const attacker = recentSource(knowledge, memory, "attack");
  if (!attacker) return 0;
  const selections = message.selects ?? message.select_cards ?? [];
  let value = 0;
  for (const index of response.indicies ?? []) {
    const selected = selections[Number(index)];
    if (Number(selected?.location) !== OcgLocation.MZONE || Number(selected?.controller) === Number(observation.player)) continue;
    const publicTarget = (observation.opponentMonsters ?? []).find((entry) => codeOf(entry) === codeOf(selected) && (selected.sequence === undefined || Number(entry.sequence) === Number(selected.sequence)))
      ?? (observation.opponentMonsters ?? []).find((entry) => codeOf(entry) === codeOf(selected));
    if (!publicTarget || !faceUp(publicTarget)) {
      const flipRisk = Math.min(2.5, Number(opponentModel?.risks?.flip ?? 0) * 10);
      value += Number(attacker.atk) >= 1800 ? 0.8 - flipRisk : -0.5 - flipRisk;
      continue;
    }
    const targetCard = knowledge?.byRuntimeCode?.[String(codeOf(publicTarget))] ?? publicCardSemantics(codeOf(publicTarget)) ?? null;
    const targetBattleStat = (Number(publicTarget.position) & OcgPosition.ATTACK) !== 0 ? Number(publicTarget.attack) || Number(targetCard?.atk) || 0 : Number(publicTarget.defense) || Number(targetCard?.def) || 0;
    const margin = Number(attacker.atk) - targetBattleStat;
    const targetValue = Math.max(Number(targetCard?.atk) || 0, Number(targetCard?.def) || 0) / 900 + (targetCard?.roles ?? []).filter((role) => ["engine", "boss", "interaction", "flip"].includes(role)).length * 0.7;
    if (margin > 0) value += 3.5 + Math.min(3, margin / 700) + targetValue;
    else if (margin === 0) value += targetValue > 2 ? 1 : -0.5;
    else value -= 6 + Math.min(5, Math.abs(margin) / 500);
  }
  return value;
}

function positionValue(knowledge, message, response, observation) {
  if (message.type !== OcgMessageType.SELECT_POSITION) return 0;
  const card = knowledge?.byRuntimeCode?.[String(Number(message.code) || 0)] ?? null;
  if (!card) return 0;
  const position = Number(response.position) || 0;
  const roles = new Set(card.roles ?? []);
  const underPressure = Number(observation.opponentThreat) > Math.max(Number(card.atk) || 0, Number(observation.ownBoardPower) || 0);
  let value = 0;
  if ((position & OcgPosition.FACEDOWN_DEFENSE) !== 0) value += roles.has("flip") ? 8 : Number(card.def) > Number(card.atk) ? 2 : -1;
  if ((position & OcgPosition.FACEUP_DEFENSE) !== 0) value += Number(card.def) > Number(card.atk) || underPressure ? 2.5 : -1.5;
  if ((position & OcgPosition.FACEUP_ATTACK) !== 0) value += !underPressure || Number(observation.opponentMonsterCount) === 0 ? 3 : -3;
  if ((position & OcgPosition.FACEDOWN_ATTACK) !== 0) value -= 6;
  return value;
}

function selectionSizeValue(message, response) {
  if (message.type !== OcgMessageType.SELECT_CARD) return 0;
  const count = response.indicies?.length ?? 0;
  const minimum = Number(message.min) || 0;
  const maximum = Number(message.max ?? minimum);
  if (maximum <= minimum) return 0;
  return count === minimum ? 0.4 : -Math.max(0, count - minimum) * 0.6;
}

function chainValue(knowledge, message, response, observation, memory) {
  if (![OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_BATTLECMD].includes(message.type) || strategyActionRole(message, response) !== "chain") return 0;
  const ownCards = actionCardEntries(knowledge, message, response);
  const ownRoles = new Set(ownCards.flatMap((card) => card.roles ?? []));
  const current = [...(observation.publicChain ?? [])].reverse().find((entry) => Number(entry.controller) !== Number(observation.player));
  const opposing = publicCardSemantics(current?.code);
  const opposingRoles = new Set(opposing?.roles ?? []);
  let threat = current ? 1 : 0;
  if (["draw", "search", "engine", "boss", "removal", "burn", "lethal"].some((role) => opposingRoles.has(role))) threat += 2.2;
  if (Number(opposing?.atk) >= 2000) threat += 1;
  const phase = Number(observation.phase) || 0;
  const inBattle = [OcgPhase.BATTLE_START, OcgPhase.BATTLE_STEP, OcgPhase.DAMAGE, OcgPhase.DAMAGE_CAL, OcgPhase.BATTLE].some((value) => (phase & value) !== 0);
  const strongestOpponent = Math.max(0, ...(observation.opponentMonsters ?? []).map((entry) => Number(entry.attack) || 0));
  const lethalPressure = Number(observation.opponentThreat) >= Number(observation.ownLp);
  let value = ownRoles.has("reactive") ? -1.2 : -2;
  if (current) value += threat * 1.2;
  if (ownRoles.has("negate")) value += current ? threat * 1.8 : -4;
  if (ownRoles.has("removal")) {
    value += strongestOpponent / 850;
    if (strongestOpponent < 1200 && Number(observation.opponentLp) > 2000) value -= 2.4;
    if (lethalPressure) value += 10;
  }
  if (ownRoles.has("position")) value += current ? threat : inBattle && strongestOpponent ? 2.4 : -3.2;
  if ((ownRoles.has("defense") || ownRoles.has("stall")) && (inBattle || lethalPressure || Number(observation.ownLp) <= 3000)) value += 3;
  if (["draw", "search", "advantage", "engine"].some((role) => ownRoles.has(role)) && !ownRoles.has("removal") && !ownRoles.has("position")) value += 2.8;
  if ((ownRoles.has("burn") || ownRoles.has("lethal")) && strongestOpponent < Number(observation.opponentLp)) value -= 1.5;
  const primaryCode = Number(ownCards[0]?.runtimeCode) || 0;
  const repeated = (memory?.recent ?? []).filter((entry) => Number(entry.turn) === Number(observation.turn) && entry.role === "chain" && Number(entry.cardCode) === primaryCode).length;
  if (repeated) value -= Math.min(8, repeated * 3.5);
  if (ownRoles.has("cost-half-lp")) value -= Number(observation.ownLp) <= 3000 ? 7 : Number(observation.ownLp) <= 5000 ? 4 : threat < 2 ? 2.5 : 0;
  return value;
}

function comboValue(knowledge, message, response, observation, memory) {
  const role = strategyActionRole(message, response);
  const cards = actionCardEntries(knowledge, message, response);
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  const handRoles = new Set((observation.ownHand ?? []).flatMap((entry) => knowledge?.byRuntimeCode?.[String(codeOf(entry))]?.roles ?? []));
  const boardRoles = new Set((observation.ownMonsters ?? []).flatMap((entry) => knowledge?.byRuntimeCode?.[String(codeOf(entry))]?.roles ?? []));
  let value = 0;
  if (roles.has("alternate-win") && role === "activate") value += 12;
  if (roles.has("continuous-engine") && role === "summon") value += 12;
  if (roles.has("continuous-engine") && role === "activate") value += 6;
  if (roles.has("continuous-engine") && role === "monster-set" && !roles.has("flip")) value -= 8;
  if (roles.has("recycle-board") && role === "activate") {
    const reusableFaceUp = (observation.ownBackrow ?? []).filter((entry) => entry?.faceUp === true).length;
    value += reusableFaceUp * 1.6 + (reusableFaceUp && boardRoles.has("continuous-engine") ? 2 : 0);
    if (!reusableFaceUp && Number(observation.ownBackrowCount) > 0) value -= Number(observation.ownBackrowCount) * 1.4;
  }
  if ((roles.has("equip") || roles.has("attack-boost")) && role === "activate") value += Number(observation.ownMonsterCount) ? 2 + (boardRoles.has("multi-attack") ? 4 : 0) : -7;
  if (roles.has("multi-attack") && ["summon", "special-summon"].includes(role)) value += handRoles.has("equip") || handRoles.has("attack-boost") ? 5 : -1;
  if (memory?.commitments?.delayedWin && (roles.has("stall") || roles.has("defense") || roles.has("negate"))) value += 3;
  if (memory?.commitments?.delayedWin && ["battle-phase", "attack"].includes(role)) value -= 1.5;
  return value;
}

/** Tactical corrections that depend on the concrete OCGCore prompt. */
export function tacticalResponseAdjustment(knowledge, message, response, { observation = {}, memory = {}, opponentModel = null } = {}) {
  let value = positionValue(knowledge, message, response, observation) + selectionSizeValue(message, response);
  if (message.type === OcgMessageType.SELECT_CARD) value += battleTargetValue(knowledge, message, response, observation, memory, opponentModel);
  value += chainValue(knowledge, message, response, observation, memory);
  value += comboValue(knowledge, message, response, observation, memory);
  return value;
}

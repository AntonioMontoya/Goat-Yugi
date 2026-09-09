import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { actionCardEntries, strategyActionRole } from "./deck-strategy.js";
import { publicCardSemantics } from "./card-semantics.js";

function codeOf(entry) { return Number(entry?.runtimeCode ?? entry?.code ?? 0); }
function faceUp(entry) { return entry?.faceUp === true || (Number(entry?.position) & OcgPosition.FACEUP) !== 0; }

function recentSource(knowledge, memory, role) {
  const entry = [...(memory?.recent ?? [])].reverse().find((item) => item.role === role && Number(item.cardCode));
  return knowledge?.byRuntimeCode?.[String(entry?.cardCode ?? 0)] ?? publicCardSemantics(Number(entry?.cardCode)) ?? null;
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

function effectTargetValue(knowledge, message, response, observation, memory) {
  if (message.type !== OcgMessageType.SELECT_CARD) return 0;
  const msgCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  const msgCard = msgCode ? (knowledge?.byRuntimeCode?.[String(msgCode)] ?? publicCardSemantics(msgCode)) : null;
  const activator = msgCard ?? recentSource(knowledge, memory, "activate") ?? recentSource(knowledge, memory, "chain");
  const activatorRoles = new Set(activator?.roles ?? []);
  const isAbsorb = activatorRoles.has("absorb");
  const isRemoval = activatorRoles.has("monster-removal") || activatorRoles.has("removal");
  const isTakeControl = activatorRoles.has("take-control");
  const isControlSwap = activatorRoles.has("control-swap");
  const isRevive = activatorRoles.has("revive");
  if (!isAbsorb && !isRemoval && !isTakeControl && !isControlSwap && !isRevive) return 0;

  const selections = message.selects ?? message.select_cards ?? [];
  let value = 0;
  for (const index of response.indicies ?? []) {
    const selected = selections[Number(index)];
    const location = Number(selected?.location);
    const controller = Number(selected?.controller ?? selected?.controler ?? 0);
    const isOpponent = controller !== Number(observation.player);

    if (location === OcgLocation.GRAVE && isRevive) {
      const targetCode = codeOf(selected);
      const targetSemantics = knowledge?.byRuntimeCode?.[String(targetCode)] ?? publicCardSemantics(targetCode);
      const targetRoles = new Set(targetSemantics?.roles ?? []);
      const targetAtk = Number(targetSemantics?.atk) || 0;
      value += Math.min(6, targetAtk / 400);
      if (targetRoles.has("boss") || targetAtk >= 2400) value += 5.0;
      if (targetRoles.has("negate")) value += 4.5;
      if (targetRoles.has("threat") || targetAtk >= 1800) value += 2.5;
      if (targetRoles.has("flip")) value += 1.5;
      continue;
    }

    if (location !== OcgLocation.MZONE) continue;

    if (isControlSwap && !isOpponent) {
      const targetCode = codeOf(selected);
      const targetSemantics = knowledge?.byRuntimeCode?.[String(targetCode)] ?? publicCardSemantics(targetCode);
      const targetRoles = new Set(targetSemantics?.roles ?? []);
      const targetAtk = Number(targetSemantics?.atk) || 0;
      if (targetRoles.has("token") || targetAtk === 0) value += 6.0;
      else if (targetRoles.has("floater") || targetAtk <= 1000) value += 4.0;
      else if (targetAtk >= 1800 || targetRoles.has("boss")) value -= 6.0;
      continue;
    }

    if (!isOpponent) continue;

    const targetCode = codeOf(selected);
    const publicTarget = (observation.opponentMonsters ?? []).find((entry) => codeOf(entry) === targetCode && (selected.sequence === undefined || Number(entry.sequence) === Number(selected.sequence)))
      ?? (observation.opponentMonsters ?? []).find((entry) => codeOf(entry) === targetCode);
    const targetSemantics = knowledge?.byRuntimeCode?.[String(targetCode)] ?? publicCardSemantics(targetCode);
    const targetRoles = new Set(targetSemantics?.roles ?? []);

    const isFaceUp = publicTarget?.faceUp === true || (Number(publicTarget?.position) & OcgPosition.FACEUP) !== 0;
    if (isFaceUp) {
      const targetAtk = Number(publicTarget?.attack ?? targetSemantics?.atk) || 0;
      value += Math.min(6, targetAtk / 450);
      if (targetRoles.has("boss") || targetAtk >= 2400) value += 5.0;
      if (targetRoles.has("threat") || targetAtk >= 1800) value += 2.5;
      if (targetRoles.has("flip") || targetRoles.has("engine")) value += 1.5;
    } else {
      value += 3.5;
      if (targetRoles.has("flip")) value += 2.0;
    }
  }
  return value;
}

const RACE_MAP = {
  warrior: 1n, spellcaster: 2n, fairy: 4n, fiend: 8n, zombie: 16n, machine: 32n,
  aqua: 64n, pyro: 128n, rock: 256n, wingedbeast: 512n, plant: 1024n, insect: 2048n,
  thunder: 4096n, dragon: 8192n, beast: 16384n, beastwarrior: 32768n, dinosaur: 65536n,
  fish: 131072n, seaserpent: 262144n, reptile: 524288n
};

function raceFlag(c) {
  if (!c) return 0n;
  if (typeof c.race === "bigint") return c.race;
  if (typeof c.race === "number") return BigInt(c.race);
  const str = String(c.race || "").toLowerCase().replace(/[^a-z]/g, "");
  return RACE_MAP[str] ?? 0n;
}

function announceRaceTacticalValue(knowledge, message, response, observation) {
  if (message.type !== OcgMessageType.ANNOUNCE_RACE) return 0;
  const races = response.races ?? [];
  const oppMonsters = observation.opponentMonsters ?? [];
  let matchedCount = 0;
  let matchedOppAtk = 0;
  for (const opp of oppMonsters) {
    const sem = knowledge?.byRuntimeCode?.[String(codeOf(opp))] ?? publicCardSemantics(codeOf(opp));
    const oppFlag = raceFlag(opp) || raceFlag(sem);
    const oppStr = String(sem?.race ?? opp.race ?? "").toLowerCase().replace(/[^a-z]/g, "");
    if (races.some((r) => (typeof r === "bigint" && oppFlag && r === oppFlag) || String(r).toLowerCase().replace(/[^a-z]/g, "") === oppStr)) {
      matchedOppAtk += Number(opp.attack ?? opp.atk ?? 0);
      matchedCount += 1;
    }
  }
  if (matchedCount > 0) {
    return 4.0 + Math.min(5, matchedOppAtk / 500) + matchedCount * 2.0;
  }
  return -5.0;
}

function positionValue(knowledge, message, response, observation) {
  if (message.type !== OcgMessageType.SELECT_POSITION) return 0;
  const card = knowledge?.byRuntimeCode?.[String(Number(message.code) || 0)] ?? publicCardSemantics(Number(message.code) || 0) ?? null;
  if (!card) return 0;
  const position = Number(response.position) || 0;
  const roles = new Set(card.roles ?? []);
  const attack = Number(card.atk) || 0;
  const defense = Number(card.def) || 0;
  const isFlip = roles.has("flip");
  const isWall = defense > attack || roles.has("defense") || roles.has("stall");
  const isBeater = attack >= 1400 && attack > defense;
  const isAbsorb = roles.has("absorb") || ["relinquished", "thousand-eyes restrict"].some((n) => String(card?.name ?? "").toLowerCase().includes(n));
  const canDefendAgainstThreat = defense >= Number(observation.opponentThreat);
  const underPressure = Number(observation.opponentThreat) > Math.max(attack, Number(observation.ownBoardPower) || 0);

  let value = 0;
  if ((position & OcgPosition.FACEDOWN_DEFENSE) !== 0) {
    if (isFlip) value += 8;
    else if (isWall) value += 2.5;
    else if (isBeater) value -= 3;
    else value -= 1;
  }
  if ((position & OcgPosition.FACEUP_DEFENSE) !== 0) {
    if (isAbsorb && attack === 0) value += 4.5;
    else if (isWall || (underPressure && canDefendAgainstThreat)) value += 2.5;
    else if (isBeater) value -= 3.5;
    else value -= 1.5;
  }
  if ((position & OcgPosition.FACEUP_ATTACK) !== 0) {
    if (isAbsorb && attack === 0 && (Number(observation.opponentMonsterCount) > 0 || Number(observation.opponentThreat) > 0)) value -= 6;
    else if (isBeater) value += 3.5;
    else if (!isWall && (!underPressure || Number(observation.opponentMonsterCount) === 0)) value += 3;
    else if (isWall) value -= 2;
    else value -= 1;
  }
  if ((position & OcgPosition.FACEDOWN_ATTACK) !== 0) value -= 6;
  return value;
}

function announceNumberTacticalValue(knowledge, message, response, observation) {
  if (message.type !== OcgMessageType.ANNOUNCE_NUMBER) return 0;
  const options = message.options ?? [];
  const declared = options[Number(response.value)] ?? response.value;
  return declared === 4 ? 4.0 : -1.0;
}

function selectOptionTacticalValue(knowledge, message, response, observation) {
  if (message.type !== OcgMessageType.SELECT_OPTION) return 0;
  const sCode = Number(message?.code ?? message?.card?.code ?? 0);
  const src = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
  const isEcon = src?.roles?.includes("modal-control") || String(src?.name ?? "").toLowerCase().includes("enemy controller");
  if (!isEcon) return 0;

  const ownMonsters = observation.ownMonsters ?? [];
  const hasDisposable = ownMonsters.some((m) => m.isToken || (Number(m.attack ?? m.atk ?? 0) <= 1000) || (m.roles ?? []).includes("floater"));
  const maxOppAtk = Math.max(0, ...(observation.opponentMonsters ?? []).map((m) => Number(m.attack ?? m.atk ?? 0)));

  if (response.index === 1) {
    return (hasDisposable && maxOppAtk >= 1800) ? 5.0 : -5.0;
  }
  if (response.index === 0) {
    return (!hasDisposable || maxOppAtk < 1800) ? 3.0 : 0;
  }
  return 0;
}

function selectTributeTacticalValue(knowledge, message, response, observation) {
  if (message.type !== OcgMessageType.SELECT_TRIBUTE && message.type !== OcgMessageType.SELECT_SUM) return 0;
  const selections = message.selects ?? [];
  let value = 0;
  for (const index of response.indicies ?? []) {
    const sel = selections[Number(index)];
    const code = codeOf(sel);
    const sem = knowledge?.byRuntimeCode?.[String(code)] ?? publicCardSemantics(code);
    const roles = new Set(sem?.roles ?? []);
    const atk = Number(sel?.attack ?? sem?.atk ?? 0);
    const isToken = sel?.isToken || (Number(sel?.type) & 0x4000) !== 0 || roles.has("token") || (atk === 0 && Number(sel?.defense ?? sem?.def ?? 0) === 0);
    const isFloater = roles.has("floater") || roles.has("search-on-death") || roles.has("grave-trigger")
      || ["sangan", "sinister serpent"].some((n) => String(sem?.name ?? "").toLowerCase().includes(n));
    const isBoss = roles.has("boss") || atk >= 2400;
    const isSpentFlip = roles.has("flip") && atk <= 1000;

    if (isToken) value += 4.0;
    else if (isFloater) value += 4.5;
    else if (isSpentFlip) value += 2.0;
    else if (isBoss) value -= 8.0;
    else if (atk >= 1800) value -= 4.0;
  }
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

  // Bucle Thousand-Eyes Restrict / Relinquished + Tsukuyomi
  const ownHasAbsorbBoss = (observation.ownMonsters ?? []).some((m) => {
    const name = String(m.name ?? "").toLowerCase();
    const sem = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
    const isAbsorb = sem?.roles?.includes("absorb") || name.includes("thousand-eyes restrict") || name.includes("relinquished");
    return isAbsorb && (Number(m.attack ?? m.atk ?? 0) > 0 || (Number(m.defense ?? m.def ?? 0) > 0 && m.isToken !== true));
  });
  if (ownHasAbsorbBoss) {
    const isTsukuyomi = cards.some((c) => String(c.name ?? "").toLowerCase().includes("tsukuyomi"));
    if (isTsukuyomi && role === "summon") value += 6.0;
  }
  return value;
}

function matchupTacticalAdjustment(knowledge, message, response, { observation = {}, memory = {}, opponentModel = null } = {}) {
  if (!opponentModel?.ready && !observation.opponentArchetype) return 0;
  const oppArchetype = String(opponentModel?.top?.archetype ?? observation.opponentArchetype ?? "").toLowerCase();
  const oppDeckId = String(opponentModel?.top?.deckId ?? "").toLowerCase();
  const confidence = Math.max(0.4, Number(opponentModel?.confidence) || 0.6);

  const role = strategyActionRole(message, response);
  const cards = actionCardEntries(knowledge, message, response);
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  const cardNames = cards.map((c) => String(c.name ?? "").toLowerCase());

  let value = 0;

  // 1. Matchup against Burn / Lockdown
  if (/burn|lockdown/i.test(oppArchetype) || /burn/i.test(oppDeckId)) {
    const ownMonsters = Number(observation.ownMonsterCount ?? observation.ownMonsters?.length ?? 0);
    if (ownMonsters >= 2) {
      if (["summon", "special-summon"].includes(role)) value -= 3.5;
      if (role === "monster-set") value -= 2.0;
    }
    const hasFaceUpContinuous = (observation.opponentBackrow ?? []).some((entry) => entry?.faceUp === true);
    if (hasFaceUpContinuous && (roles.has("backrow-removal") || roles.has("removal"))) {
      if (["activate", "chain"].includes(role)) value += 4.5;
    }
    if (roles.has("cost-half-lp") || roles.has("cost-lp-1000") || roles.has("cost-lp-800")) {
      value -= 4.0;
    }
  }

  // 2. Matchup against Chaos (Chaos Turbo / Chaos Control)
  if (/chaos/i.test(oppArchetype) || /chaos/i.test(oppDeckId)) {
    let oppLight = 0;
    let oppDark = 0;
    for (const entry of observation.opponentGrave ?? []) {
      const sem = publicCardSemantics(codeOf(entry));
      if (sem?.attribute === "LIGHT") oppLight += 1;
      if (sem?.attribute === "DARK") oppDark += 1;
    }
    const oppChaosReady = oppLight >= 1 && oppDark >= 1;
    if (oppChaosReady && (roles.has("removal") || roles.has("negate") || roles.has("position"))) {
      const currentChain = [...(observation.publicChain ?? [])].reverse().find((entry) => Number(entry.controller) !== Number(observation.player));
      const currentOpposing = publicCardSemantics(currentChain?.code);
      const isLowThreat = currentOpposing && (currentOpposing.roles?.includes("recruiter") || (Number(currentOpposing.atk) < 1500 && !currentOpposing.roles?.includes("boss")));
      if (isLowThreat) {
        value -= 3.0;
      }
      const maxOppAtk = Math.max(0, ...(observation.opponentMonsters ?? []).map((m) => Number(m.attack ?? m.atk ?? 0)));
      if (maxOppAtk >= 2300) {
        value += 3.5;
      }
    }
  }

  // 3. Matchup against Flip Control / Gravekeeper
  if (/flip|gravekeeper/i.test(oppArchetype) || /flip|gravekeeper/i.test(oppDeckId)) {
    const hasOppFaceDown = (observation.opponentMonsters ?? []).some((m) => !faceUp(m));
    if (hasOppFaceDown) {
      if (roles.has("remove-facedown") || cardNames.includes("nobleman of crossout")) {
        if (["activate", "chain"].includes(role)) value += 5.0;
      }
      if (role === "attack" || message.type === OcgMessageType.SELECT_CARD) {
        const attacker = cards[0];
        if (attacker && Number(attacker.atk) < 2000) {
          value -= 2.0;
        }
      }
    }
  }

  // 4. Matchup against Warrior / Aggro
  if (/warrior|aggro/i.test(oppArchetype) || /warrior|aggro/i.test(oppDeckId)) {
    const ownIsAggro = /warrior|aggro|beatdown/i.test(String(knowledge?.archetype ?? knowledge?.deckId ?? ""));
    if (!ownIsAggro && role === "monster-set" && cards.some((c) => Number(c.def) >= 1600 || c.roles?.includes("defense"))) {
      value += 2.5;
    }
    if (ownIsAggro && ["summon", "special-summon", "attack"].includes(role)) {
      value += 2.0;
    }
    if (role === "chain" && (roles.has("battle-removal") || roles.has("removal"))) {
      value += 2.0;
    }
  }

  // 5. Matchup against Goat Control
  if (/goat-control/i.test(oppDeckId) || (/control/i.test(oppArchetype) && !/flip/i.test(oppArchetype))) {
    const hasTokens = (observation.opponentMonsters ?? []).some((m) => m.isToken || (Number(m.attack) === 0 && Number(m.defense) === 0));
    if (hasTokens) {
      if (roles.has("piercing") || roles.has("multi-attack") || cardNames.includes("airknight parshath") || cardNames.includes("asura priest")) {
        if (["summon", "special-summon", "attack"].includes(role)) value += 4.5;
      }
    }
  }

  return value * Math.min(1.2, confidence);
}

/** Tactical corrections that depend on the concrete OCGCore prompt. */
export function tacticalResponseAdjustment(knowledge, message, response, { observation = {}, memory = {}, opponentModel = null } = {}) {
  let value = positionValue(knowledge, message, response, observation) + selectionSizeValue(message, response);
  if (message.type === OcgMessageType.SELECT_CARD) {
    value += battleTargetValue(knowledge, message, response, observation, memory, opponentModel);
    value += effectTargetValue(knowledge, message, response, observation, memory);
  }
  if (message.type === OcgMessageType.ANNOUNCE_RACE) {
    value += announceRaceTacticalValue(knowledge, message, response, observation);
  }
  if (message.type === OcgMessageType.ANNOUNCE_NUMBER) {
    value += announceNumberTacticalValue(knowledge, message, response, observation);
  }
  if (message.type === OcgMessageType.SELECT_OPTION) {
    value += selectOptionTacticalValue(knowledge, message, response, observation);
  }
  if (message.type === OcgMessageType.SELECT_TRIBUTE || message.type === OcgMessageType.SELECT_SUM) {
    value += selectTributeTacticalValue(knowledge, message, response, observation);
  }
  value += chainValue(knowledge, message, response, observation, memory);
  value += comboValue(knowledge, message, response, observation, memory);
  value += matchupTacticalAdjustment(knowledge, message, response, { observation, memory, opponentModel });
  return value;
}

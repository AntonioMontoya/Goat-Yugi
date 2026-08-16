const RESPONSE_ROLES = Object.freeze([
  "interaction", "monster-removal", "backrow-removal", "negate", "swing",
  "position", "defense", "stall", "flip",
]);

function clamp(value, minimum = -8, maximum = 8) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function logistic(value) {
  return 1 / (1 + Math.exp(-clamp(value, -12, 12)));
}

function rolesOf(entry) {
  return new Set(entry?.roles ?? (entry?.analysis?.cards ?? []).flatMap((card) => card.roles ?? []));
}

function roleDensity(knowledge, role) {
  return Math.min(1, Number(knowledge?.roles?.[role] ?? 0) / Math.max(1, Number(knowledge?.mainSize) || 40));
}

function visibleRoleSet(knowledge, values = []) {
  return new Set(values.flatMap((entry) => knowledge?.byRuntimeCode?.[String(Number(entry?.runtimeCode ?? entry?.code) || 0)]?.roles ?? []));
}

function publicResponseBeliefs(observation = {}, opponentModel = null) {
  const risks = opponentModel?.risks ?? {};
  const backrow = Math.max(0, Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length) || 0);
  const hand = Math.max(0, Number(observation.opponentHandSize) || 0);
  const evidence = opponentModel?.ready ? Math.max(0.25, Number(opponentModel.confidence) || 0) : 0.25;
  const inferred = (role) => Math.min(1, Number(risks[role]) || 0) * evidence;
  const backrowPrior = 1 - Math.pow(0.84, backrow);
  const handPrior = 1 - Math.pow(0.965, hand);
  return {
    interaction: clamp(logistic(-2.25 + backrowPrior * 2.2 + handPrior * 0.8 + inferred("interaction") * 4) - 0.08, 0.02, 0.82),
    removal: clamp(logistic(-2.7 + backrowPrior * 2 + inferred("monster-removal") * 5 + inferred("removal") * 3) - 0.06, 0.01, 0.75),
    negate: clamp(logistic(-3.1 + backrowPrior * 1.7 + inferred("negate") * 6) - 0.04, 0.005, 0.62),
    sweep: clamp(logistic(-3.4 + handPrior * 1.3 + inferred("swing") * 6) - 0.03, 0.005, 0.58),
    backrowRemoval: clamp(logistic(-3.0 + handPrior * 1.1 + inferred("backrow-removal") * 6) - 0.04, 0.005, 0.65),
    battleTrick: clamp(logistic(-2.8 + backrowPrior * 2.4 + inferred("defense") * 3 + inferred("position") * 2) - 0.05, 0.01, 0.72),
    flip: clamp(logistic(-2.9 + Number(observation.opponentMonsters?.filter((card) => card?.faceUp !== true).length ?? 0) * 0.75 + inferred("flip") * 5) - 0.04, 0.01, 0.7),
  };
}

function selectedCardValue(entry) {
  const cards = entry?.analysis?.cards ?? [];
  if (!cards.length) return 0.7;
  return cards.reduce((sum, card) => {
    const roles = new Set(card.roles ?? []);
    let value = card.kind === "MONSTER" ? Math.max(Number(card.atk) || 0, Number(card.def) || 0) / 900 : 0.8;
    if (["draw", "search", "engine", "interaction", "boss", "recovery"].some((role) => roles.has(role))) value += 0.8;
    return sum + value;
  }, 0) / cards.length;
}

function responseLoss(entry, observation, beliefs) {
  const role = entry?.role ?? entry?.analysis?.role ?? "decision";
  const roles = rolesOf(entry);
  const ownMonsters = Number(observation.ownMonsterCount ?? observation.ownMonsters?.length) || 0;
  const ownBackrow = Number(observation.ownBackrowCount ?? observation.ownBackrow?.length) || 0;
  const cardValue = selectedCardValue(entry);
  let expected = 0;
  const losses = [];
  const add = (name, probability, impact) => {
    const value = Math.max(0, probability) * Math.max(0, impact);
    expected += value;
    losses.push({ name, probability, impact, value });
  };

  if (["summon", "special-summon"].includes(role)) {
    add("single-removal", beliefs.removal, cardValue * (role === "special-summon" ? 1.15 : 0.9));
    if (ownMonsters >= 2) add("monster-sweep", beliefs.sweep, (ownMonsters - 1) * 0.75 + cardValue * 0.45);
  }
  if (role === "spell-set") {
    add("backrow-removal", beliefs.backrowRemoval, Math.max(0.6, ownBackrow * 0.42 + cardValue * 0.35));
    if (ownBackrow >= 3) add("backrow-sweep", beliefs.sweep, (ownBackrow - 1) * 0.55);
  }
  if (["activate", "chain"].includes(role) && ["draw", "search", "engine", "swing"].some((value) => roles.has(value))) {
    add("negation", beliefs.negate, cardValue * (roles.has("swing") ? 1.25 : 0.75));
  }
  if (role === "battle-phase") {
    add("battle-interaction", beliefs.battleTrick, Math.max(0.15, Number(observation.ownBoardPower) / 9000));
  }
  if (role === "attack") {
    // Target selection is a later legal window. Penalising the whole attack
    // here made the policy enter Battle Phase and then decline sound attacks.
    add("battle-interaction", beliefs.battleTrick, Math.max(0.18, Number(observation.ownBoardPower) / 7500));
    if ((observation.opponentMonsters ?? []).some((card) => card?.faceUp !== true)) add("unknown-flip", beliefs.flip, 0.45);
  }
  return { expected, worst: Math.max(0, ...losses.map((item) => item.impact)), losses };
}

function followUpValue(knowledge, entry, observation, memory) {
  const role = entry?.role ?? entry?.analysis?.role ?? "decision";
  const roles = rolesOf(entry);
  const handRoles = visibleRoleSet(knowledge, observation.ownHand ?? []);
  let value = 0;
  if (["draw", "search"].some((item) => roles.has(item))) {
    value += 0.9 + roleDensity(knowledge, "engine") * 1.5 + roleDensity(knowledge, "interaction") * 0.8;
  }
  if (roles.has("grave-setup")) value += roleDensity(knowledge, "chaos") * 1.8 + roleDensity(knowledge, "recovery") * 0.8;
  if (roles.has("flip") && role === "monster-set") value += 1.1 + (handRoles.has("position") ? 0.45 : 0);
  if (roles.has("backrow-removal") && Number(observation.opponentBackrowCount) > 0) value += Number(observation.ownBoardPower) > 0 ? 0.7 : 0.25;
  if (roles.has("monster-removal") && Number(observation.opponentMonsterCount) === 1 && Number(observation.ownBoardPower) >= Number(observation.opponentLp)) value += 3;
  if (["battle-phase", "attack"].includes(role) && Number(observation.opponentMonsterCount) === 0) {
    value += clamp(Number(observation.ownBoardPower) / Math.max(800, Number(observation.opponentLp)), 0, 3);
  }
  if (role === "attack" && Number(observation.ownBoardPower) >= Number(observation.opponentThreat)) value += 0.65;
  const previous = memory?.recent?.at(-1);
  const previousRoles = new Set(previous?.roles ?? []);
  if (["draw", "search", "removal"].some((item) => previousRoles.has(item)) && ["summon", "special-summon", "battle-phase"].includes(role)) value += 0.45;
  if (previous?.role === "summon" && roles.has("position")) value -= 1.6;
  return value;
}

function optionalityValue(entry, observation) {
  const role = entry?.role ?? entry?.analysis?.role ?? "decision";
  const roles = rolesOf(entry);
  const ahead = Number(observation.ownBoardPower) > Number(observation.opponentThreat) + 900
    || Number(observation.ownLp) > Number(observation.opponentLp) + 2200;
  const behind = Number(observation.opponentThreat) > Number(observation.ownBoardPower) + 900
    || Number(observation.opponentLp) > Number(observation.ownLp) + 2200;
  let value = 0;
  if (ahead && ["summon", "special-summon", "spell-set"].includes(role)) value -= 0.45;
  if (ahead && ["end-phase", "pass-chain"].includes(role)) value += 0.25;
  if (behind && ["removal", "swing", "draw", "search", "defense"].some((item) => roles.has(item))) value += 0.8;
  if (behind && role === "end-phase") value -= 0.8;
  if (roles.has("interaction") && role === "spell-set") value += 0.35;
  return value;
}

/**
 * Two-ply abstract rollout over public beliefs. It does not inspect the duel
 * handle, seed, opposing hand or deck order. The first ply is the candidate;
 * the second is an expectation over plausible public counterplay, followed by
 * a compact own follow-up estimate.
 */
export function publicBeliefRollout(knowledge, entry, { observation = {}, memory = {}, opponentModel = null, riskAversion = 0.25 } = {}) {
  const beliefs = publicResponseBeliefs(observation, opponentModel);
  const counterplay = responseLoss(entry, observation, beliefs);
  const followUp = followUpValue(knowledge, entry, observation, memory);
  const optionality = optionalityValue(entry, observation);
  const worstCase = counterplay.worst * clamp(riskAversion, 0, 1);
  const value = clamp(followUp + optionality - counterplay.expected - worstCase, -6, 6);
  return {
    schema: 1,
    value,
    components: { followUp, optionality, expectedCounterplay: -counterplay.expected, worstCase: -worstCase },
    beliefs: Object.fromEntries(RESPONSE_ROLES.map((role) => [role, Number(opponentModel?.risks?.[role]) || 0]).concat(Object.entries(beliefs))),
    counterplay: counterplay.losses,
  };
}

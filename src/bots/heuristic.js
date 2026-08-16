import { ACTION, CARD_KIND, MONSTER_POSITION, PHASE } from "../engine/constants.js";

function visibleCard(observation, uid) {
  for (const p of observation.players) {
    for (const zone of [p.hand, p.monsterZone, p.spellTrapZone, p.grave]) {
      const found = zone.find((instance) => instance?.uid === uid);
      if (found) return found;
    }
  }
  return null;
}

function ownPlayer(observation) {
  return observation.players[observation.viewerId];
}

function opponent(observation) {
  return observation.players[observation.viewerId === 0 ? 1 : 0];
}

function cardByUid(observation, uid) {
  return visibleCard(observation, uid);
}

function isOpponentMonster(observation, uid) {
  return Boolean(opponent(observation).monsterZone.find((instance) => instance?.uid === uid));
}

function scoreAction(observation, action, weights) {
  const own = ownPlayer(observation);
  const enemy = opponent(observation);
  const source = cardByUid(observation, action.cardUid);
  const target = cardByUid(observation, action.targetUid);
  let score = weights[action.type] ?? 0;

  if (action.type === ACTION.SURRENDER) return -100000;
  if (action.type === ACTION.PASS_PRIORITY) return target ? 2 : 0;
  if (action.type === ACTION.ADVANCE_PHASE) return 12 + (observation.phase === PHASE.MAIN_1 ? 2 : 0);
  if (action.type === ACTION.SUMMON) {
    score += (source?.atk ?? 0) / 100;
    if (source?.cardId === 4) score += 9;
    if (source?.cardId === 7 || source?.cardId === 6) score += 4;
    if (own.monsterZone.filter(Boolean).length === 0) score += 6;
    if (action.tributes?.length) score -= action.tributes.length * 3;
  }
  if (action.type === ACTION.SET_MONSTER) {
    score += (source?.def ?? 0) / 100;
    if ([6, 7, 8].includes(source?.cardId)) score += 8;
  }
  if (action.type === ACTION.SET_SPELL_TRAP) {
    if ([60, 61, 62, 63, 66].includes(source?.cardId)) score += 15;
    if (own.spellTrapZone.filter(Boolean).length === 0) score += 3;
  }
  if (action.type === ACTION.ACTIVATE_SPELL) {
    if ([30, 31].includes(source?.cardId)) score += own.hand.length < 6 ? 26 : 6;
    if ([34, 42].includes(source?.cardId) && enemy.monsterZone.some(Boolean)) score += 18;
    if ([33, 35].includes(source?.cardId) && enemy.spellTrapZone.some(Boolean)) score += 16;
    if ([32].includes(source?.cardId) && target && isOpponentMonster(observation, target.uid)) score += target.faceUp ? 13 : -5;
    if ([36].includes(source?.cardId)) score += own.monsterZone.filter(Boolean).length < 3 ? 12 : 3;
    if ([37].includes(source?.cardId)) score += target ? (target.atk ?? 0) / 80 : 0;
    if ([40].includes(source?.cardId)) score += 12;
    if ([41].includes(source?.cardId)) score += enemy.handCount > 2 ? 12 : -3;
    if ([38].includes(source?.cardId)) score += own.grave.some((card) => card.kind === CARD_KIND.MONSTER) ? 10 : -20;
  }
  if (action.type === ACTION.ACTIVATE_TRAP) {
    if (String(action.label).includes("Mirror Force")) score += 38;
    if (String(action.label).includes("Torrential")) score += enemy.monsterZone.filter(Boolean).length > 1 ? 31 : 14;
    if (String(action.label).includes("Sakuretsu")) score += 27;
    if (String(action.label).includes("Bottomless")) score += 28;
    if (String(action.label).includes("Ring")) score += target?.atk ? target.atk / 70 : 8;
    if (String(action.label).includes("Dust")) score += enemy.spellTrapZone.filter(Boolean).length * 4;
    if (observation.reaction?.event === "ATTACK_DECLARED") score += 12;
  }
  if (action.type === ACTION.ATTACK) {
    const attacker = cardByUid(observation, action.attackerUid);
    const defender = cardByUid(observation, action.targetUid);
    score += (attacker?.atk ?? 0) / 100;
    if (!defender) score += (enemy.lp <= (attacker?.atk ?? 0) ? 70 : 20);
    else if (defender.position === MONSTER_POSITION.ATTACK) score += ((attacker?.atk ?? 0) - (defender.atk ?? 0)) / 50;
    else score += ((attacker?.atk ?? 0) - (defender.def ?? 0)) / 50;
    if (attacker?.cardId === 16) score += 4;
  }
  if (action.type === ACTION.CHANGE_POSITION) score += 4;
  return score;
}

export class HeuristicBot {
  constructor({ id = "heuristic", name = "Astra", difficulty = "normal", weights = {}, seed = 1 } = {}) {
    this.id = id;
    this.name = name;
    this.difficulty = difficulty;
    this.seed = seed;
    this.weights = {
      [ACTION.SUMMON]: 20,
      [ACTION.SET_MONSTER]: 13,
      [ACTION.SET_SPELL_TRAP]: 10,
      [ACTION.ACTIVATE_SPELL]: 8,
      [ACTION.ACTIVATE_TRAP]: 12,
      [ACTION.ATTACK]: 19,
      [ACTION.CHANGE_POSITION]: 5,
      [ACTION.ADVANCE_PHASE]: 1,
      [ACTION.PASS_PRIORITY]: 0,
      ...weights
    };
    this.decisions = 0;
  }

  chooseAction(observation, legalActions) {
    if (!legalActions.length) throw new Error(`${this.name}: no recibió acciones legales.`);
    const scored = legalActions.map((action) => ({ action, score: scoreAction(observation, action, this.weights) }));
    scored.sort((a, b) => b.score - a.score || String(a.action.id).localeCompare(String(b.action.id)));
    this.decisions += 1;
    return scored[0].action;
  }

  manifest() {
    return { id: this.id, name: this.name, algorithm: "deterministic-heuristic", difficulty: this.difficulty, weights: { ...this.weights }, decisions: this.decisions };
  }
}

export class AdaptiveHeuristicBot extends HeuristicBot {
  constructor(options = {}) {
    super({ ...options, id: options.id ?? "adaptive-heuristic", name: options.name ?? "Pepito" });
    this.version = options.version ?? 1;
    this.learningRate = options.learningRate ?? 0.02;
    this.episodes = options.episodes ?? 0;
    this.outcomeSum = options.outcomeSum ?? 0;
    this.selectedActionCounts = { ...(options.selectedActionCounts ?? {}) };
  }

  chooseAction(observation, legalActions) {
    const action = super.chooseAction(observation, legalActions);
    this.selectedActionCounts[action.type] = (this.selectedActionCounts[action.type] ?? 0) + 1;
    return action;
  }

  updateFromOutcome(reward) {
    this.episodes += 1;
    this.outcomeSum += reward;
    const denominator = Math.max(1, this.episodes);
    const signal = reward * this.learningRate;
    for (const [type, count] of Object.entries(this.selectedActionCounts)) {
      const share = count / Math.max(1, this.decisions);
      this.weights[type] = Math.max(-20, Math.min(60, (this.weights[type] ?? 0) + signal * share));
    }
    return { reward, averageReward: this.outcomeSum / denominator, weights: { ...this.weights } };
  }

  manifest() {
    return { ...super.manifest(), algorithm: "online-outcome-weighted-heuristic", version: this.version, learningRate: this.learningRate, episodes: this.episodes, outcomeSum: this.outcomeSum, selectedActionCounts: { ...this.selectedActionCounts } };
  }
}

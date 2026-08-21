import { GOAT_BASE_KNOWLEDGE_FINGERPRINT, GOAT_BASE_KNOWLEDGE_SCHEMA, baseKnowledgeFeatures } from "./goat-base-knowledge.js";

export const NEXO2_POLICY_SCHEMA = 1;
export const NEXO2_INPUT_SIZE = 128;
export const NEXO2_HIDDEN_SIZE = 32;

function clamp(value, minimum = -4, maximum = 4) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function hash(value) {
  const text = String(value);
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function codeOf(card) {
  return Number(card?.runtimeCode ?? card?.code ?? card?.card ?? 0);
}

function add(vector, name, value = 1) {
  const hashed = hash(name);
  const index = hashed % vector.length;
  const sign = (hashed & 0x80000000) === 0 ? 1 : -1;
  vector[index] += clamp(value, -3, 3) * sign;
}

function addZoneRoles(vector, knowledge, prefix, cards = []) {
  for (const card of cards) {
    const semantics = knowledge?.byRuntimeCode?.[String(codeOf(card))];
    if (!semantics) continue;
    add(vector, `${prefix}:card:${semantics.runtimeCode}`, 0.35);
    for (const role of semantics.roles ?? []) add(vector, `${prefix}:role:${role}`, 0.45);
  }
}

function relation(observation) {
  const own = Number(observation.ownBoardPower) || 0;
  const opponent = Number(observation.opponentThreat) || 0;
  if (own > opponent + 700) return "ahead";
  if (opponent > own + 700) return "behind";
  return "even";
}

/** Builds a fixed-size public-information vector for one legal response. */
export function nexo2FeatureVector(knowledge, entry, { observation = {}, memory = {}, opponentModel = null, belief = null } = {}) {
  const vector = Array(NEXO2_INPUT_SIZE).fill(0);
  const role = entry?.role ?? entry?.analysis?.role ?? "decision";
  const semanticRoles = new Set(entry?.roles ?? (entry?.analysis?.cards ?? []).flatMap((card) => card.roles ?? []));
  const boardRelation = relation(observation);

  add(vector, "bias", 1);
  add(vector, "state:lp-difference", (Number(observation.ownLp) - Number(observation.opponentLp)) / 8000);
  add(vector, "state:hand-difference", (Number(observation.handSize) - Number(observation.opponentHandSize)) / 6);
  add(vector, "state:deck-difference", (Number(observation.ownDeckSize) - Number(observation.opponentDeckSize)) / 40);
  add(vector, "state:power-difference", (Number(observation.ownBoardPower) - Number(observation.opponentThreat)) / 3500);
  add(vector, "state:monster-difference", (Number(observation.ownMonsterCount) - Number(observation.opponentMonsterCount)) / 5);
  add(vector, "state:backrow-difference", (Number(observation.ownBackrowCount) - Number(observation.opponentBackrowCount)) / 5);
  add(vector, "state:turn", Math.min(1.5, (Number(observation.turn) || 0) / 16));
  add(vector, `state:phase:${Number(observation.phase) || 0}`, 0.8);
  add(vector, `state:relation:${boardRelation}`, 1);
  add(vector, `state:turn-owner:${observation.isOwnTurn === true ? "own" : observation.isOwnTurn === false ? "opponent" : "unknown"}`, 0.8);
  if (Number(observation.ownLp) <= 3000) add(vector, "state:own-low-lp", 1);
  if (Number(observation.opponentLp) <= 3000) add(vector, "state:opponent-low-lp", 1);
  if (observation.chaosReady) add(vector, "state:chaos-ready", 1);
  for (const feature of baseKnowledgeFeatures(knowledge, observation, entry)) add(vector, feature, 0.38);

  add(vector, `action:${role}`, 1.2);
  add(vector, `cross:${boardRelation}:${role}`, 0.8);
  add(vector, `cross:phase:${Number(observation.phase) || 0}:${role}`, 0.55);
  add(vector, `style:${entry?.playstyle ?? "balanced"}:${role}`, 0.7);
  for (const semanticRole of semanticRoles) {
    add(vector, `action-semantic:${semanticRole}`, 0.75);
    add(vector, `cross:${role}:${semanticRole}`, 0.55);
    add(vector, `cross:${boardRelation}:${semanticRole}`, 0.35);
  }

  for (const card of entry?.analysis?.cards ?? []) {
    add(vector, `action-card:${card.runtimeCode}`, 0.45);
    add(vector, "action-card:attack", (Number(card.atk) || 0) / 3000);
    add(vector, "action-card:defense", (Number(card.def) || 0) / 3000);
    add(vector, "action-card:level", (Number(card.level) || 0) / 8);
  }
  for (const [component, value] of Object.entries(entry?.analysis?.components ?? {})) add(vector, `projection:${component}`, Number(value) / 6);
  add(vector, "projection:value", Number(entry?.analysis?.value) / 12);
  add(vector, "planner:score", Number(entry?.score) / 12);

  const deckSize = Math.max(1, Number(knowledge?.mainSize) || 40);
  for (const [deckRole, count] of Object.entries(knowledge?.roles ?? {})) add(vector, `deck-role:${deckRole}`, Number(count) / deckSize);
  const plan = knowledge?.plan ?? {};
  add(vector, `deck-plan:${plan.id ?? "generic"}`, 0.5);
  add(vector, `deck-playstyle:${plan.playstyle ?? plan.archetype ?? "adaptive"}`, 0.45);
  for (const planRole of plan.priorityRoles ?? []) add(vector, `plan-priority:${planRole}`, 0.18);
  for (const planRole of plan.openingRoles ?? []) add(vector, `plan-opening:${planRole}`, 0.24);
  for (const planRole of plan.keepRoles ?? []) add(vector, `plan-keep:${planRole}`, 0.2);
  for (const planRole of plan.counterplayRoles ?? []) add(vector, `plan-counterplay:${planRole}`, 0.22);
  for (const strength of plan.strengths ?? []) add(vector, `plan-strength:${strength}`, 0.14);
  for (const condition of plan.lossConditions ?? []) add(vector, `plan-loss-condition:${condition}`, 0.18);
  for (const goal of plan.goals ?? []) add(vector, `plan-goal:${goal}`, 0.16);
  for (const scenario of plan.scenarios ?? []) add(vector, `plan-scenario:${scenario}`, 0.14);
  for (const cardName of plan.keyCards ?? []) add(vector, `plan-key-card:${cardName}`, 0.2);
  addZoneRoles(vector, knowledge, "hand", observation.ownHand ?? []);
  addZoneRoles(vector, knowledge, "board", observation.ownMonsters ?? []);
  addZoneRoles(vector, knowledge, "grave", observation.graveyard ?? []);

  for (const [risk, value] of Object.entries(opponentModel?.risks ?? {})) add(vector, `opponent-risk:${risk}`, Number(value));
  if (opponentModel?.ready) {
    add(vector, `opponent-archetype:${opponentModel.top?.archetype ?? "unknown"}`, Number(opponentModel.confidence) || 0.5);
    add(vector, "opponent-model-confidence", Number(opponentModel.confidence));
  }
  for (const [component, value] of Object.entries(belief?.components ?? {})) add(vector, `belief:${component}`, Number(value) / 4);
  add(vector, "belief:value", Number(belief?.value) / 6);

  const recent = (memory?.recent ?? []).slice(-6);
  for (let index = 0; index < recent.length; index += 1) {
    const item = recent[recent.length - 1 - index];
    const weight = 0.6 / (index + 1);
    add(vector, `history:${index}:action:${item.role}`, weight);
    if (item.cardCode) add(vector, `history:${index}:card:${item.cardCode}`, weight * 0.45);
    for (const recentRole of item.roles ?? []) add(vector, `history:${index}:role:${recentRole}`, weight * 0.55);
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  const scale = norm > 4 ? 4 / norm : 1;
  return vector.map((value) => value * scale);
}

function seededGenerator(seed) {
  let state = Number(seed) >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function initializedWeights(length, random, scale) {
  return Array.from({ length }, () => (random() * 2 - 1) * scale);
}

function modelArray(value, length, fallback) {
  return Array.isArray(value) && value.length === length ? value.map((item) => Number(item) || 0) : fallback();
}

function softmax(values, temperature = 1) {
  if (!values.length) return [];
  const safeTemperature = Math.max(0.15, Number(temperature) || 1);
  const maximum = Math.max(...values.map((value) => Number(value) / safeTemperature));
  const weights = values.map((value) => Math.exp(clamp(Number(value) / safeTemperature - maximum, -30, 0)));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return weights.map((value) => value / total);
}

export class Nexo2PolicyNetwork {
  constructor(model = {}, { seed = 1, learningRate = 0.004 } = {}) {
    this.inputSize = NEXO2_INPUT_SIZE;
    this.hiddenSize = NEXO2_HIDDEN_SIZE;
    const random = seededGenerator(Number(model.seed ?? seed) || 1);
    const scale = Math.sqrt(6 / (this.inputSize + this.hiddenSize));
    this.w1 = modelArray(model.w1, this.inputSize * this.hiddenSize, () => initializedWeights(this.inputSize * this.hiddenSize, random, scale));
    this.b1 = modelArray(model.b1, this.hiddenSize, () => Array(this.hiddenSize).fill(0));
    this.wp = modelArray(model.wp, this.hiddenSize, () => Array(this.hiddenSize).fill(0));
    this.wv = modelArray(model.wv, this.hiddenSize, () => Array(this.hiddenSize).fill(0));
    this.bp = Number(model.bp) || 0;
    this.bv = Number(model.bv) || 0;
    this.seed = Number(model.seed ?? seed) || 1;
    this.learningRate = Math.max(0.0001, Math.min(0.05, Number(model.learningRate ?? learningRate) || 0.004));
    this.trainingState = {
      episodes: Math.max(0, Number(model.trainingState?.episodes) || 0),
      updates: Math.max(0, Number(model.trainingState?.updates) || 0),
      rewardBaseline: Number(model.trainingState?.rewardBaseline) || 0,
      meanAbsoluteAdvantage: Number(model.trainingState?.meanAbsoluteAdvantage) || 0,
    };
  }

  forward(input) {
    const hidden = Array(this.hiddenSize).fill(0);
    for (let row = 0; row < this.hiddenSize; row += 1) {
      let value = this.b1[row];
      const offset = row * this.inputSize;
      for (let column = 0; column < this.inputSize; column += 1) value += this.w1[offset + column] * (Number(input[column]) || 0);
      hidden[row] = Math.tanh(value);
    }
    let logit = this.bp;
    let rawValue = this.bv;
    for (let index = 0; index < this.hiddenSize; index += 1) {
      logit += this.wp[index] * hidden[index];
      rawValue += this.wv[index] * hidden[index];
    }
    return { hidden, logit: clamp(logit, -12, 12), policy: Math.tanh(logit), value: Math.tanh(rawValue), rawValue };
  }

  scoreBatch(inputs = []) {
    return inputs.map((input) => this.forward(input));
  }

  learnEpisode(episode = [], reward = 0) {
    const traces = episode.filter((trace) => Array.isArray(trace.nexo2Inputs) && trace.nexo2Inputs.length > 1 && Number.isInteger(trace.nexo2Chosen));
    const result = clamp(reward, -1, 1);
    const baselineBefore = this.trainingState.rewardBaseline;
    this.trainingState.episodes += 1;
    const baselineRate = Math.min(0.04, 1 / Math.max(8, this.trainingState.episodes));
    this.trainingState.rewardBaseline += (result - this.trainingState.rewardBaseline) * baselineRate;
    if (!traces.length) return { updates: 0, meanAbsoluteAdvantage: 0 };

    const stride = Math.max(1, Math.ceil(traces.length / 96));
    let updates = 0;
    let advantageTotal = 0;
    for (let traceIndex = traces.length - 1; traceIndex >= 0; traceIndex -= stride) {
      const trace = traces[traceIndex];
      const chosen = Math.max(0, Math.min(trace.nexo2Inputs.length - 1, Number(trace.nexo2Chosen) || 0));
      const teacher = Number.isInteger(trace.nexo2Teacher) && trace.nexo2Teacher >= 0 && trace.nexo2Teacher < trace.nexo2Inputs.length ? trace.nexo2Teacher : null;
      const forwards = this.scoreBatch(trace.nexo2Inputs);
      const probabilities = softmax(forwards.map((item) => item.logit), 1);
      const distance = traces.length - traceIndex - 1;
      const discount = Math.pow(0.997, Math.min(300, distance));
      const nextSignal = Number(traces[Math.min(traces.length - 1, traceIndex + 1)]?.stateSignal) || 0;
      const localProgress = clamp(nextSignal - (Number(trace.stateSignal) || 0), -0.5, 0.5);
      const localRewardSignal = clamp(Number(trace.localRewardSignal) || 0, -0.35, 0.35);
      const valueTarget = clamp(result * discount + localProgress * 0.12 + localRewardSignal * 0.16, -1, 1);
      const advantage = clamp((result - baselineBefore) * discount + localProgress * 0.18 + localRewardSignal * 0.3 - forwards[chosen].value * 0.35, -2, 2);
      const rate = this.learningRate / Math.sqrt(Math.max(1, traces.length / 24));
      const oldWp = [...this.wp];
      const oldWv = [...this.wv];
      const teacherStrength = teacher === null ? 0 : 0.04 + 0.12 * Math.exp(-this.trainingState.episodes / 400);
      const policyGradients = probabilities.map((probability, index) => clamp(
        ((index === chosen ? 1 : 0) - probability) * advantage
          + teacherStrength * ((index === teacher ? 1 : 0) - probability),
        -1.5, 1.5,
      ));
      const valueGradient = clamp((valueTarget - forwards[chosen].value) * (1 - forwards[chosen].value ** 2) * 0.65, -1.5, 1.5);

      const w1Gradient = Array(this.w1.length).fill(0);
      const b1Gradient = Array(this.hiddenSize).fill(0);
      for (let candidate = 0; candidate < forwards.length; candidate += 1) {
        const current = forwards[candidate];
        const input = trace.nexo2Inputs[candidate];
        const policyGradient = policyGradients[candidate];
        for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
          const valuePart = candidate === chosen ? valueGradient * oldWv[hiddenIndex] : 0;
          const hiddenGradient = (policyGradient * oldWp[hiddenIndex] + valuePart) * (1 - current.hidden[hiddenIndex] ** 2);
          const clipped = clamp(hiddenGradient, -1, 1);
          b1Gradient[hiddenIndex] += clipped;
          const offset = hiddenIndex * this.inputSize;
          for (let inputIndex = 0; inputIndex < this.inputSize; inputIndex += 1) w1Gradient[offset + inputIndex] += clipped * (Number(input[inputIndex]) || 0);
        }
      }
      for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
        const policyOutputGradient = forwards.reduce((sum, current, candidate) => sum + policyGradients[candidate] * current.hidden[hiddenIndex], 0);
        this.wp[hiddenIndex] = clamp(this.wp[hiddenIndex] * 0.99998 + rate * policyOutputGradient, -4, 4);
        this.wv[hiddenIndex] = clamp(this.wv[hiddenIndex] * 0.99998 + rate * valueGradient * forwards[chosen].hidden[hiddenIndex], -4, 4);
        this.b1[hiddenIndex] = clamp(this.b1[hiddenIndex] + rate * b1Gradient[hiddenIndex], -3, 3);
      }
      this.bp = clamp(this.bp + rate * policyGradients.reduce((sum, value) => sum + value, 0), -3, 3);
      this.bv = clamp(this.bv + rate * valueGradient, -3, 3);
      for (let index = 0; index < this.w1.length; index += 1) this.w1[index] = clamp(this.w1[index] * 0.999995 + rate * clamp(w1Gradient[index], -2, 2), -2, 2);
      advantageTotal += Math.abs(advantage);
      updates += 1;
    }
    this.trainingState.updates += updates;
    const mean = advantageTotal / Math.max(1, updates);
    this.trainingState.meanAbsoluteAdvantage = this.trainingState.meanAbsoluteAdvantage * 0.95 + mean * 0.05;
    return { updates, meanAbsoluteAdvantage: mean };
  }

  manifest() {
    return {
      schema: NEXO2_POLICY_SCHEMA,
      type: "public-action-mlp-policy-value",
      baseKnowledgeSchema: GOAT_BASE_KNOWLEDGE_SCHEMA,
      baseKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      seed: this.seed,
      learningRate: this.learningRate,
      w1: [...this.w1], b1: [...this.b1], wp: [...this.wp], wv: [...this.wv], bp: this.bp, bv: this.bv,
      trainingState: { ...this.trainingState },
    };
  }
}

export function policyProbabilities(values, temperature = 1) {
  return softmax(values, temperature);
}

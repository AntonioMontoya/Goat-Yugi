import { GOAT_BASE_KNOWLEDGE_FINGERPRINT, GOAT_BASE_KNOWLEDGE_SCHEMA, baseKnowledgeFeatures } from "./goat-base-knowledge.js";
import { isOpponentBackrowProbed, evaluateBackrowThreats } from "./negative-inference.js";
import { resolvePlaystyleProfile } from "./state-evaluator.js";

import { NEXO2_POLICY_SCHEMA_V3, stableSoftmax } from "../training/nexo2-policy-contract.js";

export const NEXO2_POLICY_SCHEMA = NEXO2_POLICY_SCHEMA_V3;
export const NEXO2_DENSE_SIZE = 32;
export const NEXO2_HASH_SIZE = 256;
export const NEXO2_INPUT_SIZE = NEXO2_DENSE_SIZE + NEXO2_HASH_SIZE;
export const NEXO2_HIDDEN_SIZE = 64;

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
  const index = NEXO2_DENSE_SIZE + (hashed % NEXO2_HASH_SIZE);
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

function getCachedDeckDeltas(knowledge) {
  if (!knowledge) return [];
  if (knowledge._cachedNexo2Deltas) return knowledge._cachedNexo2Deltas;
  const deltas = [];
  const pushDelta = (name, value) => {
    const hashed = hash(name);
    const index = NEXO2_DENSE_SIZE + (hashed % NEXO2_HASH_SIZE);
    const sign = (hashed & 0x80000000) === 0 ? 1 : -1;
    deltas.push([index, clamp(value, -3, 3) * sign]);
  };
  const deckSize = Math.max(1, Number(knowledge?.mainSize) || 40);
  for (const [deckRole, count] of Object.entries(knowledge?.roles ?? {})) {
    pushDelta(`deck-role:${deckRole}`, Number(count) / deckSize);
  }
  const plan = knowledge?.plan ?? {};
  pushDelta(`deck-plan:${plan.id ?? "generic"}`, 0.5);
  pushDelta(`deck-playstyle:${plan.playstyle ?? plan.archetype ?? "adaptive"}`, 0.45);
  for (const planRole of plan.priorityRoles ?? []) pushDelta(`plan-priority:${planRole}`, 0.18);
  for (const planRole of plan.openingRoles ?? []) pushDelta(`plan-opening:${planRole}`, 0.24);
  for (const planRole of plan.keepRoles ?? []) pushDelta(`plan-keep:${planRole}`, 0.2);
  for (const planRole of plan.counterplayRoles ?? []) pushDelta(`plan-counterplay:${planRole}`, 0.22);
  for (const strength of plan.strengths ?? []) pushDelta(`plan-strength:${strength}`, 0.14);
  for (const condition of plan.lossConditions ?? []) pushDelta(`plan-loss-condition:${condition}`, 0.18);
  for (const goal of plan.goals ?? []) pushDelta(`plan-goal:${goal}`, 0.16);
  for (const scenario of plan.scenarios ?? []) pushDelta(`plan-scenario:${scenario}`, 0.14);
  for (const cardName of plan.keyCards ?? []) pushDelta(`plan-key-card:${cardName}`, 0.2);
  knowledge._cachedNexo2Deltas = deltas;
  return deltas;
}

/** Builds a fixed-size hybrid dense + hash vector for one legal response. */
export function nexo2FeatureVector(knowledge, entry, { observation = {}, memory = {}, opponentModel = null, belief = null, negativeInference = null } = {}) {
  const vector = Array(NEXO2_INPUT_SIZE).fill(0);
  const role = entry?.role ?? entry?.analysis?.role ?? "decision";
  const semanticRoles = new Set(entry?.roles ?? (entry?.analysis?.cards ?? []).flatMap((card) => card.roles ?? []));
  const boardRelation = relation(observation);

  // Dedicated Dense Features (0 to 31) - No hash collisions!
  vector[0] = 1; // bias
  vector[1] = clamp((Number(observation.ownLp) - Number(observation.opponentLp)) / 8000, -2, 2);
  vector[2] = clamp((Number(observation.handSize) - Number(observation.opponentHandSize)) / 6, -2, 2);
  vector[3] = clamp((Number(observation.ownDeckSize) - Number(observation.opponentDeckSize)) / 40, -1, 1);
  vector[4] = clamp((Number(observation.ownBoardPower) - Number(observation.opponentThreat)) / 3500, -3, 3);
  vector[5] = clamp((Number(observation.ownMonsterCount) - Number(observation.opponentMonsterCount)) / 5, -1, 1);
  vector[6] = clamp((Number(observation.ownBackrowCount) - Number(observation.opponentBackrowCount)) / 5, -1, 1);
  vector[7] = Math.min(1.5, (Number(observation.turn) || 0) / 16);
  vector[8] = Number(observation.phase || 0) / 256;
  vector[9] = Number(observation.ownLp) <= 3000 ? 1 : 0;
  vector[10] = Number(observation.opponentLp) <= 3000 ? 1 : 0;
  vector[11] = observation.chaosReady ? 1 : 0;
  vector[12] = observation.isOwnTurn === true ? 1 : 0;
  vector[13] = observation.isOwnTurn === false ? 1 : 0;
  vector[14] = boardRelation === "ahead" ? 1 : 0;
  vector[15] = boardRelation === "behind" ? 1 : 0;
  vector[16] = boardRelation === "even" ? 1 : 0;
  vector[17] = clamp(Number(entry?.analysis?.value) / 12, -2, 2);
  vector[18] = clamp(Number(entry?.score) / 12, -2, 2);
  vector[19] = clamp(Number(belief?.value) / 6, -2, 2);
  vector[20] = clamp(Number(belief?.components?.expectedCounterplay ?? 0) / 4, -2, 2);
  vector[21] = clamp(Number(belief?.components?.worstCase ?? 0) / 4, -2, 2);
  vector[22] = opponentModel?.ready ? 1 : 0;
  vector[23] = Number(opponentModel?.confidence) || 0;
  vector[24] = role === "attack" ? 1 : 0;
  vector[25] = role === "summon" || role === "special-summon" ? 1 : 0;
  vector[26] = role === "monster-set" || role === "spell-set" ? 1 : 0;
  vector[27] = role === "activate" || role === "chain" ? 1 : 0;
  vector[28] = role === "pass-chain" || role === "end-phase" ? 1 : 0;
  vector[29] = observation.goatDamageStep === true ? 1 : 0;
  vector[30] = clamp(Number(observation.ownMonsterCount) / 5, 0, 1);
  vector[31] = clamp(Number(observation.opponentMonsterCount) / 5, 0, 1);

  // Hash-partitioned features (32 to 287)
  for (const feature of baseKnowledgeFeatures(knowledge, observation, entry)) add(vector, feature, 0.38);

  add(vector, `action:${role}`, 1.2);
  add(vector, `cross:${boardRelation}:${role}`, 0.8);
  add(vector, `cross:phase:${Number(observation.phase) || 0}:${role}`, 0.55);
  add(vector, `style:${entry?.playstyle ?? "balanced"}:${role}`, 0.7);
  const playstyleProfile = entry?.analysis?.playstyle ?? resolvePlaystyleProfile(knowledge);
  add(vector, `playstyle-profile:${playstyleProfile}`, 0.6);
  add(vector, `playstyle-profile:${playstyleProfile}:role:${role}`, 0.85);
  add(vector, `playstyle-profile:${playstyleProfile}:state:${boardRelation}`, 0.55);
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
    if (card.class === "Spirit" || card.roles?.includes("spirit")) {
      add(vector, "action-card:is-spirit", 0.65);
    }
    if (card.roles?.includes("summon-restriction")) {
      add(vector, "action-card:has-summon-restriction", 0.65);
    }
  }
  for (const [component, value] of Object.entries(entry?.analysis?.components ?? {})) add(vector, `projection:${component}`, Number(value) / 6);

  const deckDeltas = getCachedDeckDeltas(knowledge);
  for (let i = 0; i < deckDeltas.length; i += 1) {
    const [index, delta] = deckDeltas[i];
    vector[index] += delta;
  }
  addZoneRoles(vector, knowledge, "hand", observation.ownHand ?? []);
  addZoneRoles(vector, knowledge, "board", observation.ownMonsters ?? []);
  addZoneRoles(vector, knowledge, "grave", observation.graveyard ?? []);

  for (const [risk, value] of Object.entries(opponentModel?.risks ?? {})) add(vector, `opponent-risk:${risk}`, Number(value));
  if (opponentModel?.ready) {
    const oppArchetype = opponentModel.top?.archetype ?? "unknown";
    const ownDeck = knowledge?.deckId ?? "unknown";
    add(vector, `opponent-archetype:${oppArchetype}`, Number(opponentModel.confidence) || 0.5);
    add(vector, "opponent-model-confidence", Number(opponentModel.confidence));
    add(vector, `matchup:${ownDeck}:vs:${oppArchetype}`, 0.6);
    add(vector, `opp-archetype:${oppArchetype}:action:${role}`, 0.65);
    for (const semanticRole of semanticRoles) {
      add(vector, `opp-archetype:${oppArchetype}:semantic:${semanticRole}`, 0.5);
    }
  }
  let oppLight = 0;
  let oppDark = 0;
  for (const card of observation.opponentGrave ?? []) {
    const sem = knowledge?.byRuntimeCode?.[String(codeOf(card))] ?? null;
    if (sem?.attribute === "LIGHT") oppLight += 1;
    if (sem?.attribute === "DARK") oppDark += 1;
  }
  if (oppLight >= 1 && oppDark >= 1) {
    add(vector, `opp-chaos-ready:action:${role}`, 0.65);
    for (const semanticRole of semanticRoles) {
      add(vector, `opp-chaos-ready:semantic:${semanticRole}`, 0.5);
    }
  }
  for (const [component, value] of Object.entries(belief?.components ?? {})) add(vector, `belief:${component}`, Number(value) / 4);
  if (negativeInference) {
    const isProbed = isOpponentBackrowProbed(negativeInference, observation);
    add(vector, `backrow-probed:${isProbed ? "true" : "false"}`, 0.6);
    add(vector, `cross:${role}:backrow-probed:${isProbed ? "true" : "false"}`, 0.5);
    const threats = evaluateBackrowThreats(negativeInference, observation);
    if (!threats.mirrorForcePossible) add(vector, "safe:no-mirror-force", 0.7);
    if (!threats.torrentialPossible) add(vector, "safe:no-torrential", 0.5);
    if (threats.knownOpponentHandCount > 0) add(vector, `opp-hand:known-count:${threats.knownOpponentHandCount}`, 0.4);
  }

  const recent = (memory?.recent ?? []).slice(-6);
  for (let index = 0; index < recent.length; index += 1) {
    const item = recent[recent.length - 1 - index];
    const weight = 0.6 / (index + 1);
    add(vector, `history:${index}:action:${item.role}`, weight);
    if (item.cardCode) add(vector, `history:${index}:card:${item.cardCode}`, weight * 0.45);
    for (const recentRole of item.roles ?? []) add(vector, `history:${index}:role:${recentRole}`, weight * 0.55);
  }

  const hashPart = vector.slice(NEXO2_DENSE_SIZE);
  const norm = Math.sqrt(hashPart.reduce((sum, value) => sum + value * value, 0));
  const scale = norm > 4 ? 4 / norm : 1;
  for (let index = NEXO2_DENSE_SIZE; index < NEXO2_INPUT_SIZE; index += 1) {
    vector[index] *= scale;
  }
  return vector;
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
    this.inputSize = Number(model.inputSize) || NEXO2_INPUT_SIZE;
    this.hiddenSize = Number(model.hiddenSize) || NEXO2_HIDDEN_SIZE;
    if (model.w1 && Array.isArray(model.w1) && model.w1.length !== this.inputSize * this.hiddenSize) {
      throw new Error(`Incompatible network dimensions in model: expected w1.length=${this.inputSize * this.hiddenSize}, got ${model.w1.length}`);
    }
    this.policyVersion = Math.max(1, Number(model.policyVersion) || 1);
    const random = seededGenerator(Number(model.seed ?? seed) || 1);
    const scale = Math.sqrt(6 / (this.inputSize + this.hiddenSize));
    const rawW1 = modelArray(model.w1, this.inputSize * this.hiddenSize, () => initializedWeights(this.inputSize * this.hiddenSize, random, scale));
    const rawB1 = modelArray(model.b1, this.hiddenSize, () => Array(this.hiddenSize).fill(0));
    const rawWp = modelArray(model.wp, this.hiddenSize, () => Array(this.hiddenSize).fill(0));
    const rawWv = modelArray(model.wv, this.hiddenSize, () => Array(this.hiddenSize).fill(0));
    this.w1 = new Float32Array(rawW1);
    this.b1 = new Float32Array(rawB1);
    this.wp = new Float32Array(rawWp);
    this.wv = new Float32Array(rawWv);
    this.bp = Number(model.bp) || 0;
    this.bv = Number(model.bv) || 0;
    this.vw1 = new Float32Array(this.w1.length);
    this.vb1 = new Float32Array(this.hiddenSize);
    this.vwp = new Float32Array(this.hiddenSize);
    this.vwv = new Float32Array(this.hiddenSize);
    this.vbp = 0;
    this.vbv = 0;
    this.seed = Number(model.seed ?? seed) || 1;
    this.learningRate = Math.max(0.0001, Math.min(0.05, Number(model.learningRate ?? learningRate) || 0.004));
    this.trainingState = {
      episodes: Math.max(0, Number(model.trainingState?.episodes) || 0),
      updates: Math.max(0, Number(model.trainingState?.updates) || 0),
      rewardBaseline: Number(model.trainingState?.rewardBaseline) || 0,
      meanAbsoluteAdvantage: Number(model.trainingState?.meanAbsoluteAdvantage) || 0,
    };
    this.optimizerState = model.optimizerState ? structuredClone(model.optimizerState) : null;
  }

  forward(input) {
    const hidden = new Float32Array(this.hiddenSize);
    const inputSize = this.inputSize;
    const w1 = this.w1;
    const b1 = this.b1;
    for (let row = 0; row < this.hiddenSize; row += 1) {
      let value = b1[row];
      const offset = row * inputSize;
      for (let column = 0; column < inputSize; column += 1) {
        value += w1[offset + column] * (Number(input[column]) || 0);
      }
      hidden[row] = Math.tanh(value);
    }
    let logit = this.bp;
    let rawValue = this.bv;
    const wp = this.wp;
    const wv = this.wv;
    for (let index = 0; index < this.hiddenSize; index += 1) {
      logit += wp[index] * hidden[index];
      rawValue += wv[index] * hidden[index];
    }
    return {
      hidden,
      rawLogit: logit,
      logit: clamp(logit, -12, 12),
      qValue: rawValue,
      rawValue,
      policy: Math.tanh(logit),
      value: Math.tanh(rawValue),
    };
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

      const candNorm = Math.max(1, forwards.length);
      const momentum = 0.9;
      for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
        const policyOutputGradient = forwards.reduce((sum, current, candidate) => sum + policyGradients[candidate] * current.hidden[hiddenIndex], 0) / candNorm;
        this.vwp[hiddenIndex] = momentum * this.vwp[hiddenIndex] + (1 - momentum) * policyOutputGradient;
        this.wp[hiddenIndex] = clamp(this.wp[hiddenIndex] * 0.99998 + rate * this.vwp[hiddenIndex], -4, 4);

        const valGrad = valueGradient * forwards[chosen].hidden[hiddenIndex];
        this.vwv[hiddenIndex] = momentum * this.vwv[hiddenIndex] + (1 - momentum) * valGrad;
        this.wv[hiddenIndex] = clamp(this.wv[hiddenIndex] * 0.99998 + rate * this.vwv[hiddenIndex], -4, 4);

        const b1Grad = b1Gradient[hiddenIndex] / candNorm;
        this.vb1[hiddenIndex] = momentum * this.vb1[hiddenIndex] + (1 - momentum) * b1Grad;
        this.b1[hiddenIndex] = clamp(this.b1[hiddenIndex] + rate * this.vb1[hiddenIndex], -3, 3);
      }
      const bpGrad = policyGradients.reduce((sum, value) => sum + value, 0) / candNorm;
      this.vbp = momentum * this.vbp + (1 - momentum) * bpGrad;
      this.bp = clamp(this.bp + rate * this.vbp, -3, 3);

      this.vbv = momentum * this.vbv + (1 - momentum) * valueGradient;
      this.bv = clamp(this.bv + rate * this.vbv, -3, 3);

      for (let index = 0; index < this.w1.length; index += 1) {
        const w1Grad = w1Gradient[index] / candNorm;
        this.vw1[index] = momentum * this.vw1[index] + (1 - momentum) * clamp(w1Grad, -2, 2);
        this.w1[index] = clamp(this.w1[index] * 0.999995 + rate * this.vw1[index], -2, 2);
      }
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
      policyVersion: this.policyVersion,
      type: "public-action-mlp-policy-value",
      baseKnowledgeSchema: GOAT_BASE_KNOWLEDGE_SCHEMA,
      baseKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      seed: this.seed,
      learningRate: this.learningRate,
      w1: [...this.w1], b1: [...this.b1], wp: [...this.wp], wv: [...this.wv], bp: this.bp, bv: this.bv,
      trainingState: { ...this.trainingState },
      ...(this.optimizerState ? { optimizerState: structuredClone(this.optimizerState) } : {}),
    };
  }
}

export function policyProbabilities(values, temperature = 1) {
  return softmax(values, temperature);
}

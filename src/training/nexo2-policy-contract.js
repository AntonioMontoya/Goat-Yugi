/**
 * Nexo 2 Policy Gradient Contract
 * Implementation of the coherent on-policy residual policy gradient algorithm
 * as specified in docs/PLAN_RECUPERACION_NEXO2_2026-09-08.md (Phase 7).
 *
 * Mathematical Contract:
 *   A(s) = candidates that survived legality and safety guardrails (afterSafety)
 *   h(a) = heuristic score frozen during the batch
 *   prior(a) = clamp((h(a) - max(h)) / T, -8, 0)
 *   z(a) = prior(a) + alpha * rawNeuralLogit(a)
 *   p(a) = softmax_stable(z over A(s))
 *   T = 1.0, alpha = 1.0
 *
 * Value & Baseline:
 *   Q(s, a) = raw value head output for action a
 *   b(s) = sum_a p(a) * Q(s, a) (gradients DETACHED)
 *   Advantage A(s, c) = Return - b(s)
 *
 * Loss:
 *   L_actor = - log p(c) * (Return - b(s))
 *   L_critic = 0.5 * c_v * (Q(s, c) - Return)^2
 *   L_total = L_actor + L_critic
 */

export const NEXO2_POLICY_CONTRACT_VERSION = "nexo2-on-policy-v1";
export const NEXO2_POLICY_SCHEMA_V3 = 3;

export const DEFAULT_TEMPERATURE = 1.0;
export const DEFAULT_ALPHA = 1.0;
export const DEFAULT_PRIOR_MIN = -8.0;
export const DEFAULT_PRIOR_MAX = 0.0;
export const DEFAULT_CRITIC_WEIGHT = 1.0;

function clamp(value, min = -8, max = 0) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

/**
 * Computes the stable softmax over an array of scores.
 * Uses Float64 arithmetic for precision.
 */
export function stableSoftmax(scores = []) {
  if (!scores.length) return [];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(Math.max(-30, Math.min(0, s - max))));
  const sum = exps.reduce((acc, v) => acc + v, 0) || 1.0;
  return exps.map((v) => v / sum);
}

/**
 * Computes the residual policy distribution over candidates A(s).
 *
 * @param {Array<Object>} candidates - List of candidate actions in A(s). Each entry must have { plannedScore, nexo2Input }
 * @param {Object} network - Neural policy network with forward(input) returning { rawLogit, qValue, hidden }
 * @param {Object} options - Configuration options { temperature, alpha, priorMin, priorMax }
 * @returns {Object} { priors, logits, qValues, zs, probabilities, baseline, hScores, hMax, zMax }
 */
export function computeResidualPolicyDistribution(candidates = [], network = null, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      priors: [],
      logits: [],
      qValues: [],
      zs: [],
      probabilities: [],
      baseline: 0,
      hScores: [],
      hMax: 0,
      zMax: 0,
    };
  }

  const temperature = Math.max(0.1, Number(options.temperature ?? DEFAULT_TEMPERATURE));
  const alpha = Number(options.alpha ?? DEFAULT_ALPHA);
  const priorMin = Number(options.priorMin ?? DEFAULT_PRIOR_MIN);
  const priorMax = Number(options.priorMax ?? DEFAULT_PRIOR_MAX);

  const hScores = candidates.map((c) => Number(c.plannedScore ?? c.score ?? 0));
  const hMax = Math.max(...hScores);

  const priors = hScores.map((h) => clamp((h - hMax) / temperature, priorMin, priorMax));

  const logits = [];
  const qValues = [];
  const hiddens = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (network && candidate.nexo2Input) {
      const fwd = network.forward(candidate.nexo2Input);
      logits.push(Number(fwd.rawLogit ?? fwd.logit ?? 0));
      qValues.push(Number(fwd.qValue ?? fwd.rawValue ?? fwd.value ?? 0));
      hiddens.push(fwd.hidden);
    } else {
      logits.push(0);
      qValues.push(0);
      hiddens.push(null);
    }
  }

  const zs = priors.map((p, i) => p + alpha * logits[i]);
  const zMax = Math.max(...zs);
  const probabilities = stableSoftmax(zs);

  // Detached baseline: b(s) = sum_a p(a) * Q(s, a)
  const baseline = probabilities.reduce((acc, p, i) => acc + p * qValues[i], 0);

  return {
    priors,
    logits,
    qValues,
    hiddens,
    zs,
    probabilities,
    baseline,
    hScores,
    hMax,
    zMax,
  };
}

/**
 * Selects an action according to the residual policy contract.
 * - In evaluation (training === false): argmax(z) with stable tie-breaking (first index).
 * - In training (training === true): categorical sampling from p(a).
 *
 * @param {Array<Object>} candidates - Candidate actions
 * @param {Object} distribution - Result from computeResidualPolicyDistribution
 * @param {Object} options - { training: boolean, prng: function }
 * @returns {Object} { chosenIndex, chosenCandidate, logp, sampled: boolean }
 */
export function selectResidualAction(candidates = [], distribution, { training = false, prng = Math.random } = {}) {
  if (!candidates.length || !distribution || !distribution.probabilities.length) {
    return { chosenIndex: -1, chosenCandidate: null, logp: 0, sampled: false };
  }

  const count = candidates.length;
  if (count === 1) {
    return { chosenIndex: 0, chosenCandidate: candidates[0], logp: 0, sampled: false };
  }

  if (!training) {
    // Stable argmax over z: if tie, pick lowest index
    let bestIndex = 0;
    let bestZ = distribution.zs[0];
    for (let i = 1; i < count; i += 1) {
      if (distribution.zs[i] > bestZ) {
        bestZ = distribution.zs[i];
        bestIndex = i;
      }
    }
    const logp = Math.log(Math.max(1e-12, distribution.probabilities[bestIndex]));
    return { chosenIndex: bestIndex, chosenCandidate: candidates[bestIndex], logp, sampled: false };
  }

  // Categorical sampling from probabilities
  let rand = typeof prng === "function" ? prng() : Math.random();
  let chosenIndex = count - 1;
  for (let i = 0; i < count; i += 1) {
    rand -= distribution.probabilities[i];
    if (rand <= 0) {
      chosenIndex = i;
      break;
    }
  }

  const logp = Math.log(Math.max(1e-12, distribution.probabilities[chosenIndex]));
  return { chosenIndex, chosenCandidate: candidates[chosenIndex], logp, sampled: true };
}

/**
 * Computes exact analytical gradients of the combined Actor-Critic loss
 * for a single decision step with frozen baseline.
 *
 * @param {Object} params
 * @param {Array<Array<number>>} params.inputs - Array of feature vectors for candidates [x_0, ..., x_{K-1}]
 * @param {Array<number>} params.heuristicScores - Heuristic scores [h_0, ..., h_{K-1}]
 * @param {number} params.chosenIndex - Index of chosen candidate c
 * @param {number} params.returnVal - Observed return R
 * @param {Object} params.weights - Network parameters { w1, b1, wp, bp, wv, bv, inputSize, hiddenSize }
 * @param {Object} params.options - { alpha, temperature, criticWeight }
 * @returns {Object} { gradients: { w1, b1, wp, bp, wv, bv }, loss: { total, actor, critic, advantage, baseline, logp } }
 */
export function computeDecisionGradients({
  inputs = [],
  heuristicScores = [],
  chosenIndex = 0,
  returnVal = 0,
  weights,
  options = {},
}) {
  const K = inputs.length;
  if (K <= 1 || chosenIndex < 0 || chosenIndex >= K) {
    return {
      gradients: null,
      loss: { total: 0, actor: 0, critic: 0, advantage: 0, baseline: 0, logp: 0 },
    };
  }

  const { w1, b1, wp, bp, wv, bv, inputSize, hiddenSize } = weights;
  const alpha = Number(options.alpha ?? DEFAULT_ALPHA);
  const temperature = Math.max(0.1, Number(options.temperature ?? DEFAULT_TEMPERATURE));
  const criticWeight = Number(options.criticWeight ?? DEFAULT_CRITIC_WEIGHT);
  const R = Number(returnVal);

  // 1. Forward pass for each candidate
  const hVecs = [];
  const logits = [];
  const Qs = [];

  for (let a = 0; a < K; a += 1) {
    const x = inputs[a];
    const ha = new Float64Array(hiddenSize);
    for (let i = 0; i < hiddenSize; i += 1) {
      let u = Number(b1[i]);
      const offset = i * inputSize;
      for (let j = 0; j < inputSize; j += 1) {
        u += Number(w1[offset + j]) * Number(x[j]);
      }
      ha[i] = Math.tanh(u);
    }
    hVecs.push(ha);

    let logit = Number(bp);
    let Q = Number(bv);
    for (let i = 0; i < hiddenSize; i += 1) {
      logit += Number(wp[i]) * ha[i];
      Q += Number(wv[i]) * ha[i];
    }
    logits.push(logit);
    Qs.push(Q);
  }

  // 2. Priors, logits, and stable softmax
  const maxH = Math.max(...heuristicScores);
  const priors = heuristicScores.map((h) => clamp((h - maxH) / temperature, DEFAULT_PRIOR_MIN, DEFAULT_PRIOR_MAX));
  const zs = logits.map((l, a) => priors[a] + alpha * l);
  const maxZ = Math.max(...zs);
  const exps = zs.map((z) => Math.exp(Math.max(-30, Math.min(0, z - maxZ))));
  const sumExp = exps.reduce((acc, v) => acc + v, 0) || 1.0;
  const probs = exps.map((e) => e / sumExp);

  // 3. Detached Baseline & Advantage
  const baseline = probs.reduce((acc, p, a) => acc + p * Qs[a], 0);
  const advantage = R - baseline;

  // 4. Losses
  const pChosen = Math.max(1e-15, probs[chosenIndex]);
  const logp = Math.log(pChosen);
  const actorLoss = -logp * advantage;
  const criticLoss = 0.5 * criticWeight * Math.pow(Qs[chosenIndex] - R, 2);
  const totalLoss = actorLoss + criticLoss;

  // 5. Analytical Gradients
  // delta_logit_a = d(actorLoss) / d(logit_a) = alpha * advantage * (p_a - 1(a == chosen))
  const deltaLogits = probs.map((p, a) => alpha * advantage * (p - (a === chosenIndex ? 1 : 0)));
  // delta_Q_chosen = d(criticLoss) / d(Q_chosen) = criticWeight * (Q_chosen - R)
  const deltaQChosen = criticWeight * (Qs[chosenIndex] - R);

  // Parameter gradients:
  // grad_bp = sum_a delta_logits[a] = 0 (exact)
  const gradBp = deltaLogits.reduce((acc, d) => acc + d, 0);
  const gradBv = deltaQChosen;

  const gradWp = new Float64Array(hiddenSize);
  const gradWv = new Float64Array(hiddenSize);
  for (let i = 0; i < hiddenSize; i += 1) {
    let swp = 0;
    for (let a = 0; a < K; a += 1) {
      swp += deltaLogits[a] * hVecs[a][i];
    }
    gradWp[i] = swp;
    gradWv[i] = deltaQChosen * hVecs[chosenIndex][i];
  }

  const gradB1 = new Float64Array(hiddenSize);
  const gradW1 = new Float64Array(hiddenSize * inputSize);

  for (let a = 0; a < K; a += 1) {
    const x = inputs[a];
    const ha = hVecs[a];
    const isChosen = a === chosenIndex;

    for (let i = 0; i < hiddenSize; i += 1) {
      let dh = deltaLogits[a] * Number(wp[i]);
      if (isChosen) {
        dh += deltaQChosen * Number(wv[i]);
      }
      const du = dh * (1.0 - ha[i] * ha[i]);
      gradB1[i] += du;

      const offset = i * inputSize;
      for (let j = 0; j < inputSize; j += 1) {
        gradW1[offset + j] += du * Number(x[j]);
      }
    }
  }

  return {
    gradients: {
      w1: gradW1,
      b1: gradB1,
      wp: gradWp,
      bp: gradBp,
      wv: gradWv,
      bv: gradBv,
    },
    loss: {
      total: totalLoss,
      actor: actorLoss,
      critic: criticLoss,
      advantage,
      baseline,
      logp,
      qChosen: Qs[chosenIndex],
      pChosen,
    },
  };
}

/**
 * Accumulates analytical gradients across a batch of games.
 * Enforces policy version matching and consistent batch gradient reduction (dividing by N).
 *
 * @param {Object} params
 * @param {Array<Object>} params.batchDecisions - All decisions collected from the batch
 * @param {Object} params.network - Policy network with current weights
 * @param {number|string} params.currentPolicyVersion - Current frozen policy version
 * @param {Object} params.options - { alpha, criticWeight }
 * @returns {Object} { count, meanGradients, norm, stats, rejectedCount }
 */
export function accumulateBatchGradients({
  batchDecisions = [],
  network,
  currentPolicyVersion,
  options = {},
}) {
  const { w1, b1, wp, bp, wv, bv, inputSize, hiddenSize } = network;
  const weights = { w1, b1, wp, bp, wv, bv, inputSize, hiddenSize };

  const sumW1 = new Float64Array(w1.length);
  const sumB1 = new Float64Array(b1.length);
  const sumWp = new Float64Array(wp.length);
  let sumBp = 0;
  const sumWv = new Float64Array(wv.length);
  let sumBv = 0;

  let totalLoss = 0;
  let totalActorLoss = 0;
  let totalCriticLoss = 0;
  let totalAdvantage = 0;

  let validCount = 0;
  let rejectedCount = 0;

  for (const decision of batchDecisions) {
    if (!decision || decision.forced || !Array.isArray(decision.inputs) || decision.inputs.length <= 1) {
      continue;
    }

    // Strict policyVersion check: reject mismatched episodes
    if (decision.policyVersion !== currentPolicyVersion) {
      rejectedCount += 1;
      continue;
    }

    const { gradients, loss } = computeDecisionGradients({
      inputs: decision.inputs,
      heuristicScores: decision.heuristicScores,
      chosenIndex: decision.chosenIndex,
      returnVal: decision.returnVal ?? decision.reward ?? 0,
      weights,
      options,
    });

    if (!gradients) continue;

    for (let i = 0; i < sumW1.length; i += 1) sumW1[i] += gradients.w1[i];
    for (let i = 0; i < sumB1.length; i += 1) sumB1[i] += gradients.b1[i];
    for (let i = 0; i < sumWp.length; i += 1) sumWp[i] += gradients.wp[i];
    sumBp += gradients.bp;
    for (let i = 0; i < sumWv.length; i += 1) sumWv[i] += gradients.wv[i];
    sumBv += gradients.bv;

    totalLoss += loss.total;
    totalActorLoss += loss.actor;
    totalCriticLoss += loss.critic;
    totalAdvantage += Math.abs(loss.advantage);
    validCount += 1;
  }

  if (validCount === 0) {
    return {
      count: 0,
      rejectedCount,
      meanGradients: null,
      norm: 0,
      stats: { loss: 0, actorLoss: 0, criticLoss: 0, meanAdvantage: 0 },
    };
  }

  // Consistent reduction: divide all gradients by validCount N
  const invN = 1.0 / validCount;
  const meanW1 = new Float32Array(sumW1.length);
  const meanB1 = new Float32Array(sumB1.length);
  const meanWp = new Float32Array(sumWp.length);
  const meanWv = new Float32Array(sumWv.length);

  let normSq = 0;
  for (let i = 0; i < sumW1.length; i += 1) {
    meanW1[i] = sumW1[i] * invN;
    normSq += meanW1[i] * meanW1[i];
  }
  for (let i = 0; i < sumB1.length; i += 1) {
    meanB1[i] = sumB1[i] * invN;
    normSq += meanB1[i] * meanB1[i];
  }
  for (let i = 0; i < sumWp.length; i += 1) {
    meanWp[i] = sumWp[i] * invN;
    normSq += meanWp[i] * meanWp[i];
  }
  for (let i = 0; i < sumWv.length; i += 1) {
    meanWv[i] = sumWv[i] * invN;
    normSq += meanWv[i] * meanWv[i];
  }
  const meanBp = sumBp * invN;
  const meanBv = sumBv * invN;
  normSq += meanBp * meanBp + meanBv * meanBv;

  const norm = Math.sqrt(normSq);
  if (!Number.isFinite(norm)) {
    throw new Error(`Non-finite gradient norm detected in accumulateBatchGradients: ${norm}`);
  }

  return {
    count: validCount,
    rejectedCount,
    meanGradients: {
      w1: meanW1,
      b1: meanB1,
      wp: meanWp,
      bp: meanBp,
      wv: meanWv,
      bv: meanBv,
    },
    norm,
    stats: {
      loss: totalLoss * invN,
      actorLoss: totalActorLoss * invN,
      criticLoss: totalCriticLoss * invN,
      meanAdvantage: totalAdvantage * invN,
    },
  };
}

/**
 * Creates a clean optimizer state (Adam).
 */
export function createOptimizerState(network, { type = "adam", beta1 = 0.9, beta2 = 0.999, eps = 1e-8 } = {}) {
  const { w1, b1, wp, wv } = network;
  return {
    type,
    step: 0,
    beta1,
    beta2,
    eps,
    m_w1: new Float32Array(w1.length),
    v_w1: new Float32Array(w1.length),
    m_b1: new Float32Array(b1.length),
    v_b1: new Float32Array(b1.length),
    m_wp: new Float32Array(wp.length),
    v_wp: new Float32Array(wp.length),
    m_bp: 0,
    v_bp: 0,
    m_wv: new Float32Array(wv.length),
    v_wv: new Float32Array(wv.length),
    m_bv: 0,
    v_bv: 0,
  };
}

/**
 * Applies a batch update using the optimizer state (Adam with gradient clipping).
 * Updates parameters in-place and increments optimizerState.step and network.policyVersion.
 */
export function applyBatchUpdate({
  network,
  meanGradients,
  optimizerState,
  learningRate = 0.004,
  weightDecay = 0.00001,
  maxGradNorm = 2.0,
}) {
  if (!meanGradients) return false;

  let normSq = 0;
  for (let i = 0; i < meanGradients.w1.length; i += 1) normSq += meanGradients.w1[i] ** 2;
  for (let i = 0; i < meanGradients.b1.length; i += 1) normSq += meanGradients.b1[i] ** 2;
  for (let i = 0; i < meanGradients.wp.length; i += 1) normSq += meanGradients.wp[i] ** 2;
  normSq += meanGradients.bp ** 2;
  for (let i = 0; i < meanGradients.wv.length; i += 1) normSq += meanGradients.wv[i] ** 2;
  normSq += meanGradients.bv ** 2;

  const totalNorm = Math.sqrt(normSq);
  const clipScale = totalNorm > maxGradNorm ? maxGradNorm / totalNorm : 1.0;

  optimizerState.step += 1;
  const t = optimizerState.step;
  const b1 = optimizerState.beta1;
  const b2 = optimizerState.beta2;
  const eps = optimizerState.eps;
  const lr = Number(learningRate);
  const wd = Number(weightDecay);

  const biasCorrection1 = 1.0 - Math.pow(b1, t);
  const biasCorrection2 = 1.0 - Math.pow(b2, t);
  const stepSize = (lr * Math.sqrt(biasCorrection2)) / biasCorrection1;

  function updateArray(param, grad, m, v) {
    for (let i = 0; i < param.length; i += 1) {
      const g = grad[i] * clipScale + wd * param[i];
      m[i] = b1 * m[i] + (1.0 - b1) * g;
      v[i] = b2 * v[i] + (1.0 - b2) * g * g;
      param[i] -= (stepSize * m[i]) / (Math.sqrt(v[i]) + eps);
    }
  }

  updateArray(network.w1, meanGradients.w1, optimizerState.m_w1, optimizerState.v_w1);
  updateArray(network.b1, meanGradients.b1, optimizerState.m_b1, optimizerState.v_b1);
  updateArray(network.wp, meanGradients.wp, optimizerState.m_wp, optimizerState.v_wp);
  updateArray(network.wv, meanGradients.wv, optimizerState.m_wv, optimizerState.v_wv);

  // Scalar bp
  {
    const g = meanGradients.bp * clipScale;
    optimizerState.m_bp = b1 * optimizerState.m_bp + (1.0 - b1) * g;
    optimizerState.v_bp = b2 * optimizerState.v_bp + (1.0 - b2) * g * g;
    network.bp -= (stepSize * optimizerState.m_bp) / (Math.sqrt(optimizerState.v_bp) + eps);
  }

  // Scalar bv
  {
    const g = meanGradients.bv * clipScale;
    optimizerState.m_bv = b1 * optimizerState.m_bv + (1.0 - b1) * g;
    optimizerState.v_bv = b2 * optimizerState.v_bv + (1.0 - b2) * g * g;
    network.bv -= (stepSize * optimizerState.m_bv) / (Math.sqrt(optimizerState.v_bv) + eps);
  }

  network.policyVersion = (network.policyVersion ?? 1) + 1;
  network.trainingState.updates = (network.trainingState.updates ?? 0) + 1;

  return true;
}

/**
 * Creates a fully reproducible checkpoint containing model weights,
 * optimizer buffers, PRNG state, and metadata.
 */
export function createPolicyCheckpoint({ network, optimizerState = null, prngState = null, metadata = {} }) {
  return {
    schema: NEXO2_POLICY_SCHEMA_V3,
    algorithm: NEXO2_POLICY_CONTRACT_VERSION,
    policyVersion: network.policyVersion ?? 1,
    inputSize: network.inputSize,
    hiddenSize: network.hiddenSize,
    seed: network.seed,
    learningRate: network.learningRate,
    w1: Array.from(network.w1),
    b1: Array.from(network.b1),
    wp: Array.from(network.wp),
    wv: Array.from(network.wv),
    bp: Number(network.bp),
    bv: Number(network.bv),
    optimizerState: optimizerState
      ? {
          type: optimizerState.type,
          step: optimizerState.step,
          beta1: optimizerState.beta1,
          beta2: optimizerState.beta2,
          eps: optimizerState.eps,
          m_w1: Array.from(optimizerState.m_w1),
          v_w1: Array.from(optimizerState.v_w1),
          m_b1: Array.from(optimizerState.m_b1),
          v_b1: Array.from(optimizerState.v_b1),
          m_wp: Array.from(optimizerState.m_wp),
          v_wp: Array.from(optimizerState.v_wp),
          m_bp: optimizerState.m_bp,
          v_bp: optimizerState.v_bp,
          m_wv: Array.from(optimizerState.m_wv),
          v_wv: Array.from(optimizerState.v_wv),
          m_bv: optimizerState.m_bv,
          v_bv: optimizerState.v_bv,
        }
      : null,
    prngState: prngState !== null ? Number(prngState) : null,
    trainingState: { ...network.trainingState },
    metadata: { ...metadata, timestamp: new Date().toISOString() },
  };
}

/**
 * Restores network parameters and optimizer state from a checkpoint.
 * Throws explicit errors on incompatible dimensions or missing keys.
 */
export function restorePolicyCheckpoint({ network, checkpoint }) {
  if (!checkpoint || typeof checkpoint !== "object") {
    throw new Error("Invalid checkpoint object provided to restorePolicyCheckpoint.");
  }

  if (Number(checkpoint.schema) !== NEXO2_POLICY_SCHEMA_V3 && Number(checkpoint.schema) !== 2) {
    throw new Error(`Incompatible checkpoint schema: expected 2 or 3, got ${checkpoint.schema}`);
  }

  if (Number(checkpoint.inputSize) !== network.inputSize || Number(checkpoint.hiddenSize) !== network.hiddenSize) {
    throw new Error(
      `Incompatible network dimensions in checkpoint: expected [${network.inputSize}, ${network.hiddenSize}], got [${checkpoint.inputSize}, ${checkpoint.hiddenSize}]`
    );
  }

  network.w1.set(checkpoint.w1);
  network.b1.set(checkpoint.b1);
  network.wp.set(checkpoint.wp);
  network.wv.set(checkpoint.wv);
  network.bp = Number(checkpoint.bp ?? 0);
  network.bv = Number(checkpoint.bv ?? 0);
  network.policyVersion = Number(checkpoint.policyVersion ?? 1);

  if (checkpoint.trainingState) {
    network.trainingState = { ...checkpoint.trainingState };
  }

  let restoredOptimizer = null;
  if (checkpoint.optimizerState) {
    restoredOptimizer = {
      type: checkpoint.optimizerState.type,
      step: Number(checkpoint.optimizerState.step ?? 0),
      beta1: Number(checkpoint.optimizerState.beta1 ?? 0.9),
      beta2: Number(checkpoint.optimizerState.beta2 ?? 0.999),
      eps: Number(checkpoint.optimizerState.eps ?? 1e-8),
      m_w1: new Float32Array(checkpoint.optimizerState.m_w1),
      v_w1: new Float32Array(checkpoint.optimizerState.v_w1),
      m_b1: new Float32Array(checkpoint.optimizerState.m_b1),
      v_b1: new Float32Array(checkpoint.optimizerState.v_b1),
      m_wp: new Float32Array(checkpoint.optimizerState.m_wp),
      v_wp: new Float32Array(checkpoint.optimizerState.v_wp),
      m_bp: Number(checkpoint.optimizerState.m_bp ?? 0),
      v_bp: Number(checkpoint.optimizerState.v_bp ?? 0),
      m_wv: new Float32Array(checkpoint.optimizerState.m_wv),
      v_wv: new Float32Array(checkpoint.optimizerState.v_wv),
      m_bv: Number(checkpoint.optimizerState.m_bv ?? 0),
      v_bv: Number(checkpoint.optimizerState.v_bv ?? 0),
    };
  }

  return {
    restoredOptimizer,
    prngState: checkpoint.prngState ?? null,
  };
}

import { confidenceInterval95 } from "../analytics/statistics.js";

export const BOT_INTELLIGENCE_TIERS = Object.freeze([
  Object.freeze({ score: 0, label: "Sin certificar", minimumTrainingGames: 0, gamesPerGate: 0, requiredWinRate: 0, requiredConfidenceLow: 0, requiredDominance: 0, minimumReasoningSamples: 0, requiredReasoningScore: 0 }),
  Object.freeze({ score: 100, label: "Aprendiz", minimumTrainingGames: 100, gamesPerGate: 50, requiredWinRate: 0.52, requiredConfidenceLow: 0.38, requiredDominance: 0.02, minimumReasoningSamples: 8, requiredReasoningScore: 0.80 }),
  Object.freeze({ score: 200, label: "Competente", minimumTrainingGames: 500, gamesPerGate: 100, requiredWinRate: 0.55, requiredConfidenceLow: 0.46, requiredDominance: 0.08, minimumReasoningSamples: 12, requiredReasoningScore: 0.86 }),
  Object.freeze({ score: 500, label: "Avanzado", minimumTrainingGames: 2_000, gamesPerGate: 200, requiredWinRate: 0.60, requiredConfidenceLow: 0.53, requiredDominance: 0.15, minimumReasoningSamples: 18, requiredReasoningScore: 0.92 }),
  Object.freeze({ score: 1_000, label: "Maestro", minimumTrainingGames: 10_000, gamesPerGate: 400, requiredWinRate: 0.65, requiredConfidenceLow: 0.59, requiredDominance: 0.25, minimumReasoningSamples: 24, requiredReasoningScore: 0.96 }),
  Object.freeze({ score: 2_000, label: "Campeon", minimumTrainingGames: 25_000, gamesPerGate: 600, requiredWinRate: 0.68, requiredConfidenceLow: 0.62, requiredDominance: 0.30, minimumReasoningSamples: 28, requiredReasoningScore: 0.98 }),
]);

export function intelligenceTier(score = 0) {
  const value = Math.max(0, Number(score) || 0);
  let selected = BOT_INTELLIGENCE_TIERS[0];
  for (const tier of BOT_INTELLIGENCE_TIERS) if (value >= tier.score) selected = tier;
  return selected;
}

export function exactIntelligenceTier(score) {
  return BOT_INTELLIGENCE_TIERS.find((tier) => tier.score === Number(score)) ?? null;
}

export function predecessorIntelligenceScores(targetScore) {
  const target = exactIntelligenceTier(targetScore);
  if (!target || target.score === 0) return [];
  const lower = BOT_INTELLIGENCE_TIERS.filter((tier) => tier.score > 0 && tier.score < target.score).map((tier) => tier.score).reverse();
  return lower.length ? lower : [0];
}

export function nextIntelligenceTier(score = 0) {
  const current = intelligenceTier(score);
  return BOT_INTELLIGENCE_TIERS.find((tier) => tier.score > current.score) ?? null;
}

export function hasReasoningCertification(certificate) {
  return certificate?.schema >= 2
    && certificate?.certified === true
    && certificate?.baseBenchmark?.passed === true
    && certificate?.reasoningAudit?.passed === true
    && Number(certificate?.reasoningAudit?.samples) >= Number(certificate?.requirements?.minimumReasoningSamples ?? 1)
    && Number(certificate?.reasoningAudit?.score) >= Number(certificate?.requirements?.requiredReasoningScore ?? 1);
}

function normalizeGate(gate = {}) {
  const games = Math.max(0, Number(gate.games) || 0);
  const wins = Math.max(0, Number(gate.wins) || 0);
  const losses = Math.max(0, Number(gate.losses) || 0);
  const draws = Math.max(0, Number(gate.draws) || Math.max(0, games - wins - losses));
  return {
    ...gate,
    opponentIntelligence: Math.max(0, Number(gate.opponentIntelligence) || 0),
    games,
    wins,
    losses,
    draws,
    invalid: Math.max(0, Number(gate.invalid) || 0),
    winRate: games ? wins / games : 0,
    dominance: games ? (wins - losses) / games : 0,
    confidence95: gate.confidence95 ?? confidenceInterval95(wins, games),
  };
}

/**
 * Certifies a discrete difficulty tier from repeatable evidence. A tier never
 * follows from MMR alone: every prior tier must be beaten with a minimum
 * sample, clean engine outcomes, win rate, dominance and confidence floor.
 */
export function evaluateIntelligenceCertification({
  targetIntelligence,
  trainingGames = 0,
  trainingInvalid = 0,
  gates = [],
  reasoningAudit = null,
  baseBenchmark = null,
  requirements = {},
} = {}) {
  const tier = exactIntelligenceTier(targetIntelligence);
  if (!tier || tier.score === 0) throw new Error(`Nivel de inteligencia no soportado: ${targetIntelligence}`);
  const rule = { ...tier, ...requirements };
  const requiredOpponents = predecessorIntelligenceScores(tier.score);
  const normalizedGates = gates.map(normalizeGate);
  const gateResults = requiredOpponents.map((opponentIntelligence) => {
    const gate = normalizedGates.find((entry) => entry.opponentIntelligence === opponentIntelligence) ?? normalizeGate({ opponentIntelligence });
    const enoughGames = gate.games >= rule.gamesPerGate;
    const clean = gate.invalid === 0;
    const winRatePassed = gate.winRate >= rule.requiredWinRate;
    const confidencePassed = Number(gate.confidence95?.low ?? 0) >= rule.requiredConfidenceLow;
    const dominancePassed = gate.dominance >= rule.requiredDominance;
    return { ...gate, enoughGames, clean, winRatePassed, confidencePassed, dominancePassed, passed: enoughGames && clean && winRatePassed && confidencePassed && dominancePassed };
  });
  const enoughTraining = Number(trainingGames) >= rule.minimumTrainingGames;
  const cleanTraining = Number(trainingInvalid) === 0;
  const normalizedReasoning = {
    ...(reasoningAudit ?? {}),
    samples: Math.max(0, Number(reasoningAudit?.samples) || 0),
    score: Math.max(0, Math.min(1, Number(reasoningAudit?.score) || 0)),
  };
  normalizedReasoning.enoughSamples = normalizedReasoning.samples >= rule.minimumReasoningSamples;
  normalizedReasoning.scorePassed = normalizedReasoning.score >= rule.requiredReasoningScore;
  normalizedReasoning.passed = normalizedReasoning.enoughSamples && normalizedReasoning.scorePassed && reasoningAudit?.passed !== false;
  const normalizedBaseBenchmark = baseBenchmark ? structuredClone(baseBenchmark) : { passed: false, reason: "MISSING_BASE_BENCHMARK" };
  const certified = enoughTraining && cleanTraining && normalizedReasoning.passed && normalizedBaseBenchmark.passed === true && gateResults.length > 0 && gateResults.every((gate) => gate.passed);
  const reason = !enoughTraining
    ? "INSUFFICIENT_TRAINING_GAMES"
    : !cleanTraining
      ? "INVALID_TRAINING_OUTCOME"
      : !normalizedReasoning.enoughSamples
        ? "INSUFFICIENT_REASONING_SAMPLES"
        : !normalizedReasoning.scorePassed || reasoningAudit?.passed === false
          ? "REASONING_SCORE_TOO_LOW"
          : normalizedBaseBenchmark.passed !== true
            ? "BASE_IA500_BENCHMARK_FAILED"
      : gateResults.some((gate) => !gate.enoughGames)
        ? "INSUFFICIENT_GATE_GAMES"
        : gateResults.some((gate) => !gate.clean)
          ? "INVALID_GATE_OUTCOME"
          : gateResults.some((gate) => !gate.winRatePassed)
            ? "WIN_RATE_TOO_LOW"
            : gateResults.some((gate) => !gate.confidencePassed)
              ? "CONFIDENCE_TOO_LOW"
              : gateResults.some((gate) => !gate.dominancePassed)
                ? "DOMINANCE_TOO_LOW"
                : "CERTIFIED";
  return {
    schema: 2,
    targetIntelligence: tier.score,
    label: tier.label,
    certified,
    reason,
    trainingGames: Math.max(0, Number(trainingGames) || 0),
    trainingInvalid: Math.max(0, Number(trainingInvalid) || 0),
    requirements: {
      minimumTrainingGames: rule.minimumTrainingGames,
      gamesPerGate: rule.gamesPerGate,
      requiredWinRate: rule.requiredWinRate,
      requiredConfidenceLow: rule.requiredConfidenceLow,
      requiredDominance: rule.requiredDominance,
      minimumReasoningSamples: rule.minimumReasoningSamples,
      requiredReasoningScore: rule.requiredReasoningScore,
      predecessorIntelligence: requiredOpponents,
    },
    reasoningAudit: normalizedReasoning,
    baseBenchmark: normalizedBaseBenchmark,
    gates: gateResults,
  };
}

import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "../engine/constants.js";
import { hashString } from "../engine/rng.js";

export const MODEL_STATUS = Object.freeze({
  UNTRAINED: "Sin entrenar",
  BEGINNER: "Principiante",
  TRAINING: "En entrenamiento",
  CANDIDATE: "Candidato",
  VALIDATED: "Validado",
  DEGRADED: "Degradado",
  OBSOLETE: "Obsoleto",
  INCOMPATIBLE: "Incompatible"
});

function now() {
  return new Date().toISOString();
}

export function modelConfigHash(config) {
  return hashString(JSON.stringify(config ?? {}));
}

export function createModelManifest({
  bot,
  deckId,
  trainingPlan = {},
  trainingStats = {},
  evaluation = {},
  state = MODEL_STATUS.CANDIDATE,
  parentModelId = null,
  createdAt = now()
} = {}) {
  if (!bot?.id) throw new Error("createModelManifest necesita bot.id.");
  const compatibility = { engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION, cardDatabaseVersion: CARD_DATABASE_VERSION };
  const learnedParameters = bot.featureWeights ?? bot.parameters ?? null;
  const config = {
    deckId,
    trainingPlan,
    bot: {
      algorithm: bot.algorithm,
      weights: bot.weights,
      featureWeights: learnedParameters,
      valueByFamily: bot.valueByFamily,
      strategyWeight: bot.strategyWeight,
      strategyBiases: bot.strategyBiases,
      strategy: bot.strategy,
      strategyCompatibility: bot.strategyCompatibility,
      learningRate: bot.learningRate,
      temperature: bot.temperature,
    }
  };
  const manifest = {
    schema: 1,
    id: `${bot.id}-v${bot.version ?? 1}`,
    botId: bot.id,
    name: bot.name,
    algorithm: bot.algorithm,
    version: bot.version ?? 1,
    profileId: `${bot.botId ?? bot.id}:${deckId}`,
    botDeckProfile: {
      botId: bot.botId ?? bot.id,
      deckId,
      profile: bot.profile ?? deckId,
      version: bot.version ?? 1,
      state: bot.state ?? state,
      games: trainingStats.games ?? 0,
      rating: trainingStats.rating ?? null,
      intelligence: bot.intelligence ?? 0,
      targetIntelligence: bot.targetIntelligence ?? 100,
      matchups: structuredClone(trainingStats.byOpponent ?? {}),
    },
    state,
    deckId,
    trainingPlan: structuredClone(trainingPlan),
    training: {
      games: trainingStats.games ?? 0,
      decisions: trainingStats.decisions ?? 0,
      winRate: trainingStats.winRate ?? 0,
      invalid: trainingStats.invalid ?? 0
    },
    evaluation: {
      games: evaluation.games ?? 0,
      winRate: evaluation.winRate ?? 0,
      invalid: evaluation.invalid ?? 0,
      confidence95: evaluation.confidence95 ?? null
    },
    intelligence: bot.intelligence ?? 0,
    targetIntelligence: bot.targetIntelligence ?? 100,
    certification: structuredClone(bot.certification ?? null),
    model: learnedParameters ? {
      featureWeights: structuredClone(learnedParameters),
      valueByFamily: structuredClone(bot.valueByFamily ?? {}),
      actionStats: structuredClone(bot.actionStats ?? {}),
      strategyWeight: bot.strategyWeight ?? 1.25,
      strategyBiases: structuredClone(bot.strategyBiases ?? {}),
      strategy: structuredClone(bot.strategy ?? null),
      strategyCompatibility: structuredClone(bot.strategyCompatibility ?? null),
    } : null,
    compatibility,
    configHash: modelConfigHash(config),
    parentModelId,
    createdAt,
    updatedAt: createdAt
  };
  manifest.hash = modelConfigHash(manifest);
  return manifest;
}

export function verifyModelManifest(manifest, current = {}) {
  const expected = {
    engineVersion: current.engineVersion ?? ENGINE_VERSION,
    formatVersion: current.formatVersion ?? FORMAT_VERSION,
    cardDatabaseVersion: current.cardDatabaseVersion ?? CARD_DATABASE_VERSION
  };
  const errors = [];
  if (!manifest || manifest.schema !== 1) errors.push("schema de modelo no soportado");
  for (const key of Object.keys(expected)) if (manifest?.compatibility?.[key] !== expected[key]) errors.push(`${key}: ${manifest?.compatibility?.[key] ?? "missing"} != ${expected[key]}`);
  if (!manifest?.botId || !manifest?.algorithm || !manifest?.configHash) errors.push("faltan campos de identidad del modelo");
  return { compatible: errors.length === 0, errors, expected };
}

export function markModel(manifest, state, evaluation = null) {
  const next = structuredClone(manifest);
  next.state = state;
  next.updatedAt = now();
  if (evaluation) next.evaluation = { ...next.evaluation, ...evaluation };
  next.hash = modelConfigHash(next);
  return next;
}

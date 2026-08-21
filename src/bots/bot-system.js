import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "../engine/constants.js";
import { hashString } from "../engine/rng.js";
import { CoreHeuristicBot, CoreRandomBot, hydrateCoreBot } from "./ocgcore.js";
import { LearnedPolicyBot } from "./learned-policy.js";
import { NEXO2_ALGORITHM, StrategicBot } from "./strategic.js";
import { parseSpecialistBotId, specialistSpec } from "./specialists.js";
import { NEXO2_ALL_DECK_IDS, NEXO2_ALL_OPPONENT_DECK_IDS, NEXO2_BOT_ID, NEXO2_DECK_IDS, NEXO2_OPPONENT_DECK_IDS, isNexo2Deck, isNexo2OpponentDeck, isNexo2MatchupAllowed } from "./nexo2-contract.js";
import NEXO_PATCH_V1 from "../../artifacts/nexo-patch-v1/candidate.json" with { type: "json" };
// Universal candidate trained across the complete 113-deck catalog.  It is
// intentionally published as a candidate until the OCGCore validity gate is
// clean; the previous pilot remains in artifacts for rollback/evidence.
import NEXO2_MODEL from "../../artifacts/nexo2-universal-v1/candidate.json" with { type: "json" };

export { NEXO2_ALL_DECK_IDS, NEXO2_ALL_OPPONENT_DECK_IDS, NEXO2_BOT_ID, NEXO2_DECK_IDS, NEXO2_OPPONENT_DECK_IDS, isNexo2Deck, isNexo2OpponentDeck, isNexo2MatchupAllowed } from "./nexo2-contract.js";

export const BOT_PROFILE_SCHEMA = 1;
export const UNIVERSAL_BOT_ID = "universal-base";
export const NEXO_CANDIDATE_BOT_ID = "nexo-patch-candidate";
export const RETIRED_BOT_IDS = Object.freeze(["jar-keeper", "astra-goat", "iron-chaos", "rookie-flip", "ember-burn", "recruiter", "terra", "echo-warrior", "gatekeeper", "sentinel-chaos", "maestro-chaos", "mirror"]);

export const BOT_STATES = Object.freeze({
  UNTRAINED: "Sin entrenar",
  BEGINNER: "Principiante",
  TRAINING: "En entrenamiento",
  COMPETENT: "Competente",
  ADVANCED: "Avanzado",
  CANDIDATE: "Candidato",
  VALIDATED: "Validado",
  DEGRADED: "Degradado",
  OBSOLETE: "Obsoleto",
  INCOMPATIBLE: "Incompatible",
});

export const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ label: "Fácil", brave: false, weights: Object.freeze({ activate: -4, summon: -2, battle: -3 }) }),
  normal: Object.freeze({ label: "Normal", brave: true, weights: Object.freeze({ activate: 0, summon: 0, battle: 0 }) }),
  hard: Object.freeze({ label: "Difícil", brave: true, weights: Object.freeze({ activate: 2, summon: 2, battle: 3 }) }),
  expert: Object.freeze({ label: "Experto", brave: true, weights: Object.freeze({ activate: 4, summon: 3, battle: 5 }) }),
});

const COMPATIBILITY = Object.freeze({
  engineVersion: ENGINE_VERSION,
  formatVersion: FORMAT_VERSION,
  cardDatabaseVersion: CARD_DATABASE_VERSION,
});

const DEFAULT_BOTS = [
  { id: UNIVERSAL_BOT_ID, name: "Nexo", deckId: "goat-control", style: "IA universal adaptativa", difficulty: "expert", profile: "generic", algorithm: "ocgcore-public-strategic-v4", intelligence: 0, skillMmr: 0, rating: 1200, state: BOT_STATES.COMPETENT },
  { ...NEXO_PATCH_V1, id: NEXO_CANDIDATE_BOT_ID, botId: NEXO_CANDIDATE_BOT_ID, name: "Nexo candidato", deckId: "goat-control", profile: "generic", style: "Parche entrenado en evaluación", difficulty: "expert", intelligence: 0, skillMmr: 0, rating: 1200, state: BOT_STATES.CANDIDATE, training: false },
  {
    ...NEXO2_MODEL,
    id: NEXO2_BOT_ID,
    botId: NEXO2_BOT_ID,
    name: "Nexo 2 · Universal 113 mazos",
    deckId: NEXO2_ALL_DECK_IDS[0],
    profile: "generic",
    style: "Creencias públicas + política/valor",
    difficulty: "expert",
    intelligence: 0,
    skillMmr: 0,
    rating: 1200,
    state: BOT_STATES.CANDIDATE,
    pilotDeckIds: [...NEXO2_ALL_DECK_IDS],
    opponentDeckIds: [...NEXO2_ALL_OPPONENT_DECK_IDS],
    legacyPilotDeckIds: [...NEXO2_DECK_IDS],
    legacyOpponentDeckIds: [...NEXO2_OPPONENT_DECK_IDS],
    allDeckIds: [...NEXO2_ALL_DECK_IDS],
    allOpponentDeckIds: [...NEXO2_ALL_OPPONENT_DECK_IDS],
    curriculum: "universal-catalog",
    trainingGames: Number(NEXO2_MODEL?.pilot?.trainingGames) || 0,
    evaluationGames: Number(NEXO2_MODEL?.pilot?.evaluationGames) || 0,
    evaluationArtifact: "artifacts/nexo2-universal-v1-balanced",
    training: false,
  },
];

function clone(value) {
  return structuredClone(value);
}

function normalizeDifficulty(value) {
  return Object.prototype.hasOwnProperty.call(BOT_DIFFICULTIES, value) ? value : "normal";
}

function normalizeState(value) {
  return Object.values(BOT_STATES).includes(value) ? value : BOT_STATES.UNTRAINED;
}

function configHash(value) {
  return hashString(JSON.stringify(value ?? {}));
}

function compatibility() {
  return { ...COMPATIBILITY };
}

export function listBotSpecs() {
  return DEFAULT_BOTS.map(clone);
}

export function listActiveBotSpecs() {
  return DEFAULT_BOTS.map(clone);
}

export function botIdFromName(name = "bot") {
  const slug = String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "bot";
}

export function createBotIdentity({ id = null, name = "Bot", deckId = "goat-control", style = "Adaptativo", difficulty = "normal", intelligence = 0, targetIntelligence = 100, rating = 1200, state = BOT_STATES.UNTRAINED } = {}) {
  const resolvedName = String(name).trim() || "Bot";
  const resolvedId = botIdFromName(id ?? resolvedName);
  return {
    id: resolvedId,
    name: resolvedName,
    deckId,
    profile: deckId,
    style,
    difficulty: normalizeDifficulty(difficulty),
    intelligence: Math.max(0, Number(intelligence) || 0),
    targetIntelligence: Math.max(0, Number(targetIntelligence) || 100),
    rating: Math.max(0, Number(rating) || 1200),
    state: normalizeState(state),
    custom: true,
  };
}

export function getBotSpec(botId = UNIVERSAL_BOT_ID) {
  const specialist = parseSpecialistBotId(botId);
  if (specialist) return clone(specialistSpec(specialist.deckId, specialist.personaId));
  const found = DEFAULT_BOTS.find((bot) => bot.id === botId);
  return clone(found ?? DEFAULT_BOTS[0]);
}

export function botDescriptor(botOrSpec = {}) {
  const source = botOrSpec?.manifest && typeof botOrSpec.manifest === "function" ? botOrSpec.manifest() : botOrSpec;
  return {
    id: source.botId ?? source.id ?? "bot",
    name: source.name ?? "Bot",
    style: source.style ?? "Heurística",
    deckId: source.deckId ?? source.profile ?? null,
    profile: source.profile ?? source.deckId ?? "generic",
    difficulty: normalizeDifficulty(source.difficulty),
    difficultyLabel: BOT_DIFFICULTIES[normalizeDifficulty(source.difficulty)].label,
    algorithm: source.algorithm ?? "unknown",
    strategyId: source.strategy?.id ?? null,
    deckKnowledgeHash: source.strategy?.deckHash ?? null,
    strategyCompatibility: source.strategyCompatibility ? clone(source.strategyCompatibility) : null,
    strategyGoals: source.strategy?.goals ?? [],
    version: Number(source.version) || 1,
    state: normalizeState(source.state),
    intelligence: Math.max(0, Number(source.intelligence) || 0),
    targetIntelligence: Math.max(0, Number(source.targetIntelligence) || 0),
    skillMmr: Math.max(0, Number(source.skillMmr) || 0),
    technicalRating: Math.max(0, Number(source.technicalRating ?? source.rating) || 1200),
    certification: source.certification ? clone(source.certification) : null,
  };
}

export function createBotDeckProfile({
  botId,
  deckId,
  profile = deckId,
  version = 1,
  state = BOT_STATES.UNTRAINED,
  games = 0,
  wins = 0,
  losses = 0,
  draws = 0,
  rating = 1200,
  intelligence = 0,
  targetIntelligence = 100,
  uncertainty = 350,
  certification = null,
  matchups = {},
  errors = {},
  lastEvaluation = null,
  trainedAt = null,
  algorithm = "ocgcore-profiled-heuristic",
  weights = {},
} = {}) {
  if (!botId || !deckId) throw new Error("Un perfil bot–mazo necesita botId y deckId.");
  const deckProfile = {
    schema: BOT_PROFILE_SCHEMA,
    id: `${botId}:${deckId}`,
    botId,
    deckId,
    profile,
    version: Number(version) || 1,
    model: { algorithm, weights: clone(weights) },
    games: Math.max(0, Number(games) || 0),
    wins: Math.max(0, Number(wins) || 0),
    losses: Math.max(0, Number(losses) || 0),
    draws: Math.max(0, Number(draws) || 0),
    rating: Math.max(0, Number(rating) || 1200),
    technicalRating: Math.max(0, Number(rating) || 1200),
    uncertainty: Math.max(50, Number(uncertainty) || 350),
    intelligence: Math.max(0, Number(intelligence) || 0),
    targetIntelligence: Math.max(0, Number(targetIntelligence) || 100),
    certification: certification ? clone(certification) : null,
    matchups: clone(matchups),
    errors: clone(errors),
    lastEvaluation: lastEvaluation ? clone(lastEvaluation) : null,
    state: normalizeState(state),
    compatibility: compatibility(),
    trainedAt,
  };
  deckProfile.configHash = configHash({ botId, deckId, profile, version: deckProfile.version, model: deckProfile.model, compatibility: deckProfile.compatibility });
  return deckProfile;
}

export function createBotRegistry({ specs = listActiveBotSpecs(), profiles = [] } = {}) {
  const bots = specs.map((spec) => ({
    ...(DEFAULT_BOTS.find((candidate) => candidate.id === spec.id) ?? {}),
    ...clone(spec),
    difficulty: normalizeDifficulty(spec.difficulty),
    state: normalizeState(spec.state),
    profiles: {},
  }));
  const registry = { schema: BOT_PROFILE_SCHEMA, bots };
  for (const profile of profiles) {
    if (!profile?.botId || !profile?.deckId) continue;
    const bot = registry.bots.find((candidate) => candidate.id === profile.botId);
    if (bot) bot.profiles[profile.deckId] = clone(profile);
  }
  return registry;
}

export function upsertBotIdentity(registry, identity = {}) {
  const next = clone(registry ?? createBotRegistry());
  const normalized = createBotIdentity(identity);
  const index = next.bots.findIndex((bot) => bot.id === normalized.id);
  if (index === -1) next.bots.push({ ...normalized, profiles: {} });
  else next.bots[index] = { ...next.bots[index], ...normalized, profiles: next.bots[index].profiles ?? {} };
  return next;
}

export function listRegistryBotSpecs(registry) {
  return (registry?.bots ?? []).map((bot) => {
    const { profiles: _profiles, ...spec } = bot;
    return clone(spec);
  });
}

export function ensureBotDeckProfile(registry, { botId, deckId, ...options } = {}) {
  const next = clone(registry ?? createBotRegistry());
  const bot = next.bots.find((candidate) => candidate.id === botId);
  if (!bot) throw new Error(`Bot desconocido: ${botId}`);
  bot.profiles ??= {};
  bot.profiles[deckId] ??= createBotDeckProfile({ botId, deckId, profile: bot.profile ?? deckId, algorithm: bot.algorithm, ...options });
  return next;
}

export function recordBotGame(registry, { botId, deckId, opponentDeckId = "unknown", opponentRating = null, result = "draw", decisions = 0, terminationReason = "UNKNOWN" } = {}) {
  const seeded = ensureBotDeckProfile(registry, { botId, deckId });
  const next = clone(seeded);
  const profile = next.bots.find((bot) => bot.id === botId).profiles[deckId];
  const normalized = ["win", "loss", "draw"].includes(result) ? result : "draw";
  profile.games += 1;
  if (normalized === "win") profile.wins += 1;
  else if (normalized === "loss") profile.losses += 1;
  else profile.draws += 1;
  const matchup = profile.matchups[opponentDeckId] ??= { games: 0, wins: 0, losses: 0, draws: 0, decisions: 0, terminations: {} };
  matchup.games += 1;
  matchup.decisions += Math.max(0, Number(decisions) || 0);
  matchup.terminations[terminationReason] = (matchup.terminations[terminationReason] ?? 0) + 1;
  if (normalized === "win") matchup.wins += 1;
  else if (normalized === "loss") matchup.losses += 1;
  else matchup.draws += 1;
  if (terminationReason === "INVALID_ACTION") profile.errors.INVALID_ACTION = (profile.errors.INVALID_ACTION ?? 0) + 1;
  if (Number.isFinite(Number(opponentRating))) {
    const expected = 1 / (1 + 10 ** ((Number(opponentRating) - profile.technicalRating) / 400));
    const score = normalized === "win" ? 1 : normalized === "loss" ? 0 : 0.5;
    profile.technicalRating = Math.max(0, profile.technicalRating + Math.round(24 * (score - expected)));
    profile.rating = profile.technicalRating;
    profile.uncertainty = Math.max(50, Math.round(profile.uncertainty * (normalized === "draw" ? 0.985 : 0.96)));
  }
  if (profile.state === BOT_STATES.UNTRAINED) profile.state = BOT_STATES.BEGINNER;
  return next;
}

export function recordBotEvaluation(registry, { botId, deckId, evaluation = {}, minimumGames = 20 } = {}) {
  const seeded = ensureBotDeckProfile(registry, { botId, deckId });
  const next = clone(seeded);
  const profile = next.bots.find((bot) => bot.id === botId).profiles[deckId];
  const invalid = Number(evaluation.invalid) || 0;
  const games = Number(evaluation.games) || 0;
  profile.lastEvaluation = {
    games,
    winRate: Number(evaluation.winRate) || 0,
    invalid,
    confidence95: evaluation.confidence95 ? clone(evaluation.confidence95) : null,
    evaluatedAt: new Date().toISOString(),
  };
  profile.state = invalid > 0 ? BOT_STATES.DEGRADED : games < minimumGames ? BOT_STATES.CANDIDATE : BOT_STATES.VALIDATED;
  profile.trainedAt ??= new Date().toISOString();
  return next;
}

export function recordBotModel(registry, { botId, deckId, model = null } = {}) {
  if (!model?.algorithm) throw new Error("recordBotModel necesita el manifiesto del modelo.");
  const seeded = ensureBotDeckProfile(registry, { botId, deckId });
  const next = clone(seeded);
  const profile = next.bots.find((bot) => bot.id === botId).profiles[deckId];
  profile.model = clone(model);
  profile.version = Number(model.version) || profile.version;
  profile.intelligence = Math.max(profile.intelligence, Number(model.intelligence ?? model.botDeckProfile?.intelligence) || 0);
  profile.targetIntelligence = Math.max(profile.targetIntelligence, Number(model.targetIntelligence ?? model.certification?.targetIntelligence) || 0);
  profile.certification = model.certification ? clone(model.certification) : profile.certification;
  profile.state = normalizeState(model.state ?? BOT_STATES.CANDIDATE);
  profile.trainedAt = new Date().toISOString();
  profile.compatibility = compatibility();
  profile.configHash = configHash({ botId, deckId, model: profile.model, compatibility: profile.compatibility });
  return next;
}

export function recordBotCertification(registry, { botId, deckId, certificate } = {}) {
  if (!certificate?.targetIntelligence) throw new Error("recordBotCertification necesita un certificado de inteligencia.");
  const seeded = ensureBotDeckProfile(registry, { botId, deckId, targetIntelligence: certificate.targetIntelligence });
  const next = clone(seeded);
  const bot = next.bots.find((candidate) => candidate.id === botId);
  const profile = bot.profiles[deckId];
  profile.targetIntelligence = certificate.targetIntelligence;
  profile.certification = clone(certificate);
  if (certificate.certified) {
    profile.intelligence = Math.max(profile.intelligence, certificate.targetIntelligence);
    profile.state = BOT_STATES.VALIDATED;
    bot.intelligence = Math.max(Number(bot.intelligence) || 0, certificate.targetIntelligence);
    bot.state = BOT_STATES.VALIDATED;
  }
  return next;
}

export function botCompatibility(value, current = COMPATIBILITY) {
  const errors = [];
  for (const key of Object.keys(current)) if (value?.compatibility?.[key] !== current[key]) errors.push(`${key}: incompatible`);
  return { compatible: errors.length === 0, errors, expected: { ...current } };
}

export function createBotForDeck({ botId = UNIVERSAL_BOT_ID, deckId = null, deck = null, seed = 1, difficulty = null, manifest = null } = {}) {
  const parsedSpecialist = parseSpecialistBotId(botId);
  const source = manifest ? clone(manifest) : parsedSpecialist ? specialistSpec(parsedSpecialist.deckId, parsedSpecialist.personaId) : getBotSpec(botId);
  const resolvedDifficulty = normalizeDifficulty(difficulty ?? source.difficulty);
  const difficultyConfig = BOT_DIFFICULTIES[resolvedDifficulty];
  const resolvedDeckId = deckId ?? source.deckId ?? source.profile ?? "goat-control";
  const resolvedProfile = deckId && deckId !== source.deckId ? resolvedDeckId : source.profile ?? resolvedDeckId;
  if ((source.botId ?? source.id ?? botId) === NEXO2_BOT_ID || source.algorithm === NEXO2_ALGORITHM) {
    if (!isNexo2Deck(resolvedDeckId)) throw new Error(`Nexo 2 sólo puede pilotar uno de los ${NEXO2_ALL_DECK_IDS.length} mazos del catálogo universal.`);
  }
  if (["ocgcore-public-strategic-v3", "ocgcore-public-strategic-v4", NEXO2_ALGORITHM].includes(source.algorithm)) {
    return new StrategicBot({ ...source, id: source.id ?? botId, botId: source.botId ?? source.id ?? botId, deckId: resolvedDeckId, profile: resolvedProfile, deck, seed });
  }
  if (source.algorithm === "ocgcore-legal-random") {
    const random = new CoreRandomBot({ id: source.id ?? botId, botId: source.botId ?? source.id ?? botId, name: source.name ?? "Legal Random", seed, profile: resolvedProfile, deckId: resolvedDeckId, style: source.style ?? "Baseline legal", state: source.state ?? BOT_STATES.VALIDATED });
    random.botId = source.botId ?? source.id ?? botId;
    random.deckId = resolvedDeckId;
    random.style = source.style ?? "Baseline legal";
    return random;
  }
  if (source.algorithm === "ocgcore-monte-carlo-policy-gradient-v1") {
    const learned = new LearnedPolicyBot({
      ...source,
      id: source.id ?? botId,
      botId: source.botId ?? source.id ?? botId,
      profile: resolvedProfile,
      deckId: resolvedDeckId,
      deck,
      featureWeights: source.featureWeights ?? source.parameters ?? source.model?.featureWeights ?? {},
      valueByFamily: source.valueByFamily ?? source.model?.valueByFamily ?? {},
      actionStats: source.actionStats ?? source.model?.actionStats ?? {},
      strategyWeight: source.strategyWeight ?? source.model?.strategyWeight,
      strategyBiases: source.strategyBiases ?? source.model?.strategyBiases ?? {},
      strategy: source.strategy ?? source.model?.strategy ?? null,
      training: false,
      state: source.state ?? BOT_STATES.CANDIDATE,
    });
    if (learned.strategyCompatibility && !learned.strategyCompatibility.compatible) learned.state = BOT_STATES.INCOMPATIBLE;
    return learned;
  }
  const bot = new CoreHeuristicBot({
    id: source.id ?? botId,
    botId: source.botId ?? source.id ?? botId,
    name: source.name ?? "Bot",
    profile: resolvedProfile,
    deckId: resolvedDeckId,
    style: source.style ?? "Heurística",
    state: source.state ?? BOT_STATES.UNTRAINED,
    difficulty: resolvedDifficulty,
    brave: source.brave ?? difficultyConfig.brave,
    weights: { ...difficultyConfig.weights, ...(source.weights ?? {}) },
    deck,
    version: source.version ?? 1,
    learningRate: source.learningRate ?? 0.02,
    episodes: source.episodes ?? 0,
    outcomeSum: source.outcomeSum ?? 0,
    responseCounts: source.responseCounts ?? {},
  });
  return bot;
}

export function hydrateBot(manifest = {}) {
  if (manifest.algorithm === "ocgcore-legal-random") return createBotForDeck({ botId: manifest.botId ?? manifest.id, manifest, deckId: manifest.deckId, seed: manifest.seed ?? 1 });
  if (manifest.algorithm === "ocgcore-monte-carlo-policy-gradient-v1") return createBotForDeck({ botId: manifest.botId ?? manifest.id, manifest, deckId: manifest.deckId, seed: manifest.randomState ?? manifest.seed ?? 1 });
  if (["ocgcore-public-strategic-v3", "ocgcore-public-strategic-v4", NEXO2_ALGORITHM].includes(manifest.algorithm)) return createBotForDeck({ botId: manifest.botId ?? manifest.id ?? UNIVERSAL_BOT_ID, manifest, deckId: manifest.deckId, seed: manifest.randomState ?? manifest.seed ?? 1 });
  return hydrateCoreBot(manifest);
}

export { COMPATIBILITY as BOT_COMPATIBILITY };

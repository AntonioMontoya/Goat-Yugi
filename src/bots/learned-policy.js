import { OcgMessageType, SelectBattleCMDAction, SelectIdleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { chooseCoreBotResponse } from "../engine/ocgcore-backend.js";
import { getDeck } from "../decks/decks.js";
import { responseFamily } from "./ocgcore.js";
import { candidateResponses } from "./legal-candidates.js";
import { responseKey, stateKey } from "../training/masked-policy.js";
import { actionCardEntries, buildDeckKnowledge, deckKnowledgeCompatibility, deckSnapshot, scoreDeckStrategy, strategyObservationFeatures } from "./deck-strategy.js";
import { reasonAboutResponses, rememberResponse } from "./state-evaluator.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function bucket(value, size = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "na";
  return String(Math.max(0, Math.floor(numeric / size)));
}

function unitRandom(bot) {
  let x = bot.randomState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  bot.randomState = x >>> 0;
  return bot.randomState / 0xffffffff;
}

function softmax(scores, temperature = 1) {
  const safeTemperature = Math.max(0.1, Number(temperature) || 1);
  const max = Math.max(...scores);
  const values = scores.map((score) => Math.exp(clamp((score - max) / safeTemperature, -30, 30)));
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
}

function compactNumericMap(source = {}, epsilon = 1e-9) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => Number.isFinite(Number(value)) && Math.abs(Number(value)) >= epsilon));
}

function cardFeatures(card) {
  if (!card) return ["card:none"];
  const type = String(card.type ?? card.kind ?? card.subtype ?? "unknown").toLowerCase();
  const features = [`card:type:${type}`];
  if (card.attack !== undefined || card.atk !== undefined) features.push(`card:atk:${bucket(card.attack ?? card.atk, 300)}`);
  if (card.defense !== undefined || card.def !== undefined) features.push(`card:def:${bucket(card.defense ?? card.def, 300)}`);
  if (card.level !== undefined) features.push(`card:level:${bucket(card.level)}`);
  return features;
}

function registeredDeck(deckId) {
  try { getDeck(deckId); return true; } catch { return false; }
}

function actionRole(message, response) {
  if (message.type === OcgMessageType.SELECT_IDLECMD) {
    return response.action === SelectIdleCMDAction.SELECT_ACTIVATE ? "activate"
      : response.action === SelectIdleCMDAction.SELECT_SUMMON ? "summon"
        : response.action === SelectIdleCMDAction.SELECT_SPECIAL_SUMMON ? "special-summon"
        : response.action === SelectIdleCMDAction.SELECT_MONSTER_SET ? "monster-set"
            : response.action === SelectIdleCMDAction.SELECT_SPELL_SET ? "spell-set"
            : response.action === SelectIdleCMDAction.SELECT_POS_CHANGE ? "position-change"
              : response.action === SelectIdleCMDAction.SHUFFLE ? "shuffle"
              : response.action === SelectIdleCMDAction.TO_BP ? "battle-phase" : "end-phase";
  }
  if (message.type === OcgMessageType.SELECT_BATTLECMD) {
    return response.action === SelectBattleCMDAction.SELECT_CHAIN ? "chain"
      : response.action === SelectBattleCMDAction.SELECT_BATTLE ? "attack"
      : response.action === SelectBattleCMDAction.TO_M2 ? "main-two" : "end-phase";
  }
  if (message.type === OcgMessageType.SELECT_EFFECTYN || message.type === OcgMessageType.SELECT_YESNO) return response.yes ? "yes" : "no";
  if (message.type === OcgMessageType.SELECT_CHAIN) return response.index === null ? "pass-chain" : "chain";
  if (message.type === OcgMessageType.SELECT_POSITION) return `position:${response.position}`;
  if (message.type === OcgMessageType.SELECT_PLACE || message.type === OcgMessageType.SELECT_DISFIELD) return "place";
  if (message.type === OcgMessageType.SELECT_CARD || message.type === OcgMessageType.SELECT_TRIBUTE || message.type === OcgMessageType.SELECT_SUM) return "select-cards";
  if (message.type === OcgMessageType.SELECT_OPTION) return `option:${bucket(response.index)}`;
  if (message.type === OcgMessageType.ANNOUNCE_NUMBER) return `number:${response.value}`;
  return `response:${Number(response.type)}`;
}

function actionCards(message, response) {
  if (message.type === OcgMessageType.SELECT_IDLECMD) {
    const source = response.action === SelectIdleCMDAction.SELECT_ACTIVATE ? message.activates
      : response.action === SelectIdleCMDAction.SELECT_SUMMON ? message.summons
        : response.action === SelectIdleCMDAction.SELECT_SPECIAL_SUMMON ? message.special_summons
        : response.action === SelectIdleCMDAction.SELECT_MONSTER_SET ? message.monster_sets
            : response.action === SelectIdleCMDAction.SELECT_SPELL_SET ? message.spell_sets
            : response.action === SelectIdleCMDAction.SELECT_POS_CHANGE ? message.pos_changes : [];
    return source?.[Number(response.index)] ? [source[Number(response.index)]] : [];
  }
  if (message.type === OcgMessageType.SELECT_BATTLECMD) {
    const source = response.action === SelectBattleCMDAction.SELECT_CHAIN ? message.chains : message.attacks;
    return source?.[Number(response.index)] ? [source[Number(response.index)]] : [];
  }
  const indexes = response.indicies ?? (response.index === null || response.index === undefined ? [] : [response.index]);
  const source = message.selects ?? message.select_cards ?? [];
  const entries = indexes.map((index) => source[Number(index)]).filter(Boolean);
  if (!entries.length && (message.type === OcgMessageType.SELECT_EFFECTYN || message.type === OcgMessageType.SELECT_YESNO || message.type === OcgMessageType.ANNOUNCE_CARD) && message.code) entries.push({ code: message.code });
  if (message.type === OcgMessageType.ANNOUNCE_CARD && response.card) entries.push({ code: response.card });
  return entries;
}

function actionFeatures(message, response) {
  const family = responseFamily(message);
  const role = actionRole(message, response);
  const options = message.options?.length ?? message.selects?.length ?? message.activates?.length ?? message.summons?.length ?? message.special_summons?.length ?? message.monster_sets?.length ?? message.spell_sets?.length ?? message.chains?.length ?? message.attacks?.length ?? 0;
  const features = [
    `state:family:${family}`,
    `state:type:${Number(message.type)}`,
    `state:options:${bucket(options)}`,
    `state:min:${bucket(message.min)}`,
    `state:max:${bucket(message.max)}`,
    `state:forced:${message.forced ? 1 : 0}`,
    `action:role:${role}`,
    `action:type:${Number(response.type)}`,
    `interaction:${family}:${role}`,
  ];
  if (response.index !== null && response.index !== undefined) features.push(`action:index:${bucket(response.index)}`);
  if (response.position !== undefined) features.push(`action:position:${response.position}`);
  if (response.yes !== undefined) features.push(`action:yes:${response.yes ? 1 : 0}`);
  if (response.indicies?.length) features.push(`action:count:${bucket(response.indicies.length)}`);
  for (const card of actionCards(message, response)) features.push(...cardFeatures(card));
  return [...new Set(features)];
}

function expectedFeatures(candidates, probabilities, descriptors) {
  const expected = {};
  candidates.forEach((_, index) => {
    for (const feature of descriptors[index]) expected[feature] = (expected[feature] ?? 0) + probabilities[index];
  });
  return expected;
}

/**
 * A real local policy-gradient learner for the authoritative OCGCore bridge.
 * It only scores responses generated from the current legal message, so
 * exploration cannot invent an illegal command. Its compact linear features
 * generalise across thousands of otherwise different game states.
 */
export class LearnedPolicyBot {
  constructor({
    id = "learned-policy",
    botId = id,
    name = "Self-Play Learner",
    profile = "generic",
    deckId = profile,
    deck = null,
    style = "Aprendizaje por autojuego",
    state = "En entrenamiento",
    algorithm = "ocgcore-monte-carlo-policy-gradient-v1",
    version = 1,
    learningRate = 0.035,
    valueRate = 0.06,
    temperature = 0.85,
    exploration = 0.22,
    minimumExploration = 0.035,
    discount = 0.997,
    episodes = 0,
    decisions = 0,
    randomState = 1,
    featureWeights = {},
    parameters = {},
    valueByFamily = {},
    actionStats = {},
    strategyWeight = 1.25,
    strategyBiases = {},
    strategy = null,
    parentModelId = null,
    intelligence = 0,
    targetIntelligence = 100,
    technicalRating = 1200,
    certification = null,
    training = true,
  } = {}) {
    this.id = id;
    this.botId = botId;
    this.name = name;
    this.algorithm = algorithm;
    this.profile = profile;
    this.deckId = deckId;
    this.style = style;
    this.state = state;
    this.version = Number(version) || 1;
    this.learningRate = Number(learningRate) || 0.035;
    this.valueRate = Number(valueRate) || 0.06;
    this.temperature = Number(temperature) || 0.85;
    this.exploration = Number(exploration) || 0.22;
    this.minimumExploration = Number(minimumExploration) || 0.035;
    this.discount = Number(discount) || 0.997;
    this.episodes = Math.max(0, Number(episodes) || 0);
    this.decisions = Math.max(0, Number(decisions) || 0);
    this.randomState = Number(randomState) >>> 0 || 1;
    this.featureWeights = { ...featureWeights, ...parameters };
    this.valueByFamily = { ...valueByFamily };
    this.actionStats = structuredClone(actionStats);
    this.strategyWeight = Number(strategyWeight) || 1.25;
    const resolvedDeckId = deckId ?? profile;
    const strategyDeck = deck ?? (strategy?.deck
      && (!strategy.deck.id || strategy.deck.id === resolvedDeckId)
      && !registeredDeck(resolvedDeckId)
      ? strategy.deck
      : null);
    this.deckKnowledge = buildDeckKnowledge(resolvedDeckId, strategyDeck);
    this.strategyCompatibility = deckKnowledgeCompatibility(this.deckKnowledge, {
      ...(strategy?.deckId ? { deckId: strategy.deckId } : {}),
      ...(strategy?.deckHash ? { deckHash: strategy.deckHash } : {}),
      ...(strategy?.mainSize !== undefined ? { mainSize: strategy.mainSize } : {}),
      ...(strategy?.deck ? { resolved: true } : {}),
    });
    if (!this.strategyCompatibility.compatible) this.state = "Incompatible";
    this.strategyBiases = { ...(strategy?.biases ?? {}), ...strategyBiases };
    this.parentModelId = parentModelId;
    this.intelligence = Math.max(0, Number(intelligence) || 0);
    this.targetIntelligence = Math.max(0, Number(targetIntelligence) || 100);
    this.technicalRating = Math.max(0, Number(technicalRating) || 1200);
    this.certification = certification ? structuredClone(certification) : null;
    this.policyQualified = this.certification?.baseBenchmark?.policyQualified === true;
    this.fallbackOnly = ["Degradado", "Obsoleto", "Incompatible"].includes(this.state);
    this.training = training !== false;
    this.trajectory = [];
    this.reasoningMemory = { recent: [] };
  }

  next() { return unitRandom(this); }

  policyScore(features, baseline, expertScore = 0) {
    const learned = features.reduce((sum, feature) => sum + Number(this.featureWeights[feature] ?? 0), 0);
    return learned + (baseline ? 1.1 : 0) + Number(expertScore || 0) * this.strategyWeight;
  }

  chooseResponse(message, context = {}) {
    const baseline = chooseCoreBotResponse(message, {
      ...context,
      profile: "generic",
      weights: {},
      brave: false,
    });
    const legalCandidates = candidateResponses(message, baseline, { deckKnowledge: this.deckKnowledge });
    if (!legalCandidates.length) return baseline;
    const observation = context.observation ?? {};
    const reasoned = reasonAboutResponses(this.deckKnowledge, message, legalCandidates, { observation, memory: this.reasoningMemory });
    const candidates = reasoned.map((entry) => entry.candidate);
    const stateFeatures = strategyObservationFeatures(this.deckKnowledge, observation);
    const expertScores = candidates.map((candidate, index) => scoreDeckStrategy(this.deckKnowledge, message, candidate, {
      actionRole: actionRole(message, candidate),
      observation,
      baseline: false,
    }) + reasoned[index].analysis.value * 1.8 + Number(this.strategyBiases[actionRole(message, candidate)] ?? 0));
    const descriptors = candidates.map((candidate, index) => {
      const role = actionRole(message, candidate);
      const action = actionFeatures(message, candidate);
      const semantic = [...new Set(actionCardEntries(this.deckKnowledge, message, candidate).flatMap((card) => card.roles ?? []))]
        .map((cardRole) => `action:semantic:${cardRole}`);
      // State-only features are equal for every candidate and therefore cancel
      // out in a linear softmax. Cross them with the decision role so deck and
      // tactical knowledge can actually change which legal action wins.
      const tactical = stateFeatures
        .filter((feature) => /^(state:|hand:role:|grave:role:|board:role:|deck:role:)/.test(feature))
        .slice(0, 48);
      const stateAction = tactical.map((feature) => `state-action:${feature}:role:${role}`);
      return [...action, ...semantic, ...stateAction, `strategy:role:${role}`, `strategy:score:${expertScores[index] >= 0 ? "positive" : "negative"}`];
    });
    const learnedPolicyAllowed = this.training || this.policyQualified;
    const scores = candidates.map((candidate, index) => learnedPolicyAllowed && this.strategyCompatibility.compatible && !this.fallbackOnly
      ? this.policyScore(descriptors[index], false, expertScores[index])
      : expertScores[index]);
    const probabilities = softmax(scores, this.temperature);
    let selectedIndex = probabilities.length - 1;
    if (this.training && this.next() < Math.max(this.minimumExploration, this.exploration * Math.pow(0.9995, this.episodes))) {
      selectedIndex = Math.floor(this.next() * candidates.length);
    } else if (!this.training) {
      selectedIndex = scores.reduce((best, score, index) => score > scores[best] ? index : best, 0);
    } else {
      let cursor = this.next();
      for (let index = 0; index < probabilities.length; index += 1) { cursor -= probabilities[index]; if (cursor <= 0) { selectedIndex = index; break; } }
    }
    const expertBestIndex = expertScores.reduce((best, score, index) => score > expertScores[best] ? index : best, 0);
    const maximumExpertRegression = this.training ? 1.5 : 0.5;
    if (expertScores[selectedIndex] < expertScores[expertBestIndex] - maximumExpertRegression) selectedIndex = expertBestIndex;
    const family = responseFamily(message);
    const role = actionRole(message, candidates[selectedIndex]);
    this.trajectory.push({
      family,
      role,
      stateKey: stateKey(message),
      actionKey: responseKey(message, candidates[selectedIndex]),
      features: descriptors[selectedIndex],
      expected: expectedFeatures(candidates, probabilities, descriptors),
      expertScore: expertScores[selectedIndex],
    });
    this.decisions += 1;
    rememberResponse(this.reasoningMemory, this.deckKnowledge, message, candidates[selectedIndex], observation);
    return structuredClone(candidates[selectedIndex]);
  }

  consumeEpisode() {
    const episode = this.trajectory;
    this.trajectory = [];
    return episode;
  }

  learnFromEpisode(episode = [], reward = 0) {
    const numericReward = clamp(reward, -1, 1);
    const total = Math.max(1, episode.length);
    for (let index = 0; index < episode.length; index += 1) {
      const trace = episode[index];
      const progress = Math.pow(this.discount, Math.min(120, total - index - 1));
      const value = Number(this.valueByFamily[trace.family] ?? 0);
      const advantage = numericReward * progress - value;
      this.valueByFamily[trace.family] = value + this.valueRate * advantage;
      const delta = this.learningRate * advantage;
      for (const feature of trace.features ?? []) this.featureWeights[feature] = clamp(Number(this.featureWeights[feature] ?? 0) + delta, -8, 8);
      for (const [feature, expected] of Object.entries(trace.expected ?? {})) this.featureWeights[feature] = clamp(Number(this.featureWeights[feature] ?? 0) - delta * Number(expected), -8, 8);
      const action = `${trace.family}:${trace.role ?? "unknown"}`;
      const stats = this.actionStats[action] ??= { samples: 0, reward: 0 };
      stats.samples += 1;
      stats.reward += numericReward;
    }
    this.episodes += 1;
    this.version = Math.max(this.version, 1 + Math.floor(this.episodes / 1000));
    return { episode: this.episodes, reward: numericReward, decisions: episode.length, features: Object.keys(this.featureWeights).length };
  }

  updateFromOutcome(reward) { return this.learnFromEpisode(this.consumeEpisode(), reward); }

  manifest() {
    const featureWeights = Object.fromEntries(Object.entries(compactNumericMap(this.featureWeights)).filter(([feature]) => !feature.startsWith("card:code:")));
    return {
      id: this.id,
      botId: this.botId,
      name: this.name,
      algorithm: this.algorithm,
      profile: this.profile,
      deckId: this.deckId,
      style: this.style,
      state: this.state,
      version: this.version,
      learningRate: this.learningRate,
      valueRate: this.valueRate,
      temperature: this.temperature,
      exploration: this.exploration,
      minimumExploration: this.minimumExploration,
      discount: this.discount,
      strategyWeight: this.strategyWeight,
      parentModelId: this.parentModelId,
      intelligence: this.intelligence,
      targetIntelligence: this.targetIntelligence,
      technicalRating: this.technicalRating,
      certification: this.certification ? structuredClone(this.certification) : null,
      episodes: this.episodes,
      decisions: this.decisions,
      randomState: this.randomState,
      featureWeights,
      valueByFamily: compactNumericMap(this.valueByFamily),
      actionStats: structuredClone(this.actionStats),
      strategyBiases: compactNumericMap(this.strategyBiases),
      strategy: {
        id: this.deckKnowledge.plan.id,
        deckId: this.deckKnowledge.deckId,
        deckHash: this.deckKnowledge.deckHash,
        resolved: this.deckKnowledge.resolved !== false,
        archetype: this.deckKnowledge.archetype,
        mainSize: this.deckKnowledge.mainSize,
        deck: deckSnapshot(this.deckKnowledge),
        cards: this.deckKnowledge.cards.map((card) => ({ id: card.id, name: card.name, count: card.count, runtimeCode: card.runtimeCode, roles: [...card.roles] })),
        roleCounts: { ...this.deckKnowledge.roles },
        goals: [...this.deckKnowledge.plan.goals],
        scenarios: [...this.deckKnowledge.plan.scenarios],
      },
      strategyCompatibility: structuredClone(this.strategyCompatibility),
    };
  }
}

export function hydrateLearnedPolicy(manifest = {}) {
  return new LearnedPolicyBot({ ...manifest, featureWeights: manifest.featureWeights ?? manifest.parameters ?? {}, training: false });
}

export function rewardForCoreResult(result = {}) {
  if (result.winner === 0 && result.terminationReason === "WIN") return 1;
  if (result.winner === 1 && result.terminationReason === "WIN") return -1;
  if (["INVALID_ACTION", "UNSUPPORTED_RESPONSE", "UNSUPPORTED_MESSAGE", "RETRY_LIMIT"].includes(result.terminationReason)) return -0.25;
  if (result.terminationReason === "DECISION_LIMIT") return -0.5;
  return 0;
}

export function learnedPolicySummary(bot) {
  const manifest = bot?.manifest?.() ?? bot ?? {};
  const entries = Object.values(manifest.actionStats ?? {});
  const samples = entries.reduce((sum, entry) => sum + (Number(entry.samples) || 0), 0);
  const reward = entries.reduce((sum, entry) => sum + (Number(entry.reward) || 0), 0);
  return {
    algorithm: manifest.algorithm,
    episodes: Number(manifest.episodes) || 0,
    decisions: Number(manifest.decisions) || 0,
    features: Object.keys(manifest.featureWeights ?? manifest.parameters ?? {}).length,
    learnedActionSamples: samples,
    meanDecisionReward: samples ? reward / samples : 0,
  };
}

export { actionFeatures };

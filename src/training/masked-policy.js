import { chooseCoreBotResponse } from "../engine/ocgcore-backend.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { CoreHeuristicBot } from "../bots/ocgcore.js";
import { duelStats } from "../analytics/statistics.js";
import { createModelManifest } from "../persistence/model-registry.js";
import { candidateResponses } from "../bots/legal-candidates.js";

export function responseKey(message, response) {
  return `${Number(message.type)}:${jsonString(response)}`;
}

export function stateKey(message) {
  return jsonString({ type: Number(message.type), options: message.options?.length ?? 0, selects: message.selects?.length ?? 0, activates: message.activates?.length ?? 0, summons: message.summons?.length ?? 0, chains: message.chains?.length ?? 0, attacks: message.attacks?.length ?? 0, min: message.min ?? null, max: message.max ?? null });
}

function jsonString(value) { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? `${item}n` : item); }

export { candidateResponses };

function randomUnit(bot) {
  let x = bot.randomState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  bot.randomState = x >>> 0;
  return bot.randomState / 0xffffffff;
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(Math.max(-30, Math.min(30, value - max))));
  const total = exponentials.reduce((sum, value) => sum + value, 0) || 1;
  return exponentials.map((value) => value / total);
}

/** A compact masked actor-critic/PPO-style policy for local experiments. */
export class MaskedPolicyBot {
  constructor({ id = "ppo-lite", name = "PPO Lite", profile = "generic", learningRate = 0.04, valueRate = 0.08, clip = 0.2, temperature = 1, version = 1, episodes = 0, randomState = 1, logits = {}, values = {} } = {}) {
    this.id = id;
    this.name = name;
    this.algorithm = "ocgcore-masked-ppo-lite";
    this.profile = profile;
    this.learningRate = learningRate;
    this.valueRate = valueRate;
    this.clip = clip;
    this.temperature = temperature;
    this.version = version;
    this.episodes = episodes;
    this.randomState = Number(randomState) >>> 0 || 1;
    this.logits = { ...logits };
    this.values = { ...values };
    this.trajectory = [];
    this.decisions = 0;
  }

  chooseResponse(message, context = {}) {
    const baseline = chooseCoreBotResponse(message, { ...context, profile: this.profile });
    const candidates = candidateResponses(message, baseline);
    if (!candidates.length) return baseline;
    const key = stateKey(message);
    const logits = candidates.map((candidate) => Number(this.logits[responseKey(message, candidate)] ?? 0) / Math.max(0.1, this.temperature));
    const probabilities = softmax(logits);
    let cursor = randomUnit(this);
    let selectedIndex = probabilities.length - 1;
    for (let index = 0; index < probabilities.length; index += 1) { cursor -= probabilities[index]; if (cursor <= 0) { selectedIndex = index; break; } }
    const selected = candidates[selectedIndex];
    this.trajectory.push({ stateKey: key, actionKey: responseKey(message, selected), oldLogit: logits[selectedIndex], oldProbability: probabilities[selectedIndex] });
    this.decisions += 1;
    return structuredClone(selected);
  }

  updateFromOutcome(reward) {
    const numericReward = Math.max(-1, Math.min(1, Number(reward) || 0));
    const grouped = new Map();
    for (const trace of this.trajectory) {
      const value = Number(this.values[trace.stateKey] ?? 0);
      const advantage = numericReward - value;
      this.values[trace.stateKey] = value + this.valueRate * advantage;
      const ratio = Math.exp(Number(this.logits[trace.actionKey] ?? trace.oldLogit) - trace.oldLogit);
      const clipped = Math.max(1 - this.clip, Math.min(1 + this.clip, ratio));
      const update = this.learningRate * Math.min(ratio * advantage, clipped * advantage);
      grouped.set(trace.actionKey, (grouped.get(trace.actionKey) ?? 0) + update);
    }
    for (const [action, update] of grouped) this.logits[action] = Math.max(-8, Math.min(8, Number(this.logits[action] ?? 0) + update));
    this.trajectory = [];
    this.episodes += 1;
    this.version = Math.max(this.version, 1 + Math.floor(this.episodes / 100));
    return { reward: numericReward, episodes: this.episodes, updatedActions: grouped.size };
  }

  manifest() {
    return { id: this.id, name: this.name, algorithm: this.algorithm, profile: this.profile, learningRate: this.learningRate, valueRate: this.valueRate, clip: this.clip, temperature: this.temperature, version: this.version, episodes: this.episodes, randomState: this.randomState, logits: { ...this.logits }, values: { ...this.values }, decisions: this.decisions };
  }
}

export function hydrateMaskedPolicy(manifest = {}) {
  const bot = new MaskedPolicyBot(manifest);
  bot.decisions = Number(manifest.decisions) || 0;
  return bot;
}

function cardNames(ids) { return ids.map((id) => getCard(id)?.name ?? String(id)); }

export async function trainMaskedPolicy({ botName = "PPO Lite", deckId = "chaos-turbo", opponentDeckIds = ["goat-control", "warrior", "panda-burn"], games = 20, seed = 16000, maxSteps = 3000, initialBot = null, onProgress = null } = {}) {
  const candidate = initialBot ?? new MaskedPolicyBot({ id: `${botName.toLowerCase().replace(/\s+/g, "-")}-policy`, name: botName, profile: deckId, randomState: seed });
  const results = [];
  for (let index = 0; index < Math.max(0, Number(games) || 0); index += 1) {
    const opponentDeckId = opponentDeckIds[index % opponentDeckIds.length];
    const deck = getDeck(deckId);
    const opponent = getDeck(opponentDeckId);
    const rival = new CoreHeuristicBot({ id: `policy-rival-${index}`, name: `Rival ${opponentDeckId}`, profile: opponentDeckId });
    const result = await runOcgcoreHeadless({
      decks: [cardNames(deck.main), cardNames(opponent.main)],
      extraDecks: [cardNames(deck.fusion), cardNames(opponent.fusion)],
      seed: seed + index,
      startingPlayer: index % 2,
      maxSteps,
      botA: candidate,
      botB: rival,
      profileA: deckId,
      profileB: opponentDeckId,
    });
    const reward = result.winner === 0 ? 1 : result.winner === 1 ? -1 : 0;
    candidate.updateFromOutcome(reward);
    results.push({ ...result.replay, opponentDeckId, reward });
    onProgress?.({ completed: index + 1, total: games, reward, bot: candidate.manifest() });
  }
  const stats = duelStats(results, { sampleSeed: seed });
  const model = createModelManifest({ bot: candidate.manifest(), deckId, trainingPlan: { engine: "ocgcore", algorithm: candidate.algorithm, games, seed, maxSteps, opponentDeckIds }, trainingStats: stats, evaluation: {} });
  return { engine: "ocgcore", algorithm: candidate.algorithm, bot: candidate.manifest(), model, stats, results };
}

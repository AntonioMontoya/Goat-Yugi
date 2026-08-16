import { CORE_BOT_PROFILES, chooseCoreBotResponse } from "../engine/ocgcore-backend.js";
import { candidateResponses } from "./legal-candidates.js";
import { buildDeckKnowledge, deckSnapshot, scoreDeckStrategy, strategyActionRole } from "./deck-strategy.js";
import { reasonAboutResponses, rememberResponse } from "./state-evaluator.js";
import {
  OcgMessageType,
  OcgPosition,
  OcgResponseType,
  SelectBattleCMDAction,
  SelectIdleCMDAction,
} from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";

function responseFamily(message) {
  return ({
    10: "battle",
    11: "idle",
    12: "effect",
    13: "yesno",
    14: "option",
    15: "card",
    16: "chain",
    18: "place",
    19: "position",
    20: "tribute",
    21: "sort",
    22: "counter",
    23: "sum",
    24: "disfield",
    25: "sort",
    26: "unselect",
    132: "rps",
    140: "announce",
    141: "announce",
    142: "announce",
    143: "announce"
  })[Number(message?.type)] ?? "other";
}

export class CoreHeuristicBot {
  constructor({
    id = "core-heuristic",
    botId = id,
    name = "Astra",
    profile = "generic",
    deckId = profile,
    deck = null,
    style = "Heurística",
    state = "Sin entrenar",
    difficulty = "normal",
    brave = difficulty !== "easy",
    weights = {},
    version = 1,
    learningRate = 0.02,
    episodes = 0,
    outcomeSum = 0,
    responseCounts = {},
  } = {}) {
    this.id = id;
    this.botId = botId;
    this.name = name;
    this.algorithm = "ocgcore-profiled-heuristic";
    this.profile = typeof profile === "string" && CORE_BOT_PROFILES[profile] ? profile : "generic";
    this.deckId = deckId;
    this.style = style;
    this.state = state;
    this.difficulty = difficulty;
    this.brave = brave;
    this.weights = { activate: 0, summon: 0, battle: 0, ...weights };
    this.version = version;
    this.learningRate = learningRate;
    this.episodes = episodes;
    this.outcomeSum = outcomeSum;
    this.responseCounts = { ...responseCounts };
    this.episodeResponseCounts = {};
    this.decisions = 0;
    this.deckKnowledge = buildDeckKnowledge(this.deckId ?? this.profile, deck);
    this.reasoningMemory = { recent: [] };
  }

  chooseResponse(message, context = {}) {
    const family = responseFamily(message);
    this.responseCounts[family] = (this.responseCounts[family] ?? 0) + 1;
    this.episodeResponseCounts[family] = (this.episodeResponseCounts[family] ?? 0) + 1;
    this.decisions += 1;
    const baseline = chooseCoreBotResponse(message, {
      ...context,
      profile: "generic",
      weights: {},
      brave: false,
    });
    const candidates = candidateResponses(message, baseline, { deckKnowledge: this.deckKnowledge });
    if (candidates.length <= 1) return structuredClone(candidates[0] ?? baseline);
    const observation = context.observation ?? {};
    const reasoned = reasonAboutResponses(this.deckKnowledge, message, candidates, { observation, memory: this.reasoningMemory });
    const ranked = reasoned.map(({ candidate, analysis }) => ({ candidate, analysis, score: scoreDeckStrategy(this.deckKnowledge, message, candidate, { actionRole: strategyActionRole(message, candidate), observation, baseline: false }) + analysis.value * 1.8 }));
    const selectedEntry = ranked.reduce((best, current) => current.score > best.score ? current : best, ranked[0]);
    const selected = selectedEntry.candidate;
    this.lastReasoning = {
      requestType: Number(message?.type),
      selected: { role: selectedEntry.analysis.role, score: selectedEntry.score, value: selectedEntry.analysis.value, reasons: [...selectedEntry.analysis.reasons] },
      alternatives: ranked.map((entry) => ({ role: entry.analysis.role, score: entry.score, value: entry.analysis.value, reasons: [...entry.analysis.reasons] })).sort((left, right) => right.score - left.score).slice(0, 8),
    };
    rememberResponse(this.reasoningMemory, this.deckKnowledge, message, selected, observation);
    return structuredClone(selected);
  }

  updateFromOutcome(reward) {
    const numericReward = Number(reward) || 0;
    this.episodes += 1;
    this.version = Math.max(this.version, 1 + Math.floor(this.episodes / 100));
    this.outcomeSum += numericReward;
    const signal = numericReward * this.learningRate;
    const episodeDecisions = Object.values(this.episodeResponseCounts).reduce((sum, count) => sum + count, 0);
    for (const [family, count] of Object.entries(this.episodeResponseCounts)) {
      const share = count / Math.max(1, episodeDecisions);
      if (family === "idle") this.weights.summon = Math.max(-20, Math.min(60, this.weights.summon + signal * share));
      if (family === "battle") this.weights.battle = Math.max(-20, Math.min(60, this.weights.battle + signal * share));
      if (family === "effect") this.weights.activate = Math.max(-20, Math.min(60, this.weights.activate + signal * share));
    }
    this.episodeResponseCounts = {};
    return { reward: numericReward, averageReward: this.outcomeSum / Math.max(1, this.episodes), weights: { ...this.weights } };
  }

  manifest() {
    return {
      id: this.id,
      botId: this.botId,
      name: this.name,
      algorithm: "ocgcore-profiled-heuristic",
      profile: this.profile,
      deckId: this.deckId,
      style: this.style,
      state: this.state,
      difficulty: this.difficulty,
      brave: this.brave,
      weights: { ...this.weights },
      version: this.version,
      learningRate: this.learningRate,
      episodes: this.episodes,
      outcomeSum: this.outcomeSum,
      responseCounts: { ...this.responseCounts },
      decisions: this.decisions,
      strategy: {
        id: this.deckKnowledge.plan.id,
        deckId: this.deckKnowledge.deckId,
        deckHash: this.deckKnowledge.deckHash,
        resolved: this.deckKnowledge.resolved !== false,
        archetype: this.deckKnowledge.archetype,
        mainSize: this.deckKnowledge.mainSize,
        deck: deckSnapshot(this.deckKnowledge),
        roleCounts: { ...this.deckKnowledge.roles },
        goals: [...this.deckKnowledge.plan.goals],
        scenarios: [...this.deckKnowledge.plan.scenarios],
      },
    };
  }
}

function randomInt(bot, maximum) {
  if (maximum <= 0) return 0;
  return Math.floor(bot.next() * maximum);
}

function shuffledIndices(bot, length) {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = randomInt(bot, index + 1);
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }
  return indices;
}

function randomCount(bot, minimum, maximum) {
  const min = Math.max(0, Number(minimum) || 0);
  const max = Math.max(min, Number(maximum) || min);
  return min + randomInt(bot, max - min + 1);
}

function randomSelection(bot, length, minimum, maximum) {
  return shuffledIndices(bot, length).slice(0, randomCount(bot, minimum, Math.min(maximum, length))).sort((a, b) => a - b);
}

function randomPosition(bot, mask) {
  const positions = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEDOWN_ATTACK]
    .filter((position) => (mask & position) !== 0);
  return positions[randomInt(bot, positions.length)] ?? OcgPosition.FACEUP_ATTACK;
}

function randomSum(bot, message, fallback) {
  const required = message.selects_must ?? [];
  const target = Number(message.amount) || 0;
  const order = shuffledIndices(bot, message.selects?.length ?? 0);
  let total = required.reduce((sum, card) => sum + (Number(card?.amount) || 0), 0);
  const indicies = required.map((_card, index) => index);
  for (const index of order) {
    const amount = Number(message.selects[index]?.amount) || 0;
    if (total < target || bot.next() > 0.45) {
      indicies.push(required.length + index);
      total += amount;
    }
    if (total >= target && bot.next() > 0.35) break;
  }
  return total >= target ? indicies.sort((a, b) => a - b) : fallback.indicies;
}

/** A deterministic legal-random baseline for independent evaluation. */
export class CoreRandomBot {
  constructor({ id = "core-random", botId = id, name = "Legal Random", seed = 1, profile = "generic", deckId = profile, style = "Baseline legal", state = "Validado" } = {}) {
    this.id = id;
    this.botId = botId;
    this.name = name;
    this.profile = profile;
    this.deckId = deckId;
    this.style = style;
    this.state = state;
    this.difficulty = "random";
    this.brave = true;
    this.algorithm = "ocgcore-legal-random";
    this.randomState = Number(seed) >>> 0 || 1;
    this.decisions = 0;
  }

  next() {
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0xffffffff;
  }

  chooseResponse(message, context = {}) {
    this.decisions += 1;
    const base = chooseCoreBotResponse(message, { ...context, brave: true, profile: this.profile });
    if (!base) return null;
    switch (message.type) {
      case OcgMessageType.ROCK_PAPER_SCISSORS:
        return { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 1 + randomInt(this, 3) };
      case OcgMessageType.SELECT_IDLECMD: {
        const choices = [];
        if (message.activates?.length) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_ACTIVATE, index: randomInt(this, message.activates.length) }));
        if (message.summons?.length) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SUMMON, index: randomInt(this, message.summons.length) }));
        if (message.special_summons?.length) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON, index: randomInt(this, message.special_summons.length) }));
        if (message.monster_sets?.length) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_MONSTER_SET, index: randomInt(this, message.monster_sets.length) }));
        if (message.spell_sets?.length) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_SPELL_SET, index: randomInt(this, message.spell_sets.length) }));
        if (message.pos_changes?.length) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SELECT_POS_CHANGE, index: randomInt(this, message.pos_changes.length) }));
        if (message.shuffle) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.SHUFFLE, index: null }));
        if (message.to_bp) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_BP, index: null }));
        if (message.to_ep) choices.push(() => ({ type: OcgResponseType.SELECT_IDLECMD, action: SelectIdleCMDAction.TO_EP, index: null }));
        return choices.length ? choices[randomInt(this, choices.length)]() : base;
      }
      case OcgMessageType.SELECT_BATTLECMD: {
        const choices = [];
        if (message.chains?.length) choices.push(() => ({ type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_CHAIN, index: randomInt(this, message.chains.length) }));
        if (message.attacks?.length) choices.push(() => ({ type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index: randomInt(this, message.attacks.length) }));
        if (message.to_m2) choices.push(() => ({ type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null }));
        if (message.to_ep) choices.push(() => ({ type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null }));
        return choices.length ? choices[randomInt(this, choices.length)]() : base;
      }
      case OcgMessageType.SELECT_EFFECTYN:
      case OcgMessageType.SELECT_YESNO:
        return { ...base, yes: this.next() >= 0.5 };
      case OcgMessageType.SELECT_OPTION:
        return { ...base, index: randomInt(this, message.options?.length ?? 1) };
      case OcgMessageType.SELECT_CARD:
        return { ...base, indicies: randomSelection(this, message.selects?.length ?? 0, message.min, message.max ?? message.min) };
      case OcgMessageType.SELECT_TRIBUTE:
        return { ...base, indicies: randomSelection(this, message.selects?.length ?? 0, message.min, message.min) };
      case OcgMessageType.SELECT_CHAIN:
        return message.forced ? { ...base, index: 0 } : { ...base, index: message.selects?.length && this.next() >= 0.35 ? randomInt(this, message.selects.length) : null };
      case OcgMessageType.SELECT_POSITION:
        return { ...base, position: randomPosition(this, message.positions) };
      case OcgMessageType.SORT_CHAIN:
      case OcgMessageType.SORT_CARD:
        return { ...base, order: shuffledIndices(this, message.cards?.length ?? 0) };
      case OcgMessageType.SELECT_UNSELECT_CARD:
        {
          const selectable = message.select_cards ?? [];
          const unselectable = message.unselect_cards ?? [];
          const total = selectable.length + unselectable.length;
          if (message.can_finish && Number(message.min) === 0 && this.next() < 0.35) return { ...base, index: null };
          return total ? { ...base, index: randomInt(this, total) } : base;
        }
      case OcgMessageType.SELECT_SUM:
        return { ...base, indicies: randomSum(this, message, base) };
      case OcgMessageType.SELECT_COUNTER: {
        let remaining = Number(message.count) || 0;
        const counters = (message.cards ?? []).map((card) => {
          const selected = Math.min(Number(card.count) || 0, randomInt(this, remaining + 1));
          remaining -= selected;
          return selected;
        });
        if (remaining > 0) return base;
        return { ...base, counters };
      }
      case OcgMessageType.ANNOUNCE_RACE:
        return base;
      case OcgMessageType.ANNOUNCE_ATTRIB:
        return base;
      case OcgMessageType.ANNOUNCE_CARD: {
        return base;
      }
      case OcgMessageType.ANNOUNCE_NUMBER: {
        const options = message.options ?? [];
        return options.length ? { ...base, value: Number(options[randomInt(this, options.length)]) } : base;
      }
      default:
        return base;
    }
  }

  manifest() {
    return { id: this.id, botId: this.botId, name: this.name, algorithm: this.algorithm, profile: this.profile, deckId: this.deckId, style: this.style, state: this.state, seed: this.randomState, decisions: this.decisions };
  }
}

export function hydrateCoreBot(manifest = {}) {
  const bot = new CoreHeuristicBot({
    id: manifest.id ?? manifest.botId ?? "core-heuristic",
    botId: manifest.botId ?? manifest.id ?? "core-heuristic",
    name: manifest.name ?? "Astra",
    profile: manifest.profile ?? "generic",
    deckId: manifest.deckId ?? manifest.profile ?? "generic",
    style: manifest.style ?? "Heurística",
    state: manifest.state ?? "Sin entrenar",
    difficulty: manifest.difficulty ?? "normal",
    brave: manifest.brave,
    weights: manifest.weights,
    version: manifest.version ?? 1,
    learningRate: manifest.learningRate ?? 0.02,
    episodes: manifest.episodes ?? 0,
    outcomeSum: manifest.outcomeSum ?? 0,
    responseCounts: manifest.responseCounts,
  });
  bot.decisions = manifest.decisions ?? 0;
  return bot;
}

export { responseFamily };

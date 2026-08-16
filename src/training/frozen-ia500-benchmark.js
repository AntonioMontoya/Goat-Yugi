import { chooseCoreBotResponse, runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { candidateResponses } from "../bots/legal-candidates.js";
import { buildDeckKnowledge, scoreDeckStrategy, strategyActionRole } from "../bots/deck-strategy.js";
import { duelStats } from "../analytics/statistics.js";

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }

/**
 * Frozen copy of the former IA-500 decision stack. Keeping this benchmark
 * immutable prevents improvements to the shared runtime from moving the goal
 * posts while a new universal policy is evaluated.
 */
export class FrozenIa500BenchmarkBot {
  constructor({ deckId = "warrior", seed = 1, id = "frozen-ia500-v1" } = {}) {
    this.id = id;
    this.botId = id;
    this.name = "Frozen IA 500 v1";
    this.algorithm = "frozen-ia500-profiled-heuristic-v1";
    this.profile = deckId;
    this.deckId = deckId;
    this.difficulty = "hard";
    this.brave = true;
    this.seed = Number(seed) || 1;
    this.weights = { activate: 2, summon: 2, battle: 3 };
    this.deckKnowledge = buildDeckKnowledge(deckId);
  }

  chooseResponse(message, context = {}) {
    const observation = context.observation ?? {};
    const baseline = chooseCoreBotResponse(message, { ...context, profile: this.profile, brave: true, weights: this.weights });
    const candidates = candidateResponses(message, baseline, { deckKnowledge: this.deckKnowledge });
    if (candidates.length <= 1) return baseline;
    const ranked = candidates.map((candidate) => ({
      candidate,
      score: scoreDeckStrategy(this.deckKnowledge, message, candidate, {
        actionRole: strategyActionRole(message, candidate),
        observation,
        baseline: candidate === baseline,
      }),
    }));
    return structuredClone(ranked.reduce((best, current) => current.score > best.score ? current : best, ranked[0]).candidate);
  }

  manifest() { return { id: this.id, botId: this.botId, name: this.name, algorithm: this.algorithm, profile: this.profile, deckId: this.deckId, difficulty: this.difficulty, intelligence: 500, benchmark: true, frozen: true, version: 1 }; }
}

export async function evaluateAgainstFrozenIa500({
  candidateFactory,
  deckIds = ["chaos-turbo", "goat-control", "flip-control", "warrior"],
  gamesPerDeck = 20,
  seed = 500_000,
  maxSteps = 5_000,
  workers = 1,
  requiredWinRate = 0.55,
  requiredConfidenceLow = 0.5,
} = {}) {
  if (typeof candidateFactory !== "function") throw new Error("evaluateAgainstFrozenIa500 necesita candidateFactory.");
  const jobs = [];
  for (let deckIndex = 0; deckIndex < deckIds.length; deckIndex += 1) {
    const deckId = deckIds[deckIndex];
    const deck = getDeck(deckId);
    for (let game = 0; game < gamesPerDeck; game += 1) jobs.push(async () => {
      const gameSeed = seed + deckIndex * 100_003 + game;
      const candidate = candidateFactory({ deckId, seed: gameSeed, game });
      const benchmark = new FrozenIa500BenchmarkBot({ deckId, seed: gameSeed ^ 0x51ed270b });
      const run = await runOcgcoreHeadless({
        decks: [cardNames(deck.main), cardNames(deck.main)],
        extraDecks: [cardNames(deck.fusion), cardNames(deck.fusion)],
        seed: gameSeed,
        startingPlayer: game % 2,
        maxSteps,
        botA: candidate,
        botB: benchmark,
        profileA: deckId,
        profileB: deckId,
      });
      return { ...run, deckId };
    });
  }
  const runs = [];
  const parallel = Math.max(1, Math.min(6, Math.floor(Number(workers) || 1)));
  for (let cursor = 0; cursor < jobs.length; cursor += parallel) runs.push(...await Promise.all(jobs.slice(cursor, cursor + parallel).map((job) => job())));
  const rows = runs.map((run) => ({ winner: run.winner, terminationReason: run.terminationReason, turns: run.turns, decisions: run.decisions, opponentDeckId: run.deckId, startingPlayer: run.replay?.startingPlayer }));
  const perDeck = Object.fromEntries(deckIds.map((deckId) => {
    const stats = duelStats(rows.filter((row) => row.opponentDeckId === deckId), { sampleLimit: 0, sampleSeed: seed });
    const passed = stats.invalid === 0 && stats.winRate >= requiredWinRate && Number(stats.confidence95?.low ?? 0) >= requiredConfidenceLow;
    return [deckId, { ...stats, passed }];
  }));
  const aggregate = duelStats(rows, { sampleLimit: 0, sampleSeed: seed });
  const passed = aggregate.invalid === 0 && Object.values(perDeck).every((entry) => entry.passed);
  return { schema: 1, benchmark: "frozen-ia500-v1", frozen: true, deckIds: [...deckIds], gamesPerDeck, requirements: { requiredWinRate, requiredConfidenceLow, invalid: 0 }, passed, perDeck, ...aggregate };
}

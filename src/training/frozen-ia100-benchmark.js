import { duelStats } from "../analytics/statistics.js";
import { candidateResponses } from "../bots/legal-candidates.js";
import { buildDeckKnowledge, scoreDeckStrategy, strategyActionRole } from "../bots/deck-strategy.js";
import { getCard } from "../engine/cards.js";
import { getDeck } from "../decks/decks.js";
import { chooseCoreBotResponse, runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { SPECIALIST_BASELINE_MODE, SPECIALIST_BENCHMARK_ID, SPECIALIST_THRESHOLDS } from "../bots/specialist-contract.js";
import { inspectOcgcoreRun, invalidReasonCounts } from "./ocgcore-run-validity.js";

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

/** Snapshot contract for the former selectable IA 1000 (Mirror). */
export class FrozenIa100BenchmarkBot {
  constructor({ deckId = "flip-control", deck = null, seed = 1 } = {}) {
    this.id = "frozen-former-ia1000-v1";
    this.botId = this.id;
    this.name = "Base IA 100";
    this.algorithm = "frozen-former-ia1000-v1";
    this.deckId = deckId;
    this.profile = deckId;
    this.difficulty = "expert";
    this.brave = true;
    this.weights = { activate: 4, summon: 3, battle: 5 };
    this.state = "Validado";
    this.seed = Number(seed) || 1;
    this.skillMmr = 100;
    this.deckKnowledge = buildDeckKnowledge(deckId, deck);
  }

  chooseResponse(message, context = {}) {
    const observation = context.observation ?? {};
    const baseline = chooseCoreBotResponse(message, { ...context, profile: this.profile, brave: true, weights: this.weights });
    const candidates = candidateResponses(message, baseline, { deckKnowledge: this.deckKnowledge });
    if (candidates.length <= 1) return baseline;
    const ranked = candidates.map((candidate) => ({
      candidate,
      score: scoreDeckStrategy(this.deckKnowledge, message, candidate, { actionRole: strategyActionRole(message, candidate), observation, baseline: candidate === baseline }),
    }));
    return structuredClone(ranked.reduce((best, current) => current.score > best.score ? current : best, ranked[0]).candidate);
  }

  manifest() {
    return { id: this.id, botId: this.botId, name: this.name, algorithm: this.algorithm, profile: this.profile, deckId: this.deckId, difficulty: this.difficulty, intelligence: 100, skillMmr: 100, benchmark: true, frozen: true, formerIntelligence: 1000 };
  }
}

export function specialistMmrForWinRate(winRate) {
  const rate = Number(winRate) || 0;
  if (rate >= 0.95) return 400;
  if (rate >= 0.90) return 300;
  if (rate >= 0.80) return 200;
  return 0;
}

export async function evaluateAgainstFrozenIa100({ candidateFactory, deckIds, baselineDeckId = SPECIALIST_BASELINE_MODE, gamesPerDeck = 100, minimumGames = 100, seed = 1_000_000, maxSteps = 5_000, workers = 1 } = {}) {
  if (typeof candidateFactory !== "function") throw new Error("evaluateAgainstFrozenIa100 necesita candidateFactory.");
  const ids = [...new Set(deckIds ?? [])];
  if (!ids.length) throw new Error("No hay mazos para certificar.");
  const jobs = [];
  for (let deckIndex = 0; deckIndex < ids.length; deckIndex += 1) {
    const deckId = ids[deckIndex];
    const deck = getDeck(deckId);
    for (let game = 0; game < gamesPerDeck; game += 1) jobs.push(async () => {
      const baselineDeck = baselineDeckId === SPECIALIST_BASELINE_MODE ? deck : getDeck(baselineDeckId);
      const baselineProfile = baselineDeckId === SPECIALIST_BASELINE_MODE ? deckId : baselineDeckId;
      const gameSeed = seed + deckIndex * 100_003 + game;
      const candidate = candidateFactory({ deckId, deck, seed: gameSeed, game });
      const benchmark = new FrozenIa100BenchmarkBot({ deckId: baselineProfile, deck: baselineDeck, seed: gameSeed ^ 0x6d2b79f5 });
      const run = await runOcgcoreHeadless({
        decks: [cardNames(deck.main), cardNames(baselineDeck.main)],
        extraDecks: [cardNames(deck.fusion), cardNames(baselineDeck.fusion)],
        seed: gameSeed,
        startingPlayer: game % 2,
        maxSteps,
        botA: candidate,
        botB: benchmark,
        profileA: deckId,
        profileB: baselineProfile,
      });
      return { ...run, deckId };
    });
  }
  const runs = [];
  const parallel = Math.max(1, Math.min(6, Math.floor(Number(workers) || 1)));
  for (let cursor = 0; cursor < jobs.length; cursor += parallel) runs.push(...await Promise.all(jobs.slice(cursor, cursor + parallel).map((job) => job())));
  const rows = runs.map((run) => ({ winner: run.winner, terminationReason: run.terminationReason, turns: run.turns, decisions: run.decisions, opponentDeckId: run.deckId, startingPlayer: run.replay?.startingPlayer, validity: inspectOcgcoreRun(run) }));
  const perDeck = Object.fromEntries(ids.map((deckId) => {
    const deckRows = rows.filter((row) => row.opponentDeckId === deckId);
    const stats = duelStats(deckRows, { sampleLimit: 0, sampleSeed: seed });
    const inspections = deckRows.map((row) => row.validity).filter((entry) => !entry.valid);
    stats.invalid = inspections.length;
    stats.invalidReasons = invalidReasonCounts(inspections);
    const enoughGames = stats.games >= Math.max(100, Number(minimumGames) || 100);
    const mmr = enoughGames && stats.invalid === 0 ? specialistMmrForWinRate(stats.winRate) : 0;
    return [deckId, { ...stats, enoughGames, mmr, passed: stats.invalid === 0 && enoughGames && mmr >= 200, target400Passed: stats.invalid === 0 && enoughGames && mmr >= 400 }];
  }));
  const aggregate = duelStats(rows, { sampleLimit: 0, sampleSeed: seed });
  const invalidInspections = rows.map((row) => row.validity).filter((entry) => !entry.valid);
  aggregate.invalid = invalidInspections.length;
  aggregate.invalidReasons = invalidReasonCounts(invalidInspections);
  return {
    schema: 1,
    benchmark: SPECIALIST_BENCHMARK_ID,
    frozen: true,
    baselineDeckId,
    deckIds: ids,
    gamesPerDeck,
    thresholds: { ...SPECIALIST_THRESHOLDS, minimumGames: Math.max(100, Number(minimumGames) || 100) },
    passed: Object.values(perDeck).every((entry) => entry.passed),
    target400Passed: Object.values(perDeck).every((entry) => entry.target400Passed),
    perDeck,
    ...aggregate,
  };
}

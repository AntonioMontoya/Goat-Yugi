import { StrategicBot } from "../bots/strategic.js";
import { SPECIALIST_PERSONAS } from "../bots/specialists.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { FrozenIa100BenchmarkBot } from "./frozen-ia100-benchmark.js";
import { inspectOcgcoreRun, invalidReasonCounts } from "./ocgcore-run-validity.js";

function names(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }

export async function trainStrategicPolicy({ deckIds, games = 1000, seed = 3_000_000, workers = 6, personaId = "oracle", initialModel = null, onProgress = null } = {}) {
  const ids = [...new Set(deckIds ?? [])];
  if (!ids.length) throw new Error("trainStrategicPolicy necesita mazos.");
  const persona = SPECIALIST_PERSONAS.find((entry) => entry.id === personaId) ?? SPECIALIST_PERSONAS[0];
  const learner = new StrategicBot({ ...(initialModel ?? {}), id: `strategic-${persona.id}-policy`, botId: `strategic-${persona.id}-policy`, name: persona.name, deckId: ids[0], deck: getDeck(ids[0]), persona, training: true, seed, exploration: initialModel?.exploration ?? 0.12 });
  const total = Math.max(1, Number(games) || 1);
  const parallel = Math.max(1, Math.min(6, Number(workers) || 1));
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let invalid = 0;
  const invalidInspections = [];
  for (let cursor = 0; cursor < total; cursor += parallel) {
    const indexes = Array.from({ length: Math.min(parallel, total - cursor) }, (_, offset) => cursor + offset);
    const snapshot = learner.manifest();
    const batch = await Promise.all(indexes.map(async (index) => {
      const deckId = ids[index % ids.length];
      const deck = getDeck(deckId);
      const baselineDeck = deck;
      const gameSeed = seed + index;
      const candidate = new StrategicBot({ ...snapshot, id: snapshot.id, botId: snapshot.botId, deckId, profile: deckId, deck, persona, training: true, seed: gameSeed ^ 0x9e3779b9, exploration: Math.max(0.025, 0.12 * Math.pow(0.999, index)) });
      const rival = new FrozenIa100BenchmarkBot({ deckId, deck: baselineDeck, seed: gameSeed ^ 0x6d2b79f5 });
      const result = await runOcgcoreHeadless({ decks: [names(deck.main), names(baselineDeck.main)], extraDecks: [names(deck.fusion), names(baselineDeck.fusion)], seed: gameSeed, startingPlayer: index % 2, maxSteps: 5000, botA: candidate, botB: rival, profileA: deckId, profileB: deckId });
      return { result, episode: candidate.consumeEpisode(), validity: inspectOcgcoreRun(result) };
    }));
    for (const game of batch) {
      const reward = !game.validity.valid ? -1 : game.result.winner === 0 ? 1 : game.result.winner === 1 ? -1 : 0;
      learner.learnFromEpisode(game.episode, reward);
      if (!game.validity.valid) {
        invalid += 1;
        invalidInspections.push(game.validity);
      } else if (game.result.winner === 0) wins += 1;
      else if (game.result.winner === 1) losses += 1;
      else draws += 1;
    }
    onProgress?.({ completed: Math.min(total, cursor + batch.length), total, wins, losses, draws, winRate: wins / Math.min(total, cursor + batch.length), invalid, invalidReasons: invalidReasonCounts(invalidInspections) });
  }
  learner.training = false;
  return { model: learner.manifest(), games: total, wins, losses, draws, winRate: wins / total, validWinRate: wins / Math.max(1, wins + losses + draws), invalid, invalidReasons: invalidReasonCounts(invalidInspections) };
}

import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { CoreHeuristicBot, hydrateCoreBot } from "../bots/ocgcore.js";
import { updateTechnicalRating, updateUncertainty } from "../ranking/ladder.js";
import { createModelManifest } from "../persistence/model-registry.js";

function cardNames(ids) { return ids.map((id) => getCard(id)?.name ?? String(id)); }

function makeEntry(entry, index) {
  const bot = entry.bot ? hydrateCoreBot(entry.bot) : new CoreHeuristicBot({
    id: entry.id ?? `league-${index}`,
    name: entry.name ?? `League ${index + 1}`,
    profile: entry.profile ?? entry.deckId ?? "generic",
    version: entry.version ?? 1,
    difficulty: entry.difficulty ?? "normal",
    brave: entry.brave,
    weights: entry.weights,
  });
  const deckId = entry.deckId ?? bot.profile ?? "chaos-turbo";
  return {
    id: entry.id ?? bot.id,
    name: entry.name ?? bot.name,
    deckId,
    bot,
    rating: Number(entry.rating) || 1200,
    uncertainty: Number(entry.uncertainty) || 350,
    wins: 0,
    losses: 0,
    draws: 0,
    model: null,
  };
}

function resultFor(winner, playerIndex) {
  if (winner === null || winner === undefined) return "draw";
  return winner === playerIndex ? "win" : "loss";
}

function updateEntry(entry, opponent, result) {
  const before = entry.rating;
  const update = updateTechnicalRating(entry.rating, opponent.rating, result, { k: 20 });
  entry.rating = update.ratingA;
  entry.uncertainty = updateUncertainty(entry.uncertainty, { decisive: result !== "draw" });
  if (result === "win") entry.wins += 1;
  else if (result === "loss") entry.losses += 1;
  else entry.draws += 1;
  return { before, after: entry.rating, delta: entry.rating - before };
}

async function playMatch(a, b, { seed, maxSteps, gameIndex }) {
  const deckA = getDeck(a.deckId);
  const deckB = getDeck(b.deckId);
  const result = await runOcgcoreHeadless({
    decks: [cardNames(deckA.main), cardNames(deckB.main)],
    extraDecks: [cardNames(deckA.fusion), cardNames(deckB.fusion)],
    seed,
    startingPlayer: gameIndex % 2,
    maxSteps,
    botA: a.bot,
    botB: b.bot,
    profileA: a.deckId,
    profileB: b.deckId,
  });
  return { result, replay: result.replay };
}

/**
 * Runs an actual local self-play league. It is deliberately model-agnostic:
 * the current candidate is the real profiled bot, while the league provides
 * versioned opponents, Elo/uncertainty and promotion evidence.
 */
export async function runSelfPlayLeague({ candidates = [], rounds = 1, gamesPerPair = 1, seed = 12000, maxSteps = 5000 } = {}) {
  const defaults = candidates.length ? candidates : [
    { id: "league-chaos-v1", name: "Chaos v1", deckId: "chaos-turbo", profile: "chaos-turbo", version: 1 },
    { id: "league-goat-v1", name: "Goat v1", deckId: "goat-control", profile: "goat-control", version: 1 },
    { id: "league-warrior-v1", name: "Warrior v1", deckId: "warrior", profile: "warrior", version: 1 },
  ];
  const entries = defaults.map(makeEntry);
  const matches = [];
  let matchIndex = 0;
  for (let round = 0; round < Math.max(1, Number(rounds) || 1); round += 1) {
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        for (let game = 0; game < Math.max(1, Number(gamesPerPair) || 1); game += 1) {
          const a = entries[left];
          const b = entries[right];
          const played = await playMatch(a, b, { seed: seed + matchIndex, maxSteps, gameIndex: matchIndex });
          const resultA = resultFor(played.result.winner, 0);
          const resultB = resultFor(played.result.winner, 1);
          const ratingA = updateEntry(a, b, resultA);
          const ratingB = updateEntry(b, a, resultB);
          const errors = played.result.errors ?? [];
          matches.push({ round: round + 1, game: game + 1, seed: seed + matchIndex, a: a.id, b: b.id, resultA, winner: played.result.winner, terminationReason: played.result.terminationReason, decisions: played.result.decisions, errors, ratingA, ratingB });
          matchIndex += 1;
        }
      }
    }
  }
  for (const entry of entries) {
    entry.model = createModelManifest({
      bot: entry.bot.manifest(),
      deckId: entry.deckId,
      trainingPlan: { mode: "self-play-league", rounds, gamesPerPair, seed },
      trainingStats: { games: entry.wins + entry.losses + entry.draws, wins: entry.wins, losses: entry.losses, draws: entry.draws },
      evaluation: {},
    });
  }
  const failures = matches.filter((match) => match.errors.length || ["CORE_ERROR", "INVALID_ACTION", "RETRY_LIMIT"].includes(match.terminationReason));
  const standings = entries.map(({ bot, model, ...entry }) => ({ ...entry, bot: bot.manifest(), modelId: model.id })).sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  return { command: "bots:league", engine: "ocgcore", candidates: standings, matches, failures, passed: failures.length === 0 };
}

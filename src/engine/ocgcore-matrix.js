import { getCard } from "./cards.js";
import { runOcgcoreHeadless } from "./ocgcore-backend.js";
import { getDeck } from "../decks/decks.js";
import { CoreHeuristicBot } from "../bots/ocgcore.js";

function cardNames(ids) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

/**
 * Runs a bounded pairwise compatibility matrix through independent OCGCore
 * sessions. It is intentionally deterministic and records every core error so
 * a deck interaction cannot be mistaken for a successful smoke.
 */
export async function runOcgcoreMatrix({ deckIds = [], gamesPerPair = 1, seed = 40000, maxSteps = 5000 } = {}) {
  const ids = [...new Set(deckIds)].filter(Boolean);
  const rows = [];
  let index = 0;
  for (const deckAId of ids) {
    for (const deckBId of ids) {
      for (let game = 0; game < Math.max(1, Number(gamesPerPair) || 1); game += 1) {
        const deckA = getDeck(deckAId);
        const deckB = getDeck(deckBId);
        const result = await runOcgcoreHeadless({
          decks: [cardNames(deckA.main), cardNames(deckB.main)],
          extraDecks: [cardNames(deckA.fusion), cardNames(deckB.fusion)],
          seed: seed + index,
          startingPlayer: index % 2,
          maxSteps,
          botA: new CoreHeuristicBot({ id: `matrix-a-${index}`, name: `Matrix A ${deckAId}`, profile: deckAId }),
          botB: new CoreHeuristicBot({ id: `matrix-b-${index}`, name: `Matrix B ${deckBId}`, profile: deckBId }),
          profileA: deckAId,
          profileB: deckBId,
          includeEvents: true,
        });
        rows.push({ deckAId, deckBId, game: game + 1, seed: seed + index, winner: result.winner, terminationReason: result.terminationReason, decisions: result.decisions, errors: result.errors, retryLog: result.retryLog });
        index += 1;
      }
    }
  }
  const failures = rows.filter((row) => row.errors.length || ["CORE_ERROR", "INVALID_ACTION", "RETRY_LIMIT"].includes(row.terminationReason));
  const decisionLimits = rows.filter((row) => row.terminationReason === "DECISION_LIMIT").length;
  return { command: "duel:matrix", engine: "ocgcore", decks: ids, games: rows.length, rows, decisionLimits, completedGames: rows.length - decisionLimits, retries: rows.reduce((sum, row) => sum + row.retryLog.length, 0), failures, passed: failures.length === 0 };
}

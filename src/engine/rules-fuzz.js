import { createDuel, legalActions, observe, step } from "./game.js";
import { SeededRng, hashString } from "./rng.js";
import { getDeck } from "../decks/decks.js";

function invariantFailures(state) {
  const failures = [];
  if (state.players.some((player) => player.lp < 0)) failures.push("negative_lp");
  if (state.players.some((player) => player.monsterZone.length !== 5 || player.spellTrapZone.length !== 5)) failures.push("zone_shape");
  const instances = state.players.flatMap((player) => [player.deck, player.hand, player.grave, player.banished, player.monsterZone, player.spellTrapZone].flat()).filter(Boolean);
  const ids = instances.map((instance) => instance.uid);
  if (new Set(ids).size !== ids.length) failures.push("duplicate_uid");
  if (state.winner !== null && ![0, 1].includes(state.winner)) failures.push("invalid_winner");
  return failures;
}

function randomDeck(id) {
  const deck = getDeck(id);
  return { main: [...deck.main], fusion: [...deck.fusion] };
}

function playFuzzGame({ seed, deckAId, deckBId, maxDecisions }) {
  const state = createDuel(randomDeck(deckAId).main, randomDeck(deckBId).main, { seed, maxDecisions });
  const rng = new SeededRng(seed ^ 0x9e3779b9);
  const trace = [];
  const failures = [];
  while (state.winner === null && state.terminationReason === null) {
    const actor = state.priorityPlayer;
    const legal = legalActions(state, actor);
    const actions = legal.filter((action) => action.type !== "SURRENDER");
    const usableActions = actions.length ? actions : legal;
    if (!usableActions.length) break;
    const action = usableActions[rng.integer(usableActions.length)];
    trace.push({ actor, action });
    try { step(state, action); }
    catch (error) { failures.push({ type: "step", message: error.message, action }); break; }
    failures.push(...invariantFailures(state).map((type) => ({ type })));
    if (failures.length) break;
  }
  return { state, trace, failures, hash: hashString(JSON.stringify({ seed, trace, winner: state.winner, termination: state.terminationReason })) };
}

export function runRulesFuzz({ games = 100, seed = 9000, deckIds = ["chaos-turbo", "goat-control", "warrior", "panda-burn"], maxDecisions = 2500 } = {}) {
  const rows = [];
  const failures = [];
  const deterministicFailures = [];
  for (let index = 0; index < Math.max(0, Number(games) || 0); index += 1) {
    const deckAId = deckIds[index % deckIds.length];
    const deckBId = deckIds[(index + 1) % deckIds.length];
    const gameSeed = seed + index;
    const first = playFuzzGame({ seed: gameSeed, deckAId, deckBId, maxDecisions });
    const second = playFuzzGame({ seed: gameSeed, deckAId, deckBId, maxDecisions });
    if (first.hash !== second.hash) deterministicFailures.push({ index, seed: gameSeed, first: first.hash, second: second.hash });
    if (first.failures.length) failures.push({ index, seed: gameSeed, deckAId, deckBId, failures: first.failures });
    rows.push({ index, seed: gameSeed, deckAId, deckBId, winner: first.state.winner, terminationReason: first.state.terminationReason, decisions: first.state.decisionCount, traceHash: first.hash });
  }
  return { command: "rules:fuzz", games: rows.length, rows, failures, deterministicFailures, passed: failures.length === 0 && deterministicFailures.length === 0 };
}

export function hiddenInformationFuzzCheck({ seed = 9001 } = {}) {
  const state = createDuel(randomDeck("chaos-turbo").main, randomDeck("goat-control").main, { seed });
  const playerZero = observe(state, 0);
  const playerOne = observe(state, 1);
  const leakedHand = playerZero.players[1].hand.some((card) => card.cardId !== null) || playerOne.players[0].hand.some((card) => card.cardId !== null);
  return { passed: !leakedHand, leakedHand };
}

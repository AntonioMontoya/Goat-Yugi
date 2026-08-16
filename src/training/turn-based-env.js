import { createDuel, legalActions, observe, step as engineStep } from "../engine/game.js";
import { getDeck } from "../decks/decks.js";

function deckMain(deckId) { return [...getDeck(deckId).main]; }

function actionKey(action) {
  return JSON.stringify(action, Object.keys(action).sort());
}

/**
 * Small PettingZoo/OpenSpiel-shaped adapter without importing either package.
 * It exposes turn-based observations and an action mask while keeping the
 * existing authoritative TypeScript engine as the transition function.
 */
export function createTurnBasedGoatEnv({ deckAId = "chaos-turbo", deckBId = "goat-control", seed = 1, maxDecisions = 2500 } = {}) {
  let state = null;
  let actionMap = new Map();
  const agents = ["player_0", "player_1"];

  function refreshActions() {
    const actor = state?.priorityPlayer ?? 0;
    const actions = state ? legalActions(state, actor) : [];
    actionMap = new Map(actions.map((action, index) => [index, action]));
    return actions;
  }

  function observations() {
    return Object.fromEntries(agents.map((agent, player) => [agent, state ? observe(state, player) : null]));
  }

  function reset(nextSeed = seed) {
    state = createDuel(deckMain(deckAId), deckMain(deckBId), { seed: nextSeed, maxDecisions });
    refreshActions();
    return { observations: observations(), infos: { player_0: {}, player_1: {} }, activeAgent: agents[state.priorityPlayer] };
  }

  function actionMask() {
    const actions = refreshActions();
    return actions.map(() => 1);
  }

  function availableActions() {
    return [...actionMap.entries()].map(([index, action]) => ({ index, action: structuredClone(action), key: actionKey(action) }));
  }

  function transition(actionIndex) {
    if (!state) reset();
    const actor = state.priorityPlayer;
    const action = actionMap.get(Number(actionIndex));
    if (!action) throw new Error(`Acción fuera de la máscara: ${actionIndex}`);
    engineStep(state, action);
    refreshActions();
    const done = state.winner !== null || state.terminationReason !== null;
    const rewards = { player_0: 0, player_1: 0 };
    if (done && state.winner !== null) { rewards.player_0 = state.winner === 0 ? 1 : -1; rewards.player_1 = -rewards.player_0; }
    return { observations: observations(), rewards, terminations: { player_0: done, player_1: done }, truncations: { player_0: false, player_1: false }, infos: { actor: agents[actor], action: structuredClone(action), terminationReason: state.terminationReason }, activeAgent: done ? null : agents[state.priorityPlayer] };
  }

  return {
    agents,
    reset,
    step: transition,
    observe: (agent = agents[state?.priorityPlayer ?? 0]) => state ? observe(state, agents.indexOf(agent)) : null,
    actionMask,
    availableActions,
    get state() { return state; },
  };
}

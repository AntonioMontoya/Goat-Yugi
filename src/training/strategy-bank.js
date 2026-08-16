import { OcgMessageType, OcgResponseType, SelectBattleCMDAction, SelectIdleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { getCardByName } from "../engine/cards.js";
import { buildDeckKnowledge } from "../bots/deck-strategy.js";

function code(name) { return Number(getCardByName(name)?.authoritative?.runtimeCode ?? 0); }
function card(name, extra = {}) { return { code: code(name), name, ...extra }; }
function idle({ activates = [], summons = [], monster_sets = [], spell_sets = [], to_bp = true, to_ep = true } = {}) { return { type: OcgMessageType.SELECT_IDLECMD, player: 0, activates, summons, monster_sets, spell_sets, to_bp, to_ep, forced: false }; }
function battle(attacks = [], { to_m2 = true, to_ep = true } = {}) { return { type: OcgMessageType.SELECT_BATTLECMD, player: 0, attacks, to_m2, to_ep, forced: false }; }
function selectCards(selects = [], { min = 1, max = min } = {}) { return { type: OcgMessageType.SELECT_CARD, player: 0, selects, min, max, forced: true }; }
function chain(selects = [], { forced = false } = {}) { return { type: OcgMessageType.SELECT_CHAIN, player: 0, selects, forced }; }
function effect(name, type = OcgMessageType.SELECT_EFFECTYN) { return { type, player: 0, code: code(name), forced: true }; }
function expected(action, index = null) { return { type: OcgResponseType.SELECT_IDLECMD, action, index }; }
function matches(response, target) {
  if (response?.type !== target.type || response?.action !== target.action) return false;
  if (target.index !== undefined && response?.index !== target.index) return false;
  if (target.yes !== undefined && response?.yes !== target.yes) return false;
  if (target.indicies && JSON.stringify(response?.indicies ?? []) !== JSON.stringify(target.indicies)) return false;
  return true;
}

export const STRATEGY_SCENARIO_BANK = Object.freeze([
  { id: "chaos-opening-draw", deckId: "chaos-turbo", kind: "opening-engine", weight: 2, message: idle({ activates: [card("Pot of Greed")], summons: [card("Gemini Elf")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "chaos-opening-thunder", deckId: "chaos-turbo", kind: "opening-search", weight: 2, message: idle({ activates: [card("Thunder Dragon")], summons: [card("Gemini Elf")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "chaos-summon-boss", deckId: "chaos-turbo", kind: "chaos-threshold", weight: 3, message: idle({ summons: [card("Black Luster Soldier - Envoy of the Beginning"), card("Gemini Elf")] }), observation: { turn: 5, ownLp: 8000, opponentLp: 4000, handSize: 4, ownBoardPower: 1600, opponentThreat: 1500, chaosReady: true }, expected: expected(SelectIdleCMDAction.SELECT_SUMMON, 0) },
  { id: "chaos-preserve-boss", deckId: "chaos-turbo", kind: "protect-boss", message: idle({ activates: [card("Book of Moon")], summons: [card("Black Luster Soldier - Envoy of the Beginning")] }), observation: { turn: 2, ownLp: 8000, opponentLp: 8000, handSize: 3, chaosReady: false }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "goat-set-defense", deckId: "goat-control", kind: "set-interaction", weight: 2, message: idle({ spell_sets: [card("Scapegoat"), card("Mirror Force")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_SPELL_SET, 1) },
  { id: "goat-preserve-goat", deckId: "goat-control", kind: "goat-defense", message: idle({ activates: [card("Scapegoat")], summons: [card("Breaker the Magical Warrior")] }), observation: { turn: 2, ownLp: 8000, opponentLp: 8000, handSize: 4, opponentThreat: 1900 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "warrior-search", deckId: "warrior", kind: "rota-target", weight: 3, message: idle({ activates: [card("Reinforcement of the Army")], summons: [card("D.D. Warrior Lady")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "warrior-pressure", deckId: "warrior", kind: "first-pressure", message: battle([card("D.D. Warrior Lady", { attack: 1500, target: null })]), observation: { turn: 2, ownLp: 8000, opponentLp: 8000, handSize: 4, ownBoardPower: 1500, opponentThreat: 0 }, expected: { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index: 0 } },
  { id: "control-save-book", deckId: "goat-control", kind: "protect-resource", message: idle({ activates: [card("Book of Moon")], to_bp: true }), observation: { turn: 4, ownLp: 2200, opponentLp: 8000, handSize: 3, opponentThreat: 3000 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "flip-set-value", deckId: "flip-control", kind: "set-value", message: idle({ monster_sets: [card("Magician of Faith"), card("Spirit Reaper")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_MONSTER_SET, 0) },
  { id: "combo-open-reasoning", deckId: "reasoning-gate", kind: "combo-piece", weight: 2, message: idle({ activates: [card("Reasoning")], summons: [card("Gemini Elf")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "combo-protect-piece", deckId: "reasoning-gate", kind: "protect-combo", message: idle({ activates: [card("Book of Moon")], summons: [card("Breaker the Magical Warrior")] }), observation: { turn: 3, ownLp: 8000, opponentLp: 8000, handSize: 3, opponentThreat: 1800 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "burn-preserve-engine", deckId: "panda-burn", kind: "burn-engine", message: idle({ activates: [card("Pot of Greed")], spell_sets: [card("Scapegoat")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "empty-jar-draw", deckId: "empty-jar", kind: "jar-setup", message: idle({ activates: [card("Pot of Greed")], monster_sets: [card("Magician of Faith")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_ACTIVATE, 0) },
  { id: "recruiter-search", deckId: "chaos-recruiter", kind: "recruiter-line", message: idle({ summons: [card("Mystic Tomato"), card("Gemini Elf")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_SUMMON, 0) },
  { id: "earth-open-threat", deckId: "earth-aggro", kind: "aggressive-summon", message: idle({ summons: [card("Gemini Elf")], monster_sets: [card("D.D. Warrior Lady")] }), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.SELECT_SUMMON, 0) },
  { id: "chaos-search-target", deckId: "chaos-turbo", kind: "search-target", weight: 2, message: selectCards([card("Gemini Elf"), card("Thunder Dragon")]), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 4 }, expected: { type: OcgResponseType.SELECT_CARD, indicies: [1] } },
  { id: "chaos-chain-defense", deckId: "chaos-turbo", kind: "protect-boss", message: chain([card("Mirror Force"), card("Book of Moon")]), observation: { turn: 5, ownLp: 2800, opponentLp: 6500, handSize: 3, opponentThreat: 2500 }, expected: { type: OcgResponseType.SELECT_CHAIN, index: 0 } },
  { id: "goat-effect-defense", deckId: "goat-control", kind: "goat-defense", message: effect("Scapegoat"), observation: { turn: 4, ownLp: 2200, opponentLp: 7000, handSize: 3, opponentThreat: 3000 }, expected: { type: OcgResponseType.SELECT_EFFECTYN, yes: true } },
  { id: "warrior-search-target", deckId: "warrior", kind: "search-target", message: selectCards([card("Gemini Elf"), card("D.D. Warrior Lady")]), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 4 }, expected: { type: OcgResponseType.SELECT_CARD, indicies: [1] } },
  { id: "flip-recovery-target", deckId: "flip-control", kind: "flip-recovery", message: selectCards([card("Gemini Elf"), card("Magician of Faith")]), observation: { turn: 5, ownLp: 5000, opponentLp: 6500, handSize: 3 }, expected: { type: OcgResponseType.SELECT_CARD, indicies: [1] } },
]);

function generatedStrategyBank(deckId, knowledge) {
  const scenarios = [];
  const add = (id, kind, selected, action, zone, observation = {}) => {
    if (!selected) return;
    const message = idle({ [zone]: [selected] });
    scenarios.push({ id: `${deckId}-${id}`, deckId, kind, weight: 1, message, observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5, ...observation }, expected: expected(action, 0) });
  };
  const cards = knowledge?.cards ?? [];
  const engine = cards.find((candidate) => candidate.roles.some((role) => ["draw", "search", "engine", "combo"].includes(role)) && candidate.runtimeCode);
  const threat = cards.find((candidate) => candidate.roles.some((role) => ["boss", "threat"].includes(role)) && candidate.kind === "MONSTER" && candidate.runtimeCode);
  const defense = cards.find((candidate) => candidate.roles.some((role) => ["defense", "stall", "flip"].includes(role)) && candidate.runtimeCode);
  const interaction = cards.find((candidate) => candidate.roles.includes("interaction") && candidate.runtimeCode);
  if (engine) {
    const engineAction = engine.kind === "MONSTER" ? SelectIdleCMDAction.SELECT_SUMMON : SelectIdleCMDAction.SELECT_ACTIVATE;
    const engineZone = engine.kind === "MONSTER" ? "summons" : "activates";
    add("opening-engine", "opening-engine", card(engine.name, { code: engine.runtimeCode }), engineAction, engineZone);
  }
  if (threat) add("establish-threat", "threat", card(threat.name, { code: threat.runtimeCode }), SelectIdleCMDAction.SELECT_SUMMON, "summons", { turn: 3, handSize: 3 });
  if (defense) add("set-defense", "defense", card(defense.name, { code: defense.runtimeCode }), defense.kind === "MONSTER" ? SelectIdleCMDAction.SELECT_MONSTER_SET : SelectIdleCMDAction.SELECT_SPELL_SET, defense.kind === "MONSTER" ? "monster_sets" : "spell_sets", { turn: 2, opponentThreat: 2500, ownLp: 3200 });
  if (interaction) add("use-interaction", "interaction", card(interaction.name, { code: interaction.runtimeCode }), SelectIdleCMDAction.SELECT_ACTIVATE, "activates", { turn: 4, opponentThreat: 2500 });
  if (!scenarios.length) scenarios.push({ id: `${deckId}-safe-pass`, deckId, kind: "safe-pass", weight: 1, message: idle(), observation: { turn: 1, ownLp: 8000, opponentLp: 8000, handSize: 5 }, expected: expected(SelectIdleCMDAction.TO_BP, null) });
  return scenarios;
}

export function strategyBankForDeck(deckId, { deck = null, knowledge = null } = {}) {
  const explicit = STRATEGY_SCENARIO_BANK.filter((scenario) => scenario.deckId === deckId);
  return explicit.length ? explicit : generatedStrategyBank(deckId, knowledge ?? buildDeckKnowledge(deckId, deck));
}

export function evaluateStrategyBank(bot, { scenarios = STRATEGY_SCENARIO_BANK } = {}) {
  const selected = scenarios === STRATEGY_SCENARIO_BANK && bot?.deckId && bot.deckId !== "generic" ? strategyBankForDeck(bot.deckId, { knowledge: bot.deckKnowledge }) : scenarios;
  const results = selected.map((scenario) => {
    const response = bot.chooseResponse(scenario.message, { profile: scenario.deckId, observation: scenario.observation, brave: true });
    bot.consumeEpisode?.();
    return { id: scenario.id, deckId: scenario.deckId, kind: scenario.kind, passed: matches(response, scenario.expected), expected: scenario.expected, response, weight: scenario.weight ?? 1 };
  });
  const weightedTotal = results.reduce((sum, result) => sum + result.weight, 0);
  const weightedPassed = results.reduce((sum, result) => sum + (result.passed ? result.weight : 0), 0);
  const byDeck = {};
  for (const result of results) {
    const group = byDeck[result.deckId] ??= { scenarios: 0, passed: 0, score: 0 };
    group.scenarios += 1;
    group.passed += result.passed ? 1 : 0;
    group.score += result.passed ? result.weight : 0;
  }
  return { scenarios: results.length, passed: results.filter((result) => result.passed).length, score: weightedTotal ? weightedPassed / weightedTotal : 0, byDeck, failures: results.filter((result) => !result.passed), results };
}

export function strategyBankManifest() {
  return { schema: 1, id: "goat-strategy-bank-v1", scenarios: STRATEGY_SCENARIO_BANK.length, decks: [...new Set(STRATEGY_SCENARIO_BANK.map((scenario) => scenario.deckId))], kinds: [...new Set(STRATEGY_SCENARIO_BANK.map((scenario) => scenario.kind))] };
}

export { buildDeckKnowledge };

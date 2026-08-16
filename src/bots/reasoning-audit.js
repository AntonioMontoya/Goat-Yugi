import { CARDS } from "../engine/cards.js";
import { CoreHeuristicBot } from "./ocgcore.js";
import { LearnedPolicyBot } from "./learned-policy.js";
import { StrategicBot } from "./strategic.js";
import { OcgLocation, OcgMessageType, OcgPosition, SelectIdleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";

function runtimeCode(card) { return Number(card?.authoritative?.runtimeCode ?? card?.runtimeCode ?? 0); }
function idleMessage(overrides = {}) {
  return { type: OcgMessageType.SELECT_IDLECMD, player: 0, activates: [], summons: [], special_summons: [], monster_sets: [], spell_sets: [], pos_changes: [], to_bp: false, to_ep: true, ...overrides };
}
function observation(overrides = {}) {
  return { player: 0, turn: 1, ownLp: 8000, opponentLp: 8000, ownMonsters: [], opponentMonsters: [], ownBackrow: [], opponentBackrow: [], ownBoardPower: 0, opponentThreat: 0, ...overrides };
}
function auditDeck() {
  const main = CARDS.filter((card) => runtimeCode(card) && card?.legalities?.goatFormat !== "FORBIDDEN").map((card) => Number(card.id));
  return { id: "semantic-reasoning-audit", name: "Semantic reasoning audit", archetype: "Generic", main, fusion: [], side: [] };
}
function cloneForAudit(candidate) {
  const manifest = candidate?.manifest ? candidate.manifest() : structuredClone(candidate ?? {});
  const common = { ...manifest, id: "semantic-reasoning-audit", botId: "semantic-reasoning-audit", name: "Semantic reasoning audit", profile: "generic", deckId: "semantic-reasoning-audit", deck: auditDeck(), strategy: null, certification: null, training: false, randomState: 1 };
  if (String(manifest.algorithm).includes("monte-carlo-policy-gradient")) return new LearnedPolicyBot(common);
  if (String(manifest.algorithm).includes("public-strategic")) return new StrategicBot(common);
  if (String(manifest.algorithm).includes("heuristic")) return new CoreHeuristicBot(common);
  return null;
}
function choose(bot, message, state) { return bot.chooseResponse(message, { brave: true, observation: state }); }
function addSample(samples, category, card, passed, response) {
  samples.push({ category, semanticRoles: [...(card?.roles ?? [])], passed: passed === true, responseRole: response?.action ?? response?.indicies ?? null });
}

/**
 * Executes invariant decision checks selected by semantic card roles. Concrete
 * names and effect ids never participate in either sample selection or pass
 * criteria, so the audit measures general behaviour rather than memorised
 * combos.
 */
export function auditBotReasoning(candidate, { maximumPerCategory = 6 } = {}) {
  const bot = cloneForAudit(candidate);
  if (!bot) return { schema: 1, passed: false, reason: "UNSUPPORTED_BOT_ALGORITHM", score: 0, samples: 0, categories: {}, failures: [] };
  const cards = bot.deckKnowledge.cards.filter((card) => card.runtimeCode);
  const samples = [];

  const flips = cards.filter((card) => card.kind === "MONSTER" && card.level <= 4 && card.roles.includes("flip")).slice(0, maximumPerCategory);
  for (const card of flips) {
    const entry = { code: card.runtimeCode };
    const response = choose(bot, idleMessage({ summons: [entry], monster_sets: [entry] }), observation());
    addSample(samples, "preserve-future-effect", card, response.action === SelectIdleCMDAction.SELECT_MONSTER_SET, response);
  }

  const attackers = cards.filter((card) => card.kind === "MONSTER" && card.level <= 4 && card.atk >= 1700 && card.atk > card.def && !card.roles.includes("flip")).slice(0, maximumPerCategory);
  for (const card of attackers) {
    const entry = { code: card.runtimeCode };
    const response = choose(bot, idleMessage({ summons: [entry], monster_sets: [entry], to_bp: true }), observation());
    addSample(samples, "convert-visible-pressure", card, response.action === SelectIdleCMDAction.SELECT_SUMMON, response);
  }

  for (const card of attackers) {
    const entry = { code: card.runtimeCode, controller: 0, location: OcgLocation.MZONE, sequence: 0 };
    const state = observation({ ownMonsters: [{ runtimeCode: card.runtimeCode, controller: 0, location: OcgLocation.MZONE, sequence: 0, position: OcgPosition.FACEUP_ATTACK, attack: card.atk, defense: card.def }], ownBoardPower: card.atk });
    const response = choose(bot, idleMessage({ pos_changes: [entry], to_bp: true }), state);
    addSample(samples, "preserve-profitable-attack-position", card, response.action === SelectIdleCMDAction.TO_BP, response);
  }

  const defenders = cards.filter((card) => card.kind === "MONSTER" && card.level <= 4 && card.def >= 1800 && card.def >= card.atk + 600 && !card.roles.includes("flip")).slice(0, maximumPerCategory);
  for (const card of defenders) {
    const entry = { code: card.runtimeCode };
    const state = observation({ opponentMonsters: [{ runtimeCode: attackers[0]?.runtimeCode, position: OcgPosition.FACEUP_ATTACK, attack: 1900 }], opponentThreat: 1900 });
    const response = choose(bot, idleMessage({ summons: [entry], monster_sets: [entry] }), state);
    addSample(samples, "protect-under-pressure", card, response.action === SelectIdleCMDAction.SELECT_MONSTER_SET, response);
  }

  const advantages = cards.filter((card) => card.kind !== "MONSTER" && (card.roles.includes("draw") || card.roles.includes("search"))).slice(0, maximumPerCategory);
  for (const card of advantages) {
    const response = choose(bot, idleMessage({ activates: [{ code: card.runtimeCode }] }), observation());
    addSample(samples, "take-resource-advantage", card, response.action === SelectIdleCMDAction.SELECT_ACTIVATE, response);
  }

  const positionTools = cards.filter((card) => card.kind !== "MONSTER" && card.roles.includes("position")).slice(0, maximumPerCategory);
  for (const card of positionTools) {
    const entry = { code: card.runtimeCode };
    const response = choose(bot, idleMessage({ activates: [entry], spell_sets: [entry] }), observation());
    addSample(samples, "avoid-empty-interaction", card, response.action !== SelectIdleCMDAction.SELECT_ACTIVATE, response);
  }

  const nonReactiveSpells = cards.filter((card) => card.kind === "SPELL" && !card.roles.includes("reactive") && !card.roles.includes("defense")).slice(0, maximumPerCategory);
  for (const card of nonReactiveSpells) {
    const response = choose(bot, idleMessage({ spell_sets: [{ code: card.runtimeCode }] }), observation());
    addSample(samples, "keep-non-reactive-options-available", card, response.action !== SelectIdleCMDAction.SELECT_SPELL_SET, response);
  }

  const discardSource = cards.find((card) => card.roles.includes("draw") && card.roles.includes("grave-setup"));
  const lowValue = attackers.at(-1);
  const highValue = advantages[0];
  if (discardSource && lowValue && highValue) {
    choose(bot, idleMessage({ activates: [{ code: discardSource.runtimeCode }] }), observation({ decisions: 1 }));
    const response = choose(bot, { type: OcgMessageType.SELECT_CARD, player: 0, min: 1, max: 1, selects: [{ code: lowValue.runtimeCode, controller: 0, location: OcgLocation.HAND }, { code: highValue.runtimeCode, controller: 0, location: OcgLocation.HAND }] }, observation({ decisions: 2, ownHand: [{ runtimeCode: lowValue.runtimeCode }, { runtimeCode: highValue.runtimeCode }] }));
    addSample(samples, "discard-lowest-future-value", discardSource, response.indicies?.[0] === 0, response);
  }

  const source = positionTools[0];
  const own = attackers[0];
  const opponent = attackers.find((card) => card.runtimeCode !== own?.runtimeCode) ?? defenders[0];
  if (source && own && opponent) {
    const entry = { code: own.runtimeCode };
    choose(bot, idleMessage({ summons: [entry] }), observation({ turn: 2 }));
    const state = observation({ turn: 2, ownMonsters: [{ runtimeCode: own.runtimeCode, position: OcgPosition.FACEUP_ATTACK, attack: own.atk }], opponentMonsters: [{ runtimeCode: opponent.runtimeCode, position: OcgPosition.FACEUP_ATTACK, attack: opponent.atk }], ownBoardPower: own.atk, opponentThreat: opponent.atk });
    const response = choose(bot, { type: OcgMessageType.SELECT_CARD, player: 0, code: source.runtimeCode, min: 1, max: 1, selects: [{ code: own.runtimeCode, controller: 0 }, { code: opponent.runtimeCode, controller: 1 }] }, state);
    addSample(samples, "do-not-repair-own-mistake", source, response.indicies?.length === 1 && response.indicies[0] === 1, response);
  }

  const passedCount = samples.filter((sample) => sample.passed).length;
  const categories = {};
  for (const sample of samples) {
    const row = categories[sample.category] ?? { passed: 0, samples: 0 };
    row.samples += 1;
    if (sample.passed) row.passed += 1;
    categories[sample.category] = row;
  }
  const score = samples.length ? passedCount / samples.length : 0;
  return { schema: 1, passed: samples.length >= 8 && score >= 0.8, reason: samples.length < 8 ? "INSUFFICIENT_REASONING_SAMPLES" : score < 0.8 ? "REASONING_SCORE_TOO_LOW" : "PASSED", score, passedSamples: passedCount, samples: samples.length, categories, failures: samples.filter((sample) => !sample.passed).slice(0, 12) };
}

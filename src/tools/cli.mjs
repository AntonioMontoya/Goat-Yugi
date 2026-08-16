import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { CARDS, cardDatabaseHash, getCard, getCardByName, GOAT_CARD_POOL_SOURCE } from "../engine/cards.js";
import { OCGCORE_ASSET_SOURCE, OCGCORE_CARD_ENTRIES, OCGCORE_MISSING_CARDS, OCGCORE_MISSING_SCRIPTS } from "../data/ocgcore-assets.js";
import { createDuel, legalActions, observe, runDuel, step } from "../engine/game.js";
import { runScenario } from "../engine/scenarios.js";
import { DECK_PRESETS, getDeck, validateDeck } from "../decks/decks.js";
import { HeuristicBot } from "../bots/heuristic.js";
import { CoreHeuristicBot, hydrateCoreBot } from "../bots/ocgcore.js";
import { BOT_DIFFICULTIES, botDescriptor, createBotForDeck, createBotRegistry, listBotSpecs } from "../bots/bot-system.js";
import { LegalRandomBot } from "../bots/random.js";
import { LearnedPolicyBot, hydrateLearnedPolicy } from "../bots/learned-policy.js";
import { duelStats, evaluateBot, evaluateCoreCandidate, evaluateLearnedPolicy, hydrateAdaptiveBot, runBatch, runCoreBatch, trainCandidate, trainCoreCandidate, trainLearnedPolicy } from "../training/training.js";
import { decodeDuelPack, encodeDuelPack, exportPackJson, inspectDuelPack } from "../storage/duelpack.js";
import { applyLadderResult, initialLadder, ladderView } from "../ranking/ladder.js";
import { GOAT_BANLIST_IDS } from "../format/banlist.js";
import { cleanRun, createRunLayout, readCheckpoint, readRunGames, readRunManifest, verifyRun, writeCheckpoint, writeDuelChunk, writeRunManifest } from "../persistence/file-store.mjs";
import { verifyModelManifest } from "../persistence/model-registry.js";
import { CARD_DATABASE_VERSION, ENGINE_VERSION, FORMAT_VERSION } from "../engine/constants.js";
import { replayOcgcore, runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { validateCardRuntime } from "../engine/card-runtime-contract.js";
import { auditAllCardEffects } from "../engine/card-effect-audit.js";
import { buildCardAuditManifest, buildCardAuditReport, selectCardAuditRecords } from "../engine/card-audit.js";
import { auditCardTextContracts } from "../engine/card-text-contract-audit.js";
import { runCardValidationSuite } from "../engine/card-validation-suite.js";
import { runHighRiskCardRegressions } from "../engine/card-regressions.js";
import { auditCardLuaSources } from "../engine/lua-static-audit.js";
import { runOcgcoreMatrix } from "../engine/ocgcore-matrix.js";
import { explainStats } from "../analytics/explainability.js";
import { hiddenInformationFuzzCheck, runRulesFuzz } from "../engine/rules-fuzz.js";
import { runSelfPlayLeague } from "../training/self-play-league.js";
import { createTurnBasedGoatEnv } from "../training/turn-based-env.js";
import { mergeResourceBudget } from "../training/resource-profiles.js";
import { trainMaskedPolicy } from "../training/masked-policy.js";
import { evolveLearnedPolicy } from "../training/bot-league.js";
import { certifyBotIntelligence } from "../training/intelligence-certification.js";
import { evaluateAgainstFrozenIa500 } from "../training/frozen-ia500-benchmark.js";
import { BOT_INTELLIGENCE_TIERS } from "../bots/intelligence.js";
import { confidenceInterval95 } from "../analytics/statistics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const command = args[0] ?? "help";

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function numberOption(name, fallback) { return Number(option(name, fallback)); }
function print(value) { console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2)); }
function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); return directory; }
function compactStats(stats) {
  const { samples: _samples, ...summary } = stats;
  return { ...summary, sampleCount: stats.samples?.length ?? 0 };
}

function mergeCountMaps(left = {}, right = {}) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
  return merged;
}

function mergeBuckets(left = {}, right = {}) {
  const merged = structuredClone(left);
  for (const [key, row] of Object.entries(right)) merged[key] = {
    games: (Number(merged[key]?.games) || 0) + (Number(row.games) || 0),
    wins: (Number(merged[key]?.wins) || 0) + (Number(row.wins) || 0),
    losses: (Number(merged[key]?.losses) || 0) + (Number(row.losses) || 0),
    draws: (Number(merged[key]?.draws) || 0) + (Number(row.draws) || 0),
  };
  return merged;
}

function mergeTrainingStats(left = {}, right = {}) {
  const games = (Number(left.games) || 0) + (Number(right.games) || 0);
  const wins = (Number(left.wins) || 0) + (Number(right.wins) || 0);
  const turns = (Number(left.turns) || (Number(left.averageTurns) || 0) * (Number(left.games) || 0)) + (Number(right.turns) || (Number(right.averageTurns) || 0) * (Number(right.games) || 0));
  const decisions = (Number(left.decisions) || 0) + (Number(right.decisions) || 0);
  return {
    games,
    wins,
    losses: (Number(left.losses) || 0) + (Number(right.losses) || 0),
    draws: (Number(left.draws) || 0) + (Number(right.draws) || 0),
    turns,
    decisions,
    invalid: (Number(left.invalid) || 0) + (Number(right.invalid) || 0),
    winRate: games ? wins / games : 0,
    confidence95: confidenceInterval95(wins, games),
    averageTurns: games ? turns / games : 0,
    averageDecisions: games ? decisions / games : 0,
    termination: mergeCountMaps(left.termination, right.termination),
    actionTypes: mergeCountMaps(left.actionTypes, right.actionTypes),
    errors: mergeCountMaps(left.errors, right.errors),
    byOpponent: mergeBuckets(left.byOpponent, right.byOpponent),
    byStartingPlayer: mergeBuckets(left.byStartingPlayer, right.byStartingPlayer),
    sampleCount: (Number(left.sampleCount) || 0) + (Number(right.sampleCount) || 0),
  };
}

function deckNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }

function storedBotSummary(bot = {}) {
  return {
    id: bot.id,
    botId: bot.botId ?? bot.id,
    name: bot.name,
    algorithm: bot.algorithm,
    profile: bot.profile,
    deckId: bot.deckId,
    style: bot.style,
    state: bot.state,
    version: bot.version,
    intelligence: bot.intelligence ?? 0,
    targetIntelligence: bot.targetIntelligence ?? 100,
    technicalRating: bot.technicalRating ?? 1200,
    episodes: bot.episodes ?? 0,
    decisions: bot.decisions ?? 0,
    featureCount: Object.keys(bot.featureWeights ?? bot.parameters ?? {}).length,
    strategyId: bot.strategy?.id ?? null,
    strategyDeckHash: bot.strategy?.deckHash ?? null,
  };
}

function trainingRoot() { return ensureDir(path.join(root, "artifacts", "training-runs")); }

function modelManifestFromFile(file) {
  if (!file) return null;
  const value = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
  return value?.candidate ?? value?.bot ?? value?.champion ?? value;
}

function validateCards() {
  const ids = new Set();
  const duplicates = [];
  for (const card of CARDS) { if (ids.has(card.id)) duplicates.push(card.id); ids.add(card.id); }
  const byStatus = {};
  const byKind = {};
  const effectFamilies = {};
  const authoritativeStatus = {};
  let authoritativeScriptCards = 0;
  let authoritativeCdbCards = 0;
  for (const card of CARDS) {
    byStatus[card.status] = (byStatus[card.status] ?? 0) + 1;
    byKind[card.kind] = (byKind[card.kind] ?? 0) + 1;
    effectFamilies[card.effectFamily] = (effectFamilies[card.effectFamily] ?? 0) + 1;
    authoritativeStatus[card.authoritativeStatus] = (authoritativeStatus[card.authoritativeStatus] ?? 0) + 1;
    if (card.authoritative?.scriptLoaded) authoritativeScriptCards += 1;
    if (card.effectSource === "ocgcore-cdb-normal") authoritativeCdbCards += 1;
  }
  return {
    databaseHash: cardDatabaseHash(),
    cards: CARDS.length,
    uniqueNames: new Set(CARDS.map((card) => card.name.toLowerCase())).size,
    duplicates,
    byKind,
    effectFamilies,
    descriptorStatus: byStatus,
    descriptorSupported: byStatus.SUPPORTED ?? 0,
    descriptorPartial: CARDS.filter((card) => card.status !== "SUPPORTED").length,
    source: GOAT_CARD_POOL_SOURCE,
    authoritativeOcgcore: {
      cards: OCGCORE_CARD_ENTRIES.length,
      missingCards: OCGCORE_MISSING_CARDS.length,
      historicalOverrides: OCGCORE_ASSET_SOURCE.historicalOverrides,
      executableEffectCards: OCGCORE_CARD_ENTRIES.filter((entry) => !OCGCORE_MISSING_SCRIPTS.includes(entry.script)).length,
      missingScriptCards: OCGCORE_MISSING_SCRIPTS.length,
      runtimeMappedCards: CARDS.filter((card) => card.authoritativeStatus === "SUPPORTED").length,
      runtimeScriptCards: authoritativeScriptCards,
      runtimeCdbNormalCards: authoritativeCdbCards,
      runtimeStatus: authoritativeStatus,
      missingScriptKinds: Object.fromEntries(OCGCORE_MISSING_SCRIPTS.map((script) => OCGCORE_CARD_ENTRIES.find((entry) => entry.script === script)).filter(Boolean).reduce((map, entry) => {
        const card = getCardByName(entry.name);
        const kind = `${card?.kind ?? "UNKNOWN"}:${card?.subtype ?? ""}`;
        map.set(kind, (map.get(kind) ?? 0) + 1);
        return map;
      }, new Map())),
      source: OCGCORE_ASSET_SOURCE
    },
    banlist: { forbidden: GOAT_BANLIST_IDS.forbidden.size, limited: GOAT_BANLIST_IDS.limited.size, semiLimited: GOAT_BANLIST_IDS.semiLimited.size },
    missingSource: CARDS.filter((card) => !card.source).map((card) => card.name)
  };
}

async function validateOcgcore() {
  const { validateOcgcoreScripts } = await import("../engine/ocgcore-backend.js");
  const result = await validateOcgcoreScripts();
  return {
    command: "ocgcore:validate",
    ...result,
    missingScripts: {
      count: result.missingScripts.length,
      sample: result.missingScripts.slice(0, 12)
    }
  };
}

function validateCardRuntimeContract() {
  const result = validateCardRuntime(CARDS);
  return {
    command: "cards:runtime-audit",
    cards: result.cards,
    executable: result.executable,
    missing: result.missing,
    duplicateRuntimeCodes: result.duplicateRuntimeCodes,
    byRuntime: result.byRuntime,
  };
}

async function auditCardEffects() {
  const result = await auditAllCardEffects({
    maxSteps: numberOption("max-steps", 40),
    limit: args.includes("--limit") ? numberOption("limit", 0) : null,
    sample: args.includes("--sample") ? numberOption("sample", 0) : null,
    workers: numberOption("workers", 1),
    seed: numberOption("seed", 2005),
    names: option("cards", "").split(",").map((name) => name.trim()).filter(Boolean),
  });
  const output = { ...result, results: undefined };
  if (option("out", null)) {
    const outputPath = path.resolve(root, option("out", ""));
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    output.out = outputPath;
  }
  return output;
}

function readJsonIfPresent(file) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  } catch {
    return null;
  }
}

function runCardByCardAudit() {
  const manifest = buildCardAuditManifest();
  const outputPath = path.resolve(root, option("out", "artifacts/card-audit-manifest.json"));
  const reportPath = path.resolve(root, option("report", "artifacts/card-audit-report.md"));
  const previous = args.includes("--changed") ? readJsonIfPresent(outputPath) : null;
  const selectedRecords = selectCardAuditRecords(manifest, {
    card: option("card", ""),
    family: option("family", ""),
    changedAgainst: previous,
  });
  const artifact = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    selection: {
      card: option("card", ""),
      family: option("family", ""),
      changed: args.includes("--changed"),
      all: args.includes("--all") || (!args.includes("--changed") && !option("card", "") && !option("family", "")),
      records: selectedRecords.map((record) => record.cardId),
    },
  };
  ensureDir(path.dirname(outputPath));
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  const report = buildCardAuditReport(manifest, { selectedRecords });
  fs.writeFileSync(reportPath, report);
  const completeSelection = selectedRecords.length === manifest.records.length;
  const registryPath = completeSelection
    ? path.resolve(root, option("registry", "docs/AUDITORIA_COMPLETA_CARTAS.md"))
    : null;
  if (registryPath) {
    ensureDir(path.dirname(registryPath));
    fs.writeFileSync(registryPath, report);
  }
  return {
    command: "cards:audit",
    selected: selectedRecords.length,
    summary: manifest.summary,
    gate: {
      documentationComplete: manifest.summary.documentationComplete,
      repairsAllowed: manifest.summary.repairsAllowed,
      note: manifest.summary.repairComplete
        ? "La auditoria y la reparacion estan cerradas: todas las cartas tienen regresion aprobada."
        : manifest.summary.repairsAllowed
          ? "La auditoria esta cerrada y hay fallos documentados: puede empezar la fase de reparacion."
          : "La fase de reparacion permanece bloqueada hasta documentar todas las cartas.",
    },
    output: outputPath,
    report: reportPath,
    registry: registryPath,
  };
}

async function smokeOcgcore() {
  const { runAuthoritativeSmoke } = await import("../engine/ocgcore-backend.js");
  return { command: "ocgcore:smoke", ...(await runAuthoritativeSmoke()) };
}

async function runOcgcoreDuel() {
  const { runOcgcoreHeadless } = await import("../engine/ocgcore-backend.js");
  const deckA = getDeck(option("deck-a", "chaos-turbo"));
  const deckB = getDeck(option("deck-b", "goat-control"));
  const result = await runOcgcoreHeadless({
    decks: [deckA.main, deckB.main],
    extraDecks: [deckA.fusion ?? [], deckB.fusion ?? []],
    seed: numberOption("seed", 100),
    maxSteps: numberOption("max-steps", 5000),
    brave: !args.includes("--safe"),
    includeEvents: args.includes("--events")
  });
  return { command: "duel:ocgcore", deckA: deckA.id, deckB: deckB.id, ...result };
}

function inspectCard() {
  const query = option("name", "").trim().toLowerCase();
  if (!query) throw new Error("Usa --name \"Nombre de carta\".");
  const matches = CARDS.filter((card) => card.name.toLowerCase() === query || card.name.toLowerCase().includes(query));
  return { query, matches: matches.slice(0, 25).map((card) => ({ ...card, limit: GOAT_BANLIST_IDS.forbidden.has(card.id) ? 0 : GOAT_BANLIST_IDS.limited.has(card.id) ? 1 : GOAT_BANLIST_IDS.semiLimited.has(card.id) ? 2 : 3 })) };
}

function validateDecks() {
  return DECK_PRESETS.map((deck) => { const validation = validateDeck(deck); return { id: deck.id, name: deck.name, ...validation, counts: Object.fromEntries(validation.counts), errors: validation.errors, warnings: validation.warnings }; });
}

function runScenarioFixtures() {
  const directory = path.join(root, "tests", "scenarios");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
  const results = files.map((file) => {
    const fixture = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    const result = runScenario(fixture, { throwOnFailure: false });
    return {
      file,
      id: result.id,
      pass: result.result.pass,
      failedChecks: result.result.checks.filter((check) => !check.pass).map((check) => check.key),
      decisions: result.state.decisionCount,
      events: result.state.log.length
    };
  });
  return { command: "scenarios:test", fixtures: results.length, pass: results.every((result) => result.pass), results };
}

async function replayResult(replay) {
  if (replay?.engine === "ocgcore") return replayOcgcore(replay);
  const state = createDuel(replay.decks[0], replay.decks[1], { seed: replay.seed, startingPlayer: replay.startingPlayer });
  for (const item of replay.actions) step(state, item.action);
  return { winner: state.winner, terminationReason: state.terminationReason, turns: state.turn, decisions: state.decisionCount, matches: state.winner === replay.result && state.terminationReason === replay.terminationReason && state.decisionCount === replay.decisions };
}

async function runHeadless() {
  if (option("engine", "ocgcore") !== "ts") {
    const deckA = getDeck(option("deck-a", "chaos-turbo"));
    const deckB = getDeck(option("deck-b", "goat-control"));
    const games = numberOption("games", 10);
    const seed = numberOption("seed", 100);
    const replays = [];
    for (let i = 0; i < games; i += 1) {
      const result = await runOcgcoreHeadless({
        decks: [deckNames(deckA.main), deckNames(deckB.main)],
        extraDecks: [deckNames(deckA.fusion), deckNames(deckB.fusion)],
        seed: seed + i,
        startingPlayer: i % 2,
        botA: new CoreHeuristicBot({ id: `headless-a-${i}`, name: "Astra A", profile: deckA.id }),
        botB: new CoreHeuristicBot({ id: `headless-b-${i}`, name: "Astra B", profile: deckB.id }),
        profileA: deckA.id,
        profileB: deckB.id,
      });
      replays.push({ ...result.replay, deckAId: deckA.id, deckBId: deckB.id });
    }
    return { command: "duel:headless", engine: "ocgcore", games, seed, stats: compactStats(duelStats(replays)), replay: replays[0] };
  }
  const deckA = getDeck(option("deck-a", "chaos-turbo"));
  const deckB = getDeck(option("deck-b", "goat-control"));
  const games = numberOption("games", 10);
  const seed = numberOption("seed", 100);
  const results = [];
  for (let i = 0; i < games; i += 1) results.push(runDuel(deckA.main, deckB.main, new HeuristicBot({ name: "Astra A", seed: seed + i }), new HeuristicBot({ name: "Astra B", seed: seed + i + 900 }), { seed: seed + i, startingPlayer: i % 2 }));
  const output = { command: "duel:headless", games, seed, stats: duelStats(results), replay: results[0]?.replay };
  if (option("out", null)) fs.writeFileSync(path.resolve(root, option("out", "")), JSON.stringify(output, null, 2));
  return output;
}

function commandRulesTest() {
  const deckA = getDeck("chaos-turbo");
  const deckB = getDeck("goat-control");
  const state = createDuel(deckA.main, deckB.main, { seed: 42, startingPlayer: 0 });
  const firstView = observe(state, 0);
  const hiddenLeak = firstView.players[1].hand.some((card) => card.cardId !== null) || Object.prototype.hasOwnProperty.call(firstView, "rng");
  const first = legalActions(state, 0).find((action) => action.type === "ADVANCE_PHASE");
  step(state, first);
  const second = legalActions(state, 0).find((action) => action.type === "ADVANCE_PHASE");
  step(state, second);
  return { deterministic: true, hiddenLeak, initialHand: firstView.players[0].hand.length, opponentHandCount: firstView.players[1].handCount, phaseAfterStandby: state.phase, legalActions: legalActions(state, 0).length };
}

function commandInfoTest() {
  const state = createDuel(getDeck("chaos-turbo").main, getDeck("goat-control").main, { seed: 7 });
  const view0 = observe(state, 0);
  const view1 = observe(state, 1);
  return { player0CannotSeePlayer1Hand: view0.players[1].hand.every((card) => card.cardId === null), player1CannotSeePlayer0Hand: view1.players[0].hand.every((card) => card.cardId === null), facedownCardsRedacted: view0.players[1].spellTrapZone.every((card) => !card || card.cardId === null), noSeedInObservation: !Object.prototype.hasOwnProperty.call(view0, "seed") };
}

function persistTrainingRun(run, name = "training-run", previous = null) {
  const layout = createRunLayout(trainingRoot(), name);
  const previousManifest = previous?.manifest ?? null;
  const chunks = [...(previousManifest?.chunks ?? [])];
  const runReplays = run.results.map((result) => result?.replay ?? result).filter(Boolean);
  let chunk = null;
  if (runReplays.length) {
    chunk = writeDuelChunk(layout, {
      index: chunks.length + 1,
      firstGame: previousManifest?.completed ?? 0,
      replays: runReplays,
      manifest: { runId: name, mode: "training", engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION, cardDatabaseVersion: CARD_DATABASE_VERSION }
    });
    chunks.push(chunk);
  }
  const checkpoint = writeCheckpoint(layout, {
    runId: name,
    status: run.trainingPlan.status,
    completed: run.completed,
    total: run.trainingPlan.games,
    seed: run.trainingPlan.seed,
    candidate: run.bot,
    trainingPlan: run.trainingPlan,
    trainingStats: compactStats(run.trainingStats),
    evaluation: compactStats(run.evaluation)
  });
  const aggregateStats = previousManifest ? mergeTrainingStats(previousManifest.training?.aggregate, run.trainingStats) : run.trainingStats;
  const manifest = writeRunManifest(layout, {
    runId: name,
    status: run.trainingPlan.status,
    completed: run.completed,
    total: run.trainingPlan.games,
    seed: run.trainingPlan.seed,
    deckId: run.trainingPlan.deckId,
    bot: storedBotSummary(run.bot),
    model: run.model,
    trainingPlan: run.trainingPlan,
    training: { segment: compactStats(run.trainingStats), aggregate: compactStats(aggregateStats) },
    retention: run.retention ?? run.trainingPlan.retention ?? null,
    evaluation: compactStats(run.evaluation),
    checkpoint: "checkpoint/latest.json",
    chunks,
    schemaVersions: { engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION, cardDatabaseVersion: CARD_DATABASE_VERSION },
    previousRun: previousManifest?.runId ?? null
  });
  const verification = verifyRun(layout, manifest);
  return { directory: layout.directory, checkpoint, manifest: path.join(layout.directory, "manifest.json"), chunk, verification };
}

async function main() {
  switch (command) {
    case "cards:validate": print(validateCards()); break;
    case "cards:check": {
      const result = await runCardValidationSuite({
        sample: numberOption("sample", 120),
        maxSteps: numberOption("max-steps", 30),
        workers: numberOption("workers", 2),
        seed: numberOption("seed", 2005),
      });
      print(result);
      if (!result.passed) process.exitCode = 1;
      break;
    }
    case "cards:regressions": {
      const result = await runHighRiskCardRegressions();
      print(result);
      if (!result.passed) process.exitCode = 1;
      break;
    }
    case "cards:lua-audit": {
      const result = auditCardLuaSources();
      print(result);
      if (!result.passed) process.exitCode = 1;
      break;
    }
    case "cards:text-contract-audit": {
      const result = auditCardTextContracts();
      print(result);
      if (!result.passed) process.exitCode = 1;
      break;
    }
    case "cards:runtime-audit": print(validateCardRuntimeContract()); break;
    case "cards:effect-audit": print(await auditCardEffects()); break;
    case "cards:audit": print(runCardByCardAudit()); break;
    case "ocgcore:validate": print(await validateOcgcore()); break;
    case "ocgcore:smoke": print(await smokeOcgcore()); break;
    case "duel:ocgcore": print(await runOcgcoreDuel()); break;
    case "duel:matrix": print(await runOcgcoreMatrix({
      deckIds: option("decks", "chaos-turbo,goat-control,warrior").split(",").map((id) => id.trim()).filter(Boolean),
      gamesPerPair: numberOption("games", 1),
      seed: numberOption("seed", 40000),
      maxSteps: numberOption("max-steps", 5000),
    })); break;
    case "rules:fuzz": print({ ...runRulesFuzz({ games: numberOption("games", 100), seed: numberOption("seed", 9000), maxDecisions: numberOption("max-decisions", 2500) }), hiddenInformation: hiddenInformationFuzzCheck({ seed: numberOption("seed", 9001) }) }); break;
    case "env:smoke": {
      const env = createTurnBasedGoatEnv({ seed: numberOption("seed", 9100), maxDecisions: numberOption("max-decisions", 2500) });
      const initial = env.reset();
      const initialMask = env.actionMask();
      const firstAction = env.availableActions().find(({ action }) => action.type !== "SURRENDER")?.index ?? 0;
      const transition = env.step(firstAction);
      print({ command, agents: env.agents, activeAgent: initial.activeAgent, maskSize: initialMask.length, nextAgent: transition.activeAgent, passed: transition.infos.actor === "player_0" });
      break;
    }
    case "cards:inspect": print(inspectCard()); break;
    case "decks:validate": print(validateDecks()); break;
    case "scenarios:test": print(runScenarioFixtures()); break;
    case "rules:test": print(commandRulesTest()); break;
    case "information:test": print(commandInfoTest()); break;
    case "duel:headless": print(await runHeadless()); break;
    case "duel:replay": {
      const run = await runHeadless();
      print({ replay: run.replay, verification: await replayResult(run.replay) });
      break;
    }
    case "bots:tournament": {
      const resources = mergeResourceBudget(option("resource-profile", "balanced"), { workers: numberOption("workers", undefined), maxSteps: numberOption("max-steps", undefined) });
      const batch = option("engine", "ocgcore") === "ts"
        ? runBatch({ deckAId: option("deck-a", "chaos-turbo"), deckBId: option("deck-b", "goat-control"), games: numberOption("games", 100), seed: numberOption("seed", 1) })
        : await runCoreBatch({ deckAId: option("deck-a", "chaos-turbo"), deckBId: option("deck-b", "goat-control"), games: numberOption("games", 100), seed: numberOption("seed", 1), workers: resources.workers, maxSteps: resources.maxSteps });
      print({ command, engine: batch.engine ?? "typescript", resources, games: batch.replays.length, stats: compactStats(batch.stats) });
      break;
    }
    case "bots:list": {
      print({ command, schema: 1, intelligenceTiers: BOT_INTELLIGENCE_TIERS, bots: listBotSpecs().map((bot) => ({ ...bot, difficultyLabel: BOT_DIFFICULTIES[bot.difficulty]?.label ?? bot.difficulty })), registry: createBotRegistry().bots.length });
      break;
    }
    case "bots:inspect": {
      const botId = option("bot", "astra-goat");
      const deckId = option("deck", null);
      const stored = modelManifestFromFile(option("model", null));
      const bot = createBotForDeck({ botId, deckId, difficulty: option("difficulty", null), seed: numberOption("seed", 1), manifest: stored });
      print({ command, descriptor: botDescriptor(bot), manifest: bot.manifest?.() ?? null });
      break;
    }
    case "bots:evaluate": {
      const deckId = option("deck", "chaos-turbo");
      const resources = mergeResourceBudget(option("resource-profile", "balanced"), { workers: numberOption("workers", undefined), maxSteps: numberOption("max-steps", undefined) });
      const stored = modelManifestFromFile(option("model", null));
      const candidate = stored?.algorithm === "ocgcore-monte-carlo-policy-gradient-v1"
        ? hydrateLearnedPolicy(stored)
        : option("algorithm", null) === "learned"
          ? new LearnedPolicyBot({ id: `${option("bot", "learner")}-evaluation`, name: option("bot", "Learner"), profile: deckId, deckId, training: false })
          : createBotForDeck({ botId: option("bot", "astra-goat"), deckId, difficulty: option("difficulty", null), seed: numberOption("seed", 200) });
      const evaluation = candidate.algorithm === "ocgcore-monte-carlo-policy-gradient-v1"
        ? await evaluateLearnedPolicy({ candidate, deckId, deckIds: ["goat-control", "chaos-control", "warrior"], gamesPerDeck: Math.max(1, Math.ceil(numberOption("games", 30) / 6)), seed: numberOption("seed", 200), workers: resources.workers, maxSteps: resources.maxSteps })
        : option("engine", "ocgcore") === "ts"
        ? evaluateBot({ deckId, games: numberOption("games", 100), seed: numberOption("seed", 200) })
        : await evaluateCoreCandidate({ candidate, deckId, deckIds: ["goat-control", "chaos-control", "warrior"], gamesPerDeck: Math.max(1, Math.ceil(numberOption("games", 30) / 6)), seed: numberOption("seed", 200), workers: resources.workers, maxSteps: resources.maxSteps });
      print({ command, engine: evaluation.engine ?? "typescript", resources, stats: compactStats(evaluation.stats), explainability: explainStats(evaluation.stats) });
      break;
    }
    case "bots:competence": {
      const deckIds = option("decks", "goat-control,chaos-turbo,flip-control,panda-burn,chaos-recruiter,earth-aggro,warrior,reasoning-gate,chaos-control").split(",").map((value) => value.trim()).filter(Boolean);
      const result = await evaluateAgainstFrozenIa500({
        candidateFactory: ({ deckId, seed }) => new CoreHeuristicBot({ id: `universal-${deckId}`, botId: `universal-${deckId}`, name: "Universal Base", profile: deckId, deckId, difficulty: "easy", seed }),
        deckIds,
        gamesPerDeck: numberOption("games-per-deck", 100),
        seed: numberOption("seed", 700000),
        maxSteps: numberOption("max-steps", 5000),
        workers: numberOption("workers", 6),
        requiredWinRate: Number(option("required-win-rate", 0.55)),
        requiredConfidenceLow: Number(option("required-confidence-low", 0.5)),
      });
      const output = option("output", null);
      if (output) {
        const outputPath = path.resolve(root, output);
        ensureDir(path.dirname(outputPath));
        fs.writeFileSync(outputPath, JSON.stringify({ ...result, certifiedAt: result.passed ? new Date().toISOString() : null }, null, 2));
      }
      print({ command, passed: result.passed, benchmark: result.benchmark, games: result.games, wins: result.wins, losses: result.losses, winRate: result.winRate, confidence95: result.confidence95, invalid: result.invalid, perDeck: Object.fromEntries(Object.entries(result.perDeck).map(([deckId, stats]) => [deckId, { games: stats.games, wins: stats.wins, losses: stats.losses, winRate: stats.winRate, confidence95: stats.confidence95, invalid: stats.invalid, passed: stats.passed }])), output });
      break;
    }
    case "bots:league": {
      const decks = option("decks", "chaos-turbo,goat-control,warrior").split(",").map((id) => id.trim()).filter(Boolean);
      const candidates = decks.map((deckId, index) => ({ id: `league-${deckId}-v1`, name: `${getDeck(deckId).name} v1`, deckId, profile: deckId, version: 1 + index }));
      print(await runSelfPlayLeague({ candidates, rounds: numberOption("rounds", 1), gamesPerPair: numberOption("games", 1), seed: numberOption("seed", 12000), maxSteps: numberOption("max-steps", 5000) }));
      break;
    }
    case "training:policy": {
      const resources = mergeResourceBudget(option("resource-profile", "light"), { workers: 1, maxSteps: numberOption("max-steps", undefined) });
      const run = await trainMaskedPolicy({ botName: option("bot", "PPO Lite"), deckId: option("deck", "chaos-turbo"), games: numberOption("games", 10), seed: numberOption("seed", 16000), maxSteps: resources.maxSteps });
      print({ command, resources, algorithm: run.algorithm, bot: run.bot, model: run.model, stats: compactStats(run.stats) });
      break;
    }
    case "training:learn": {
      const resources = mergeResourceBudget(option("resource-profile", "intensive"), { workers: numberOption("workers", undefined), maxSteps: numberOption("max-steps", undefined) });
      const runId = option("run", "learned-run");
      const progressLayout = createRunLayout(trainingRoot(), runId);
      const stored = modelManifestFromFile(option("model", null));
      const initialBot = stored?.algorithm === "ocgcore-monte-carlo-policy-gradient-v1"
        ? hydrateLearnedPolicy({
            ...stored,
            id: args.includes("--bot-id") ? option("bot-id", stored.id) : stored.id,
            botId: args.includes("--bot-id") ? option("bot-id", stored.botId ?? stored.id) : (stored.botId ?? stored.id),
            name: args.includes("--bot") ? option("bot", stored.name) : stored.name,
          })
        : null;
      const startIndex = initialBot ? numberOption("start-index", initialBot.episodes ?? 0) : 0;
      const run = await trainLearnedPolicy({
        botName: option("bot", initialBot?.name ?? "Self-Play Learner"),
        botId: option("bot-id", initialBot?.botId ?? null),
        deckId: option("deck", "chaos-turbo"),
        games: numberOption("games", 10000),
        seed: numberOption("seed", 16000),
        checkpointEvery: numberOption("checkpoint-every", 250),
        workers: resources.workers,
        maxSteps: resources.maxSteps,
        selfPlayRate: Number(option("self-play-rate", 0.3)),
        resourceProfile: resources.profile,
        initialBot,
        startIndex,
        onProgress: ({ completed, total, speed }) => print({ command, progress: { completed, total, percent: Number(((completed / Math.max(1, total)) * 100).toFixed(2)), gamesPerSecond: Number(speed.toFixed(2)) } }),
        onCheckpoint: (checkpoint) => writeCheckpoint(progressLayout, { runId, status: "IN_PROGRESS", ...checkpoint }),
      });
      const files = persistTrainingRun(run, runId);
      const { featureWeights: _featureWeights, parameters: _parameters, valueByFamily: _valueByFamily, actionStats: _actionStats, strategy: _strategy, strategyCompatibility: _strategyCompatibility, ...botSummary } = run.bot;
      const { model: _modelData, ...modelSummary } = run.model;
      print({ command, resources, algorithm: run.algorithm, learning: run.learning, retention: run.retention, training: compactStats(run.trainingStats), validation: compactStats(run.validation), evaluation: compactStats(run.evaluation), comparison: run.evaluationDetails?.comparison ?? null, strategyBank: run.strategyBank ? { scenarios: run.strategyBank.scenarios, passed: run.strategyBank.passed, score: run.strategyBank.score } : null, bot: { ...botSummary, strategyId: run.bot.strategy?.id ?? null, featureCount: Object.keys(run.bot.featureWeights ?? {}).length, actionSampleCount: Object.values(run.bot.actionStats ?? {}).reduce((sum, entry) => sum + (Number(entry.samples) || 0), 0) }, model: modelSummary, files, verification: files.verification });
      break;
    }
    case "training:evolve": {
      const runId = option("run", "bot-league").replace(/[^a-zA-Z0-9._-]+/g, "-");
      const directory = ensureDir(path.join(trainingRoot(), runId));
      const checkpointPath = path.join(directory, "league.checkpoint.json");
      const parentPath = option("parent", "");
      const parent = parentPath ? JSON.parse(fs.readFileSync(path.resolve(root, parentPath), "utf8")) : null;
      const resources = mergeResourceBudget(option("resource-profile", "intensive"), { workers: numberOption("workers", undefined), maxSteps: numberOption("max-steps", undefined) });
      const league = await evolveLearnedPolicy({
        botName: option("bot", "Self-Play Learner"),
        botId: option("bot-id", "self-play-learner"),
        deckId: option("deck", "chaos-turbo"),
        generations: numberOption("generations", 10),
        gamesPerGeneration: numberOption("games", 1000),
        headToHeadGames: numberOption("head-games", 200),
        hiddenGamesPerDeck: numberOption("hidden-games", 10),
        seed: numberOption("seed", 70000),
        workers: resources.workers,
        maxSteps: resources.maxSteps,
        checkpointEvery: numberOption("checkpoint-every", 250),
        selfPlayRate: Number(option("self-play-rate", 0.5)),
        minimumHeadToHeadGames: numberOption("min-head-games", 100),
        minimumHiddenGames: numberOption("min-hidden-games", 50),
        minimumHeadToHeadDelta: Number(option("min-head-delta", 0.05)),
        minimumHeadToHeadConfidence: Number(option("min-head-confidence", 0.5)),
        parentModelId: parent?.championModelId ?? parent?.id ?? parent?.model?.id ?? null,
        initialBot: parent,
        onCheckpoint: (checkpoint) => fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2)),
      });
      const manifestPath = path.join(directory, "league.json");
      fs.writeFileSync(manifestPath, JSON.stringify(league, null, 2));
      print({ command, resources, algorithm: league.algorithm, completedGenerations: league.completedGenerations, champion: { id: league.champion.id, version: league.champion.version, state: league.champion.state, episodes: league.champion.episodes, features: Object.keys(league.champion.featureWeights ?? {}).length }, generations: league.generations.map((entry) => ({ generation: entry.generation, promoted: entry.qualification.promoted, reason: entry.qualification.reason, headToHeadWinRate: entry.headToHead.winRate, hiddenWinRate: entry.hidden.winRate, championHiddenWinRate: entry.championHidden.winRate, strategyScore: entry.strategy.score })), files: { manifest: manifestPath, checkpoint: checkpointPath } });
      break;
    }
    case "training:certify": {
      const stored = modelManifestFromFile(option("model", null));
      if (!stored) throw new Error("training:certify necesita --model <checkpoint.json>.");
      const resources = mergeResourceBudget(option("resource-profile", "intensive"), { workers: numberOption("workers", undefined), maxSteps: numberOption("max-steps", undefined) });
      const result = await certifyBotIntelligence({
        candidate: stored,
        deckId: option("deck", stored.deckId ?? stored.profile ?? "chaos-turbo"),
        targetIntelligence: numberOption("target", 100),
        trainingGames: numberOption("training-games", stored.episodes ?? stored.training?.games ?? 0),
        trainingInvalid: numberOption("training-invalid", stored.training?.invalid ?? 0),
        gamesPerGate: args.includes("--gate-games") ? numberOption("gate-games", 1) : null,
        workers: resources.workers,
        maxSteps: resources.maxSteps,
        seed: numberOption("seed", 90000),
      });
      const output = option("output", null);
      if (output) fs.writeFileSync(path.resolve(root, output), JSON.stringify(result.candidate, null, 2));
      print({ command, resources, certificate: result.certificate, certificationGames: result.games, output });
      break;
    }
    case "training:start": {
      const cancelAfter = numberOption("cancel-after", 0);
      const abortController = new AbortController();
      const engine = option("engine", "ocgcore");
      const resources = mergeResourceBudget(option("resource-profile", "balanced"), { workers: numberOption("workers", undefined), maxSteps: numberOption("max-steps", undefined) });
      const train = engine === "ts" ? trainCandidate : trainCoreCandidate;
      const run = await train({
        botName: option("bot", "Pepito"),
        deckId: option("deck", "chaos-turbo"),
        games: numberOption("games", 100),
        seed: numberOption("seed", 500),
        checkpointEvery: numberOption("checkpoint-every", cancelAfter ? 1 : 100),
        workers: resources.workers,
        maxSteps: resources.maxSteps,
        resourceProfile: resources.profile,
        abortSignal: abortController.signal,
        onProgress: ({ completed }) => { if (cancelAfter > 0 && completed >= cancelAfter) abortController.abort(); }
      });
      const files = persistTrainingRun(run, option("run", "training-run"));
      print({ command, engine: run.engine ?? engine, resources, files, bot: run.bot, model: run.model, training: compactStats(run.trainingStats), evaluation: compactStats(run.evaluation), verification: files.verification });
      break;
    }
    case "training:resume": {
      const runId = option("run", "training-run");
      const previous = readRunManifest(trainingRoot(), runId);
      const verification = verifyRun(previous.layout, previous.manifest);
      if (!verification.valid) throw new Error(`No se reanuda un run corrupto: ${verification.errors.map((error) => error.message).join("; ")}`);
      if (["COMPLETED", "CLEANED"].includes(previous.manifest.status)) throw new Error(`El run ${runId} ya está en estado ${previous.manifest.status}.`);
      const checkpoint = readCheckpoint(previous.layout);
      if (!checkpoint?.candidate) throw new Error(`El run ${runId} no tiene checkpoint recuperable.`);
      const modelCheck = verifyModelManifest(previous.manifest.model);
      if (!modelCheck.compatible) throw new Error(`El modelo no es compatible: ${modelCheck.errors.join("; ")}`);
      const plan = previous.manifest.trainingPlan;
      const run = plan.algorithm === "ocgcore-monte-carlo-policy-gradient-v1"
        ? await trainLearnedPolicy({ botName: checkpoint.candidate.name, botId: checkpoint.candidate.botId ?? checkpoint.candidate.id, deckId: plan.deckId, opponentDeckIds: plan.opponentDeckIds, validationDeckIds: plan.validationDeckIds, hiddenEvaluationDeckIds: plan.hiddenEvaluationDeckIds, games: plan.games, seed: plan.seed, checkpointEvery: plan.checkpointEvery, workers: plan.workers ?? numberOption("workers", 1), maxSteps: plan.maxSteps ?? numberOption("max-steps", 5000), resourceProfile: plan.resourceProfile ?? "custom", initialBot: hydrateLearnedPolicy(checkpoint.candidate), startIndex: checkpoint.completed })
        : plan.engine === "ocgcore"
        ? await trainCoreCandidate({ botName: checkpoint.candidate.name, deckId: plan.deckId, opponentDeckIds: plan.opponentDeckIds, validationDeckIds: plan.validationDeckIds, hiddenEvaluationDeckIds: plan.hiddenEvaluationDeckIds, games: plan.games, seed: plan.seed, checkpointEvery: plan.checkpointEvery, workers: plan.workers ?? numberOption("workers", 1), maxSteps: plan.maxSteps ?? numberOption("max-steps", 5000), resourceProfile: plan.resourceProfile ?? "custom", initialBot: hydrateCoreBot(checkpoint.candidate), startIndex: checkpoint.completed })
        : trainCandidate({ botName: checkpoint.candidate.name, deckId: plan.deckId, opponentDeckIds: plan.opponentDeckIds, validationDeckIds: plan.validationDeckIds, hiddenEvaluationDeckIds: plan.hiddenEvaluationDeckIds, games: plan.games, seed: plan.seed, checkpointEvery: plan.checkpointEvery, initialBot: hydrateAdaptiveBot(checkpoint.candidate), startIndex: checkpoint.completed });
      const files = persistTrainingRun(run, runId, previous);
      print({ command, runId, resumedFrom: checkpoint.completed, bot: run.bot, training: compactStats(run.trainingStats), evaluation: compactStats(run.evaluation), files, verification: files.verification });
      break;
    }
    case "training:clean": {
      const runId = option("run", "training-run");
      const cleaned = cleanRun(trainingRoot(), runId, { keepWins: numberOption("keep-wins", 20), keepLosses: numberOption("keep-losses", 20), force: args.includes("--force") });
      print({ command, runId, retention: cleaned.retention, manifest: { status: cleaned.manifest.status, completed: cleaned.manifest.completed, total: cleaned.manifest.total, permanentFiles: cleaned.manifest.permanentFiles } });
      break;
    }
    case "storage:benchmark": {
      const maxGames = numberOption("max-games", 1000);
      const engine = option("engine", "ocgcore");
      const sizes = [100, 1000, 10000].filter((games) => games <= maxGames);
      if (sizes.length === 0) sizes.push(maxGames);
      const rows = [];
      for (const games of sizes) {
        const batch = engine === "ts"
          ? runBatch({ games, seed: 9000 + games })
          : await runCoreBatch({ games, seed: 9000 + games, workers: numberOption("workers", 1) });
        const json = Buffer.from(JSON.stringify(batch.replays));
        const pack = encodeDuelPack(batch.replays, { mode: "benchmark", games });
        const compressed = deflateSync(pack);
        rows.push({ engine: batch.engine ?? engine, games, jsonBytes: json.byteLength, packBytes: pack.byteLength, compressedBytes: compressed.byteLength, bytesPerGame: Number((compressed.byteLength / games).toFixed(2)), jsonRatio: Number((pack.byteLength / json.byteLength).toFixed(3)) });
      }
      print({ command, engine, rows });
      break;
    }
    case "storage:inspect": {
      const file = option("file", null);
      if (!file) throw new Error("Usa --file ruta/al/duelpack.");
      const bytes = fs.readFileSync(path.resolve(root, file));
      print(inspectDuelPack(bytes));
      break;
    }
    case "storage:verify": {
      const file = option("file", null);
      if (!file) throw new Error("Usa --file ruta/al/duelpack.");
      const decoded = decodeDuelPack(fs.readFileSync(path.resolve(root, file)));
      const checks = await Promise.all(decoded.games.slice(0, numberOption("games", decoded.games.length)).map(replayResult));
      print({ games: decoded.games.length, checked: checks.length, allReconstruct: checks.every((check) => check.matches), failures: checks.filter((check) => !check.matches).slice(0, 3) });
      break;
    }
    case "ranking:simulate": {
      let ladder = initialLadder();
      for (let i = 0; i < numberOption("games", 30); i += 1) ladder = applyLadderResult(ladder, { botId: ladder.bots[i % ladder.bots.length].id, deckId: "chaos-turbo", result: i % 3 === 0 ? "loss" : "win", mode: "simulation" });
      print({ command, view: ladderView(ladder), history: ladder.history.slice(0, 5) });
      break;
    }
    case "models:verify": {
      const runId = option("run", null);
      if (!runId) { print({ modelsDirectory: fs.existsSync(path.join(root, "models")), compatibility: verifyModelManifest({ schema: 1, botId: "placeholder", algorithm: "placeholder", configHash: "placeholder", compatibility: { engineVersion: ENGINE_VERSION, formatVersion: FORMAT_VERSION, cardDatabaseVersion: CARD_DATABASE_VERSION } }) }); break; }
      const stored = readRunManifest(trainingRoot(), runId);
      print({ runId, model: stored.manifest.model, verification: verifyModelManifest(stored.manifest.model) });
      break;
    }
    case "research:validate": {
      const required = ["progress.md", "existing-projects-review.md", "goat-format-specification.md", "card-pool-methodology.md", "bot-learning-architecture.md", "storage-architecture.md", "ranking-system.md", "roadmap.md"];
      print({ docs: required.map((file) => ({ file, exists: fs.existsSync(path.join(root, "docs", file)) })), sources: ["https://www.goatformat.com/home/category/card-pool", "https://www.goatformat.com/basics.html"] });
      break;
    }
    default:
      print({ usage: "npm run <script>", commands: ["dev", "build", "test", "duel:headless", "duel:ocgcore", "duel:matrix", "duel:replay", "cards:validate", "cards:check", "cards:regressions", "cards:lua-audit", "cards:text-contract-audit", "cards:runtime-audit", "cards:effect-audit", "cards:audit", "ocgcore:validate", "ocgcore:smoke", "cards:inspect", "decks:validate", "scenarios:test", "rules:test", "rules:fuzz", "env:smoke", "information:test", "bots:tournament", "bots:list", "bots:inspect", "bots:evaluate", "bots:competence", "bots:league", "training:start", "training:learn", "training:evolve", "training:certify", "training:policy", "training:resume", "training:clean", "storage:benchmark", "storage:inspect", "storage:verify", "ranking:simulate", "models:verify", "research:validate"] });
  }
}

main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });

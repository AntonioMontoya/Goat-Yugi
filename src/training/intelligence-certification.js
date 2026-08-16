import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { createBotForDeck, hydrateBot } from "../bots/bot-system.js";
import { CoreRandomBot } from "../bots/ocgcore.js";
import { evaluateIntelligenceCertification, exactIntelligenceTier, predecessorIntelligenceScores } from "../bots/intelligence.js";
import { duelStats } from "../analytics/statistics.js";
import { hashString } from "../engine/rng.js";
import { auditBotReasoning } from "../bots/reasoning-audit.js";
import { evaluateAgainstFrozenIa500 } from "./frozen-ia500-benchmark.js";

const STOCK_GATES = Object.freeze({
  0: Object.freeze({ botId: "legal-random", deckId: "goat-control", name: "Random legal" }),
  100: Object.freeze({ botId: "rookie-flip", deckId: "flip-control", name: "Rookie" }),
  200: Object.freeze({ botId: "astra-goat", deckId: "goat-control", name: "Astra" }),
  500: Object.freeze({ botId: "echo-warrior", deckId: "warrior", name: "Echo" }),
  1000: Object.freeze({ botId: "mirror", deckId: "flip-control", name: "Mirror" }),
});

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

function workerCount(value) {
  return Math.max(1, Math.min(6, Math.floor(Number(value) || 1)));
}

function metricRow(run, opponentDeckId) {
  return {
    winner: run.winner,
    terminationReason: run.terminationReason,
    turns: run.turns,
    decisions: run.decisions,
    startingPlayer: run.replay?.startingPlayer,
    opponentDeckId,
  };
}

function gateOpponent(score, index, seed) {
  const spec = STOCK_GATES[score];
  if (!spec) throw new Error(`No existe rival de certificacion para inteligencia ${score}.`);
  if (score === 0) return new CoreRandomBot({ id: `cert-random-${index}`, botId: "legal-random", name: spec.name, profile: spec.deckId, deckId: spec.deckId, seed });
  return createBotForDeck({ botId: spec.botId, deckId: spec.deckId, seed });
}

async function playGate({ candidateManifest, candidateDeckId, opponentIntelligence, games, seed, maxSteps, workers } = {}) {
  const candidateDeck = getDeck(candidateDeckId);
  const gate = STOCK_GATES[opponentIntelligence];
  if (!gate) throw new Error(`Rival de certificacion desconocido: ${opponentIntelligence}.`);
  const opponentDeck = getDeck(gate.deckId);
  const jobs = Array.from({ length: games }, (_, index) => async () => {
    const candidate = hydrateBot({ ...candidateManifest, randomState: seed ^ (index + 0x9e3779b9), training: false });
    const opponent = gateOpponent(opponentIntelligence, index, seed ^ (index + 0x51ed270b));
    return runOcgcoreHeadless({
      decks: [cardNames(candidateDeck.main), cardNames(opponentDeck.main)],
      extraDecks: [cardNames(candidateDeck.fusion), cardNames(opponentDeck.fusion)],
      seed: seed + index,
      startingPlayer: index % 2,
      maxSteps,
      botA: candidate,
      botB: opponent,
      profileA: candidateDeckId,
      profileB: gate.deckId,
    });
  });
  const runs = [];
  const parallel = workerCount(workers);
  for (let cursor = 0; cursor < jobs.length; cursor += parallel) runs.push(...await Promise.all(jobs.slice(cursor, cursor + parallel).map((job) => job())));
  const stats = duelStats(runs.map((run) => metricRow(run, gate.deckId)), { sampleLimit: 0, sampleSeed: seed });
  return { opponentIntelligence, opponentBotId: gate.botId, opponentDeckId: gate.deckId, ...stats };
}

export async function certifyBotIntelligence({
  candidate,
  deckId = candidate?.deckId ?? candidate?.profile ?? "chaos-turbo",
  targetIntelligence = 100,
  trainingGames = candidate?.episodes ?? 0,
  trainingInvalid = 0,
  gamesPerGate = null,
  workers = 1,
  seed = 90_000,
  maxSteps = 5_000,
  requirements = {},
  baseBenchmarkDeckIds = null,
  baseBenchmarkGamesPerDeck = null,
  onProgress = null,
} = {}) {
  if (!candidate) throw new Error("certifyBotIntelligence necesita un candidato.");
  const suppliedManifest = candidate.manifest ? candidate.manifest() : structuredClone(candidate);
  const manifest = suppliedManifest.algorithm === "ocgcore-monte-carlo-policy-gradient-v1" ? hydrateBot(suppliedManifest).manifest() : suppliedManifest;
  const tier = exactIntelligenceTier(targetIntelligence);
  if (!tier || tier.score === 0) throw new Error(`Nivel de inteligencia no soportado: ${targetIntelligence}`);
  const effectiveRequirements = { ...requirements, ...(gamesPerGate === null ? {} : { gamesPerGate: Math.max(1, Number(gamesPerGate) || 1) }) };
  const reasoningAudit = auditBotReasoning(manifest);
  if (Number(trainingGames) < Number(effectiveRequirements.minimumTrainingGames ?? tier.minimumTrainingGames) || Number(trainingInvalid) > 0) {
    const certificate = evaluateIntelligenceCertification({ targetIntelligence, trainingGames, trainingInvalid, gates: [], reasoningAudit, baseBenchmark: null, requirements: effectiveRequirements });
    return { certificate, candidate: { ...manifest, targetIntelligence: tier.score }, games: 0 };
  }
  const benchmarkDeckIds = baseBenchmarkDeckIds?.length ? [...baseBenchmarkDeckIds] : [deckId];
  const benchmarkGames = Math.max(20, Number(baseBenchmarkGamesPerDeck ?? effectiveRequirements.baseBenchmarkGamesPerDeck ?? tier.gamesPerGate) || 20);
  const baseBenchmark = await evaluateAgainstFrozenIa500({
    candidateFactory: ({ deckId: benchmarkDeckId, seed: benchmarkSeed }) => createBotForDeck({
      botId: manifest.botId ?? manifest.id,
      deckId: benchmarkDeckId,
      seed: benchmarkSeed,
      difficulty: "easy",
      manifest: { ...manifest, profile: benchmarkDeckId, deckId: benchmarkDeckId },
    }),
    deckIds: benchmarkDeckIds,
    gamesPerDeck: benchmarkGames,
    seed: seed ^ 0x6d2b79f5,
    maxSteps,
    workers,
    requiredWinRate: Number(effectiveRequirements.requiredBaseBenchmarkWinRate ?? 0.55),
    requiredConfidenceLow: Number(effectiveRequirements.requiredBaseBenchmarkConfidenceLow ?? 0.5),
  });
  baseBenchmark.policyQualified = manifest.algorithm === "ocgcore-monte-carlo-policy-gradient-v1" && manifest.certification?.baseBenchmark?.policyQualified === true && baseBenchmark.passed;
  const gates = [];
  const requiredScores = predecessorIntelligenceScores(tier.score);
  const count = Math.max(1, Number(effectiveRequirements.gamesPerGate ?? tier.gamesPerGate) || 1);
  for (let index = 0; index < requiredScores.length; index += 1) {
    const gate = await playGate({ candidateManifest: manifest, candidateDeckId: deckId, opponentIntelligence: requiredScores[index], games: count, seed: seed + index * 10_003, maxSteps, workers });
    gates.push(gate);
    onProgress?.({ completedGates: gates.length, totalGates: requiredScores.length, gate });
  }
  const certificate = evaluateIntelligenceCertification({ targetIntelligence, trainingGames, trainingInvalid, gates, reasoningAudit, baseBenchmark, requirements: effectiveRequirements });
  certificate.id = hashString(JSON.stringify({ botId: manifest.botId ?? manifest.id, deckId, targetIntelligence, reasoningScore: reasoningAudit.score, gates: gates.map((gate) => ({ opponentIntelligence: gate.opponentIntelligence, games: gate.games, wins: gate.wins, losses: gate.losses, draws: gate.draws })) }));
  certificate.certifiedAt = certificate.certified ? new Date().toISOString() : null;
  return {
    certificate,
    candidate: {
      ...manifest,
      targetIntelligence: tier.score,
      intelligence: certificate.certified ? tier.score : Math.max(0, Number(manifest.intelligence) || 0),
      certification: certificate,
      state: certificate.certified ? "Validado" : "Candidato",
    },
    games: baseBenchmark.games + gates.reduce((sum, gate) => sum + gate.games, 0),
  };
}

export { STOCK_GATES as INTELLIGENCE_STOCK_GATES };

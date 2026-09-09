import crypto from "node:crypto";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { inspectOcgcoreRun, resolveRunOutcome } from "./ocgcore-run-validity.js";
import { StrategicBot } from "../bots/strategic.js";
import { createBotForDeck, UNIVERSAL_BOT_ID, NEXO2_BOT_ID } from "../bots/bot-system.js";

function cardNames(ids = []) {
  return (ids ?? []).map((id) => getCard(id)?.name ?? String(id));
}

export function hashWeights(bot) {
  const hash = crypto.createHash("sha256");
  const payload = {
    neuralModel: bot?.neuralModel ?? null,
    policyWeights: bot?.policyWeights ?? bot?.weights ?? null,
  };
  hash.update(JSON.stringify(payload));
  return hash.digest("hex");
}

export function createDeterministicRng(seed = 42) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function bootstrapBlockDifference(blockDeltas = [], { iterations = 10000, seed = 42, alpha = 0.05 } = {}) {
  const n = blockDeltas.length;
  if (n === 0) {
    return { mean: 0, low: 0, high: 0, bonferroniLow: 0, samples: 0 };
  }

  const sum = blockDeltas.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  if (n === 1) {
    return { mean, low: mean, high: mean, bonferroniLow: mean, samples: 1 };
  }

  const rng = createDeterministicRng(seed);
  const resampleMeans = new Float64Array(iterations);

  for (let i = 0; i < iterations; i += 1) {
    let resampleSum = 0;
    for (let j = 0; j < n; j += 1) {
      const idx = Math.floor(rng() * n) % n;
      resampleSum += blockDeltas[idx];
    }
    resampleMeans[i] = resampleSum / n;
  }

  resampleMeans.sort();

  const lowIdx = Math.max(0, Math.floor((alpha / 2) * iterations));
  const highIdx = Math.min(iterations - 1, Math.ceil((1 - alpha / 2) * iterations));
  // Bonferroni for 8 decks: 5% / 8 = 0.625%
  const bonferroniIdx = Math.max(0, Math.floor((alpha / 8) * iterations));

  return {
    mean,
    low: resampleMeans[lowIdx],
    high: resampleMeans[highIdx],
    bonferroniLow: resampleMeans[bonferroniIdx],
    samples: n,
    iterations,
  };
}

export function generateEvaluationJobs({
  deckIds = ["goat-control", "chaos-control", "warrior", "empty-jar"],
  rivals = ["universal-base", "core-heuristic"],
  blocksPerDeck = 8,
  seed = 8_200_000,
  mode = "whole-bot-comparison",
  split = "diagnostic",
  useLegacyBase = false,
} = {}) {
  const jobs = [];
  let blockCounter = 0;

  for (const deckId of deckIds) {
    for (let b = 0; b < blocksPerDeck; b += 1) {
      const rivalId = rivals[b % rivals.length];
      blockCounter += 1;
      const blockSeed = (seed + blockCounter * 7919) >>> 0;
      const blockId = `block_${deckId}_${rivalId}_${b + 1}`;
      const isMirror = b % 2 === 0;
      const opponentDeckId = isMirror ? deckId : (deckIds.find((id) => id !== deckId) ?? deckId);

        // 4 duels per block:
        // 1. candidate as seat 0
        // 2. candidate as seat 1
        // 3. base as seat 0
        // 4. base as seat 1
        jobs.push({
          jobId: `${blockId}_cand_s0`,
          blockId,
          versionTarget: "candidate",
          candidateSeat: 0,
          requestedStartingPlayer: 0,
          deckId,
          opponentDeckId,
          rivalId,
          seed: blockSeed,
          mode,
          split,
          isMirror,
          useLegacyBase,
        });
        jobs.push({
          jobId: `${blockId}_cand_s1`,
          blockId,
          versionTarget: "candidate",
          candidateSeat: 1,
          requestedStartingPlayer: 1,
          deckId,
          opponentDeckId,
          rivalId,
          seed: blockSeed,
          mode,
          split,
          isMirror,
          useLegacyBase,
        });
        jobs.push({
          jobId: `${blockId}_base_s0`,
          blockId,
          versionTarget: "base",
          candidateSeat: 0,
          requestedStartingPlayer: 0,
          deckId,
          opponentDeckId,
          rivalId,
          seed: blockSeed,
          mode,
          split,
          isMirror,
          useLegacyBase,
        });
        jobs.push({
          jobId: `${blockId}_base_s1`,
          blockId,
          versionTarget: "base",
          candidateSeat: 1,
          requestedStartingPlayer: 1,
          deckId,
          opponentDeckId,
          rivalId,
          seed: blockSeed,
          mode,
          split,
          isMirror,
          useLegacyBase,
        });
      }
    }

  return jobs;
}

export async function executeSingleJob(job, { candidateManifest, baseManifest, maxSteps = 6000 } = {}) {
  const isCandidate = job.versionTarget === "candidate";
  let activeManifest = isCandidate ? candidateManifest : baseManifest;
  if (activeManifest && typeof activeManifest === "object" && activeManifest[job.deckId]) {
    activeManifest = activeManifest[job.deckId];
  }

  const playerDeck = getDeck(job.deckId);
  const opponentDeck = getDeck(job.opponentDeckId);
  if (!playerDeck || !opponentDeck) {
    throw new Error(`Mazo no encontrado: ${job.deckId} o ${job.opponentDeckId}`);
  }

  const useLegacy = activeManifest?.legacyNegativeInference ?? (job.useLegacyBase ? !isCandidate : false);

  // Create testing bot instance
  const evalBot = new StrategicBot({
    ...activeManifest,
    id: isCandidate ? "candidate-under-eval" : "base-under-eval",
    botId: isCandidate ? NEXO2_BOT_ID : UNIVERSAL_BOT_ID,
    deckId: job.deckId,
    profile: job.deckId,
    deck: playerDeck,
    training: false,
    seed: job.seed,
    legacyNegativeInference: useLegacy,
  });

  const hashBefore = hashWeights(evalBot);

  // Create opponent bot
  const rivalBot = createBotForDeck({
    botId: job.rivalId === "core-heuristic" ? "heuristic" : UNIVERSAL_BOT_ID,
    deckId: job.opponentDeckId,
    deck: opponentDeck,
    seed: job.seed ^ 0x51ed270b,
  });

  const seat = job.candidateSeat;
  const bots = seat === 0 ? [evalBot, rivalBot] : [rivalBot, evalBot];
  const decks = seat === 0 ? [playerDeck, opponentDeck] : [opponentDeck, playerDeck];

  let actualStartingPlayer = null;
  let firstTurnEvent = null;

  const run = await runOcgcoreHeadless({
    decks: decks.map((d) => cardNames(d.main)),
    extraDecks: decks.map((d) => cardNames(d.fusion)),
    seed: job.seed,
    startingPlayer: job.requestedStartingPlayer,
    maxSteps,
    botA: bots[0],
    botB: bots[1],
    profileA: decks[0].id,
    profileB: decks[1].id,
    onDecision: (trace, context) => {
      if (actualStartingPlayer === null && trace?.player != null) {
        actualStartingPlayer = Number(trace.player);
        firstTurnEvent = {
          player: actualStartingPlayer,
          turn: context.observation?.turn ?? 1,
          phase: context.observation?.phase ?? "START",
        };
      }
    },
  });

  const hashAfter = hashWeights(evalBot);
  if (hashBefore !== hashAfter) {
    throw new Error(`Violación de inmutabilidad: los pesos del bot ${job.versionTarget} cambiaron durante la evaluación.`);
  }

  const runOutcome = resolveRunOutcome(run, seat);
  const score = !runOutcome.valid ? 0 : runOutcome.outcome === "win" ? 1.0 : runOutcome.outcome === "draw" ? 0.5 : 0.0;

  return {
    jobId: job.jobId,
    blockId: job.blockId,
    versionTarget: job.versionTarget,
    deckId: job.deckId,
    opponentDeckId: job.opponentDeckId,
    rivalId: job.rivalId,
    candidateSeat: seat,
    requestedStartingPlayer: job.requestedStartingPlayer,
    actualStartingPlayer: actualStartingPlayer ?? job.requestedStartingPlayer,
    firstTurnEvent,
    seed: job.seed,
    mode: job.mode,
    split: job.split,
    valid: runOutcome.valid,
    outcome: runOutcome.outcome,
    terminationReason: runOutcome.terminationReason,
    reasons: runOutcome.reasons,
    score,
    turns: run.turns ?? 0,
    decisions: run.decisions ?? 0,
  };
}

export function aggregatePairedBlocks(jobResults = []) {
  const blocks = new Map();

  for (const res of jobResults) {
    if (!blocks.has(res.blockId)) {
      blocks.set(res.blockId, {
        blockId: res.blockId,
        deckId: res.deckId,
        opponentDeckId: res.opponentDeckId,
        rivalId: res.rivalId,
        candidateResults: [],
        baseResults: [],
      });
    }
    const b = blocks.get(res.blockId);
    if (res.versionTarget === "candidate") b.candidateResults.push(res);
    else b.baseResults.push(res);
  }

  const blockDeltas = [];
  const validBlocks = [];
  const invalidBlocks = [];
  const perDeckDeltas = {};
  const perRivalDeltas = {};

  for (const block of blocks.values()) {
    const allGames = [...block.candidateResults, ...block.baseResults];
    const anyInvalid = allGames.some((g) => !g.valid || g.outcome === "invalid");
    if (anyInvalid || block.candidateResults.length < 2 || block.baseResults.length < 2) {
      invalidBlocks.push(block);
      continue;
    }

    const candScore = block.candidateResults.reduce((acc, g) => acc + g.score, 0) / block.candidateResults.length;
    const baseScore = block.baseResults.reduce((acc, g) => acc + g.score, 0) / block.baseResults.length;
    const delta = candScore - baseScore;

    block.candidateScore = candScore;
    block.baseScore = baseScore;
    block.delta = delta;
    block.valid = true;

    validBlocks.push(block);
    blockDeltas.push(delta);

    perDeckDeltas[block.deckId] ??= [];
    perDeckDeltas[block.deckId].push(delta);

    perRivalDeltas[block.rivalId] ??= [];
    perRivalDeltas[block.rivalId].push(delta);
  }

  const overallBootstrap = bootstrapBlockDifference(blockDeltas);

  const perDeckStats = {};
  for (const [dId, deltas] of Object.entries(perDeckDeltas)) {
    perDeckStats[dId] = bootstrapBlockDifference(deltas);
  }

  const perRivalStats = {};
  for (const [rId, deltas] of Object.entries(perRivalDeltas)) {
    perRivalStats[rId] = bootstrapBlockDifference(deltas);
  }

  return {
    totalBlocks: blocks.size,
    validBlocksCount: validBlocks.length,
    invalidBlocksCount: invalidBlocks.length,
    overall: overallBootstrap,
    perDeck: perDeckStats,
    perRival: perRivalStats,
  };
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_PRESETS, getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { StrategicBot, NEXO2_ALGORITHM } from "../bots/strategic.js";
import { createBotForDeck, UNIVERSAL_BOT_ID, NEXO2_BOT_ID } from "../bots/bot-system.js";
import { strategyPlanForDeck } from "../bots/deck-strategy.js";
import { createActionQualityCollector, mergeActionQualityAudits } from "../training/action-quality-audit.js";
import { inspectOcgcoreRun, validateBotObservation, resolveRunOutcome } from "../training/ocgcore-run-validity.js";
import { confidenceInterval95 } from "../analytics/statistics.js";
import {
  createOptimizerState,
  accumulateBatchGradients,
  applyBatchUpdate,
  createPolicyCheckpoint,
  restorePolicyCheckpoint,
} from "../training/nexo2-policy-contract.js";
import NEXO2_UNIVERSAL_MODEL from "../../artifacts/nexo2-universal-v1/candidate.json" with { type: "json" };

const META_DECK_POOL = [
  "goat-control",
  "chaos-turbo",
  "chaos-control",
  "warrior",
  "flip-control",
  "goatformat-zombie",
  "goatformat-monarch",
  "goatformat-strike-ninja",
  "reasoning-gate",
  "earth-aggro",
];

const ROGUE_DECK_POOL = [
  "empty-jar",
  "goatformat-deckout",
  "panda-burn",
  "goatformat-lockdown-burn",
  "goatformat-p-a-c-m-a-n",
  "chaos-recruiter",
  "goatformat-direct-attack",
];

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

export function getCurriculumPools() {
  const existingIds = new Set(DECK_PRESETS.map((d) => d.id));
  return {
    meta: META_DECK_POOL.filter((id) => existingIds.has(id)),
    rogue: ROGUE_DECK_POOL.filter((id) => existingIds.has(id)),
  };
}

/**
 * Weighted opponent sampler:
 * 35% Mirror, 45% Tier 1/2 Meta, 20% Rogue/Burn/Mill
 */
export function sampleOpponentDeck(candidateDeckId, randomValue = Math.random()) {
  const { meta, rogue } = getCurriculumPools();
  if (randomValue < 0.35) {
    return candidateDeckId;
  }
  if (randomValue < 0.80 && meta.length > 0) {
    const idx = Math.floor(((randomValue - 0.35) / 0.45) * meta.length) % meta.length;
    return meta[idx];
  }
  if (rogue.length > 0) {
    const idx = Math.floor(((randomValue - 0.80) / 0.20) * rogue.length) % rogue.length;
    return rogue[idx];
  }
  return candidateDeckId;
}

/**
 * Archetype-tailored reward calculation:
 * - Mill/Deckout: rewards opponent deck reduction.
 * - Burn: rewards opponent LP reduction.
 * - Standard / terminal-only: +1 for win, 0 for draw, -1 for loss.
 */
export function calculateDeckReward({ candidateDeckId, outcome, run, candidateSeat, lastCandidateObs, rewardMode = "dense" }) {
  if (!run) return 0;
  const inspection = inspectOcgcoreRun(run);
  if (!inspection.valid) return 0;
  if (outcome !== "win" && outcome !== "loss" && outcome !== "draw") return 0;

  const win = outcome === "win";
  const loss = outcome === "loss";
  const baseReward = win ? 1.0 : loss ? -1.0 : 0.0;

  if (rewardMode === "terminal-only") {
    return baseReward;
  }

  const plan = strategyPlanForDeck(candidateDeckId);
  const oppDeck = lastCandidateObs?.opponentDeckSize ?? lastCandidateObs?.opponentDeckCount ?? 40;
  const ownDeck = lastCandidateObs?.ownDeckSize ?? lastCandidateObs?.deckCount ?? 40;
  const oppLp = lastCandidateObs?.opponentLp ?? lastCandidateObs?.opponentLifePoints ?? 8000;

  // Deckout / Mill shaping (Needle Worm, Morphing Jar, Empty Jar)
  if (candidateDeckId.includes("deckout") || candidateDeckId.includes("jar") || plan.archetype.toLowerCase().includes("deck-out")) {
    const milled = Math.max(0, 40 - oppDeck);
    const millRatio = Math.min(1.0, milled / 40);
    if (win) {
      return 1.0;
    }
    if (loss) {
      let shaped = -1.0 + 0.5 * millRatio;
      if (ownDeck <= 0) shaped -= 0.2;
      return Math.max(-1.0, Math.min(1.0, shaped));
    }
  }

  // Burn / Direct Damage shaping (Wave-Motion Cannon, Lava Golem, Panda, etc.)
  if (candidateDeckId.includes("burn") || plan.archetype.toLowerCase().includes("burn")) {
    const damageDone = Math.max(0, 8000 - Math.max(0, oppLp));
    const damageRatio = Math.min(1.0, damageDone / 8000);
    if (win) {
      return 1.0;
    }
    if (loss) {
      return Math.max(-1.0, Math.min(1.0, -1.0 + 0.5 * damageRatio));
    }
  }

  return baseReward;
}

/**
 * Quantize neural arrays to 5 decimal places and prune small linear weights.
 */
export function quantizeDeckModel(model, deckId) {
  const result = {
    ...model,
    id: NEXO2_BOT_ID,
    botId: NEXO2_BOT_ID,
    deckId,
    profile: deckId,
    algorithm: NEXO2_ALGORITHM,
    style: `Especializado · ${deckId}`,
    trainedAt: new Date().toISOString(),
  };

  // Quantize neural weights
  if (result.neuralModel) {
    const nm = result.neuralModel;
    const quantizeArr = (arr) => (arr ? Array.from(arr).map((v) => Number(Number(v).toFixed(5))) : []);
    result.neuralModel = {
      ...nm,
      w1: quantizeArr(nm.w1),
      b1: quantizeArr(nm.b1),
      wp: quantizeArr(nm.wp),
      wv: quantizeArr(nm.wv),
      bp: Number(Number(nm.bp ?? 0).toFixed(5)),
      bv: Number(Number(nm.bv ?? 0).toFixed(5)),
    };
  }

  // Prune & quantize linear weights
  if (result.policyWeights) {
    const pruned = {};
    for (const [key, value] of Object.entries(result.policyWeights)) {
      const num = Number(value);
      if (Number.isFinite(num) && Math.abs(num) >= 0.001) {
        pruned[key] = Number(num.toFixed(5));
      }
    }
    result.policyWeights = pruned;
  }

  return result;
}

/**
 * Core deck training orchestrator.
 */
export async function runNexoDeckTraining({
  deckId = "empty-jar",
  trainingGames = 100,
  evaluationGames = 30,
  workers = 4,
  seed = 8_200_000,
  maxSteps = 6000,
  initialModel = null,
  auditSampleLimit = 15,
  rewardMode = "dense",
  onProgress = null,
} = {}) {
  const candidateDeck = getDeck(deckId);
  if (!candidateDeck) {
    throw new Error(`Mazo no encontrado en el catálogo: ${deckId}`);
  }

  const baseManifest = initialModel ?? NEXO2_UNIVERSAL_MODEL;
  const learner = new StrategicBot({
    ...baseManifest,
    id: NEXO2_BOT_ID,
    botId: NEXO2_BOT_ID,
    name: `Nexo 2 [${deckId}]`,
    deckId,
    profile: deckId,
    deck: candidateDeck,
    algorithm: NEXO2_ALGORITHM,
    training: true,
    seed,
  });

  const parallel = Math.max(1, Math.min(6, workers));
  const trainingStats = { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0 };
  const allAudits = [];
  const sampledDecisions = [];
  const optimizerState = learner.neuralPolicy ? (learner.neuralPolicy.optimizerState ?? createOptimizerState(learner.neuralPolicy)) : null;

  // 1. Training Loop
  for (let cursor = 0; cursor < trainingGames; cursor += parallel) {
    const batchSize = Math.min(parallel, trainingGames - cursor);
    const jobs = Array.from({ length: batchSize }, (_, offset) => {
      const gameIdx = cursor + offset;
      const gameSeed = (seed + gameIdx * 7919) >>> 0;
      let rngState = gameSeed || 1;
      const nextRng = () => {
        rngState = (rngState * 1664525 + 1013904223) >>> 0;
        return rngState / 0x100000000;
      };
      const opponentDeckId = sampleOpponentDeck(deckId, nextRng());
      const candidateSeat = gameIdx % 2;
      return {
        game: gameIdx + 1,
        seed: gameSeed,
        candidateDeckId: deckId,
        opponentDeckId,
        candidateSeat,
        startingPlayer: candidateSeat === 0 ? 0 : 1,
        exploration: Math.max(0.02, 0.12 * Math.pow(0.995, gameIdx)),
      };
    });

    const results = await Promise.all(
      jobs.map(async (job) => {
        const oppDeck = getDeck(job.opponentDeckId);
        const snapshot = learner.manifest();
        const candidateBot = new StrategicBot({
          ...snapshot,
          id: NEXO2_BOT_ID,
          botId: NEXO2_BOT_ID,
          deckId: job.candidateDeckId,
          profile: job.candidateDeckId,
          deck: candidateDeck,
          exploration: job.exploration,
          seed: job.seed ^ 0xa511e9b3,
          training: true,
        });

        const opponentBot = createBotForDeck({
          botId: UNIVERSAL_BOT_ID,
          deckId: job.opponentDeckId,
          deck: oppDeck,
          seed: job.seed ^ 0x51ed270b,
        });

        const bots = job.candidateSeat === 0 ? [candidateBot, opponentBot] : [opponentBot, candidateBot];
        const decks = job.candidateSeat === 0 ? [candidateDeck, oppDeck] : [oppDeck, candidateDeck];

        let lastCandidateObs = null;
        const gameDecisions = [];
        const collector = createActionQualityCollector({
          metadata: { game: job.game, deckId: job.candidateDeckId, opponentDeckId: job.opponentDeckId, seed: job.seed },
          sampleLimit: auditSampleLimit,
          targetPlayer: job.candidateSeat,
          onRecord: (rec) => gameDecisions.push(rec),
        });

        const run = await runOcgcoreHeadless({
          decks: decks.map((d) => cardNames(d.main)),
          extraDecks: decks.map((d) => cardNames(d.fusion)),
          seed: job.seed,
          startingPlayer: job.startingPlayer,
          maxSteps,
          botA: bots[0],
          botB: bots[1],
          profileA: decks[0].id,
          profileB: decks[1].id,
          onDecision: (trace, context) => {
            if (Number(trace.player) === job.candidateSeat) {
              lastCandidateObs = context.observation;
              collector.capture(trace, context);
            }
          },
        });

        const runOutcome = resolveRunOutcome(run, job.candidateSeat);
        const obsValid = lastCandidateObs ? validateBotObservation(lastCandidateObs) : { valid: false, reason: "NO_OBSERVATION" };
        const valid = runOutcome.valid && obsValid.valid;
        const outcome = valid ? runOutcome.outcome : "invalid";

        const reward = calculateDeckReward({
          candidateDeckId: job.candidateDeckId,
          outcome,
          run,
          candidateSeat: job.candidateSeat,
          lastCandidateObs,
          rewardMode,
        });

        if (!valid) {
          console.error("[INVALID_GAME_DETECTED]", {
            game: job.game,
            deck: job.candidateDeckId,
            opponentDeck: job.opponentDeckId,
            steps: run?.steps,
            maxSteps,
            terminationReason: runOutcome.terminationReason,
            runOutcomeValid: runOutcome.valid,
            runOutcomeReasons: runOutcome.reasons,
            retryLog: run?.retryLog,
            errors: run?.errors,
            winner: run?.winner,
            completed: run?.completed,
            obsValid: obsValid.valid,
            obsReason: obsValid.reason,
          });
        }

        return {
          ...job,
          run,
          valid,
          outcome,
          terminationReason: runOutcome.terminationReason,
          obsReason: obsValid.reason,
          reward,
          episode: candidateBot.consumeEpisode(),
          audit: collector.result(),
          decisions: gameDecisions,
        };
      })
    );

    for (const res of results) {
      trainingStats.games += 1;
      if (res.outcome === "win") trainingStats.wins += 1;
      else if (res.outcome === "loss") trainingStats.losses += 1;
      else if (res.outcome === "draw") trainingStats.draws += 1;
      else trainingStats.invalid += 1;

      allAudits.push(res.audit);
      if (sampledDecisions.length < auditSampleLimit * 5) {
        sampledDecisions.push(...res.decisions);
      }
    }

    if (learner.neuralPolicy) {
      const batchDecisions = [];
      for (const res of results) {
        if (res.valid && res.outcome !== "invalid" && Array.isArray(res.episode)) {
          for (const step of res.episode) {
            batchDecisions.push({
              ...step,
              returnVal: res.reward,
            });
          }
        }
      }

      if (batchDecisions.length > 0) {
        const batchGrads = accumulateBatchGradients({
          batchDecisions,
          network: learner.neuralPolicy,
          currentPolicyVersion: learner.neuralPolicy.policyVersion,
        });

        if (batchGrads.meanGradients) {
          applyBatchUpdate({
            network: learner.neuralPolicy,
            meanGradients: batchGrads.meanGradients,
            optimizerState,
            learningRate: learner.learningRate,
          });
        }
      }
    } else {
      for (const res of results) {
        if (res.valid && res.outcome !== "invalid") {
          learner.learnFromEpisode(res.episode, res.reward);
        }
      }
    }

    onProgress?.({
      stage: "training",
      completed: Math.min(trainingGames, cursor + batchSize),
      total: trainingGames,
      stats: trainingStats,
    });
  }

  // 2. Evaluation Loop
  learner.training = false;
  const evaluationStats = { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0, byMatchup: {} };
  const evalAudits = [];
  const evalDecisions = [];

  for (let cursor = 0; cursor < evaluationGames; cursor += parallel) {
    const batchSize = Math.min(parallel, evaluationGames - cursor);
    const jobs = Array.from({ length: batchSize }, (_, offset) => {
      const gameIdx = cursor + offset;
      const gameSeed = (seed + 9_000_000 + gameIdx * 7919) >>> 0;
      let rngState = gameSeed || 1;
      const nextRng = () => {
        rngState = (rngState * 1664525 + 1013904223) >>> 0;
        return rngState / 0x100000000;
      };
      const opponentDeckId = sampleOpponentDeck(deckId, nextRng());
      const candidateSeat = gameIdx % 2;
      return {
        game: gameIdx + 1,
        seed: gameSeed,
        candidateDeckId: deckId,
        opponentDeckId,
        candidateSeat,
        startingPlayer: candidateSeat === 0 ? 0 : 1,
      };
    });

    const results = await Promise.all(
      jobs.map(async (job) => {
        const oppDeck = getDeck(job.opponentDeckId);
        const candidateBot = new StrategicBot({
          ...learner.manifest(),
          id: NEXO2_BOT_ID,
          botId: NEXO2_BOT_ID,
          deckId: job.candidateDeckId,
          profile: job.candidateDeckId,
          deck: candidateDeck,
          exploration: 0,
          seed: job.seed ^ 0xa511e9b3,
          training: false,
        });

        const opponentBot = createBotForDeck({
          botId: UNIVERSAL_BOT_ID,
          deckId: job.opponentDeckId,
          deck: oppDeck,
          seed: job.seed ^ 0x51ed270b,
        });

        const bots = job.candidateSeat === 0 ? [candidateBot, opponentBot] : [opponentBot, candidateBot];
        const decks = job.candidateSeat === 0 ? [candidateDeck, oppDeck] : [oppDeck, candidateDeck];

        const gameDecisions = [];
        const collector = createActionQualityCollector({
          metadata: { game: job.game, deckId: job.candidateDeckId, opponentDeckId: job.opponentDeckId, seed: job.seed },
          sampleLimit: auditSampleLimit,
          targetPlayer: job.candidateSeat,
          onRecord: (rec) => gameDecisions.push(rec),
        });

        const run = await runOcgcoreHeadless({
          decks: decks.map((d) => cardNames(d.main)),
          extraDecks: decks.map((d) => cardNames(d.fusion)),
          seed: job.seed,
          startingPlayer: job.startingPlayer,
          maxSteps,
          botA: bots[0],
          botB: bots[1],
          profileA: decks[0].id,
          profileB: decks[1].id,
          onDecision: (trace, context) => {
            if (Number(trace.player) === job.candidateSeat) {
              collector.capture(trace, context);
            }
          },
        });

        const runOutcome = resolveRunOutcome(run, job.candidateSeat);
        const valid = runOutcome.valid;
        const outcome = valid ? runOutcome.outcome : "invalid";

        return {
          ...job,
          run,
          valid,
          outcome,
          terminationReason: runOutcome.terminationReason,
          audit: collector.result(),
          decisions: gameDecisions,
        };
      })
    );

    for (const res of results) {
      evaluationStats.games += 1;
      if (res.outcome === "win") evaluationStats.wins += 1;
      else if (res.outcome === "loss") evaluationStats.losses += 1;
      else if (res.outcome === "draw") evaluationStats.draws += 1;
      else evaluationStats.invalid += 1;

      const matchupKey = `${res.candidateDeckId}__vs__${res.opponentDeckId}`;
      evaluationStats.byMatchup[matchupKey] ??= { wins: 0, losses: 0, draws: 0, total: 0 };
      evaluationStats.byMatchup[matchupKey].total += 1;
      if (res.outcome === "win") evaluationStats.byMatchup[matchupKey].wins += 1;
      else if (res.outcome === "loss") evaluationStats.byMatchup[matchupKey].losses += 1;
      else if (res.outcome === "draw") evaluationStats.byMatchup[matchupKey].draws += 1;

      evalAudits.push(res.audit);
      evalDecisions.push(...res.decisions);
    }

    onProgress?.({
      stage: "evaluation",
      completed: Math.min(evaluationGames, cursor + batchSize),
      total: evaluationGames,
      stats: evaluationStats,
    });
  }

  const validEval = Math.max(1, evaluationStats.games - evaluationStats.invalid);
  const winRate = evaluationStats.wins / validEval;
  const mergedActionAudit = mergeActionQualityAudits(evalAudits);
  const quantizedCandidate = quantizeDeckModel(learner.manifest(), deckId);

  return {
    deckId,
    deckName: candidateDeck.name,
    archetype: candidateDeck.archetype,
    trainingGames,
    evaluationGames,
    trainingStats,
    evaluationStats: {
      ...evaluationStats,
      winRate,
      confidence95: confidenceInterval95(evaluationStats.wins, validEval),
    },
    actionQuality: mergedActionAudit,
    sampledDecisions: evalDecisions.slice(0, auditSampleLimit * 10),
    candidate: quantizedCandidate,
  };
}

// CLI Execution Entrypoint
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const args = process.argv.slice(2);

  function option(name, fallback = null) {
    const prefix = `--${name}=`;
    const eqArg = args.find((a) => a.startsWith(prefix));
    if (eqArg) return eqArg.slice(prefix.length);
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] ?? fallback : fallback;
  }

  function positiveInteger(name, fallback) {
    const value = Number(option(name, fallback));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  const deckId = option("deck", "empty-jar");
  const trainingGames = positiveInteger("training-games", positiveInteger("games", 100));
  const evaluationGames = positiveInteger("evaluation-games", 30);
  const workers = positiveInteger("workers", 4);
  const seed = positiveInteger("seed", 8_200_000);
  const maxSteps = positiveInteger("max-steps", 6000);
  const resumePath = option("resume", null);
  const initialModel = resumePath ? JSON.parse(fs.readFileSync(path.resolve(root, resumePath), "utf8")) : null;
  const outputDir = path.resolve(root, option("out", path.join("artifacts", "nexo2-decks", deckId)));

  fs.mkdirSync(outputDir, { recursive: true });

  process.stderr.write(`=== Nexo 2: Entrenamiento Especializado de Mazo [${deckId}] ===\n`);
  process.stderr.write(`Partidas: ${trainingGames} entrenamiento + ${evaluationGames} evaluación | Workers: ${workers} | Semilla: ${seed}\n\n`);

  const report = await runNexoDeckTraining({
    deckId,
    trainingGames,
    evaluationGames,
    workers,
    seed,
    maxSteps,
    initialModel,
    onProgress: ({ stage, completed, total, stats }) => {
      process.stderr.write(`\r[${stage.toUpperCase()}] ${completed}/${total} | W: ${stats.wins} L: ${stats.losses} D: ${stats.draws} Inv: ${stats.invalid}`);
    },
  });
  process.stderr.write("\n\nEntrenamiento finalizado. Guardando modelo y auditoría...\n");

  // Write outputs
  fs.writeFileSync(path.join(outputDir, "candidate.json"), `${JSON.stringify(report.candidate)}\n`, "utf8");
  
  const summary = {
    deckId: report.deckId,
    deckName: report.deckName,
    archetype: report.archetype,
    trainingGames: report.trainingGames,
    evaluationGames: report.evaluationGames,
    trainingStats: report.trainingStats,
    evaluationStats: report.evaluationStats,
    actionQuality: report.actionQuality,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  // Decision audit JSONL
  fs.writeFileSync(
    path.join(outputDir, "decision-audit.jsonl"),
    `${report.sampledDecisions.map((d) => JSON.stringify(d)).join("\n")}\n`,
    "utf8"
  );

  // Markdown Report
  const md = [
    `# Informe de Entrenamiento Especializado Nexo 2: ${report.deckName} (\`${report.deckId}\`)`,
    "",
    `- **Arquetipo**: ${report.archetype}`,
    `- **Fecha**: ${new Date().toISOString()}`,
    `- **Partidas de Entrenamiento**: ${report.trainingGames}`,
    `- **Partidas de Evaluación**: ${report.evaluationGames}`,
    "",
    "## Resultados de Evaluación",
    "",
    `- **Victorias**: ${report.evaluationStats.wins}`,
    `- **Derrotas**: ${report.evaluationStats.losses}`,
    `- **Empates**: ${report.evaluationStats.draws}`,
    `- **Inválidas**: ${report.evaluationStats.invalid}`,
    `- **Tasa de Victoria (Winrate)**: ${Number.isFinite(report.evaluationStats.winRate) ? (report.evaluationStats.winRate * 100).toFixed(1) : "0.0"} % [IC 95%: ${Number.isFinite(report.evaluationStats.confidence95?.low) ? (report.evaluationStats.confidence95.low * 100).toFixed(1) : "0.0"}% - ${Number.isFinite(report.evaluationStats.confidence95?.high) ? (report.evaluationStats.confidence95.high * 100).toFixed(1) : "0.0"}%]`,
    "",
    "### Desglose por Matchup",
    "",
    "| Matchup | Total | Victorias | Derrotas | Winrate |",
    "| :--- | :--- | :--- | :--- | :--- |",
    ...Object.entries(report.evaluationStats.byMatchup).map(([matchup, data]) => {
      const rate = data.total ? ((data.wins / data.total) * 100).toFixed(1) : "0.0";
      return `| \`${matchup}\` | ${data.total} | ${data.wins} | ${data.losses} | ${rate} % |`;
    }),
    "",
    "## Auditoría de Calidad Táctica",
    "",
    `- **Decisiones Evaluadas**: ${report.actionQuality.decisions}`,
    `- **Decisiones Sólidas**: ${report.actionQuality.quality?.sound ?? 0}`,
    `- **Decisiones Forzadas (única opción)**: ${report.actionQuality.quality?.forced ?? 0}`,
    `- **Decisiones en Revisión**: ${report.actionQuality.quality?.review ?? 0}`,
    `- **Decisiones Sospechosas**: ${report.actionQuality.quality?.suspicious ?? 0}`,
    "",
    "### Decisiones de Muestra Grabadas",
    "",
    `Se han grabado ${report.sampledDecisions.length} decisiones movimiento por movimiento en \`decision-audit.jsonl\`.`,
  ].join("\n");

  fs.writeFileSync(path.join(outputDir, "report.md"), `${md}\n`, "utf8");

  process.stdout.write(JSON.stringify({
    deckId: report.deckId,
    winRate: report.evaluationStats.winRate,
    trainingStats: report.trainingStats,
    outputDir,
  }, null, 2));
}

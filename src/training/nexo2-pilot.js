import { confidenceInterval95 } from "../analytics/statistics.js";
import { UNIVERSAL_BOT_ID, createBotForDeck } from "../bots/bot-system.js";
import { DECISION_GUARDRAIL_SCHEMA } from "../bots/decision-guardrails.js";
import { NEXO2_ALGORITHM, StrategicBot } from "../bots/strategic.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { hashString } from "../engine/rng.js";
import { createIndependentActionAudit, mergeIndependentActionAudits } from "./independent-action-audit.js";
import { inspectOcgcoreRun } from "./ocgcore-run-validity.js";

export const NEXO2_PILOT_DECKS = Object.freeze(["goat-control", "chaos-turbo", "flip-control"]);

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }
function percent(value) { return `${(Number(value) * 100).toFixed(1)} %`; }

function pilotDecks(values = NEXO2_PILOT_DECKS) {
  const ids = [...new Set(values)].map((deckId) => getDeck(deckId).id);
  if (ids.length !== 3) throw new Error("El piloto Nexo 2 exige exactamente tres mazos.");
  return ids;
}

function baseContract(manifest = {}) {
  return {
    algorithm: manifest.algorithm,
    policyWeights: structuredClone(manifest.policyWeights ?? {}),
    decisionConfig: structuredClone(manifest.decisionConfig ?? {}),
    policySchema: Number(manifest.policySchema) || 0,
    decisionSchema: Number(manifest.decisionSchema) || 0,
    guardrailSchema: DECISION_GUARDRAIL_SCHEMA,
  };
}

export function nexo2BaseFingerprint() {
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: NEXO2_PILOT_DECKS[0], seed: 1 }).manifest();
  return hashString(JSON.stringify(baseContract(base)));
}

function emptyRow() { return { games: 0, validGames: 0, wins: 0, losses: 0, draws: 0, invalid: 0 }; }

function emptyStats(deckIds) {
  const byDeck = Object.fromEntries(deckIds.map((deckId) => [deckId, emptyRow()]));
  const byMatchup = Object.fromEntries(deckIds.flatMap((candidateDeck) => deckIds.map((opponentDeck) => [`${candidateDeck}__vs__${opponentDeck}`, emptyRow()])));
  return { ...emptyRow(), turns: 0, decisions: 0, byDeck, byMatchup };
}

function addOutcome(row, outcome, valid) {
  row.games += 1;
  if (!valid) { row.invalid += 1; return; }
  row.validGames += 1;
  if (outcome === "win") row.wins += 1;
  else if (outcome === "loss") row.losses += 1;
  else row.draws += 1;
}

function addRun(stats, item) {
  const outcome = !item.validity.valid ? "invalid" : item.run.winner === item.candidateSeat ? "win" : item.run.winner === 1 - item.candidateSeat ? "loss" : "draw";
  addOutcome(stats, outcome, item.validity.valid);
  addOutcome(stats.byDeck[item.candidateDeck], outcome, item.validity.valid);
  addOutcome(stats.byMatchup[`${item.candidateDeck}__vs__${item.opponentDeck}`], outcome, item.validity.valid);
  stats.turns += Number(item.run.turns) || 0;
  stats.decisions += Number(item.run.decisions) || 0;
  return outcome;
}

function finalizeRow(row) {
  const valid = Math.max(1, Number(row.validGames) || 0);
  return {
    ...row,
    winRate: Number(row.wins) / valid,
    scoreRate: (Number(row.wins) + Number(row.draws) * 0.5) / valid,
    confidence95: confidenceInterval95(Number(row.wins), Number(row.validGames)),
  };
}

function finalizeStats(stats) {
  return {
    ...finalizeRow(stats),
    averageTurns: Number(stats.turns) / Math.max(1, Number(stats.games)),
    averageDecisions: Number(stats.decisions) / Math.max(1, Number(stats.games)),
    byDeck: Object.fromEntries(Object.entries(stats.byDeck).map(([key, value]) => [key, finalizeRow(value)])),
    byMatchup: Object.fromEntries(Object.entries(stats.byMatchup).map(([key, value]) => [key, finalizeRow(value)])),
  };
}

function scheduledJob(index, deckIds, seed, stage) {
  const pair = index % 9;
  const round = Math.floor(index / 9);
  const candidateDeck = deckIds[Math.floor(pair / 3)];
  const opponentDeck = deckIds[pair % 3];
  const candidateSeat = (round + pair) % 2;
  const candidateStarts = round % 2 === 0;
  return {
    stage,
    game: index + 1,
    candidateDeck,
    opponentDeck,
    candidateSeat,
    startingPlayer: candidateStarts ? candidateSeat : 1 - candidateSeat,
    seed: Number(seed) + pair * 100_003 + round,
  };
}

function compactReasoning(context, metadata, seat, limit, target) {
  if (target.length >= limit || context.bot?.lastReasoning?.forced !== false) return;
  const reasoning = context.bot.lastReasoning;
  target.push({
    schema: 1,
    ...metadata,
    seat,
    player: Number(context.observation?.player) || 0,
    decision: Number(context.decisions) || 0,
    turn: Number(context.observation?.turn) || 0,
    phase: Number(context.observation?.phase) || 0,
    requestType: Number(reasoning.requestType) || 0,
    publicState: {
      ownMonsters: (context.observation?.ownMonsters ?? []).map((card) => ({ code: Number(card.runtimeCode) || 0, position: Number(card.position) || 0, faceUp: card.faceUp === true })),
      opponentMonsters: (context.observation?.opponentMonsters ?? []).map((card) => ({ code: Number(card.runtimeCode) || 0, position: Number(card.position) || 0, faceUp: card.faceUp === true })),
      ownBackrowCount: Number(context.observation?.ownBackrowCount) || 0,
      opponentBackrowCount: Number(context.observation?.opponentBackrowCount) || 0,
      publicChain: (context.observation?.publicChain ?? []).map((card) => ({ code: Number(card.code) || 0, controller: Number(card.controller), location: Number(card.location) || 0, sequence: Number(card.sequence) || 0 })),
    },
    selected: reasoning.selected ? {
      role: reasoning.selected.role,
      cards: [...(reasoning.selected.cards ?? [])],
      score: reasoning.selected.score,
      plannedScore: reasoning.selected.plannedScore,
      projectedValue: reasoning.selected.projectedValue,
      beliefValue: reasoning.selected.beliefValue,
      neuralPolicyValue: reasoning.selected.neuralPolicyValue,
      neuralStateValue: reasoning.selected.neuralStateValue,
      reasons: [...(reasoning.selected.reasons ?? [])],
    } : null,
    alternative: reasoning.alternatives?.[0] ? {
      role: reasoning.alternatives[0].role,
      cards: [...(reasoning.alternatives[0].cards ?? [])],
      score: reasoning.alternatives[0].score,
      plannedScore: reasoning.alternatives[0].plannedScore,
      projectedValue: reasoning.alternatives[0].projectedValue,
      beliefValue: reasoning.alternatives[0].beliefValue,
      neuralPolicyValue: reasoning.alternatives[0].neuralPolicyValue,
      neuralStateValue: reasoning.alternatives[0].neuralStateValue,
      reasons: [...(reasoning.alternatives[0].reasons ?? [])],
    } : null,
    rejected: (reasoning.rejected ?? []).map((entry) => entry.guardrail).filter(Boolean),
  });
}

async function playPilotGame(job, { candidateManifest, training, maxSteps, decisionSampleLimit }) {
  const candidateDeck = getDeck(job.candidateDeck);
  const opponentDeck = getDeck(job.opponentDeck);
  const candidate = new StrategicBot({
    ...candidateManifest,
    id: "nexo2-pilot",
    botId: "nexo2-pilot",
    name: "Nexo 2 piloto",
    deckId: candidateDeck.id,
    profile: candidateDeck.id,
    deck: candidateDeck,
    seed: job.seed ^ 0xa511e9b3,
    training,
  });
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: opponentDeck.id, deck: opponentDeck, seed: job.seed ^ 0x51ed270b });
  const bots = job.candidateSeat === 0 ? [candidate, base] : [base, candidate];
  const decks = job.candidateSeat === 0 ? [candidateDeck, opponentDeck] : [opponentDeck, candidateDeck];
  const candidateAudit = createIndependentActionAudit({ targetPlayer: job.candidateSeat, metadata: { stage: job.stage, game: job.game, candidateDeck: job.candidateDeck, opponentDeck: job.opponentDeck, seed: job.seed } });
  const baseAudit = createIndependentActionAudit({ targetPlayer: 1 - job.candidateSeat, metadata: { stage: job.stage, game: job.game, candidateDeck: job.candidateDeck, opponentDeck: job.opponentDeck, seed: job.seed } });
  const decisions = [];
  const metadata = { stage: job.stage, game: job.game, candidateDeck: job.candidateDeck, opponentDeck: job.opponentDeck, seed: job.seed };
  const run = await runOcgcoreHeadless({
    decks: decks.map((deck) => cardNames(deck.main)),
    extraDecks: decks.map((deck) => cardNames(deck.fusion)),
    seed: job.seed,
    startingPlayer: job.startingPlayer,
    maxSteps,
    botA: bots[0],
    botB: bots[1],
    profileA: decks[0].id,
    profileB: decks[1].id,
    onDecision: (trace, context) => {
      candidateAudit.capture(trace, context);
      baseAudit.capture(trace, context);
      if (Number(trace.player) === job.candidateSeat) compactReasoning(context, metadata, "candidate", decisionSampleLimit, decisions);
      else compactReasoning(context, metadata, "base", decisionSampleLimit, decisions);
    },
  });
  return {
    ...job,
    run,
    validity: inspectOcgcoreRun(run),
    episode: training ? candidate.consumeEpisode() : [],
    candidateAudit: candidateAudit.result(),
    baseAudit: baseAudit.result(),
    decisions,
  };
}

function compactFight(item, outcome, reward = null) {
  return {
    schema: 1,
    stage: item.stage,
    game: item.game,
    candidateDeck: item.candidateDeck,
    opponentDeck: item.opponentDeck,
    candidateSeat: item.candidateSeat,
    startingPlayer: item.startingPlayer,
    seed: item.seed,
    outcome,
    winner: item.run.winner,
    valid: item.validity.valid,
    validityReasons: [...item.validity.reasons],
    terminationReason: item.run.terminationReason,
    turns: item.run.turns,
    decisions: item.run.decisions,
    learning: reward === null ? null : { reward, trajectoryDecisions: item.episode.length },
    independentAudit: { candidate: item.candidateAudit, base: item.baseAudit },
  };
}

export function nexo2PilotGate({ evaluation, candidateAudit, baseAudit, deckCount, neuralTraining }) {
  const deckRows = Object.values(evaluation.byDeck ?? {});
  const gates = {
    exactlyThreeDecks: deckCount === 3,
    validEngineRuns: evaluation.invalid === 0,
    enoughPilotEvidence: evaluation.validGames >= 54,
    noIndependentCriticalErrors: candidateAudit.critical === 0,
    noCriticalRegression: candidateAudit.criticalRate <= baseAudit.criticalRate,
    activeNeuralLearning: Number(neuralTraining?.updates) > 0,
    competitiveAggregate: evaluation.wins > evaluation.losses && evaluation.scoreRate >= 0.55,
    everyPilotDeckCompetitive: deckRows.length === 3 && deckRows.every((row) => row.validGames >= 12 && row.scoreRate >= 0.45),
    confidenceAboveWeakness: Number(evaluation.confidence95?.low) > 0.45,
  };
  const failed = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
  const hundredfold = baseAudit.critical >= 10
    ? { measurable: true, passed: candidateAudit.criticalRate <= baseAudit.criticalRate / 100, baselineRate: baseAudit.criticalRate, candidateRate: candidateAudit.criticalRate }
    : { measurable: false, passed: false, reason: "La base no produjo al menos diez errores críticos en esta muestra; no puede medirse honestamente una reducción de 100x.", baselineRate: baseAudit.criticalRate, candidateRate: candidateAudit.criticalRate };
  return {
    schema: 1,
    passed: failed.length === 0,
    state: failed.length ? "PILOT_NOT_PASSED" : "PILOT_PASSED",
    gates,
    failed,
    hundredfold,
    publicationAllowed: false,
    rule: "Superar este piloto sólo autoriza ampliar la evaluación; nunca sustituye automáticamente a Nexo.",
  };
}

/** Trains and evaluates one reversible Nexo 2 model on exactly three decks. */
export async function runNexo2Pilot({
  deckIds = NEXO2_PILOT_DECKS,
  trainingGames = 54,
  evaluationGames = 72,
  seed = 8_200_000,
  workers = 4,
  maxSteps = 5_000,
  checkpointEvery = 9,
  decisionSampleLimit = 16,
  initialModel = null,
  onProgress = null,
  onCheckpoint = null,
} = {}) {
  const ids = pilotDecks(deckIds);
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: ids[0], seed: 1 }).manifest();
  const fingerprint = nexo2BaseFingerprint();
  if (initialModel?.pilot?.baseFingerprint && initialModel.pilot.baseFingerprint !== fingerprint) throw new Error("El checkpoint Nexo 2 pertenece a otra base.");
  const priorGames = Math.max(0, Number(initialModel?.pilot?.trainingGames) || 0);
  const learner = new StrategicBot({
    ...base,
    ...(initialModel ?? {}),
    id: "nexo2-pilot",
    botId: "nexo2-pilot",
    name: "Nexo 2 piloto",
    algorithm: NEXO2_ALGORITHM,
    style: "Política y valor con creencias públicas",
    state: "Candidato",
    deckId: ids[0],
    deck: getDeck(ids[0]),
    decisionConfig: {
      ...(base.decisionConfig ?? {}),
      ...(initialModel?.decisionConfig ?? {}),
      beliefScale: Number(initialModel?.decisionConfig?.beliefScale ?? 0.4),
      neuralScale: Number(initialModel?.decisionConfig?.neuralScale ?? 0.7),
      valueScale: Number(initialModel?.decisionConfig?.valueScale ?? 0.25),
      riskAversion: Number(initialModel?.decisionConfig?.riskAversion ?? 0.15),
      viabilityMargin: Number(initialModel?.decisionConfig?.viabilityMargin ?? 1.0),
      maxBaseRegret: Number(initialModel?.decisionConfig?.maxBaseRegret ?? 0.6),
    },
    training: true,
    exploration: Number(initialModel?.exploration ?? 0.12),
    seed,
  });
  const parallel = Math.max(1, Math.min(6, Math.floor(Number(workers) || 1)));
  const fights = [];
  const decisionLog = [];
  const trainingRaw = emptyStats(ids);
  const trainingCandidateAudits = [];
  const trainingBaseAudits = [];
  const totalTraining = Math.max(0, Math.floor(Number(trainingGames) || 0));

  for (let cursor = 0; cursor < totalTraining; cursor += parallel) {
    const snapshot = learner.manifest();
    const jobs = Array.from({ length: Math.min(parallel, totalTraining - cursor) }, (_, offset) => {
      const globalIndex = priorGames + cursor + offset;
      const job = scheduledJob(globalIndex, ids, seed, "training");
      return playPilotGame(job, { candidateManifest: { ...snapshot, exploration: Math.max(0.035, 0.12 * Math.pow(0.996, globalIndex)) }, training: true, maxSteps, decisionSampleLimit });
    });
    const batch = await Promise.all(jobs);
    for (const item of batch) {
      const outcome = addRun(trainingRaw, item);
      const reward = outcome === "win" ? 1 : outcome === "loss" || outcome === "invalid" ? -1 : 0;
      learner.learnFromEpisode(item.episode, reward);
      trainingCandidateAudits.push(item.candidateAudit);
      trainingBaseAudits.push(item.baseAudit);
      fights.push(compactFight(item, outcome, reward));
      decisionLog.push(...item.decisions);
    }
    const completed = Math.min(totalTraining, cursor + batch.length);
    const globalCompleted = priorGames + completed;
    onProgress?.({ stage: "training", completed, total: totalTraining, stats: finalizeStats(trainingRaw) });
    if (globalCompleted % Math.max(1, Number(checkpointEvery) || 1) === 0 || completed === totalTraining) {
      onCheckpoint?.({
        schema: 1,
        completed: globalCompleted,
        total: priorGames + totalTraining,
        candidate: { ...learner.manifest(), pilot: { schema: 1, baseFingerprint: fingerprint, deckIds: ids, trainingGames: globalCompleted } },
        training: finalizeStats(trainingRaw),
        savedAt: new Date().toISOString(),
      });
    }
  }

  learner.training = false;
  const candidate = {
    ...learner.manifest(),
    id: "nexo2-pilot",
    botId: "nexo2-pilot",
    name: "Nexo 2 piloto",
    state: "Candidato",
    pilot: { schema: 1, baseFingerprint: fingerprint, deckIds: ids, trainingGames: priorGames + totalTraining, runTrainingGames: totalTraining, seed: Number(seed) },
  };
  const evaluationRaw = emptyStats(ids);
  const evaluationCandidateAudits = [];
  const evaluationBaseAudits = [];
  const totalEvaluation = Math.max(1, Number(evaluationGames) || 1);
  const evaluationSeed = Number(seed) + 9_000_000;
  for (let cursor = 0; cursor < totalEvaluation; cursor += parallel) {
    const jobs = Array.from({ length: Math.min(parallel, totalEvaluation - cursor) }, (_, offset) => {
      const job = scheduledJob(cursor + offset, ids, evaluationSeed, "evaluation");
      return playPilotGame(job, { candidateManifest: candidate, training: false, maxSteps, decisionSampleLimit });
    });
    const batch = await Promise.all(jobs);
    for (const item of batch) {
      const outcome = addRun(evaluationRaw, item);
      evaluationCandidateAudits.push(item.candidateAudit);
      evaluationBaseAudits.push(item.baseAudit);
      fights.push(compactFight(item, outcome));
      decisionLog.push(...item.decisions);
    }
    onProgress?.({ stage: "evaluation", completed: Math.min(totalEvaluation, cursor + batch.length), total: totalEvaluation, stats: finalizeStats(evaluationRaw) });
  }

  const training = finalizeStats(trainingRaw);
  const evaluation = finalizeStats(evaluationRaw);
  const independentAudit = {
    candidate: mergeIndependentActionAudits(evaluationCandidateAudits),
    base: mergeIndependentActionAudits(evaluationBaseAudits),
  };
  const pilotGate = nexo2PilotGate({
    evaluation,
    candidateAudit: independentAudit.candidate,
    baseAudit: independentAudit.base,
    deckCount: ids.length,
    neuralTraining: candidate.neuralModel?.trainingState,
  });
  candidate.state = pilotGate.passed ? "Piloto superado" : "Candidato";
  candidate.pilot = { ...candidate.pilot, evaluationGames: totalEvaluation, gate: pilotGate };
  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    configuration: { deckIds: ids, trainingGames: totalTraining, priorTrainingGames: priorGames, evaluationGames: totalEvaluation, seed: Number(seed), workers: parallel, maxSteps },
    base: { id: UNIVERSAL_BOT_ID, name: "Nexo", fingerprint, contract: baseContract(base) },
    candidate,
    training,
    evaluation,
    independentAudit,
    pilotGate,
    fights,
    decisionLog,
    caveat: "El piloto sólo cubre tres mazos. La política nunca recibe identidades de mano o deck rivales y el candidato no sustituye al bot publicado.",
  };
}

function deckTable(rows) {
  return [
    "| Mazo del candidato | V-D-E | Puntuación | Inválidos |",
    "|---|---:|---:|---:|",
    ...Object.entries(rows).map(([deckId, row]) => `| ${deckId} | ${row.wins}-${row.losses}-${row.draws} | ${percent(row.scoreRate)} | ${row.invalid} |`),
  ].join("\n");
}

export function formatNexo2PilotMarkdown(report) {
  const gates = Object.entries(report.pilotGate.gates).map(([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`).join("\n");
  return `# Piloto Nexo 2 — tres mazos

Generado: ${report.createdAt}

Mazos: ${report.configuration.deckIds.join(", ")}

## Resultado retenido

- Entrenamiento: ${report.training.wins}-${report.training.losses}-${report.training.draws}; inválidos ${report.training.invalid}.
- Evaluación separada: ${report.evaluation.wins}-${report.evaluation.losses}-${report.evaluation.draws}; inválidos ${report.evaluation.invalid}.
- Win rate: ${percent(report.evaluation.winRate)}.
- Puntuación con empates: ${percent(report.evaluation.scoreRate)}.
- Confianza 95 % de victorias: ${percent(report.evaluation.confidence95.low)} – ${percent(report.evaluation.confidence95.high)}.

${deckTable(report.evaluation.byDeck)}

## Auditor independiente

| Modelo | Decisiones razonadas | Críticas | Revisión | Tasa crítica |
|---|---:|---:|---:|---:|
| Nexo 2 | ${report.independentAudit.candidate.reasoned} | ${report.independentAudit.candidate.critical} | ${report.independentAudit.candidate.review} | ${percent(report.independentAudit.candidate.criticalRate)} |
| Nexo base | ${report.independentAudit.base.reasoned} | ${report.independentAudit.base.critical} | ${report.independentAudit.base.review} | ${percent(report.independentAudit.base.criticalRate)} |

Este auditor trabaja sobre el mensaje, la respuesta y el estado público, no sobre la puntuación que usó el bot.

## Puertas del piloto

${gates}

Resultado: **${report.pilotGate.state}**

Medición 100x: **${report.pilotGate.hundredfold.measurable ? (report.pilotGate.hundredfold.passed ? "PASS" : "FAIL") : "NO MEDIBLE TODAVÍA"}**.

${report.pilotGate.rule}

## Límite

${report.caveat}
`;
}

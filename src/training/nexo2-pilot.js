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
import { NEXO2_ALL_DECK_IDS, NEXO2_ALL_OPPONENT_DECK_IDS, NEXO2_BOT_ID, NEXO2_DECK_IDS, NEXO2_OPPONENT_DECK_IDS } from "../bots/nexo2-contract.js";
import { NEXO2_DOCUMENTED_DECK_IDS } from "../bots/nexo2-deck-profiles.js";
import { GOAT_BASE_KNOWLEDGE_FINGERPRINT, GOAT_BASE_KNOWLEDGE_SCHEMA } from "../bots/goat-base-knowledge.js";

export const NEXO2_PILOT_DECKS = NEXO2_DECK_IDS;
export const NEXO2_OPPONENT_DECKS = NEXO2_OPPONENT_DECK_IDS;
export const NEXO2_UNIVERSAL_DECKS = NEXO2_ALL_DECK_IDS;
export const NEXO2_UNIVERSAL_OPPONENT_DECKS = NEXO2_ALL_OPPONENT_DECK_IDS;

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }
function percent(value) { return `${(Number(value) * 100).toFixed(1)} %`; }

function pilotDecks(values = NEXO2_PILOT_DECKS, { universal = false } = {}) {
  const ids = [...new Set(values)].map((deckId) => getDeck(deckId).id);
  const expected = universal ? NEXO2_UNIVERSAL_DECKS.length : 5;
  if (ids.length !== expected) throw new Error(universal ? `El currículo universal Nexo 2 exige los ${expected} mazos del catálogo.` : "El piloto Nexo 2 exige exactamente cinco mazos propios.");
  return ids;
}

function opponentDecks(values = NEXO2_OPPONENT_DECKS, { universal = false } = {}) {
  const ids = [...new Set(values)].map((deckId) => getDeck(deckId).id);
  const expected = universal ? NEXO2_UNIVERSAL_OPPONENT_DECKS.length : 20;
  if (ids.length !== expected) throw new Error(universal ? `El currículo universal Nexo 2 exige los ${expected} mazos rivales del catálogo.` : "El piloto Nexo 2 exige exactamente veinte mazos de enfrentamiento.");
  if (!universal) {
    const undocumented = ids.filter((deckId) => !NEXO2_DOCUMENTED_DECK_IDS.includes(deckId));
    if (undocumented.length) throw new Error(`Faltan fichas estratégicas Nexo 2 para: ${undocumented.join(", ")}.`);
  }
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
    baseKnowledgeSchema: Number(manifest.baseKnowledgeSchema) || GOAT_BASE_KNOWLEDGE_SCHEMA,
    baseKnowledgeFingerprint: manifest.baseKnowledgeFingerprint ?? GOAT_BASE_KNOWLEDGE_FINGERPRINT,
  };
}

export function nexo2BaseFingerprint() {
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: NEXO2_PILOT_DECKS[0], seed: 1 }).manifest();
  return hashString(JSON.stringify(baseContract(base)));
}

function emptyRow() { return { games: 0, validGames: 0, wins: 0, losses: 0, draws: 0, invalid: 0 }; }

function emptyStats(candidateDeckIds, opponentDeckIds) {
  const byDeck = Object.fromEntries(candidateDeckIds.map((deckId) => [deckId, emptyRow()]));
  const byOpponentDeck = Object.fromEntries(opponentDeckIds.map((deckId) => [deckId, emptyRow()]));
  const byMatchup = Object.fromEntries(candidateDeckIds.flatMap((candidateDeck) => opponentDeckIds.map((opponentDeck) => [`${candidateDeck}__vs__${opponentDeck}`, emptyRow()])));
  return { ...emptyRow(), turns: 0, decisions: 0, byDeck, byOpponentDeck, byMatchup };
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
  addOutcome(stats.byOpponentDeck[item.opponentDeck], outcome, item.validity.valid);
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
    byOpponentDeck: Object.fromEntries(Object.entries(stats.byOpponentDeck).map(([key, value]) => [key, finalizeRow(value)])),
    byMatchup: Object.fromEntries(Object.entries(stats.byMatchup).map(([key, value]) => [key, finalizeRow(value)])),
  };
}

function scheduledJob(index, candidateDeckIds, opponentDeckIds, seed, stage) {
  const pairCount = candidateDeckIds.length * opponentDeckIds.length;
  if (candidateDeckIds.length > 20 || opponentDeckIds.length > 20) {
    // Universal curriculum: each block is a round-robin row.  Rotating the
    // opponent by the round means that with N games every candidate and every
    // opponent receives the same number of samples (and the complete matrix
    // remains reproducible at candidateCount * opponentCount games).
    const candidateIndex = index % candidateDeckIds.length;
    const round = Math.floor(index / candidateDeckIds.length);
    const opponentIndex = (candidateIndex + round) % opponentDeckIds.length;
    const candidateSeat = (round + candidateIndex) % 2;
    return {
      stage,
      game: index + 1,
      candidateDeck: candidateDeckIds[candidateIndex],
      opponentDeck: opponentDeckIds[opponentIndex],
      candidateSeat,
      startingPlayer: round % 2 === 0 ? candidateSeat : 1 - candidateSeat,
      seed: Number(seed) + candidateIndex * 100_003 + round * 7_919,
    };
  }
  const pair = index % pairCount;
  const round = Math.floor(index / pairCount);
  const candidateDeck = candidateDeckIds[Math.floor(pair / opponentDeckIds.length)];
  const opponentDeck = opponentDeckIds[pair % opponentDeckIds.length];
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
    goatState: reasoning.baseKnowledge?.state ?? null,
    goatWindow: reasoning.baseKnowledge?.window ?? null,
    goatDamageStep: reasoning.baseKnowledge?.damageStep === true,
    baseKnowledge: reasoning.baseKnowledge ? { schema: reasoning.baseKnowledge.schema, fingerprint: reasoning.baseKnowledge.fingerprint } : null,
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
      reasonCodes: [...(reasoning.selected.reasonCodes ?? [])],
      localRewardSignal: Number(reasoning.selected.localRewardSignal) || 0,
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
      reasonCodes: [...(reasoning.alternatives[0].reasonCodes ?? [])],
      localRewardSignal: Number(reasoning.alternatives[0].localRewardSignal) || 0,
    } : null,
    rejected: (reasoning.rejected ?? []).map((entry) => ({ guardrail: entry.guardrail, reasonCodes: [...(entry.reasonCodes ?? [])] })).filter((entry) => entry.guardrail),
  });
}

async function playPilotGame(job, { candidateManifest, training, maxSteps, decisionSampleLimit }) {
  const candidateDeck = getDeck(job.candidateDeck);
  const opponentDeck = getDeck(job.opponentDeck);
  const candidate = new StrategicBot({
    ...candidateManifest,
    id: NEXO2_BOT_ID,
    botId: NEXO2_BOT_ID,
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

export function nexo2PilotGate({ evaluation, candidateAudit, baseAudit, deckCount = 5, opponentDeckCount = 20, neuralTraining, curriculum = "pilot" }) {
  const universal = curriculum === "universal";
  const expectedDeckCount = universal ? NEXO2_UNIVERSAL_DECKS.length : 5;
  const expectedOpponentDeckCount = universal ? NEXO2_UNIVERSAL_OPPONENT_DECKS.length : 20;
  const deckRows = Object.values(evaluation.byDeck ?? {});
  const opponentRows = Object.values(evaluation.byOpponentDeck ?? {});
  const requiredEvidence = Math.max(100, Number(opponentDeckCount) * 5);
  const gates = {
    exactlyFivePilotDecks: deckCount === expectedDeckCount,
    exactlyTwentyOpponentDecks: opponentDeckCount === expectedOpponentDeckCount,
    validEngineRuns: evaluation.invalid === 0,
    enoughPilotEvidence: evaluation.validGames >= requiredEvidence,
    noIndependentCriticalErrors: candidateAudit.critical === 0,
    noCriticalRegression: candidateAudit.criticalRate <= baseAudit.criticalRate,
    activeNeuralLearning: Number(neuralTraining?.updates) > 0,
    competitiveAggregate: evaluation.wins > evaluation.losses && evaluation.scoreRate >= 0.55,
    everyPilotDeckCompetitive: deckRows.length === expectedDeckCount && deckRows.every((row) => row.validGames >= (universal ? 2 : 4) && row.scoreRate >= 0.45),
    everyOpponentCovered: opponentRows.length === expectedOpponentDeckCount && opponentRows.every((row) => row.validGames >= (universal ? 2 : 5)),
    confidenceAboveWeakness: Number(evaluation.confidence95?.low) > 0.45,
  };
  const failed = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
  const hundredfold = baseAudit.critical >= 10
    ? { measurable: true, passed: candidateAudit.criticalRate <= baseAudit.criticalRate / 100, baselineRate: baseAudit.criticalRate, candidateRate: candidateAudit.criticalRate }
    : { measurable: false, passed: false, reason: "La base no produjo al menos diez errores críticos en esta muestra; no puede medirse honestamente una reducción de 100x.", baselineRate: baseAudit.criticalRate, candidateRate: candidateAudit.criticalRate };
  return {
    schema: 1,
    passed: failed.length === 0,
    state: failed.length ? (universal ? "UNIVERSAL_NOT_PASSED" : "PILOT_NOT_PASSED") : (universal ? "UNIVERSAL_PASSED" : "PILOT_PASSED"),
    gates,
    failed,
    hundredfold,
    publicationAllowed: false,
    rule: universal ? "La cobertura universal sólo autoriza sustituir Nexo tras superar todas las comprobaciones; el volumen no sustituye la validez." : "Superar este piloto sólo autoriza ampliar la evaluación; nunca sustituye automáticamente a Nexo.",
  };
}

/** Trains either the historical five-by-twenty pilot or the full catalog curriculum. */
export async function runNexo2Pilot({
  deckIds = NEXO2_PILOT_DECKS,
  opponentDeckIds = NEXO2_OPPONENT_DECKS,
  curriculum = "pilot",
  trainingGames = 500,
  evaluationGames = 400,
  seed = 8_200_000,
  workers = 4,
  maxSteps = 10_000,
  checkpointEvery = 9,
  decisionSampleLimit = 16,
  initialModel = null,
  onProgress = null,
  onCheckpoint = null,
} = {}) {
  const universal = curriculum === "universal";
  const ids = pilotDecks(deckIds, { universal });
  const opponentIds = opponentDecks(opponentDeckIds, { universal });
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: ids[0], seed: 1 }).manifest();
  const fingerprint = nexo2BaseFingerprint();
  if (initialModel?.pilot?.baseFingerprint && initialModel.pilot.baseFingerprint !== fingerprint) throw new Error("El checkpoint Nexo 2 pertenece a otra base.");
  const priorGames = Math.max(0, Number(initialModel?.pilot?.trainingGames) || 0);
  const learner = new StrategicBot({
    ...base,
    ...(initialModel ?? {}),
    id: NEXO2_BOT_ID,
    botId: NEXO2_BOT_ID,
    name: universal ? "Nexo 2 universal" : "Nexo 2 piloto",
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
  const trainingRaw = emptyStats(ids, opponentIds);
  const trainingCandidateAudits = [];
  const trainingBaseAudits = [];
  const totalTraining = Math.max(0, Math.floor(Number(trainingGames) || 0));

  for (let cursor = 0; cursor < totalTraining; cursor += parallel) {
    const snapshot = learner.manifest();
    const jobs = Array.from({ length: Math.min(parallel, totalTraining - cursor) }, (_, offset) => {
      const globalIndex = priorGames + cursor + offset;
      const job = scheduledJob(globalIndex, ids, opponentIds, seed, "training");
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
    const checkpointInterval = Math.max(1, Number(checkpointEvery) || 1);
    if (completed === totalTraining || globalCompleted % checkpointInterval < batch.length) {
      onCheckpoint?.({
        schema: 1,
        completed: globalCompleted,
        total: priorGames + totalTraining,
        candidate: { ...learner.manifest(), pilot: { schema: 3, curriculum, baseFingerprint: fingerprint, deckIds: ids, opponentDeckIds: opponentIds, trainingGames: globalCompleted } },
        training: finalizeStats(trainingRaw),
        savedAt: new Date().toISOString(),
      });
    }
  }

  learner.training = false;
  const candidate = {
    ...learner.manifest(),
    id: NEXO2_BOT_ID,
    botId: NEXO2_BOT_ID,
    name: universal ? "Nexo 2 universal" : "Nexo 2 piloto",
    state: "Candidato",
    pilot: { schema: 3, curriculum, baseFingerprint: fingerprint, deckIds: ids, opponentDeckIds: opponentIds, trainingGames: priorGames + totalTraining, runTrainingGames: totalTraining, seed: Number(seed) },
  };
  const evaluationRaw = emptyStats(ids, opponentIds);
  const evaluationCandidateAudits = [];
  const evaluationBaseAudits = [];
  const totalEvaluation = Math.max(1, Number(evaluationGames) || 1);
  const evaluationSeed = Number(seed) + 9_000_000;
  for (let cursor = 0; cursor < totalEvaluation; cursor += parallel) {
    const jobs = Array.from({ length: Math.min(parallel, totalEvaluation - cursor) }, (_, offset) => {
      const job = scheduledJob(cursor + offset, ids, opponentIds, evaluationSeed, "evaluation");
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
    opponentDeckCount: opponentIds.length,
    neuralTraining: candidate.neuralModel?.trainingState,
    curriculum,
  });
  candidate.state = pilotGate.passed ? "Piloto superado" : "Candidato";
  candidate.pilot = { ...candidate.pilot, evaluationGames: totalEvaluation, gate: pilotGate };
  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    configuration: { curriculum, deckIds: ids, opponentDeckIds: opponentIds, catalogDeckCount: NEXO2_UNIVERSAL_DECKS.length, explicitlyDocumentedDeckCount: NEXO2_DOCUMENTED_DECK_IDS.length, trainingGames: totalTraining, priorTrainingGames: priorGames, evaluationGames: totalEvaluation, seed: Number(seed), workers: parallel, maxSteps },
    base: { id: UNIVERSAL_BOT_ID, name: "Nexo", fingerprint, contract: baseContract(base) },
    candidate,
    training,
    evaluation,
    independentAudit,
    pilotGate,
    fights,
    decisionLog,
    caveat: universal ? "El currículo cubre el catálogo completo como mazo propio y rival. Las fichas no explícitas usan una lectura estratégica derivada de sus cartas; la política nunca recibe identidades de mano o Deck rivales." : "El piloto cubre cinco mazos propios y veinte enfrentamientos documentados. La política nunca recibe identidades de mano o Deck rivales y el candidato no sustituye al bot publicado.",
  };
}

function deckTable(rows) {
  return [
    "| Mazo del candidato | V-D-E | Puntuación | Inválidos |",
    "|---|---:|---:|---:|",
    ...Object.entries(rows).map(([deckId, row]) => `| ${deckId} | ${row.wins}-${row.losses}-${row.draws} | ${percent(row.scoreRate)} | ${row.invalid} |`),
  ].join("\n");
}

function opponentTable(rows) {
  return [
    "| Oponente | V-D-E | Puntuación | Inválidos |",
    "|---|---:|---:|---:|",
    ...Object.entries(rows).map(([deckId, row]) => `| ${deckId} | ${row.wins}-${row.losses}-${row.draws} | ${percent(row.scoreRate)} | ${row.invalid} |`),
  ].join("\n");
}

export function formatNexo2PilotMarkdown(report) {
  const gates = Object.entries(report.pilotGate.gates).map(([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`).join("\n");
  const universal = report.configuration.curriculum === "universal";
  const title = universal ? `# Nexo 2 universal — ${report.configuration.deckIds.length} mazos contra ${report.configuration.opponentDeckIds.length}` : "# Piloto Nexo 2 — cinco mazos contra veinte";
  const deckHeading = universal ? `## Cobertura de los ${report.configuration.deckIds.length} mazos propios` : "";
  const opponentHeading = universal ? `## Cobertura de los ${report.configuration.opponentDeckIds.length} oponentes` : "## Cobertura de los veinte oponentes";
  return `${title}

Generado: ${report.createdAt}

Mazos propios: ${report.configuration.deckIds.join(", ")}

Mazos de enfrentamiento: ${report.configuration.opponentDeckIds.join(", ")}

## Resultado retenido

- Entrenamiento: ${report.training.wins}-${report.training.losses}-${report.training.draws}; inválidos ${report.training.invalid}.
- Evaluación separada: ${report.evaluation.wins}-${report.evaluation.losses}-${report.evaluation.draws}; inválidos ${report.evaluation.invalid}.
- Win rate: ${percent(report.evaluation.winRate)}.
- Puntuación con empates: ${percent(report.evaluation.scoreRate)}.
- Confianza 95 % de victorias: ${percent(report.evaluation.confidence95.low)} – ${percent(report.evaluation.confidence95.high)}.
- Fichas estratégicas: ${report.configuration.explicitlyDocumentedDeckCount} explícitas y ${report.configuration.catalogDeckCount - report.configuration.explicitlyDocumentedDeckCount} derivadas desde las cartas del catálogo.

${deckHeading}

${deckTable(report.evaluation.byDeck)}

${opponentHeading}

${opponentTable(report.evaluation.byOpponentDeck)}

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

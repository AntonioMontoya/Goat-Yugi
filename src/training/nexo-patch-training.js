import { confidenceInterval95 } from "../analytics/statistics.js";
import { UNIVERSAL_BOT_ID, createBotForDeck } from "../bots/bot-system.js";
import { DECISION_GUARDRAIL_SCHEMA } from "../bots/decision-guardrails.js";
import { StrategicBot } from "../bots/strategic.js";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { hashString } from "../engine/rng.js";
import { createActionQualityCollector, mergeActionQualityAudits } from "./action-quality-audit.js";
import { inspectOcgcoreRun } from "./ocgcore-run-validity.js";

export const NEXO_PATCH_DECKS = Object.freeze(["chaos-turbo", "goat-control", "flip-control", "warrior", "panda-burn"]);

function cardNames(ids = []) { return ids.map((id) => getCard(id)?.name ?? String(id)); }
function uniqueDecks(values = []) { return [...new Set(values)].map((deckId) => getDeck(deckId).id); }
function percent(value) { return `${(Number(value) * 100).toFixed(1)} %`; }

function baselineContract(manifest = {}) {
  return {
    algorithm: manifest.algorithm,
    decisionConfig: structuredClone(manifest.decisionConfig ?? {}),
    policyWeights: structuredClone(manifest.policyWeights ?? {}),
    policySchema: Number(manifest.policySchema) || 0,
    decisionSchema: Number(manifest.decisionSchema) || 0,
    guardrailSchema: DECISION_GUARDRAIL_SCHEMA,
  };
}

export function nexoBaselineFingerprint(deckId = NEXO_PATCH_DECKS[0]) {
  const manifest = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId, seed: 1 }).manifest();
  return hashString(JSON.stringify(baselineContract(manifest)));
}

function emptyMatchStats(deckIds) {
  return {
    games: 0, validGames: 0, wins: 0, losses: 0, draws: 0, invalid: 0,
    turns: 0, decisions: 0,
    byDeck: Object.fromEntries(deckIds.map((deckId) => [deckId, { games: 0, wins: 0, losses: 0, draws: 0, invalid: 0 }])),
  };
}

function addMatch(stats, deckId, run, validity) {
  const row = stats.byDeck[deckId];
  stats.games += 1; row.games += 1;
  stats.turns += Number(run.turns) || 0;
  stats.decisions += Number(run.decisions) || 0;
  if (!validity.valid) { stats.invalid += 1; row.invalid += 1; return; }
  stats.validGames += 1;
  if (run.winner === 0) { stats.wins += 1; row.wins += 1; }
  else if (run.winner === 1) { stats.losses += 1; row.losses += 1; }
  else { stats.draws += 1; row.draws += 1; }
}

function finalizeMatchStats(stats) {
  const valid = Math.max(1, stats.validGames);
  return {
    ...stats,
    winRate: stats.wins / valid,
    scoreRate: (stats.wins + stats.draws * 0.5) / valid,
    confidence95: confidenceInterval95(stats.wins, stats.validGames),
    averageTurns: stats.turns / Math.max(1, stats.games),
    averageDecisions: stats.decisions / Math.max(1, stats.games),
  };
}

function actionSummary(audit) {
  return {
    decisions: audit.decisions,
    reasoned: audit.reasoned,
    quality: structuredClone(audit.quality),
    rates: structuredClone(audit.rates),
    averages: structuredClone(audit.averages),
    byRole: structuredClone(audit.byRole),
    guardrailsAvoided: structuredClone(audit.guardrailsAvoided),
  };
}

function compactDecision(record, { stage, game, seat }) {
  const alternative = record.alternatives?.[0];
  return {
    schema: 1,
    stage,
    game,
    seat,
    deckId: record.deckId,
    seed: record.seed,
    decision: record.decision,
    turn: record.turn,
    phase: record.phase,
    requestType: record.requestType,
    playstyle: record.playstyle,
    quality: record.quality,
    publicState: structuredClone(record.publicState),
    selected: {
      role: record.selected?.role,
      cards: [...(record.selected?.cards ?? [])],
      semanticRoles: [...(record.selected?.semanticRoles ?? [])],
      score: record.selected?.score,
      plannedScore: record.selected?.plannedScore,
      projectedValue: record.selected?.projectedValue,
      policyValue: record.selected?.policyValue,
      reasons: [...(record.selected?.reasons ?? [])],
    },
    alternative: alternative ? {
      role: alternative.role,
      cards: [...(alternative.cards ?? [])],
      score: alternative.score,
      plannedScore: alternative.plannedScore,
      projectedValue: alternative.projectedValue,
      reasons: [...(alternative.reasons ?? [])],
    } : null,
    guardrailsAvoided: [...record.guardrailsAvoided],
    scoreMargin: record.scoreMargin,
    plannedRegret: record.plannedRegret,
  };
}

function rewardFor(run, validity) {
  if (!validity.valid) return -1;
  return run.winner === 0 ? 1 : run.winner === 1 ? -1 : 0;
}

function outcomeFor(run, validity) {
  if (!validity.valid) return "invalid";
  return run.winner === 0 ? "candidate-win" : run.winner === 1 ? "base-win" : "draw";
}

async function playPatchGame({ stage, game, deckId, seed, startingPlayer, candidateManifest, training, maxSteps, sampleLimit }) {
  const deck = getDeck(deckId);
  const candidateRecords = [];
  const baseRecords = [];
  const candidateAudit = createActionQualityCollector({
    metadata: { game, deckId, seed }, sampleLimit, targetPlayer: 0,
    onRecord: (record) => { if (record.quality !== "forced") candidateRecords.push(compactDecision(record, { stage, game, seat: "candidate" })); },
  });
  const baseAudit = createActionQualityCollector({
    metadata: { game, deckId, seed }, sampleLimit, targetPlayer: 1,
    onRecord: (record) => { if (record.quality !== "forced") baseRecords.push(compactDecision(record, { stage, game, seat: "base" })); },
  });
  const candidate = new StrategicBot({
    ...candidateManifest,
    id: "nexo-patch-candidate",
    botId: "nexo-patch-candidate",
    name: "Nexo Patch Candidate",
    deckId,
    profile: deckId,
    deck,
    training,
    seed: seed ^ 0x9e3779b9,
  });
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId, seed: seed ^ 0x51ed270b });
  const run = await runOcgcoreHeadless({
    decks: [cardNames(deck.main), cardNames(deck.main)],
    extraDecks: [cardNames(deck.fusion), cardNames(deck.fusion)],
    seed, startingPlayer, maxSteps,
    botA: candidate, botB: base,
    profileA: deckId, profileB: deckId,
    onDecision: (trace, context) => {
      candidateAudit.capture(trace, context);
      baseAudit.capture(trace, context);
    },
  });
  const validity = inspectOcgcoreRun(run);
  return {
    stage, game, deckId, seed, startingPlayer, run, validity,
    episode: training ? candidate.consumeEpisode() : [],
    candidateAudit: candidateAudit.result(),
    baseAudit: baseAudit.result(),
    decisions: [...candidateRecords, ...baseRecords],
  };
}

function fightRecord(item, reward = null) {
  return {
    schema: 1,
    stage: item.stage,
    game: item.game,
    deckId: item.deckId,
    seed: item.seed,
    startingPlayer: item.startingPlayer,
    outcome: outcomeFor(item.run, item.validity),
    winner: item.run.winner,
    valid: item.validity.valid,
    validityReasons: [...item.validity.reasons],
    terminationReason: item.run.terminationReason,
    turns: item.run.turns,
    decisions: item.run.decisions,
    learning: reward === null ? null : { reward, trajectoryDecisions: item.episode.length },
    candidateActions: actionSummary(item.candidateAudit),
    baseActions: actionSummary(item.baseAudit),
  };
}

export function nexoPatchPromotionGate({ baselineFingerprint, expectedFingerprint, training, evaluation, candidateActions, baseActions, deckCount }) {
  const gates = {
    baselinePinned: baselineFingerprint === expectedFingerprint,
    trainingClean: training.invalid === 0,
    evaluationClean: evaluation.invalid === 0,
    enoughEvidence: evaluation.validGames >= 40 && deckCount >= 5,
    candidateActionsClean: candidateActions.quality.suspicious === 0 && candidateActions.rates.review <= 0.002,
    noActionRegression: candidateActions.rates.suspicious <= baseActions.rates.suspicious
      && candidateActions.rates.review <= baseActions.rates.review + 0.002
      && candidateActions.averages.projectedValue >= baseActions.averages.projectedValue - 0.05,
    beatsBase: evaluation.wins > evaluation.losses
      && evaluation.scoreRate >= 0.55
      && Number(evaluation.confidence95.low) > 0.50,
  };
  const failed = Object.entries(gates).filter(([, value]) => !value).map(([name]) => name);
  return {
    schema: 1,
    passed: failed.length === 0,
    state: failed.length ? "CANDIDATE_NOT_PROMOTED" : "PATCH_PROMOTABLE",
    failed,
    gates,
    rule: "El parche sólo puede sustituir a Nexo si vence a la base fijada, no degrada las acciones y toda la ejecución OCGCore es válida.",
  };
}

/**
 * Trains a reversible challenger from the current Nexo manifest. Every duel is
 * logged, while only public, reasoned decisions are retained individually.
 * The active base is never overwritten by this function.
 */
export async function trainNexoPatch({
  deckIds = NEXO_PATCH_DECKS,
  trainingGames = 24,
  evaluationGames = 40,
  seed = 8_160_000,
  workers = 4,
  maxSteps = 5_000,
  checkpointEvery = 8,
  sampleLimit = 12,
  initialModel = null,
  onProgress = null,
  onCheckpoint = null,
} = {}) {
  const ids = uniqueDecks(deckIds);
  const base = createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: ids[0], seed: 1 }).manifest();
  const baselineFingerprint = nexoBaselineFingerprint(ids[0]);
  const initialFingerprint = initialModel?.patch?.baseFingerprint ?? baselineFingerprint;
  if (initialModel && initialFingerprint !== baselineFingerprint) throw new Error("El checkpoint pertenece a otra base de Nexo.");
  const priorTrainingGames = Math.max(0, Number(initialModel?.patch?.trainingGames) || 0);
  const learner = new StrategicBot({
    ...base,
    ...(initialModel ?? {}),
    id: "nexo-patch-candidate",
    botId: "nexo-patch-candidate",
    name: "Nexo Patch Candidate",
    state: "Candidato",
    deckId: ids[0],
    deck: getDeck(ids[0]),
    training: true,
    exploration: initialModel?.exploration ?? 0.10,
    seed,
  });
  const fights = [];
  const decisionLog = [];
  const trainingRaw = emptyMatchStats(ids);
  const trainingCandidateAudits = [];
  const trainingBaseAudits = [];
  const totalTraining = Math.max(1, Number(trainingGames) || 1);
  const parallel = Math.max(1, Math.min(6, Math.floor(Number(workers) || 1)));
  for (let cursor = 0; cursor < totalTraining; cursor += parallel) {
    const snapshot = learner.manifest();
    const jobs = Array.from({ length: Math.min(parallel, totalTraining - cursor) }, (_, offset) => {
      const index = cursor + offset;
      return {
        stage: "training",
        game: index + 1,
        deckId: ids[index % ids.length],
        seed: Number(seed) + index,
        startingPlayer: index % 2,
        candidateManifest: { ...snapshot, exploration: Math.max(0.025, 0.10 * Math.pow(0.997, index)) },
        training: true,
        maxSteps,
        sampleLimit,
      };
    });
    const batch = await Promise.all(jobs.map(playPatchGame));
    for (const item of batch) {
      const reward = rewardFor(item.run, item.validity);
      learner.learnFromEpisode(item.episode, reward);
      addMatch(trainingRaw, item.deckId, item.run, item.validity);
      trainingCandidateAudits.push(item.candidateAudit);
      trainingBaseAudits.push(item.baseAudit);
      fights.push(fightRecord(item, reward));
      decisionLog.push(...item.decisions);
    }
    const completed = Math.min(totalTraining, cursor + batch.length);
    onProgress?.({ stage: "training", completed, total: totalTraining, stats: finalizeMatchStats(trainingRaw) });
    if (completed % Math.max(1, Number(checkpointEvery) || 1) === 0 || completed === totalTraining) {
      onCheckpoint?.({
        schema: 1,
        completed,
        total: totalTraining,
        baseFingerprint: baselineFingerprint,
        candidate: { ...learner.manifest(), patch: { baseFingerprint: baselineFingerprint, trainingGames: priorTrainingGames + completed } },
        training: finalizeMatchStats(trainingRaw),
        savedAt: new Date().toISOString(),
      });
    }
  }

  learner.training = false;
  const candidateManifest = {
    ...learner.manifest(),
    id: "nexo-patch-candidate",
    botId: "nexo-patch-candidate",
    name: "Nexo Patch Candidate",
    state: "Candidato",
    patch: { schema: 1, baseFingerprint: baselineFingerprint, trainingGames: priorTrainingGames + totalTraining, runTrainingGames: totalTraining, seed: Number(seed) },
  };
  const evaluationRaw = emptyMatchStats(ids);
  const evaluationCandidateAudits = [];
  const evaluationBaseAudits = [];
  const totalEvaluation = Math.max(1, Number(evaluationGames) || 1);
  for (let cursor = 0; cursor < totalEvaluation; cursor += parallel) {
    const jobs = Array.from({ length: Math.min(parallel, totalEvaluation - cursor) }, (_, offset) => {
      const index = cursor + offset;
      const deckIndex = index % ids.length;
      return {
        stage: "evaluation",
        game: index + 1,
        deckId: ids[deckIndex],
        seed: Number(seed) + 900_000 + deckIndex * 100_003 + Math.floor(index / ids.length),
        startingPlayer: index % 2,
        candidateManifest,
        training: false,
        maxSteps,
        sampleLimit,
      };
    });
    const batch = await Promise.all(jobs.map(playPatchGame));
    for (const item of batch) {
      addMatch(evaluationRaw, item.deckId, item.run, item.validity);
      evaluationCandidateAudits.push(item.candidateAudit);
      evaluationBaseAudits.push(item.baseAudit);
      fights.push(fightRecord(item));
      decisionLog.push(...item.decisions);
    }
    onProgress?.({ stage: "evaluation", completed: Math.min(totalEvaluation, cursor + batch.length), total: totalEvaluation, stats: finalizeMatchStats(evaluationRaw) });
  }

  const training = finalizeMatchStats(trainingRaw);
  const evaluation = finalizeMatchStats(evaluationRaw);
  const candidateActions = mergeActionQualityAudits(evaluationCandidateAudits, { sampleLimit });
  const baseActions = mergeActionQualityAudits(evaluationBaseAudits, { sampleLimit });
  const promotion = nexoPatchPromotionGate({
    baselineFingerprint,
    expectedFingerprint: nexoBaselineFingerprint(ids[0]),
    training,
    evaluation,
    candidateActions,
    baseActions,
    deckCount: ids.length,
  });
  candidateManifest.state = promotion.passed ? "Promocionable" : "Candidato";
  candidateManifest.patch = { ...candidateManifest.patch, evaluationGames: totalEvaluation, promotion };
  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    configuration: { deckIds: ids, trainingGames: totalTraining, priorTrainingGames, evaluationGames: totalEvaluation, seed: Number(seed), workers: parallel, maxSteps },
    base: { id: UNIVERSAL_BOT_ID, name: "Nexo", fingerprint: baselineFingerprint, contract: baselineContract(base) },
    candidate: candidateManifest,
    training,
    evaluation,
    actionComparison: { candidate: candidateActions, base: baseActions },
    promotion,
    fights,
    decisionLog,
    caveat: "Los registros atribuyen resultados y comparan alternativas públicas; no revelan información oculta ni prueban que una acción sea óptima en todos los estados.",
  };
}

function deckTable(stats) {
  const rows = Object.entries(stats.byDeck).map(([deckId, row]) => `| ${deckId} | ${row.wins}-${row.losses}-${row.draws} | ${row.invalid} |`);
  return ["| Mazo espejo | V-D-E del parche | Inválidos |", "|---|---:|---:|", ...rows].join("\n");
}

export function formatNexoPatchMarkdown(report) {
  const candidate = report.actionComparison.candidate;
  const base = report.actionComparison.base;
  const gates = Object.entries(report.promotion.gates).map(([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`).join("\n");
  return `# Entrenamiento del parche de Nexo

Generado: ${report.createdAt}

Base fijada: Nexo ${report.base.fingerprint}

## Entrenamiento

- Duelos: ${report.training.games}
- Resultado del candidato: ${report.training.wins}-${report.training.losses}-${report.training.draws}
- Inválidos: ${report.training.invalid}

## Evaluación separada contra la base

- Duelos: ${report.evaluation.games}
- Resultado del parche: ${report.evaluation.wins}-${report.evaluation.losses}-${report.evaluation.draws}
- Win rate: ${percent(report.evaluation.winRate)}
- Puntuación con empates: ${percent(report.evaluation.scoreRate)}
- Confianza 95 % de victorias: ${percent(report.evaluation.confidence95.low)} – ${percent(report.evaluation.confidence95.high)}
- Inválidos: ${report.evaluation.invalid}

${deckTable(report.evaluation)}

## Comparación de acciones en evaluación

| Modelo | Examinadas | Razonadas | Sólidas | Revisión | Sospechosas | Valor público medio |
|---|---:|---:|---:|---:|---:|---:|
| Parche | ${candidate.decisions} | ${candidate.reasoned} | ${candidate.quality.sound} | ${candidate.quality.review} | ${candidate.quality.suspicious} | ${candidate.averages.projectedValue.toFixed(3)} |
| Nexo base | ${base.decisions} | ${base.reasoned} | ${base.quality.sound} | ${base.quality.review} | ${base.quality.suspicious} | ${base.averages.projectedValue.toFixed(3)} |

## Puertas de promoción

${gates}

Resultado: **${report.promotion.state}**

${report.promotion.rule}

## Registro retenido

- Un registro por combate con seed, mazo, asiento, resultado, validez y resumen de acciones.
- Un registro compacto por cada decisión razonada de ambos bots; las respuestas forzadas quedan contabilizadas en el resumen.
- La base activa no se modifica durante el entrenamiento.

## Límite

${report.caveat}
`;
}

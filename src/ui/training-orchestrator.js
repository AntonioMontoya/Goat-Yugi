import { UNIVERSAL_BOT_ID, hydrateBot } from "../bots/bot-system.js";
import { trainUniversalBot } from "../training/universal-training.js";

export async function orchestrateTraining({ app, render, saveBotRegistry, resume = false } = {}) {
  const t = app.training;
  if (t.running) return;
  t.requestedStatus = null;
  if (resume) {
    if (!t.candidate || t.complete >= t.total) return;
    t.candidate = hydrateBot(t.candidate?.manifest?.() ?? t.candidate);
  } else {
    t.total = Math.min(10_000, Math.max(10, Number(document.querySelector("#training-total")?.value) || 100));
    t.deckId = document.querySelector("#training-deck")?.value || "goat-control";
    t.botName = "Nexo";
    t.botId = UNIVERSAL_BOT_ID;
    t.algorithm = "ocgcore-public-strategic-v4";
    t.candidate = null;
    t.complete = 0;
    t.results = [];
    t.stats = null;
    t.evaluation = null;
    t.model = null;
    t.certification = null;
    t.bytes = 0;
    t.speed = 0;
    t.checkpoint = 0;
    t.approved = false;
    t.error = null;
    t.startedAt = Date.now();
    saveBotRegistry(app.botRegistry);
  }
  t.running = true;
  t.status = "RUNNING";
  t.engine = "ocgcore";
  t.error = null;
  t.abortController = new AbortController();
  const startedAt = t.startedAt ?? Date.now();
  t.startedAt = startedAt;
  render();
  try {
    const initial = resume ? (t.candidate?.manifest?.() ?? t.candidate) : null;
    const remaining = resume ? Math.max(0, t.total - t.complete) : t.total;
    const offset = resume ? t.complete : 0;
    const run = await trainUniversalBot({
      selectedDeckId: t.deckId,
      deckIds: t.opponentDeckIds,
      games: remaining,
      seed: t.seed + offset * 100_003,
      workers: t.workers,
      initialModel: initial,
      abortSignal: t.abortController.signal,
      checkpointEvery: 25,
      onProgress: ({ completed, stats }) => {
        t.complete = offset + completed;
        t.stats = stats;
        t.speed = t.complete / Math.max(0.001, (Date.now() - startedAt) / 1000);
        render();
      },
      onCheckpoint: (checkpoint) => {
        t.checkpoint = { ...checkpoint, completed: offset + checkpoint.completed, total: t.total };
        t.candidate = hydrateBot(checkpoint.candidate);
        render();
      },
    });
    t.complete = offset + run.completed;
    t.stats = run.trainingStats;
    t.evaluation = run.evaluation;
    t.model = run.model;
    t.bytes = new TextEncoder().encode(JSON.stringify(run.model)).byteLength;
    t.certification = { schema: 1, certified: run.quality.passed, targetIntelligence: 0, reason: run.quality.reason, quality: run.quality, reasoningAudit: run.reasoningAudit };
    t.candidate = hydrateBot(run.model);
    t.speed = t.complete / Math.max(0.001, (Date.now() - startedAt) / 1000);
    t.running = false;
    t.status = t.requestedStatus ?? (run.cancelled ? "CANCELLED" : "COMPLETED");
    t.requestedStatus = null;
    t.abortController = null;
    if (!t.checkpoint || t.checkpoint.completed !== t.complete) t.checkpoint = { completed: t.complete, total: t.total, candidate: run.model, savedAt: new Date().toISOString() };
    app.toast = run.cancelled
      ? `Lote pausado en ${t.complete}/${t.total}; el refinamiento de Nexo queda conservado.`
      : run.quality.passed
        ? "Refinamiento terminado: superó razonamiento y evaluación separada."
        : `Refinamiento conservado como candidato: ${run.quality.reason}.`;
  } catch (error) {
    t.running = false;
    t.status = "FAILED";
    t.error = error instanceof Error ? error.message : String(error);
    t.abortController = null;
    app.toast = `Entrenamiento detenido: ${t.error}`;
  }
  render();
}

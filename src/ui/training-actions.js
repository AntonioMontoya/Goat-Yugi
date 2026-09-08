import { UNIVERSAL_BOT_ID, hydrateBot, recordBotModel } from "../bots/bot-system.js";
import { evaluateUniversalPolicy, universalQualityGate } from "../training/training.js";
import { upsertLadderBot } from "../ranking/ladder.js";
import { saveLocalState } from "../storage/local.js";

export function handleTrainingAction({ action, app, render, startTraining, saveBotRegistry, persistPlaySelection }) {
  if (action === "pause-training") {
    const training = app.training;
    training.requestedStatus = "PAUSED";
    training.abortController?.abort();
    training.status = "PAUSED";
    app.toast = "Pausa solicitada; el motor cerrará la partida actual y conservará el checkpoint.";
    render();
    return true;
  }
  if (action === "resume-training") {
    startTraining({ resume: true });
    return true;
  }
  if (action === "cancel-training") {
    const training = app.training;
    training.requestedStatus = "CANCELLED";
    training.abortController?.abort();
    if (!training.running) training.status = "CANCELLED";
    app.toast = "Cancelación solicitada; candidato y métricas se conservarán.";
    render();
    return true;
  }
  if (action === "evaluate-training") {
    const training = app.training;
    if (training.candidate && !training.running) {
      training.status = "EVALUATING";
      render();
      const candidate = hydrateBot(training.candidate?.manifest?.() ?? training.candidate);
      evaluateUniversalPolicy({
        candidate,
        deckIds: training.opponentDeckIds,
        gamesPerDeck: Math.max(1, Math.min(10, Math.floor(Math.max(1, training.complete) / 10))),
        seed: training.seed + 8000,
      }).then((evaluation) => {
        training.evaluation = evaluation;
        const manifest = candidate.manifest?.() ?? candidate;
        const quality = universalQualityGate({ training: training.stats, evaluation, reasoningAudit: manifest.reasoningAudit });
        training.certification = { schema: 1, certified: quality.passed, reason: quality.reason, quality, reasoningAudit: manifest.reasoningAudit };
        training.status = "PAUSED";
        app.toast = "Evaluación separada OCGCore completada.";
      }).catch((error) => {
        training.status = "FAILED";
        training.error = error instanceof Error ? error.message : String(error);
        app.toast = `Evaluación detenida: ${training.error}`;
      }).finally(() => render());
    }
    return true;
  }
  if (action === "approve-candidate") {
    const training = app.training;
    const manifest = training.candidate?.manifest?.() ?? training.candidate;
    if (manifest?.algorithm) {
      try {
        if (!training.certification?.certified) throw new Error("El candidato todavía no ha superado las puertas de calidad.");
        app.botRegistry = recordBotModel(app.botRegistry, { botId: UNIVERSAL_BOT_ID, deckId: training.deckId, model: manifest });
        saveBotRegistry(app.botRegistry);
        const stored = app.botRegistry.bots.find((bot) => bot.id === training.botId);
        const profile = stored?.profiles?.[training.deckId];
        if (training.certification?.certified && stored && profile) {
          app.ladder = upsertLadderBot(app.ladder, { ...stored, deckId: training.deckId, intelligence: profile.intelligence, technicalRating: profile.technicalRating, uncertainty: profile.uncertainty });
          saveLocalState(app.ladder);
        }
        app.playBotId = UNIVERSAL_BOT_ID;
        app.playOpponentDeckId = training.deckId;
        persistPlaySelection();
        training.approved = true;
        app.toast = training.certification?.certified ? `Modelo guardado y habilitado en ladder como IA ${training.certification.targetIntelligence}.` : "Modelo candidato guardado para partida libre; aún no entra en ladder certificada.";
      } catch (error) {
        training.approved = false;
        app.toast = `No se pudo guardar el modelo: ${error.message}`;
      }
    }
    render();
    return true;
  }
  if (action === "discard-candidate") {
    app.training.candidate = null;
    app.training.approved = false;
    app.training.status = "DISCARDED";
    app.toast = "Candidato descartado; las métricas se conservan.";
    render();
    return true;
  }
  if (action === "clean-training") {
    app.training.results = [];
    app.training.bytes = 0;
    app.training.status = "CLEANED";
    app.toast = "Chunks temporales eliminados del estado de la interfaz; métricas y candidato conservados.";
    render();
    return true;
  }
  return false;
}

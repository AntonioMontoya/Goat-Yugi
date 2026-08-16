import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NEXO2_PILOT_DECKS, formatNexo2PilotMarkdown, runNexo2Pilot } from "../training/nexo2-pilot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} necesita un entero positivo.`);
  return value;
}

function nonNegativeInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} necesita un entero no negativo.`);
  return value;
}

function optionalNumber(name) {
  const raw = option(name, null);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} necesita un número.`);
  return value;
}

const trainingGames = nonNegativeInteger("training-games", 54);
const evaluationGames = positiveInteger("evaluation-games", 72);
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 8_200_000);
const decisionSampleLimit = positiveInteger("decision-sample-limit", 16);
const deckIds = String(option("decks", NEXO2_PILOT_DECKS.join(","))).split(",").map((value) => value.trim()).filter(Boolean);
const outputDir = path.resolve(root, option("out", path.join("artifacts", `nexo2-pilot-${seed}`)));
const resumePath = option("resume", null);
const resumeDocument = resumePath ? JSON.parse(fs.readFileSync(path.resolve(root, resumePath), "utf8")) : null;
const initialModel = resumeDocument?.candidate ?? resumeDocument;
if (initialModel) {
  const overrides = {
    beliefScale: optionalNumber("belief-scale"),
    neuralScale: optionalNumber("neural-scale"),
    valueScale: optionalNumber("value-scale"),
    riskAversion: optionalNumber("risk-aversion"),
    maxBaseRegret: optionalNumber("max-base-regret"),
    viabilityMargin: optionalNumber("viability-margin"),
  };
  initialModel.decisionConfig = { ...(initialModel.decisionConfig ?? {}) };
  for (const [key, value] of Object.entries(overrides)) if (value !== null) initialModel.decisionConfig[key] = value;
}
const checkpointDir = path.join(outputDir, "checkpoint");
fs.mkdirSync(checkpointDir, { recursive: true });

const report = await runNexo2Pilot({
  deckIds,
  trainingGames,
  evaluationGames,
  workers,
  seed,
  initialModel,
  decisionSampleLimit,
  checkpointEvery: 9,
  onProgress: ({ stage, completed, total, stats }) => {
    process.stderr.write(`\rNexo 2 ${stage}: ${completed}/${total} (${stats.wins}-${stats.losses}-${stats.draws}, inválidos ${stats.invalid})`);
  },
  onCheckpoint: (checkpoint) => {
    fs.writeFileSync(path.join(checkpointDir, "latest.json"), `${JSON.stringify(checkpoint)}\n`, "utf8");
  },
});
process.stderr.write("\n");

const { decisionLog, ...summary } = report;
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "candidate.json"), `${JSON.stringify(report.candidate)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "combat-log.jsonl"), `${report.fights.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "decision-samples.jsonl"), `${decisionLog.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "report.md"), formatNexo2PilotMarkdown(report), "utf8");

process.stdout.write(`${JSON.stringify({
  outputDir,
  decks: report.configuration.deckIds,
  training: { games: report.training.games, wins: report.training.wins, losses: report.training.losses, draws: report.training.draws, invalid: report.training.invalid },
  evaluation: { games: report.evaluation.games, wins: report.evaluation.wins, losses: report.evaluation.losses, draws: report.evaluation.draws, invalid: report.evaluation.invalid, scoreRate: report.evaluation.scoreRate, confidence95: report.evaluation.confidence95 },
  independentAudit: {
    candidate: { reasoned: report.independentAudit.candidate.reasoned, critical: report.independentAudit.candidate.critical, review: report.independentAudit.candidate.review },
    base: { reasoned: report.independentAudit.base.reasoned, critical: report.independentAudit.base.critical, review: report.independentAudit.base.review },
  },
  neuralTraining: report.candidate.neuralModel?.trainingState,
  pilotGate: report.pilotGate,
}, null, 2)}\n`);

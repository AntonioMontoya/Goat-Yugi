import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NEXO2_PILOT_DECKS, NEXO2_OPPONENT_DECKS, formatNexo2PilotMarkdown, runNexo2Pilot } from "../training/nexo2-pilot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

const gamesPerDeck = positiveInteger("games-per-deck", 1000);
const evalGamesPerDeck = positiveInteger("eval-per-deck", 200);
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 9_000_000);
const maxSteps = positiveInteger("max-steps", 10_000);
const deckIds = String(option("decks", NEXO2_PILOT_DECKS.join(",")))
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const opponentDeckIds = String(option("opponent-decks", NEXO2_OPPONENT_DECKS.join(",")))
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const totalTrainingGames = gamesPerDeck * deckIds.length;
const totalEvaluationGames = evalGamesPerDeck * deckIds.length;

const outputDir = path.resolve(root, option("out", path.join("artifacts", `nexo2-scale-train-${gamesPerDeck}`)));
const resumePath = option("resume", null);
const resumeDocument = resumePath ? JSON.parse(fs.readFileSync(path.resolve(root, resumePath), "utf8")) : null;
const initialModel = resumeDocument?.candidate ?? resumeDocument ?? null;

const checkpointDir = path.join(outputDir, "checkpoint");
fs.mkdirSync(checkpointDir, { recursive: true });

process.stderr.write(`========================================================================\n`);
process.stderr.write(` PLAN DE ENTRENAMIENTO ESCALADO: NEXO 2\n`);
process.stderr.write(`========================================================================\n`);
process.stderr.write(`- Mazos propios (${deckIds.length}): ${deckIds.join(", ")}\n`);
process.stderr.write(`- Mazos oponentes (${opponentDeckIds.length}): ${opponentDeckIds.slice(0, 5).join(", ")}...\n`);
process.stderr.write(`- Partidas de entrenamiento: ${gamesPerDeck} por mazo -> Total ${totalTrainingGames} partidas\n`);
process.stderr.write(`- Partidas de evaluación: ${evalGamesPerDeck} por mazo -> Total ${totalEvaluationGames} partidas\n`);
process.stderr.write(`- Workers paralelos: ${workers} | Semilla base: ${seed}\n`);
process.stderr.write(`- Salida: ${outputDir}\n`);
process.stderr.write(`========================================================================\n\n`);

const report = await runNexo2Pilot({
  deckIds,
  opponentDeckIds,
  curriculum: "pilot",
  trainingGames: totalTrainingGames,
  evaluationGames: totalEvaluationGames,
  workers,
  maxSteps,
  seed,
  initialModel,
  decisionSampleLimit: 24,
  checkpointEvery: Math.max(10, workers * 5),
  onProgress: ({ stage, completed, total, stats }) => {
    const pct = ((completed / Math.max(1, total)) * 100).toFixed(1);
    process.stderr.write(`\r[${stage.toUpperCase()}] ${completed}/${total} (${pct}%) | V-D-E: ${stats.wins}-${stats.losses}-${stats.draws} (inválidos: ${stats.invalid})`);
  },
  onCheckpoint: (checkpoint) => {
    fs.writeFileSync(path.join(checkpointDir, "latest.json"), `${JSON.stringify(checkpoint)}\n`, "utf8");
  },
});

process.stderr.write("\n\nEntrenamiento finalizado. Guardando modelo candidato y artefactos...\n");

const { decisionLog, ...summary } = report;
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "candidate.json"), `${JSON.stringify(report.candidate)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "combat-log.jsonl"), `${report.fights.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "decision-samples.jsonl"), `${decisionLog.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "report.md"), formatNexo2PilotMarkdown(report), "utf8");

process.stdout.write(JSON.stringify({
  outputDir,
  decks: report.configuration.deckIds,
  gamesPerDeck,
  totalTrainingGames,
  training: report.training,
  evaluation: {
    games: report.evaluation.games,
    wins: report.evaluation.wins,
    losses: report.evaluation.losses,
    draws: report.evaluation.draws,
    winRate: `${(report.evaluation.scoreRate * 100).toFixed(1)} %`,
    confidence95: report.evaluation.confidence95,
  },
  pilotGate: report.pilotGate,
  candidatePath: path.join(outputDir, "candidate.json"),
}, null, 2) + "\n");

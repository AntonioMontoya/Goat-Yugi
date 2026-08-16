import fs from "node:fs";
import path from "node:path";
import { formatNexoPatchMarkdown, trainNexoPatch } from "../training/nexo-patch-training.js";

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} necesita un entero positivo.`);
  return value;
}

const trainingGames = positiveInteger("training-games", 24);
const evaluationGames = positiveInteger("evaluation-games", 40);
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 8_160_000);
const deckIds = String(option("decks", "chaos-turbo,goat-control,flip-control,warrior,panda-burn")).split(",").map((value) => value.trim()).filter(Boolean);
const outputDir = path.resolve(option("out", path.join("artifacts", `nexo-patch-${seed}`)));
const resumePath = option("resume", null);
const initialModel = resumePath ? JSON.parse(fs.readFileSync(path.resolve(resumePath), "utf8")) : null;
const checkpointDir = path.join(outputDir, "checkpoint");
fs.mkdirSync(checkpointDir, { recursive: true });

const result = await trainNexoPatch({
  deckIds,
  trainingGames,
  evaluationGames,
  workers,
  seed,
  initialModel,
  checkpointEvery: Math.max(4, workers * 2),
  onProgress: ({ stage, completed, total, stats }) => {
    process.stderr.write(`\rNexo patch ${stage}: ${completed}/${total} (${stats.wins}-${stats.losses}-${stats.draws}, inválidos ${stats.invalid})`);
  },
  onCheckpoint: (checkpoint) => {
    fs.writeFileSync(path.join(checkpointDir, "latest.json"), `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  },
});
process.stderr.write("\n");

const { decisionLog, ...summary } = result;
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "candidate.json"), `${JSON.stringify(result.candidate, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "combat-log.jsonl"), `${result.fights.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "decision-log.jsonl"), `${decisionLog.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "report.md"), formatNexoPatchMarkdown(result), "utf8");

process.stdout.write(`${JSON.stringify({
  outputDir,
  baseFingerprint: result.base.fingerprint,
  training: { games: result.training.games, wins: result.training.wins, losses: result.training.losses, draws: result.training.draws, invalid: result.training.invalid },
  evaluation: { games: result.evaluation.games, wins: result.evaluation.wins, losses: result.evaluation.losses, draws: result.evaluation.draws, invalid: result.evaluation.invalid, scoreRate: result.evaluation.scoreRate },
  candidateActions: result.actionComparison.candidate.quality,
  baseActions: result.actionComparison.base.quality,
  promotion: result.promotion,
  loggedReasonedDecisions: decisionLog.length,
}, null, 2)}\n`);

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BENCHMARK_META_DECKS, formatNexoDuelBenchmarkMarkdown, runNexoDuelBenchmark } from "../training/nexo-duel-benchmark.js";
import { NEXO2_BOT_ID } from "../bots/nexo2-contract.js";
import { UNIVERSAL_BOT_ID } from "../bots/bot-system.js";

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

const games = positiveInteger("games", 100);
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 8_500_000);
const maxSteps = positiveInteger("max-steps", 6_000);
const botAId = option("botA", NEXO2_BOT_ID);
const botBId = option("botB", UNIVERSAL_BOT_ID);
const botAPath = option("modelA", null);
const botBPath = option("modelB", null);
const botAManifest = botAPath ? JSON.parse(fs.readFileSync(path.resolve(root, botAPath), "utf8")) : null;
const botBManifest = botBPath ? JSON.parse(fs.readFileSync(path.resolve(root, botBPath), "utf8")) : null;
const deckIds = String(option("decks", BENCHMARK_META_DECKS.join(","))).split(",").map((value) => value.trim()).filter(Boolean);
const outputDir = path.resolve(root, option("out", path.join("artifacts", `nexo-duel-${seed}`)));

fs.mkdirSync(outputDir, { recursive: true });

process.stderr.write(`Iniciando duelo 50/50: ${botAManifest?.name ?? botAId} vs ${botBManifest?.name ?? botBId} (${games} partidas)...\n`);

const report = await runNexoDuelBenchmark({
  botAId,
  botBId,
  botAManifest,
  botBManifest,
  games,
  deckIds,
  seed,
  workers,
  maxSteps,
  onProgress: ({ completed, total }) => {
    process.stderr.write(`\rProgreso: ${completed}/${total} duelos completados`);
  },
});

process.stderr.write("\n");

fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "report.md"), formatNexoDuelBenchmarkMarkdown(report), "utf8");
fs.writeFileSync(path.join(outputDir, "fights.jsonl"), `${report.fights.map((f) => JSON.stringify(f)).join("\n")}\n`, "utf8");

process.stdout.write(JSON.stringify({
  outputDir,
  botA: report.matchup.botA.name,
  botB: report.matchup.botB.name,
  aggregate: report.aggregate,
  byTurnOrder: report.byTurnOrder,
}, null, 2) + "\n");

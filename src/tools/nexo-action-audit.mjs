import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatNexoBenchmarkAuditMarkdown, runNexoBenchmarkAudit } from "../training/nexo-benchmark-audit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

const games = Math.max(1, Number(option("games", 50)) || 50);
const workers = Math.max(1, Math.min(6, Number(option("workers", 4)) || 4));
const seed = Number(option("seed", 8_150_000)) || 8_150_000;
const deckIds = String(option("decks", "chaos-turbo,goat-control,flip-control,warrior,panda-burn")).split(",").map((value) => value.trim()).filter(Boolean);
const output = path.resolve(root, option("out", `artifacts/nexo-action-audit-${games}.json`));
const markdown = output.replace(/\.json$/i, ".md");

const report = await runNexoBenchmarkAudit({
  games,
  workers,
  seed,
  deckIds,
  onProgress: ({ completed, total }) => process.stderr.write(`\rNexo audit: ${completed}/${total}`),
});
process.stderr.write("\n");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(markdown, formatNexoBenchmarkAuditMarkdown(report), "utf8");
console.log(JSON.stringify({ output, markdown, matches: report.matches, actionQuality: { decisions: report.actionQuality.decisions, quality: report.actionQuality.quality, rates: report.actionQuality.rates }, gates: report.gates }, null, 2));


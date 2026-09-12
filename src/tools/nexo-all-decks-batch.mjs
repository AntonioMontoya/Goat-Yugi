import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_PRESETS } from "../decks/decks.js";
import { runNexoDeckTraining } from "./nexo-deck-trainer.mjs";
import { NEXO2_PILOT_DECKS } from "../training/nexo2-pilot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const TIER_1_2_DECKS = [
  "goat-control",
  "chaos-turbo",
  "chaos-control",
  "warrior",
  "flip-control",
  "goatformat-monarch",
  "goatformat-zombie",
  "goatformat-strike-ninja",
  "reasoning-gate",
  "earth-aggro",
  "empty-jar",
  "goatformat-lockdown-burn",
  "panda-burn",
  "goatformat-deckout",
];

const trainingGames = positiveInteger("training-games", positiveInteger("games", 1000));
const evaluationGames = positiveInteger("evaluation-games", positiveInteger("eval", 200));
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 8_200_000);
const maxSteps = positiveInteger("max-steps", 6000);
const skipExisting = args.includes("--skip-existing");
const outDir = path.resolve(root, option("out", path.join("artifacts", "nexo2-decks")));

const decksOption = option("decks", "all");
let targetDeckIds = [];

if (decksOption === "all") {
  targetDeckIds = DECK_PRESETS.map((d) => d.id);
} else if (decksOption === "pilot") {
  targetDeckIds = [...NEXO2_PILOT_DECKS];
} else if (decksOption === "tier1" || decksOption === "tier1-2") {
  targetDeckIds = TIER_1_2_DECKS.filter((id) => DECK_PRESETS.some((d) => d.id === id));
} else {
  targetDeckIds = decksOption.split(",").map((s) => s.trim()).filter(Boolean);
}

fs.mkdirSync(outDir, { recursive: true });

function formatGlossaryMarkdown(glossaryEntries, totalDecks, finishedCount) {
  const lines = [
    `# Glosario y Ranking Global de Mazos Nexo 2`,
    "",
    `- **Fecha de actualización**: ${new Date().toISOString()}`,
    `- **Progreso**: ${finishedCount} / ${totalDecks} mazos procesados`,
    `- **Configuración por mazo**: ${trainingGames} partidas entrenamiento + ${evaluationGames} partidas evaluación (Workers: ${workers})`,
    "",
    "## Tabla Clasificatoria por Winrate de Evaluación",
    "",
    "| Pos | Mazo | ID | Arquetipo | Winrate Eval | IC 95% | V / D / E | Decisiones Sólidas | Decisiones en Revisión |",
    "| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |",
  ];

  const sorted = [...glossaryEntries].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  sorted.forEach((entry, idx) => {
    const rateStr = `${((entry.winRate ?? 0) * 100).toFixed(1)} %`;
    const icStr = entry.confidence95 && Number.isFinite(entry.confidence95.low) && Number.isFinite(entry.confidence95.high)
      ? `[${(entry.confidence95.low * 100).toFixed(1)}% - ${(entry.confidence95.high * 100).toFixed(1)}%]`
      : "-";
    const vdeStr = `${entry.wins ?? 0} / ${entry.losses ?? 0} / ${entry.draws ?? 0}`;
    const sound = entry.actionQuality?.quality?.sound ?? "-";
    const review = entry.actionQuality?.quality?.review ?? "-";

    lines.push(`| **#${idx + 1}** | **${entry.deckName}** | \`${entry.deckId}\` | ${entry.archetype} | **${rateStr}** | ${icStr} | ${vdeStr} | ${sound} | ${review} |`);
  });

  lines.push("");
  lines.push("---");
  lines.push("### Glosario de Arquetipos y Estrategias");
  lines.push("");
  for (const entry of sorted) {
    lines.push(`#### ${entry.deckName} (\`${entry.deckId}\`)`);
    lines.push(`- **Arquetipo**: ${entry.archetype}`);
    lines.push(`- **Winrate en Evaluación**: ${((entry.winRate ?? 0) * 100).toFixed(1)} % frente a currículo equilibrado`);
    if (entry.byMatchup && Object.keys(entry.byMatchup).length) {
      lines.push(`- **Matchups destacados**:`);
      for (const [mKey, mData] of Object.entries(entry.byMatchup).slice(0, 4)) {
        const mRate = mData.total ? ((mData.wins / mData.total) * 100).toFixed(1) : "0.0";
        lines.push(`  - vs \`${mKey.split("__vs__")[1]}\`: ${mData.wins}/${mData.total} (${mRate} %)`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  process.stderr.write(`========================================================================\n`);
  process.stderr.write(` ENTRENAMIENTO SECUENCIAL MASIVO POR MAZOS: NEXO 2\n`);
  process.stderr.write(`========================================================================\n`);
  process.stderr.write(`- Total de mazos a procesar: ${targetDeckIds.length}\n`);
  process.stderr.write(`- Partidas por mazo: ${trainingGames} entrenamiento + ${evaluationGames} evaluación\n`);
  process.stderr.write(`- Total de partidas estimadas: ${targetDeckIds.length * (trainingGames + evaluationGames)}\n`);
  process.stderr.write(`- Modo 'skip-existing': ${skipExisting ? "ACTIVADO" : "DESACTIVADO"}\n`);
  process.stderr.write(`- Directorio destino: ${outDir}\n`);
  process.stderr.write(`========================================================================\n\n`);

  const glossaryPath = path.join(outDir, "global-glossary.json");
  const glossaryEntries = fs.existsSync(glossaryPath) ? JSON.parse(fs.readFileSync(glossaryPath, "utf8")) : [];
  const entriesByDeckId = new Map(glossaryEntries.map((e) => [e.deckId, e]));

  let processedCount = 0;

  for (let i = 0; i < targetDeckIds.length; i++) {
    const deckId = targetDeckIds[i];
    const deckDir = path.join(outDir, deckId);
    const candidateFile = path.join(deckDir, "candidate.json");
    const summaryFile = path.join(deckDir, "summary.json");

    if (skipExisting && fs.existsSync(candidateFile) && fs.existsSync(summaryFile)) {
      process.stderr.write(`[${i + 1}/${targetDeckIds.length}] Mazo '${deckId}' ya entrenado anteriormente. Omitiendo...\n`);
      if (!entriesByDeckId.has(deckId)) {
        try {
          const loadedSummary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
          entriesByDeckId.set(deckId, {
            deckId: loadedSummary.deckId,
            deckName: loadedSummary.deckName,
            archetype: loadedSummary.archetype,
            winRate: loadedSummary.evaluationStats?.winRate ?? 0,
            confidence95: loadedSummary.evaluationStats?.confidence95 ?? null,
            wins: loadedSummary.evaluationStats?.wins ?? 0,
            losses: loadedSummary.evaluationStats?.losses ?? 0,
            draws: loadedSummary.evaluationStats?.draws ?? 0,
            byMatchup: loadedSummary.evaluationStats?.byMatchup ?? {},
            actionQuality: loadedSummary.actionQuality ?? null,
            trainedAt: loadedSummary.savedAt ?? new Date().toISOString(),
          });
        } catch {}
      }
      processedCount++;
      continue;
    }

    fs.mkdirSync(deckDir, { recursive: true });
    process.stderr.write(`\n------------------------------------------------------------------------\n`);
    process.stderr.write(`[${i + 1}/${targetDeckIds.length}] Procesando Mazo: ${deckId}\n`);
    process.stderr.write(`------------------------------------------------------------------------\n`);

    const report = await runNexoDeckTraining({
      deckId,
      trainingGames,
      evaluationGames,
      workers,
      seed: seed + i * 1337,
      maxSteps,
      onProgress: ({ stage, completed, total, stats }) => {
        const pct = ((completed / Math.max(1, total)) * 100).toFixed(1);
        process.stderr.write(`\r[${stage.toUpperCase()}] ${completed}/${total} (${pct}%) | W: ${stats.wins} L: ${stats.losses} D: ${stats.draws} Inv: ${stats.invalid}`);
      },
    });

    process.stderr.write(`\n Guardando artefactos de ${deckId}...\n`);

    // Write individual deck artifacts
    fs.writeFileSync(candidateFile, `${JSON.stringify(report.candidate)}\n`, "utf8");
    const summary = {
      deckId: report.deckId,
      deckName: report.deckName,
      archetype: report.archetype,
      trainingGames: report.trainingGames,
      evaluationGames: report.evaluationGames,
      trainingStats: report.trainingStats,
      evaluationStats: report.evaluationStats,
      actionQuality: report.actionQuality,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    // Record in global glossary
    entriesByDeckId.set(deckId, {
      deckId: report.deckId,
      deckName: report.deckName,
      archetype: report.archetype,
      winRate: report.evaluationStats.winRate,
      confidence95: report.evaluationStats.confidence95,
      wins: report.evaluationStats.wins,
      losses: report.evaluationStats.losses,
      draws: report.evaluationStats.draws,
      byMatchup: report.evaluationStats.byMatchup,
      actionQuality: report.actionQuality,
      trainedAt: new Date().toISOString(),
    });

    processedCount++;

    // Update global glossary incrementally
    const updatedEntries = Array.from(entriesByDeckId.values());
    fs.writeFileSync(glossaryPath, `${JSON.stringify(updatedEntries, null, 2)}\n`, "utf8");
    fs.writeFileSync(
      path.join(outDir, "global-glossary.md"),
      formatGlossaryMarkdown(updatedEntries, targetDeckIds.length, processedCount),
      "utf8"
    );
  }

  process.stderr.write(`\n========================================================================\n`);
  process.stderr.write(` ENTRENAMIENTO COMPLETO FINALIZADO (${processedCount} mazos)\n`);
  process.stderr.write(` Glosario guardado en: ${path.join(outDir, "global-glossary.md")}\n`);
  process.stderr.write(`========================================================================\n`);

  process.stdout.write(JSON.stringify({
    totalDecks: targetDeckIds.length,
    processedCount,
    glossaryFile: path.join(outDir, "global-glossary.md"),
  }, null, 2));
}

main().catch((err) => {
  console.error("Error en entrenamiento masivo:", err);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateEvaluationJobs,
  executeSingleJob,
  aggregatePairedBlocks,
  hashWeights,
} from "../training/nexo2-paired-evaluation.js";

function printHelp() {
  console.log(`
Uso de Evaluador A/B Emparejado Nexo 2:
  node src/tools/nexo2-recovery-eval.mjs [opciones]

Opciones obligatorias:
  --base <ruta>          Ruta al manifiesto o JSON del modelo base congelado
  --candidate <ruta>     Ruta al manifiesto o JSON del modelo candidato
  --out <directorio>     Directorio de salida donde guardar los resultados de la evaluación

Opciones adicionales:
  --jobs <ruta>          Ruta al archivo jobs.jsonl pre-generado y congelado
  --generate-jobs        Genera un nuevo archivo jobs.jsonl en el directorio de salida y lo congela
  --max-steps <int>      Límite de pasos de simulación por duelo (por defecto: 6000)
  --resume               Permite reanudar una ejecución previa en el directorio de salida
  --mode <modo>          "whole-bot-comparison" (defecto) o "weights-only-comparison"
  --blocks-per-deck <n>  Número de bloques A/B por mazo (por defecto: 8 para diagnóstico inicial)
  --legacy-base          Evalúa la base usando las reglas y memoria heredadas previas a Fase 3
  --help                 Muestra esta ayuda y termina
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  function getOption(flag, fallback = null) {
    const idx = args.indexOf(`--${flag}`);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return fallback;
  }

  const basePath = getOption("base");
  const candidatePath = getOption("candidate");
  const outDir = getOption("out");
  const jobsPath = getOption("jobs");
  const generateJobs = args.includes("--generate-jobs");
  const resume = args.includes("--resume");
  const maxSteps = Number(getOption("max-steps", 6000));
  const mode = getOption("mode", "whole-bot-comparison");
  const blocksPerDeck = Number(getOption("blocks-per-deck", 8));
  const legacyBase = args.includes("--legacy-base");

  if (!basePath || !candidatePath || !outDir) {
    console.error("Error: --base, --candidate y --out son obligatorios.");
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(basePath)) {
    console.error(`Error: La ruta base no existe: ${basePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(candidatePath)) {
    console.error(`Error: La ruta candidate no existe: ${candidatePath}`);
    process.exit(1);
  }

  if (fs.existsSync(outDir) && !resume) {
    const files = fs.readdirSync(outDir);
    if (files.length > 0) {
      console.error(`Error: El directorio de salida ya existe y contiene archivos. Usa --resume para reanudar.`);
      process.exit(1);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  function loadManifest(targetPath) {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      return JSON.parse(fs.readFileSync(targetPath, "utf8"));
    }
    const bundlePath = path.join(targetPath, "bot-manifests.json");
    if (fs.existsSync(bundlePath)) {
      return JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    }
    const modelPath = path.join(targetPath, "model.json");
    if (fs.existsSync(modelPath)) {
      return JSON.parse(fs.readFileSync(modelPath, "utf8"));
    }
    const result = {};
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subModel = path.join(targetPath, entry.name, "model.json");
        if (fs.existsSync(subModel)) {
          result[entry.name] = JSON.parse(fs.readFileSync(subModel, "utf8"));
        }
      }
    }
    return result;
  }

  const baseManifest = loadManifest(basePath);
  const candidateManifest = loadManifest(candidatePath);

  let jobs = [];
  const targetJobsFile = jobsPath ?? path.join(outDir, "jobs.jsonl");

  if (jobsPath && fs.existsSync(jobsPath)) {
    console.log(`Cargando trabajos congelados desde ${jobsPath}...`);
    const rawLines = fs.readFileSync(jobsPath, "utf8").split("\n").filter(Boolean);
    jobs = rawLines.map((l) => JSON.parse(l));
  } else if (generateJobs || !fs.existsSync(targetJobsFile)) {
    console.log(`Generando ${blocksPerDeck} bloques A/B por mazo...`);
    jobs = generateEvaluationJobs({
      blocksPerDeck,
      mode,
      split: "diagnostic",
      useLegacyBase: legacyBase,
    });
    fs.writeFileSync(targetJobsFile, jobs.map((j) => JSON.stringify(j)).join("\n") + "\n", "utf8");
    console.log(`Trabajos congelados guardados en ${targetJobsFile}`);
  } else {
    console.log(`Cargando trabajos existentes desde ${targetJobsFile}...`);
    const rawLines = fs.readFileSync(targetJobsFile, "utf8").split("\n").filter(Boolean);
    jobs = rawLines.map((l) => JSON.parse(l));
  }

  // Verify all jobs have split
  for (const job of jobs) {
    if (!job.split) {
      console.error(`Error: El trabajo ${job.jobId} no tiene definido el campo "split".`);
      process.exit(1);
    }
  }

  // Load existing finished games if resuming
  const gamesFile = path.join(outDir, "games.jsonl");
  const completedJobIds = new Set();
  const allResults = [];

  if (fs.existsSync(gamesFile)) {
    const lines = fs.readFileSync(gamesFile, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      completedJobIds.add(parsed.jobId);
      allResults.push(parsed);
    }
    console.log(`Reanudación activa: ${completedJobIds.size} de ${jobs.length} duelos ya completados.`);
  }

  const concurrency = Math.max(1, Number(getOption("concurrency", 4)));

  // Execution Loop
  console.log(`Iniciando ejecución de ${jobs.length} duelos A/B (Max Steps: ${maxSteps}, Concurrency: ${concurrency})...`);
  const gameStream = fs.createWriteStream(gamesFile, { flags: "a" });

  let doneCount = completedJobIds.size;
  const pendingJobs = jobs.filter((j) => !completedJobIds.has(j.jobId));
  let cursor = 0;

  async function worker() {
    while (cursor < pendingJobs.length) {
      const current = cursor++;
      const job = pendingJobs[current];
      const result = await executeSingleJob(job, { candidateManifest, baseManifest, maxSteps });
      gameStream.write(JSON.stringify(result) + "\n");
      allResults.push(result);
      doneCount += 1;

      if (doneCount % 10 === 0 || doneCount === jobs.length) {
        console.log(`[${doneCount}/${jobs.length}] Duelo completado: ${result.jobId} -> ${result.outcome} (${result.score})`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pendingJobs.length) }, () => worker());
  await Promise.all(workers);
  gameStream.end();

  // Aggregation & Statistics
  console.log("Calculando agregación por bloques A/B y bootstrap (10.000 iteraciones)...");
  const stats = aggregatePairedBlocks(allResults);

  fs.writeFileSync(path.join(outDir, "comparison.json"), JSON.stringify(stats, null, 2), "utf8");

  const runManifest = {
    evaluatedAt: new Date().toISOString(),
    basePath,
    candidatePath,
    mode,
    maxSteps,
    totalJobs: jobs.length,
    completedJobs: allResults.length,
    stats,
  };
  fs.writeFileSync(path.join(outDir, "run-manifest.json"), JSON.stringify(runManifest, null, 2), "utf8");

  const reportMd = [
    `# Informe de Evaluación Emparejada A/B Nexo 2`,
    "",
    `- **Fecha**: ${new Date().toISOString()}`,
    `- **Modo**: \`${mode}\``,
    `- **Total Bloques A/B**: ${stats.totalBlocks}`,
    `- **Bloques Válidos**: ${stats.validBlocksCount}`,
    `- **Bloques Inválidos**: ${stats.invalidBlocksCount}`,
    `- **Diferencia de Puntuación Media (Candidato - Base)**: ${(stats.overall.mean * 100).toFixed(2)} %`,
    `- **IC 95% Bootstrap por Bloques**: [${(stats.overall.low * 100).toFixed(2)} %, ${(stats.overall.high * 100).toFixed(2)} %]`,
    `- **Límite Inferior Bonferroni**: ${(stats.overall.bonferroniLow * 100).toFixed(2)} %`,
    "",
    "## Desglose por Mazo",
    "",
    "| Mazo | Media Delta | IC 95% Low | IC 95% High | Bonferroni Low | Muestras |",
    "| :--- | :---: | :---: | :---: | :---: | :---: |",
    ...Object.entries(stats.perDeck).map(([deckId, st]) => {
      return `| \`${deckId}\` | ${(st.mean * 100).toFixed(2)} % | ${(st.low * 100).toFixed(2)} % | ${(st.high * 100).toFixed(2)} % | ${(st.bonferroniLow * 100).toFixed(2)} % | ${st.samples} |`;
    }),
    "",
    "## Desglose por Rival",
    "",
    "| Rival | Media Delta | IC 95% Low | IC 95% High | Muestras |",
    "| :--- | :---: | :---: | :---: | :---: |",
    ...Object.entries(stats.perRival).map(([rivalId, st]) => {
      return `| \`${rivalId}\` | ${(st.mean * 100).toFixed(2)} % | ${(st.low * 100).toFixed(2)} % | ${(st.high * 100).toFixed(2)} % | ${st.samples} |`;
    }),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "report.md"), reportMd, "utf8");
  console.log(`Evaluación finalizada. Resultados guardados en ${outDir}`);
}

main().catch((err) => {
  console.error("Error fatal en evaluación A/B:", err);
  process.exit(1);
});

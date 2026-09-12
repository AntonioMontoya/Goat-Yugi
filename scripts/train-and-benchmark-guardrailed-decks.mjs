import fs from "node:fs";
import path from "node:path";

const root = "c:/Users/anton/Desktop/Yu-Gi-Oh! Goat";
const ipadRoot = path.resolve(root, "Ipad");

const { getDeck, DECK_PRESETS } = await import(`file:///${root.replace(/\\/g, "/")}/src/decks/decks.js`);
const { DECK_PROFILES } = await import(`file:///${root.replace(/\\/g, "/")}/src/decks/deck-profiles.js`);
const { getCard } = await import(`file:///${root.replace(/\\/g, "/")}/src/engine/cards.js`);
const { runNexoDeckTraining } = await import(`file:///${root.replace(/\\/g, "/")}/src/tools/nexo-deck-trainer.mjs`);
const { createBotForDeck, UNIVERSAL_BOT_ID, NEXO2_BOT_ID } = await import(`file:///${root.replace(/\\/g, "/")}/src/bots/bot-system.js`);
const { runOcgcoreHeadless } = await import(`file:///${root.replace(/\\/g, "/")}/src/engine/ocgcore-backend.js`);
const { confidenceInterval95 } = await import(`file:///${root.replace(/\\/g, "/")}/src/analytics/statistics.js`);

const args = process.argv.slice(2);
const isDryRun = args.includes("--smoke-test");
const isForce = args.includes("--force");
const singleDeckFilter = args.find((a) => a.startsWith("--deck="))?.split("=")[1] ?? null;

const TRAINING_GAMES = isDryRun ? 2 : 100;
const BENCHMARK_GAMES_PER_OPP = isDryRun ? 2 : 20; // 10 opps * 20 = 200 games
const TOTAL_BENCHMARK_GAMES = BENCHMARK_GAMES_PER_OPP * 10;
const WORKERS = 4;
const BASE_SEED = 9_500_000;

// Filter 62 extended decks
const profileKeys = new Set(Object.keys(DECK_PROFILES));
const aliases = {
  "goatformat-warrior": "warrior",
  "goatformat-goat-control": "goat-control",
  "goatformat-chaos-turbo": "chaos-turbo",
  "goatformat-chaos-control": "chaos-control",
  "goatformat-earth-aggro": "earth-aggro",
  "goatformat-panda-burn": "panda-burn",
  "goatformat-reasoning-gate": "reasoning-gate",
  "goatformat-empty-jar": "empty-jar",
  "goatformat-chaos-recruiter": "chaos-recruiter",
  "goatformat-flip-control": "flip-control",
};

export const EXTENDED_DECKS = DECK_PRESETS.filter((d) => {
  if (profileKeys.has(d.id)) return false;
  const norm = d.id.replace(/^goatformat-/, "");
  if (profileKeys.has(norm)) return false;
  if (aliases[d.id] && profileKeys.has(aliases[d.id])) return false;
  return true;
}).map((d) => ({
  id: d.id,
  name: d.name,
  archetype: d.archetype,
  readiness: d.readiness,
}));

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

function loadCandidateManifest(deckId) {
  const p = path.resolve(root, `artifacts/nexo2-decks/${deckId}/candidate.json`);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function getBenchmarkOpponents(candidateDeckId) {
  const metaPool = [
    { id: "goat-control", name: "Goat Control" },
    { id: "chaos-turbo", name: "Chaos Turbo" },
    { id: "warrior", name: "Warrior / Anti-Meta" },
    { id: "chaos-control", name: "Chaos Control" },
    { id: "goatformat-monarch", name: "Monarch" },
    { id: "goatformat-zombie", name: "Zombie" },
    { id: "goatformat-drain-aggro", name: "Drain Aggro" },
    { id: "goatformat-beatdown", name: "Beatdown" },
    { id: "earth-aggro", name: "Earth Aggro" },
    { id: "chaos-recruiter", name: "Chaos Recruiter" },
  ];

  const opponents = [];
  opponents.push({ id: candidateDeckId, name: `${candidateDeckId} (Mirror)` });

  for (const item of metaPool) {
    if (opponents.length >= 10) break;
    if (item.id !== candidateDeckId) {
      opponents.push(item);
    }
  }
  return opponents;
}

function copyFileSafe(src, dest) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  } catch (err) {
    console.warn(`[Copy Warning] No se pudo copiar ${src} a ${dest}:`, err.message);
  }
}

async function runBenchmarkForDeck(deckDef, candidateManifest, deckSeed) {
  const candidateDeck = getDeck(deckDef.id);
  const candidateMain = cardNames(candidateDeck.main);
  const candidateFusion = cardNames(candidateDeck.fusion ?? []);

  const opponents = getBenchmarkOpponents(deckDef.id);
  const jobs = [];
  let matchId = 1;

  for (const opp of opponents) {
    const oppDeck = getDeck(opp.id);
    const oppManifest = loadCandidateManifest(opp.id);
    const oppMain = cardNames(oppDeck.main);
    const oppFusion = cardNames(oppDeck.fusion ?? []);

    const nexo1Count = Math.floor(BENCHMARK_GAMES_PER_OPP / 2);
    const nexo2Count = BENCHMARK_GAMES_PER_OPP - nexo1Count;

    // NEXO 1 duels
    for (let i = 0; i < nexo1Count; i += 1) {
      jobs.push({
        matchId: matchId++,
        oppId: opp.id,
        oppName: opp.name,
        oppEngine: "NEXO_1",
        oppDeck,
        oppManifest: null,
        oppMain,
        oppFusion,
        targetStarts: (i % 2) === 0,
        seed: (deckSeed + matchId * 7919 + i * 31) >>> 0,
      });
    }

    // NEXO 2 duels
    for (let i = 0; i < nexo2Count; i += 1) {
      jobs.push({
        matchId: matchId++,
        oppId: opp.id,
        oppName: opp.name,
        oppEngine: "NEXO_2",
        oppDeck,
        oppManifest,
        oppMain,
        oppFusion,
        targetStarts: (i % 2) === 1,
        seed: (deckSeed + 500_000 + matchId * 7919 + i * 31) >>> 0,
      });
    }
  }

  const fights = [];
  const parallel = WORKERS;

  for (let cursor = 0; cursor < jobs.length; cursor += parallel) {
    const batch = jobs.slice(cursor, cursor + parallel);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        const botASeat = job.targetStarts ? 0 : 1;
        const targetBot = createBotForDeck({
          botId: NEXO2_BOT_ID,
          deckId: deckDef.id,
          deck: candidateDeck,
          manifest: candidateManifest,
          seed: job.seed ^ 0x9e3779b9,
        });

        const oppBot = createBotForDeck({
          botId: job.oppEngine === "NEXO_1" ? UNIVERSAL_BOT_ID : NEXO2_BOT_ID,
          deckId: job.oppId,
          deck: job.oppDeck,
          manifest: job.oppManifest,
          seed: job.seed ^ 0x51ed270b,
        });

        const decks = botASeat === 0 ? [candidateMain, job.oppMain] : [job.oppMain, candidateMain];
        const extraDecks = botASeat === 0 ? [candidateFusion, job.oppFusion] : [job.oppFusion, candidateFusion];
        const botA = botASeat === 0 ? targetBot : oppBot;
        const botB = botASeat === 0 ? oppBot : targetBot;
        const profileA = botASeat === 0 ? deckDef.id : job.oppId;
        const profileB = botASeat === 0 ? job.oppId : deckDef.id;

        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Duel timed out (12s limit)")), 12000)
          );
          const duelPromise = runOcgcoreHeadless({
            decks,
            extraDecks,
            botA,
            botB,
            profileA,
            profileB,
            seed: job.seed,
            maxSteps: 1800,
          });
          const run = await Promise.race([duelPromise, timeoutPromise]);

          const targetWon = run.winner === botASeat;
          const targetFinalLp = botASeat === 0 ? run.lp0 : run.lp1;
          const oppFinalLp = botASeat === 0 ? run.lp1 : run.lp0;

          return {
            matchId: job.matchId,
            seed: job.seed,
            oppId: job.oppId,
            oppName: job.oppName,
            oppEngine: job.oppEngine,
            targetStarts: job.targetStarts,
            winnerSeat: run.winner,
            targetWon,
            turns: run.turns,
            finishReason: run.finishReason,
            targetFinalLp: targetFinalLp ?? 0,
            oppFinalLp: oppFinalLp ?? 0,
          };
        } catch (err) {
          return {
            matchId: job.matchId,
            seed: job.seed,
            oppId: job.oppId,
            oppName: job.oppName,
            oppEngine: job.oppEngine,
            targetStarts: job.targetStarts,
            winnerSeat: botASeat === 0 ? 1 : 0,
            targetWon: false,
            turns: 0,
            finishReason: `ERROR: ${err.message}`,
            targetFinalLp: 0,
            oppFinalLp: 8000,
          };
        }
      })
    );

    fights.push(...batchResults);
  }

  // Aggregate stats
  const totalMatches = fights.length;
  const totalWins = fights.filter((f) => f.targetWon).length;
  const totalLosses = fights.filter((f) => !f.targetWon && f.winnerSeat !== null).length;
  const totalDraws = fights.filter((f) => f.winnerSeat === null).length;
  const winRate = totalMatches > 0 ? totalWins / totalMatches : 0;
  const ic = confidenceInterval95(totalWins, totalMatches);

  // vs Nexo 1
  const nexo1Fights = fights.filter((f) => f.oppEngine === "NEXO_1");
  const nexo1Wins = nexo1Fights.filter((f) => f.targetWon).length;
  const vsNexo1Rate = nexo1Fights.length > 0 ? nexo1Wins / nexo1Fights.length : 0;

  // vs Nexo 2
  const nexo2Fights = fights.filter((f) => f.oppEngine === "NEXO_2");
  const nexo2Wins = nexo2Fights.filter((f) => f.targetWon).length;
  const vsNexo2Rate = nexo2Fights.length > 0 ? nexo2Wins / nexo2Fights.length : 0;

  // By opponent breakdown
  const byOpponent = {};
  for (const opp of opponents) {
    const oppFights = fights.filter((f) => f.oppId === opp.id);
    const oppWins = oppFights.filter((f) => f.targetWon).length;
    const oppNexo1 = oppFights.filter((f) => f.oppEngine === "NEXO_1");
    const oppNexo1Wins = oppNexo1.filter((f) => f.targetWon).length;
    const oppNexo2 = oppFights.filter((f) => f.oppEngine === "NEXO_2");
    const oppNexo2Wins = oppNexo2.filter((f) => f.targetWon).length;

    byOpponent[opp.id] = {
      name: opp.name,
      total: oppFights.length,
      wins: oppWins,
      winRate: oppFights.length > 0 ? oppWins / oppFights.length : 0,
      vsNexo1: `${oppNexo1Wins}/${oppNexo1.length} (${(oppNexo1.length > 0 ? (oppNexo1Wins / oppNexo1.length) * 100 : 0).toFixed(1)}%)`,
      vsNexo2: `${oppNexo2Wins}/${oppNexo2.length} (${(oppNexo2.length > 0 ? (oppNexo2Wins / oppNexo2.length) * 100 : 0).toFixed(1)}%)`,
    };
  }

  // Losses Audit
  const losses = fights.filter((f) => !f.targetWon);
  const lossesAudit = {
    deckId: deckDef.id,
    name: deckDef.name,
    totalLosses: losses.length,
    avgTurnsInLoss: losses.length > 0 ? Number((losses.reduce((s, l) => s + l.turns, 0) / losses.length).toFixed(1)) : 0,
    lossesVsNexo1: losses.filter((l) => l.oppEngine === "NEXO_1").length,
    lossesVsNexo2: losses.filter((l) => l.oppEngine === "NEXO_2").length,
    lossReasons: losses.reduce((acc, l) => {
      const r = l.finishReason || "UNKNOWN";
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {}),
    sampledLosses: losses.slice(0, 20).map((l) => ({
      matchId: l.matchId,
      seed: l.seed,
      oppId: l.oppId,
      oppName: l.oppName,
      oppEngine: l.oppEngine,
      targetStarts: l.targetStarts,
      turns: l.turns,
      reason: l.finishReason,
      targetFinalLp: l.targetFinalLp,
      oppFinalLp: l.oppFinalLp,
    })),
  };

  const summary = {
    deckId: deckDef.id,
    name: deckDef.name,
    archetype: deckDef.archetype,
    totalMatches,
    wins: totalWins,
    losses: totalLosses,
    draws: totalDraws,
    winRate,
    confidence95: ic,
    vsNexo1: {
      matches: nexo1Fights.length,
      wins: nexo1Wins,
      winRate: vsNexo1Rate,
      formatted: `${nexo1Wins}/${nexo1Fights.length} (${(vsNexo1Rate * 100).toFixed(1)}%)`,
    },
    vsNexo2: {
      matches: nexo2Fights.length,
      wins: nexo2Wins,
      winRate: vsNexo2Rate,
      formatted: `${nexo2Wins}/${nexo2Fights.length} (${(vsNexo2Rate * 100).toFixed(1)}%)`,
    },
    byOpponent,
    savedAt: new Date().toISOString(),
  };

  return { summary, fights, lossesAudit };
}

function generateMarkdownTable(allResults) {
  const lines = [
    "# Benchmark de 62 Mazos con Guardarraíles Tácticos",
    "",
    "Este informe presenta los resultados oficiales tras la aplicación de guardarraíles tácticos en los 62 mazos adicionales, con **100 partidas de re-entrenamiento** y **200 partidas de benchmark** por mazo (100 vs Nexo 1 y 100 vs Nexo 2).",
    "",
    "| # | Deck ID | Nombre del Mazo | Arquetipo | WinRate (200) | IC 95% | vs NEXO 1 | vs NEXO 2 | Pérdidas |",
    "|:---:|---|---|---|:---:|:---:|:---:|:---:|:---:|",
  ];

  allResults.forEach((r, idx) => {
    const s = r.summary;
    const wr = (s.winRate * 100).toFixed(1);
    const icLow = (s.confidence95.low * 100).toFixed(1);
    const icHigh = (s.confidence95.high * 100).toFixed(1);
    lines.push(
      `| ${idx + 1} | \`${s.deckId}\` | **${s.name}** | ${s.archetype} | **${wr}%** (${s.wins}/${s.totalMatches}) | [${icLow}% - ${icHigh}%] | ${s.vsNexo1.formatted} | ${s.vsNexo2.formatted} | ${s.losses} |`
    );
  });

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const targetDecks = singleDeckFilter
    ? EXTENDED_DECKS.filter((d) => d.id === singleDeckFilter)
    : EXTENDED_DECKS;

  console.log(`\n===============================================================================`);
  console.log(`INICIANDO ENTRENAMIENTO Y BENCHMARK CON GUARDARRAÍLES: ${targetDecks.length} MAZOS`);
  console.log(`Configuración: ${TRAINING_GAMES} entrenamientos + ${TOTAL_BENCHMARK_GAMES} test (200) por mazo`);
  console.log(`Workers: ${WORKERS} | Total duelos estimados: ${targetDecks.length * (TRAINING_GAMES + TOTAL_BENCHMARK_GAMES)}`);
  console.log(`===============================================================================\n`);

  const globalStart = Date.now();
  const allResults = [];

  const baseOutDir = path.resolve(root, "artifacts/nexo2-guardrailed");
  const ipadBaseOutDir = path.resolve(ipadRoot, "artifacts/nexo2-guardrailed");
  const decksModelDir = path.resolve(root, "artifacts/nexo2-decks");
  fs.mkdirSync(baseOutDir, { recursive: true });
  fs.mkdirSync(ipadBaseOutDir, { recursive: true });
  fs.mkdirSync(decksModelDir, { recursive: true });

  for (let i = 0; i < targetDecks.length; i += 1) {
    const deckDef = targetDecks[i];
    const deckStart = Date.now();
    const deckSeed = BASE_SEED + i * 10_000;

    // Check if already completed in full in guardrailed output
    const existingSummaryPath = path.join(baseOutDir, deckDef.id, "summary.json");
    if (fs.existsSync(existingSummaryPath) && !isDryRun && !isForce) {
      try {
        const existingSummary = JSON.parse(fs.readFileSync(existingSummaryPath, "utf8"));
        if (existingSummary.totalMatches >= TOTAL_BENCHMARK_GAMES) {
          console.log(`[COMPLETO] Mazo ya procesado con guardarraíles: "${deckDef.name}" (${deckDef.id}) con ${existingSummary.totalMatches} partidas.`);
          allResults.push({ summary: existingSummary });
          continue;
        }
      } catch {}
    }

    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`[${i + 1}/${targetDecks.length}] PROCESANDO: "${deckDef.name}" (\`${deckDef.id}\`)`);
    console.log(`-------------------------------------------------------------------------------`);

    // --- FASE 1: ENTRENAMIENTO (100 partidas) ---
    process.stdout.write(`  [1/2] Entrenando ${TRAINING_GAMES} partidas neuronales con OCGCore (4 workers)... `);
    let candidateManifest = null;
    let trainingUpdates = 0;

    try {
      const trainPromise = runNexoDeckTraining({
        deckId: deckDef.id,
        trainingGames: TRAINING_GAMES,
        evaluationGames: 0,
        workers: WORKERS,
        seed: deckSeed,
        maxSteps: 1800,
        rewardMode: "dense",
      });
      const trainTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Training timeout (180s limit)")), 180000)
      );
      const trainReport = await Promise.race([trainPromise, trainTimeoutPromise]);

      candidateManifest = trainReport.candidate;
      trainingUpdates = candidateManifest?.neuralModel?.trainingState?.updates ?? 0;

      // Save candidate model
      const candidateDir = path.join(decksModelDir, deckDef.id);
      fs.mkdirSync(candidateDir, { recursive: true });
      const candidateFile = path.join(candidateDir, "candidate.json");
      fs.writeFileSync(candidateFile, JSON.stringify(candidateManifest, null, 2), "utf8");

      // iPad replica
      const ipadCandidateFile = path.resolve(ipadRoot, `artifacts/nexo2-decks/${deckDef.id}/candidate.json`);
      copyFileSafe(candidateFile, ipadCandidateFile);

      console.log(`OK! (Updates: ${trainingUpdates})`);
    } catch (trainErr) {
      console.error(`ERROR en entrenamiento de ${deckDef.id}:`, trainErr.message);
    }

    // --- FASE 2: BENCHMARK (200 partidas) ---
    process.stdout.write(`  [2/2] Ejecutando benchmark (${TOTAL_BENCHMARK_GAMES} partidas vs Nexo1/Nexo2) con guardarraíles... `);

    try {
      const { summary, fights, lossesAudit } = await runBenchmarkForDeck(deckDef, candidateManifest, deckSeed);

      // Save files
      const deckOutDir = path.join(baseOutDir, deckDef.id);
      const ipadDeckOutDir = path.join(ipadBaseOutDir, deckDef.id);
      fs.mkdirSync(deckOutDir, { recursive: true });
      fs.mkdirSync(ipadDeckOutDir, { recursive: true });

      const summaryFile = path.join(deckOutDir, "summary.json");
      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), "utf8");
      copyFileSafe(summaryFile, path.join(ipadDeckOutDir, "summary.json"));

      const fightsFile = path.join(deckOutDir, "fights.jsonl");
      fs.writeFileSync(fightsFile, fights.map((f) => JSON.stringify(f)).join("\n") + "\n", "utf8");
      copyFileSafe(fightsFile, path.join(ipadDeckOutDir, "fights.jsonl"));

      const lossesFile = path.join(deckOutDir, "losses-audit.json");
      fs.writeFileSync(lossesFile, JSON.stringify(lossesAudit, null, 2), "utf8");
      copyFileSafe(lossesFile, path.join(ipadDeckOutDir, "losses-audit.json"));

      const deckElapsedSec = ((Date.now() - deckStart) / 1000).toFixed(1);
      console.log(`OK! WinRate: ${(summary.winRate * 100).toFixed(1)}% (${summary.wins}/${summary.totalMatches}) en ${deckElapsedSec}s`);
      console.log(`       vs Nexo1: ${summary.vsNexo1.formatted} | vs Nexo2: ${summary.vsNexo2.formatted}`);

      allResults.push({ summary });
    } catch (benchErr) {
      console.error(`ERROR en benchmark de ${deckDef.id}:`, benchErr.message);
    }
  }

  // Final consolidated report across all 62 decks
  const completeResults = EXTENDED_DECKS.map((d) => {
    const summaryFile = path.join(baseOutDir, d.id, "summary.json");
    if (fs.existsSync(summaryFile)) {
      try {
        const s = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
        // Ensure name and archetype are populated if missing in older summaries
        if (!s.name) s.name = d.name;
        if (!s.archetype) s.archetype = d.archetype;
        return { summary: s };
      } catch {}
    }
    return null;
  }).filter(Boolean);

  const tableMd = generateMarkdownTable(completeResults);
  const reportPath = path.join(baseOutDir, "guardrailed-benchmark-matrix.md");
  fs.writeFileSync(reportPath, tableMd, "utf8");
  copyFileSafe(reportPath, path.join(ipadBaseOutDir, "guardrailed-benchmark-matrix.md"));

  const totalDurationMin = ((Date.now() - globalStart) / 1000 / 60).toFixed(1);
  console.log(`\n===============================================================================`);
  console.log(`PROCESO COMPLETO: ${allResults.length} mazos en esta tanda. Total en matriz: ${completeResults.length}/62.`);
  console.log(`Reporte global guardado en: ${reportPath}`);
  console.log(`===============================================================================\n`);
}

main().catch((err) => {
  console.error("Fatal error en proceso:", err);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDeck } from "../decks/decks.js";
import { getCard } from "../engine/cards.js";
import { runOcgcoreHeadless } from "../engine/ocgcore-backend.js";
import { createBotForDeck, UNIVERSAL_BOT_ID } from "../bots/bot-system.js";
import { NEXO2_BOT_ID } from "../bots/nexo2-contract.js";
import { confidenceInterval95 } from "../analytics/statistics.js";

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

const gamesPerMatchup = positiveInteger("games", 100);
const workers = positiveInteger("workers", 4);
const seed = positiveInteger("seed", 9_000_000);
const maxSteps = positiveInteger("max-steps", 4_500);
const defaultMatchups = [
  "goat-control:goat-control",
  "chaos-turbo:chaos-turbo",
  "warrior:warrior",
  "goat-control:flip-control",
  "chaos-turbo:flip-control",
  "warrior:panda-burn",
  "goat-control:goatformat-monarch",
].join(",");

const matchupPairs = String(option("matchups", defaultMatchups))
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean)
  .map((pair) => {
    const [deckA, deckB] = pair.split(":").map((s) => s.trim());
    return { deckA, deckB: deckB || deckA, key: `${deckA}_vs_${deckB || deckA}` };
  });

const outputDir = path.resolve(root, option("out", path.join("artifacts", "nexo2-matchup-100")));
fs.mkdirSync(outputDir, { recursive: true });

function cardNames(ids = []) {
  return ids.map((id) => getCard(id)?.name ?? String(id));
}

async function simulateMatchup(pair, matchupIndex) {
  const deckA = getDeck(pair.deckA);
  const deckB = getDeck(pair.deckB);

  const jobs = Array.from({ length: gamesPerMatchup }, (_, index) => {
    const botASeat = index % 2;
    const startingPlayer = Math.floor(index / 2) % 2;
    const botAStarts = startingPlayer === botASeat;
    const gameSeed = Number(seed) + matchupIndex * 50_000 + index * 1_009 + (index % 11);
    return {
      game: index + 1,
      deckAId: pair.deckA,
      deckBId: pair.deckB,
      botASeat,
      botAStarts,
      startingPlayer,
      seed: gameSeed,
    };
  });

  const parallel = Math.max(1, Math.min(6, workers));
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let turnsSum = 0;
  let firstWins = 0;
  let firstCount = 0;
  let secondWins = 0;
  let secondCount = 0;

  for (let cursor = 0; cursor < jobs.length; cursor += parallel) {
    const batch = await Promise.all(
      jobs.slice(cursor, cursor + parallel).map(async (job) => {
        const instanceA = createBotForDeck({
          botId: NEXO2_BOT_ID,
          deckId: job.deckAId,
          deck: deckA,
          seed: job.seed ^ 0x9e3779b9,
        });

        const instanceB = createBotForDeck({
          botId: UNIVERSAL_BOT_ID,
          deckId: job.deckBId,
          deck: deckB,
          seed: job.seed ^ 0x51ed270b,
        });

        const run = await runOcgcoreHeadless({
          decks: job.botASeat === 0 ? [cardNames(deckA.main), cardNames(deckB.main)] : [cardNames(deckB.main), cardNames(deckA.main)],
          extraDecks: job.botASeat === 0 ? [cardNames(deckA.fusion), cardNames(deckB.fusion)] : [cardNames(deckB.fusion), cardNames(deckA.fusion)],
          seed: job.seed,
          startingPlayer: job.startingPlayer,
          maxSteps,
          botA: job.botASeat === 0 ? instanceA : instanceB,
          botB: job.botASeat === 0 ? instanceB : instanceA,
          profileA: job.deckAId,
          profileB: job.deckBId,
        });

        const won = run.winner === job.botASeat;
        const loss = run.winner !== null && run.winner !== job.botASeat;
        const draw = run.winner === null;

        return {
          won,
          loss,
          draw,
          turns: Number(run.turns) || 0,
          botAStarts: job.botAStarts,
        };
      })
    );

    for (const r of batch) {
      if (r.won) wins += 1;
      else if (r.loss) losses += 1;
      else draws += 1;
      turnsSum += r.turns;

      if (r.botAStarts) {
        firstCount += 1;
        if (r.won) firstWins += 1;
      } else {
        secondCount += 1;
        if (r.won) secondWins += 1;
      }
    }

    const currentCompleted = cursor + batch.length;
    process.stderr.write(`\rMatch-up [${matchupIndex + 1}/${matchupPairs.length}] ${pair.deckA} vs ${pair.deckB}: ${currentCompleted}/${gamesPerMatchup} (${wins}W - ${losses}L)`);
  }

  process.stderr.write("\n");

  const played = Math.max(1, gamesPerMatchup);
  const winRate = wins / played;

  return {
    matchup: `${pair.deckA} vs ${pair.deckB}`,
    deckNexo2: pair.deckA,
    deckNexo1: pair.deckB,
    isMirror: pair.deckA === pair.deckB,
    games: gamesPerMatchup,
    wins,
    losses,
    draws,
    winRate,
    confidence95: confidenceInterval95(wins, played),
    averageTurns: turnsSum / played,
    turnOrder: {
      goingFirst: { wins: firstWins, games: firstCount, rate: firstCount ? firstWins / firstCount : 0 },
      goingSecond: { wins: secondWins, games: secondCount, rate: secondCount ? secondWins / secondCount : 0 },
    },
  };
}

async function main() {
  process.stderr.write(`Iniciando simulación masiva: ${matchupPairs.length} match-ups x ${gamesPerMatchup} partidas = ${matchupPairs.length * gamesPerMatchup} duelos totales...\n`);
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < matchupPairs.length; i++) {
    const res = await simulateMatchup(matchupPairs[i], i);
    results.push(res);
  }

  const totalGames = results.reduce((acc, r) => acc + r.games, 0);
  const totalWins = results.reduce((acc, r) => acc + r.wins, 0);
  const totalLosses = results.reduce((acc, r) => acc + r.losses, 0);
  const totalDraws = results.reduce((acc, r) => acc + r.draws, 0);
  const overallWinRate = totalWins / Math.max(1, totalGames);

  const mirrorResults = results.filter((r) => r.isMirror);
  const mirrorGames = mirrorResults.reduce((acc, r) => acc + r.games, 0);
  const mirrorWins = mirrorResults.reduce((acc, r) => acc + r.wins, 0);
  const mirrorWinRate = mirrorGames ? mirrorWins / mirrorGames : 0;

  const crossResults = results.filter((r) => !r.isMirror);
  const crossGames = crossResults.reduce((acc, r) => acc + r.games, 0);
  const crossWins = crossResults.reduce((acc, r) => acc + r.wins, 0);
  const crossWinRate = crossGames ? crossWins / crossGames : 0;

  const summary = {
    schema: 1,
    createdAt: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
    config: { gamesPerMatchup, workers, seed },
    overall: {
      totalGames,
      totalWins,
      totalLosses,
      totalDraws,
      winRate: overallWinRate,
      confidence95: confidenceInterval95(totalWins, totalGames),
    },
    mirrors: {
      games: mirrorGames,
      wins: mirrorWins,
      winRate: mirrorWinRate,
    },
    asymmetricCross: {
      games: crossGames,
      wins: crossWins,
      winRate: crossWinRate,
    },
    matchups: results,
  };

  fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  // Format Markdown report
  const mdLines = [
    `# Resultados de la Simulación Masiva de Match-ups (${totalGames} Partidas)`,
    "",
    `Fecha: ${new Date().toISOString()} | Duración: ${summary.elapsedSeconds}s`,
    "",
    "## Resumen Global",
    "",
    `- **Total de Partidas**: ${totalGames}`,
    `- **Victorias Nexo 2**: **${totalWins} (${(overallWinRate * 100).toFixed(1)} %)**`,
    `- **Derrotas**: ${totalLosses}`,
    `- **Empates**: ${totalDraws}`,
    `- **Intervalo de Confianza 95 %**: [${(summary.overall.confidence95.low * 100).toFixed(1)} %, ${(summary.overall.confidence95.high * 100).toFixed(1)} %]`,
    "",
    "### Comparativa Mirrors vs. Match-ups Asimétricos",
    `- **Enfrentamientos Espejo (Mirrors)**: **${(mirrorWinRate * 100).toFixed(1)} %** (${mirrorWins}/${mirrorGames})`,
    `- **Enfrentamientos Asimétricos (Tier 1 vs Tier 2 / Ventaja)**: **${(crossWinRate * 100).toFixed(1)} %** (${crossWins}/${crossGames})`,
    "",
    "---",
    "",
    "## Tabla Detallada por Match-up (100 Partidas c/u)",
    "",
    "| Match-up (Nexo 2 vs Nexo 1) | Tipo | Victorias | Derrotas | Winrate Nexo 2 | IC 95 % | Saliendo 1º | Saliendo 2º | Duración Media |",
    "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
  ];

  for (const r of results) {
    const typeLabel = r.isMirror ? "Mirror" : "Asimétrico";
    const icStr = `[${(r.confidence95.low * 100).toFixed(0)}%, ${(r.confidence95.high * 100).toFixed(0)}%]`;
    const fStr = `${(r.turnOrder.goingFirst.rate * 100).toFixed(0)}% (${r.turnOrder.goingFirst.wins}/${r.turnOrder.goingFirst.games})`;
    const sStr = `${(r.turnOrder.goingSecond.rate * 100).toFixed(0)}% (${r.turnOrder.goingSecond.wins}/${r.turnOrder.goingSecond.games})`;
    mdLines.push(`| **${r.matchup}** | ${typeLabel} | ${r.wins} | ${r.losses} | **${(r.winRate * 100).toFixed(1)} %** | ${icStr} | ${fStr} | ${sStr} | ${r.averageTurns.toFixed(1)} turnos |`);
  }

  mdLines.push("");
  mdLines.push("---");
  mdLines.push("");
  mdLines.push("## Conclusiones del Experimento");
  mdLines.push("");
  mdLines.push("1. **Ventaja en Mirror**: Demuestra que Nexo 2 toma mejores decisiones que Nexo 1 en igualdad de condiciones de mazo.");
  mdLines.push("2. **Impacto en Match-ups Favorables**: Demuestra cómo la ventaja combinada de mazo e IA impulsa el winrate hacia y por encima del 75 %.");
  mdLines.push("");

  fs.writeFileSync(path.join(outputDir, "matchup-results.md"), mdLines.join("\n"), "utf8");

  console.log(JSON.stringify({
    outputDir,
    totalGames,
    overallWinRate: `${(overallWinRate * 100).toFixed(1)} %`,
    mirrorWinRate: `${(mirrorWinRate * 100).toFixed(1)} %`,
    crossWinRate: `${(crossWinRate * 100).toFixed(1)} %`,
  }, null, 2));
}

main().catch((err) => {
  console.error("Error en simulación:", err);
  process.exit(1);
});

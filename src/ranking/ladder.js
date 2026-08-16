import { hashString } from "../engine/rng.js";
import { listActiveBotSpecs } from "../bots/bot-system.js";

export const LEAGUES = Object.freeze([
  { name: "Hierro", minRating: 0, divisions: true },
  { name: "Bronce", minRating: 900, divisions: true },
  { name: "Plata", minRating: 1050, divisions: true },
  { name: "Oro", minRating: 1200, divisions: true },
  { name: "Platino", minRating: 1350, divisions: true },
  { name: "Esmeralda", minRating: 1500, divisions: true },
  { name: "Diamante", minRating: 1650, divisions: true },
  { name: "Maestro", minRating: 1800, divisions: false },
  { name: "Gran Maestro", minRating: 1950, divisions: false },
  { name: "Retador", minRating: 2100, divisions: false }
]);

export const LADDER_SCHEMA = 2;
export const MATCH_SCHEMA = 1;

export function normalizeBestOf(value = 1) {
  const requested = Math.max(1, Math.floor(Number(value) || 1));
  return requested % 2 === 0 ? requested - 1 : requested;
}

export function leagueForRating(rating) {
  let selected = LEAGUES[0];
  for (const league of LEAGUES) if (rating >= league.minRating) selected = league;
  const index = LEAGUES.indexOf(selected);
  const division = selected.divisions ? Math.min(4, Math.floor((rating - selected.minRating) / 37.5) + 1) : null;
  return { league: selected.name, division, leagueIndex: index, minRating: selected.minRating };
}

export function initialLadder() {
  return {
    schema: LADDER_SCHEMA,
    season: { id: "local-season-01", name: "Temporada local 01", startedAt: new Date().toISOString(), active: true, matches: 0, bestOf: 1, promotion: null },
    player: { id: "local-player", name: "Duelista", rating: 1200, technicalRating: 1200, uncertainty: 350, lp: 0, wins: 0, losses: 0, draws: 0, streak: 0, games: 0, lastOpponents: [], deckRatings: {} },
    history: [],
    bots: listActiveBotSpecs().map((bot) => ({ id: bot.id, name: bot.name, deckId: bot.deckId, style: bot.style, rating: bot.rating ?? 1200, technicalRating: bot.rating ?? 1200, uncertainty: 250, difficulty: bot.difficulty, intelligence: bot.intelligence ?? 0 }))
  };
}

export function upsertLadderBot(ladder, bot = {}) {
  if (!bot.id || !bot.deckId) throw new Error("upsertLadderBot necesita id y deckId.");
  const next = structuredClone(ladder);
  const normalized = {
    id: bot.id,
    name: bot.name ?? bot.id,
    deckId: bot.deckId,
    style: bot.style ?? "Adaptativo",
    rating: Math.max(0, Number(bot.technicalRating ?? bot.rating) || 1200),
    technicalRating: Math.max(0, Number(bot.technicalRating ?? bot.rating) || 1200),
    uncertainty: Math.max(50, Number(bot.uncertainty) || 350),
    difficulty: bot.difficulty ?? "normal",
    intelligence: Math.max(0, Number(bot.intelligence) || 0),
  };
  const index = next.bots.findIndex((candidate) => candidate.id === normalized.id);
  if (index === -1) next.bots.push(normalized);
  else next.bots[index] = { ...next.bots[index], ...normalized };
  return next;
}

export function startLocalSeason({ id = `local-season-${Date.now()}`, name = "Temporada local", preserveBots = true } = {}) {
  const ladder = initialLadder();
  ladder.season.id = id;
  ladder.season.name = name;
  if (!preserveBots) ladder.bots = [];
  return ladder;
}

export function championsLadder(ladder) {
  return [...(ladder.bots ?? [])]
    .map((bot) => ({ ...bot, source: "bot", technicalRating: bot.technicalRating ?? bot.rating }))
    .sort((a, b) => (b.technicalRating ?? 0) - (a.technicalRating ?? 0) || String(a.id).localeCompare(String(b.id)));
}

export function createLocalChallenge(ladder, { botId = null, mode = "challenge", bestOf = 1 } = {}) {
  const bot = botId ? ladder.bots.find((candidate) => candidate.id === botId) : chooseLocalMatch(ladder, { difficulty: "all" });
  if (!bot) return null;
  return { id: hashString(`${ladder.season.id}-${bot.id}-${ladder.player.games}-${mode}`), mode, bestOf: normalizeBestOf(bestOf), botId: bot.id, deckId: bot.deckId, opponentName: bot.name, opponentRating: bot.rating };
}

export function createLocalMatch(ladder, { botId = null, mode = "ladder", bestOf = 3, deckId = "chaos-turbo", sideDeck = [] } = {}) {
  const challenge = createLocalChallenge(ladder, { botId, mode, bestOf });
  if (!challenge) return null;
  const normalizedBestOf = normalizeBestOf(challenge.bestOf);
  return {
    schema: MATCH_SCHEMA,
    id: challenge.id,
    mode: challenge.mode,
    bestOf: normalizedBestOf,
    targetWins: Math.ceil(normalizedBestOf / 2),
    gameNumber: 0,
    playerWins: 0,
    opponentWins: 0,
    draws: 0,
    completed: false,
    seriesResult: null,
    botId: challenge.botId,
    opponentName: challenge.opponentName,
    opponentRating: challenge.opponentRating,
    deckId,
    sideDeck: [...sideDeck],
    games: []
  };
}

export function recordMatchGame(match, { result, seed = null, replayId = null } = {}) {
  const next = structuredClone(match);
  if (next.completed) return next;
  const normalized = ["win", "loss", "draw"].includes(result) ? result : "draw";
  next.gameNumber += 1;
  if (normalized === "win") next.playerWins += 1;
  else if (normalized === "loss") next.opponentWins += 1;
  else next.draws += 1;
  next.games.push({ number: next.gameNumber, result: normalized, seed, replayId });
  if (next.playerWins >= next.targetWins || next.opponentWins >= next.targetWins) {
    next.completed = true;
    next.seriesResult = next.playerWins > next.opponentWins ? "win" : "loss";
  }
  return next;
}

export function createPromotionSeries(ladder, { bestOf = 3, guardianIds = null } = {}) {
  const current = leagueForRating(ladder.player.rating);
  const target = LEAGUES[Math.min(LEAGUES.length - 1, current.leagueIndex + 1)];
  const guardians = (guardianIds ?? ladder.bots
    .slice()
    .sort((a, b) => Math.abs((a.rating ?? 1200) - target.minRating) - Math.abs((b.rating ?? 1200) - target.minRating))
    .slice(0, 3)
    .map((bot) => bot.id))
    .filter((id) => ladder.bots.some((bot) => bot.id === id));
  if (!guardians.length || !target || target.leagueIndex <= current.leagueIndex) return null;
  const normalizedBestOf = normalizeBestOf(bestOf);
  return {
    schema: MATCH_SCHEMA,
    id: hashString(`${ladder.season.id}-promotion-${ladder.player.games}-${target.name}`),
    mode: "promotion",
    from: current,
    to: { league: target.name, leagueIndex: target.leagueIndex, minRating: target.minRating },
    guardians,
    bestOf: normalizedBestOf,
    targetWins: Math.ceil(normalizedBestOf / 2),
    gameNumber: 0,
    playerWins: 0,
    opponentWins: 0,
    completed: false,
    result: null,
    games: [],
  };
}

export function recordPromotionGame(series, { result, seed = null, replayId = null } = {}) {
  const next = structuredClone(series);
  if (next.completed) return next;
  const normalized = ["win", "loss", "draw"].includes(result) ? result : "draw";
  const guardianId = next.guardians[next.gameNumber % next.guardians.length];
  next.gameNumber += 1;
  if (normalized === "win") next.playerWins += 1;
  if (normalized === "loss") next.opponentWins += 1;
  next.games.push({ number: next.gameNumber, guardianId, result: normalized, seed, replayId });
  if (next.playerWins >= next.targetWins || next.opponentWins >= next.targetWins) {
    next.completed = true;
    next.result = next.playerWins > next.opponentWins ? "promoted" : "failed";
  }
  return next;
}

export function applyPromotionSeries(ladder, series) {
  if (!series?.completed || !series.result) return structuredClone(ladder);
  const next = structuredClone(ladder);
  if (series.result === "promoted") {
    next.player.rating = Math.max(next.player.rating, series.to.minRating);
    next.player.technicalRating = next.player.rating;
    next.player.lp = 0;
    next.season.promotion = { from: series.from, to: series.to, result: "promoted", matchId: series.id, at: new Date().toISOString() };
  } else next.player.lp = Math.min(next.player.lp, 99);
  return next;
}

export function eloExpected(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function updateTechnicalRating(ratingA, ratingB, resultA, { k = 24 } = {}) {
  const expectedA = eloExpected(ratingA, ratingB);
  const scoreA = resultA === "win" ? 1 : resultA === "loss" ? 0 : 0.5;
  const delta = Math.round(k * (scoreA - expectedA));
  return { ratingA: ratingA + delta, ratingB: ratingB - delta, delta, expectedA };
}

export function updateUncertainty(uncertainty, { games = 1, decisive = true } = {}) {
  const current = Math.max(50, Number(uncertainty) || 350);
  const reduction = decisive ? 0.96 : 0.985;
  return Math.max(50, Math.round(current * (reduction ** Math.max(1, Number(games) || 1))));
}

export function applyLadderResult(ladder, { botId, deckId, result, mode = "ladder", opponentRating = null, opponentName = "Bot", matchId = null, bestOf = 1, matchScore = null } = {}) {
  const next = structuredClone(ladder);
  const p = next.player;
  const bot = next.bots.find((candidate) => candidate.id === botId);
  const currentTechnicalRating = Number(p.technicalRating ?? p.rating ?? 1200);
  const uncertaintyBefore = Number(p.uncertainty ?? 350);
  const baseOpponentRating = opponentRating ?? bot?.technicalRating ?? bot?.rating ?? currentTechnicalRating;
  const previousMeetings = next.history.filter((entry) => entry.botId === botId && entry.mode === "ladder").slice(0, 5).length;
  const antiSpamFactor = mode === "ladder" ? Math.max(0.25, 1 - previousMeetings * 0.2) : 1;
  const rating = updateTechnicalRating(currentTechnicalRating, baseOpponentRating, result, { k: Math.max(6, Math.round(24 * antiSpamFactor)) });
  p.rating = Math.max(0, rating.ratingA);
  p.technicalRating = p.rating;
  p.uncertainty = updateUncertainty(uncertaintyBefore, { decisive: result !== "draw" });
  p.games += 1;
  if (result === "win") { p.wins += 1; p.streak = Math.max(1, p.streak + 1); }
  else if (result === "loss") { p.losses += 1; p.streak = Math.min(-1, p.streak - 1); }
  else { p.draws += 1; p.streak = 0; }
  const rawLpDelta = result === "win" ? Math.max(12, Math.round(22 - Math.max(0, p.rating - baseOpponentRating) / 20)) : result === "loss" ? -Math.max(8, Math.round(18 - Math.max(0, baseOpponentRating - p.rating) / 20)) : 0;
  const lpDelta = Math.round(rawLpDelta * antiSpamFactor);
  p.lp = Math.max(0, Math.min(100, p.lp + lpDelta));
  if (!p.deckRatings[deckId]) p.deckRatings[deckId] = { rating: 1200, games: 0, wins: 0, losses: 0, draws: 0 };
  const deckRating = p.deckRatings[deckId];
  const deckUncertaintyBefore = Number(deckRating.uncertainty ?? 350);
  const deckUpdate = updateTechnicalRating(deckRating.rating, baseOpponentRating, result, { k: 20 });
  deckRating.rating = Math.max(0, deckUpdate.ratingA);
  deckRating.uncertainty = updateUncertainty(deckUncertaintyBefore, { decisive: result !== "draw" });
  deckRating.games += 1;
  if (result === "win") deckRating.wins += 1;
  else if (result === "loss") deckRating.losses += 1;
  else deckRating.draws += 1;
  const rank = leagueForRating(p.rating);
  if (p.lp >= 100 && rank.division && rank.division > 1) { p.lp -= 100; p.rating += 35; }
  if (p.lp === 0 && result === "loss" && rank.division && rank.division < 4 && p.games > 3) p.rating = Math.max(rank.minRating, p.rating - 20);
  p.technicalRating = p.rating;
  next.season.matches = (next.season.matches ?? 0) + (mode === "ladder" ? 1 : 0);
  const previousRank = leagueForRating(currentTechnicalRating);
  const nextRank = leagueForRating(p.rating);
  if (nextRank.leagueIndex > previousRank.leagueIndex) next.season.promotion = { from: previousRank, to: nextRank, result: "promoted", at: new Date().toISOString() };
  if (nextRank.leagueIndex < previousRank.leagueIndex) next.season.promotion = { from: previousRank, to: nextRank, result: "demoted", at: new Date().toISOString() };
  const entry = { id: hashString(`${Date.now()}-${p.games}-${botId}`), date: new Date().toISOString(), mode, botId, opponentName, deckId, result, antiSpamFactor, ratingBefore: p.rating - rating.delta, ratingAfter: p.rating, uncertaintyBefore, uncertaintyAfter: p.uncertainty, lpDelta, lp: p.lp, rank: leagueForRating(p.rating), matchId, bestOf: normalizeBestOf(bestOf), matchScore };
  next.history.unshift(entry);
  next.history = next.history.slice(0, 100);
  return next;
}

export function chooseLocalMatch(ladder, { deckId = null, difficulty = "normal" } = {}) {
  const p = ladder.player;
  const filtered = ladder.bots.filter((bot) => difficulty === "all" || bot.difficulty === difficulty || (difficulty === "normal" && bot.difficulty === "easy"));
  const candidates = filtered.length ? filtered : ladder.bots;
  if (!candidates.length) return null;
  const recent = new Set(p.lastOpponents ?? []);
  const matchScore = (bot) => Math.abs(bot.rating - p.rating) + (recent.has(bot.id) ? 180 : 0) + (deckId && bot.deckId === deckId ? 35 : 0);
  const sorted = [...candidates].sort((a, b) => matchScore(a) - matchScore(b) || String(a.id).localeCompare(b.id));
  const selected = sorted[0];
  p.lastOpponents = [selected.id, ...(p.lastOpponents ?? [])].slice(0, 5);
  return selected;
}

export function ladderView(ladder) {
  const rank = leagueForRating(ladder.player.rating);
  const deckEntries = Object.entries(ladder.player.deckRatings).map(([deckId, data]) => ({ deckId, ...data }));
  return { ...rank, rating: ladder.player.rating, technicalRating: ladder.player.technicalRating ?? ladder.player.rating, uncertainty: ladder.player.uncertainty ?? 350, lp: ladder.player.lp, wins: ladder.player.wins, losses: ladder.player.losses, draws: ladder.player.draws, streak: ladder.player.streak, season: ladder.season, promotion: ladder.season.promotion ?? null, deckEntries, champions: championsLadder(ladder) };
}

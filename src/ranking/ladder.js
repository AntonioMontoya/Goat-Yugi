import { hashString } from "../engine/rng.js";
import { NEXO2_BOT_ID, UNIVERSAL_BOT_ID, listActiveBotSpecs } from "../bots/bot-system.js";
import { NEXO3_BOT_ID } from "../bots/nexo3-contract.js";
import {
  RANK_TIERS,
  DIVISIONS,
  DIVISION_ROMAN,
  generateRankedOpponent,
  getDeckTierNumber,
  calculateBaseRating,
  BOT_ARCHETYPES,
  getRankedOpponentSprite
} from "./deck-tiers.js";

export { RANK_TIERS, DIVISIONS, DIVISION_ROMAN, generateRankedOpponent, getDeckTierNumber, BOT_ARCHETYPES, getRankedOpponentSprite };

export const LEAGUES = Object.freeze(
  RANK_TIERS.map((tier) => ({
    name: tier.name,
    id: tier.id,
    minRating: tier.minRating,
    color: tier.color,
    divisions: true
  }))
);

export const LADDER_SCHEMA = 2;
export const MATCH_SCHEMA = 1;

export function normalizeBestOf(value = 1) {
  const requested = Math.max(1, Math.floor(Number(value) || 1));
  return requested % 2 === 0 ? requested - 1 : requested;
}

export function getNextTier(tierName) {
  const norm = String(tierName).trim().toLowerCase();
  const index = RANK_TIERS.findIndex((t) => t.id === norm || t.name.toLowerCase() === norm);
  if (index === -1 || index >= RANK_TIERS.length - 1) return null;
  return RANK_TIERS[index + 1];
}

export function getPrevTier(tierName) {
  const norm = String(tierName).trim().toLowerCase();
  const index = RANK_TIERS.findIndex((t) => t.id === norm || t.name.toLowerCase() === norm);
  if (index <= 0) return null;
  return RANK_TIERS[index - 1];
}

export function getPlacementRank(wins) {
  const w = Math.max(0, Math.min(10, Math.round(Number(wins) || 0)));
  switch (w) {
    case 10: return { tier: "Oro", division: 1, divisionRoman: "I", rating: 1450 };
    case 9:  return { tier: "Oro", division: 2, divisionRoman: "II", rating: 1400 };
    case 8:  return { tier: "Oro", division: 3, divisionRoman: "III", rating: 1350 };
    case 7:  return { tier: "Oro", division: 4, divisionRoman: "IV", rating: 1300 };
    case 6:  return { tier: "Oro", division: 5, divisionRoman: "V", rating: 1250 };
    case 5:  return { tier: "Bronce", division: 1, divisionRoman: "I", rating: 1150 };
    case 4:  return { tier: "Bronce", division: 2, divisionRoman: "II", rating: 1050 };
    case 3:  return { tier: "Bronce", division: 3, divisionRoman: "III", rating: 950 };
    case 2:  return { tier: "Bronce", division: 4, divisionRoman: "IV", rating: 850 };
    case 1:  return { tier: "Bronce", division: 4, divisionRoman: "IV", rating: 750 };
    case 0:
    default: return { tier: "Bronce", division: 5, divisionRoman: "V", rating: 650 };
  }
}

export function leagueForRating(rating) {
  let selected = LEAGUES[0];
  for (const league of LEAGUES) {
    if (rating >= league.minRating) selected = league;
  }
  const index = LEAGUES.indexOf(selected);
  const nextMin = LEAGUES[index + 1]?.minRating ?? (selected.minRating + 300);
  const span = Math.max(60, (nextMin - selected.minRating) / 5);
  // 5 es la división más baja (V), 1 es la más alta (I)
  const offset = Math.max(0, rating - selected.minRating);
  const step = Math.min(4, Math.floor(offset / span));
  const division = 5 - step;
  return {
    league: selected.name,
    division,
    leagueIndex: index,
    minRating: selected.minRating,
    divisionRoman: DIVISION_ROMAN[division] ?? "V"
  };
}

export function initialLadder() {
  return {
    schema: LADDER_SCHEMA,
    season: {
      id: "local-season-01",
      name: "Temporada local 01",
      startedAt: new Date().toISOString(),
      active: true,
      matches: 0,
      bestOf: 1,
      promotion: null
    },
    player: {
      id: "local-player",
      name: "Duelista",
      rating: 1200,
      technicalRating: 1200,
      uncertainty: 350,
      tier: "Bronce",
      division: 5,
      divisionRoman: "V",
      lp: 0,
      demotionShield: 1,
      placements: {
        active: true,
        gamesPlayed: 0,
        totalGames: 10,
        wins: 0,
        losses: 0,
        provisionalTier: "Bronce",
        provisionalDivision: 5,
        provisionalDivisionRoman: "V",
        games: []
      },
      promoSeries: null,
      rankedDeckId: "chaos-turbo",
      activeRankedMatch: null,
      quitPenalty: null,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      games: 0,
      lastOpponents: [],
      recentDeckIds: [],
      recentOpponentNames: [],
      deckRatings: {}
    },
    history: [],
    bots: listActiveBotSpecs()
      .filter((bot) => bot.id !== NEXO2_BOT_ID)
      .map((bot) => ({
        id: bot.id,
        name: bot.name,
        deckId: bot.deckId,
        style: bot.style,
        rating: bot.rating ?? 1200,
        technicalRating: bot.rating ?? 1200,
        uncertainty: 250,
        difficulty: bot.difficulty,
        intelligence: bot.intelligence ?? 0
      }))
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
    intelligence: Math.max(0, Number(bot.intelligence) || 0)
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
  return {
    id: hashString(`${ladder.season.id}-${bot.id}-${ladder.player.games}-${mode}`),
    mode,
    bestOf: normalizeBestOf(bestOf),
    botId: bot.id,
    deckId: bot.deckId,
    opponentName: bot.name,
    opponentRating: bot.rating
  };
}

export function createLocalMatch(ladder, { botId = null, mode = "ladder", bestOf = 1, deckId = "chaos-turbo", sideDeck = [] } = {}) {
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
    games: []
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
    next.player.tier = series.to.league;
    next.player.division = 5;
    next.player.divisionRoman = "V";
    next.player.lp = 0;
    next.player.demotionShield = 1;
    next.player.promoSeries = null;
    next.season.promotion = { from: series.from, to: series.to, result: "promoted", matchId: series.id, at: new Date().toISOString() };
  } else {
    next.player.lp = Math.min(next.player.lp, 75);
    next.player.promoSeries = null;
  }
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

/**
 * Registra el resultado de un duelo puntuable aplicando la progresión de LP,
 * ascensos de división y series de promoción estilo League of Legends.
 */
export function applyLadderResult(ladder, {
  botId = null,
  deckId = "chaos-turbo",
  result = "draw",
  abandoned = false,
  mode = "ladder",
  opponentRating = null,
  opponentName = "Bot",
  opponentTier = null,
  opponentDivision = null,
  matchId = null,
  bestOf = 1,
  matchScore = null
} = {}) {
  if (abandoned) {
    result = "loss";
    matchScore = matchScore ?? "Abandono";
  }
  const next = structuredClone(ladder);
  const p = next.player;
  const bot = next.bots.find((candidate) => candidate.id === botId);
  const currentTechnicalRating = Number(p.technicalRating ?? p.rating ?? 1200);
  const uncertaintyBefore = Number(p.uncertainty ?? 350);
  const baseOpponentRating = opponentRating ?? bot?.technicalRating ?? bot?.rating ?? currentTechnicalRating;

  // Anti-spam para rating técnico
  const previousMeetings = (next.history ?? []).filter((entry) => entry.botId === botId && entry.mode === "ladder").slice(0, 5).length;
  const antiSpamFactor = mode === "ladder" ? Math.max(0.25, 1 - previousMeetings * 0.2) : 1;

  // Actualización Elo técnico
  const ratingUpdate = updateTechnicalRating(currentTechnicalRating, baseOpponentRating, result, {
    k: Math.max(6, Math.round(24 * antiSpamFactor))
  });

  p.rating = Math.max(0, ratingUpdate.ratingA);
  p.technicalRating = p.rating;
  p.uncertainty = updateUncertainty(uncertaintyBefore, { decisive: result !== "draw" });
  p.games += 1;

  // Estadísticas generales
  if (result === "win") {
    p.wins += 1;
    p.streak = Math.max(1, (p.streak ?? 0) + 1);
  } else if (result === "loss") {
    p.losses += 1;
    p.streak = Math.min(-1, (p.streak ?? 0) - 1);
  } else {
    p.draws += 1;
    p.streak = 0;
  }

  // Inicializar estado de tier/división si faltaba
  if (!p.tier) {
    const derived = leagueForRating(p.rating);
    p.tier = derived.league;
    p.division = derived.division;
  }
  p.division = Math.max(1, Math.min(5, Number(p.division) || 5));
  p.divisionRoman = DIVISION_ROMAN[p.division] ?? "V";
  p.lp = Math.max(0, Math.min(100, Number(p.lp) || 0));
  if (p.demotionShield === undefined) p.demotionShield = 1;

  let lpDelta = 0;
  let promoEvent = null;
  let divisionChanged = false;

  // Manejo de Partidas de Posicionamiento (10 partidas iniciales estilo LoL)
  if (p.placements?.active && mode === "ladder") {
    const pl = p.placements;
    pl.games = pl.games ?? [];
    pl.gamesPlayed = (pl.gamesPlayed ?? 0) + 1;
    if (result === "win") pl.wins = (pl.wins ?? 0) + 1;
    else if (result === "loss") pl.losses = (pl.losses ?? 0) + 1;
    pl.games.push({ gameNumber: pl.gamesPlayed, result, opponentName, deckId });

    const prov = getPlacementRank(pl.wins);
    pl.provisionalTier = prov.tier;
    pl.provisionalDivision = prov.division;
    pl.provisionalDivisionRoman = prov.divisionRoman;

    if (pl.gamesPlayed >= (pl.totalGames ?? 10)) {
      pl.active = false;
      p.tier = prov.tier;
      p.division = prov.division;
      p.divisionRoman = prov.divisionRoman;
      p.lp = 50;
      p.demotionShield = 3;
      p.technicalRating = prov.rating;
      p.rating = prov.rating;
      lpDelta = 50;
      promoEvent = {
        type: "placements-completed",
        tier: p.tier,
        division: p.division,
        divisionRoman: p.divisionRoman,
        wins: pl.wins,
        losses: pl.losses
      };
    } else {
      lpDelta = result === "win" ? 10 : 0;
      promoEvent = {
        type: "placement-game",
        gameNumber: pl.gamesPlayed,
        totalGames: pl.totalGames ?? 10,
        result,
        wins: pl.wins,
        losses: pl.losses,
        provisionalTier: prov.tier,
        provisionalDivision: prov.division,
        provisionalDivisionRoman: prov.divisionRoman
      };
    }
  } else if (p.promoSeries && mode === "ladder") {
    const series = p.promoSeries;
    series.games = series.games ?? [];
    if (result === "win") series.wins = (series.wins ?? 0) + 1;
    else if (result === "loss") series.losses = (series.losses ?? 0) + 1;
    series.games.push({ result, opponentName, deckId });

    if (series.wins >= series.targetWins) {
      // ¡Promoción exitosa a siguiente Rango!
      promoEvent = { type: "promoted-tier", from: p.tier, to: series.toTier };
      p.tier = series.toTier;
      p.division = 5;
      p.divisionRoman = "V";
      p.lp = 0;
      p.demotionShield = 1;
      p.promoSeries = null;
      next.season.promotion = {
        from: series.fromTier,
        to: series.toTier,
        result: "promoted",
        at: new Date().toISOString()
      };
    } else if (series.losses >= series.targetWins) {
      // Promoción fallida
      promoEvent = { type: "failed-promo", tier: p.tier };
      p.lp = 75;
      p.promoSeries = null;
    }
  } else if (mode === "ladder") {
    // Modo Ladder regular: Cálculo dinámico de LP (Estilo LoL)
    const expectedTierRating = calculateBaseRating(p.tier, p.division);
    const mmrAdvantage = Math.round((currentTechnicalRating - expectedTierRating) / 30);
    const streakBonus = Math.max(0, Math.min(5, (p.streak ?? 0) - 1));

    if (result === "win") {
      const baseLp = 20 + mmrAdvantage + streakBonus;
      lpDelta = Math.max(15, Math.min(30, Math.round(baseLp * antiSpamFactor)));
      p.lp += lpDelta;

      if (p.lp >= 100) {
        if (p.division > 1) {
          // Ascenso intra-tier (ej. Oro IV -> Oro III)
          const oldDiv = p.division;
          p.division -= 1;
          p.divisionRoman = DIVISION_ROMAN[p.division] ?? "V";
          p.lp = Math.max(0, p.lp - 100);
          p.demotionShield = 1;
          divisionChanged = true;
          promoEvent = { type: "division-up", from: oldDiv, to: p.division, tier: p.tier };
        } else if (p.division === 1) {
          // Reaching 100 LP in division 1 triggers Promotion Series BO3
          const nextTier = getNextTier(p.tier);
          if (nextTier) {
            p.lp = 100;
            p.promoSeries = {
              targetWins: 2,
              wins: 0,
              losses: 0,
              fromTier: p.tier,
              toTier: nextTier.name,
              toDivision: 5,
              bestOf: 3,
              games: []
            };
            promoEvent = { type: "promo-unlocked", from: p.tier, to: nextTier.name };
          } else {
            // Rango máximo (Diamante I a 100 LP)
            p.lp = 100;
          }
        }
      }
    } else if (result === "loss") {
      const baseLoss = 18 - mmrAdvantage;
      lpDelta = -Math.max(12, Math.min(26, Math.round(baseLoss * antiSpamFactor)));
      
      if (p.lp + lpDelta < 0) {
        if (p.demotionShield > 0 && p.lp === 0) {
          // Escudo de gracia protege
          p.demotionShield -= 1;
          lpDelta = 0;
          p.lp = 0;
          promoEvent = { type: "demotion-warning", tier: p.tier, division: p.division };
        } else if (p.lp > 0) {
          // Cae a 0 LP primero
          lpDelta = -p.lp;
          p.lp = 0;
        } else {
          // Descenso de división / tier
          if (p.division < 5) {
            const oldDiv = p.division;
            p.division += 1;
            p.divisionRoman = DIVISION_ROMAN[p.division] ?? "V";
            p.lp = 75;
            p.demotionShield = 1;
            divisionChanged = true;
            promoEvent = { type: "division-down", from: oldDiv, to: p.division, tier: p.tier };
          } else {
            // Descenso de Tier (ej. Oro V a Bronce I)
            const prevTier = getPrevTier(p.tier);
            if (prevTier) {
              const oldTier = p.tier;
              p.tier = prevTier.name;
              p.division = 1;
              p.divisionRoman = "I";
              p.lp = 75;
              p.demotionShield = 1;
              divisionChanged = true;
              promoEvent = { type: "tier-demoted", from: oldTier, to: prevTier.name };
              next.season.promotion = { from: oldTier, to: prevTier.name, result: "demoted", at: new Date().toISOString() };
            } else {
              // Bronce V: tope inferior
              p.lp = 0;
            }
          }
        }
      } else {
        p.lp += lpDelta;
      }
    }
  }

  // Rating por deck individual
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

  next.season.matches = (next.season.matches ?? 0) + (mode === "ladder" ? 1 : 0);

  // Registro en historial
  const entry = {
    id: hashString(`${Date.now()}-${p.games}-${botId}`),
    date: new Date().toISOString(),
    mode,
    botId,
    opponentName,
    opponentTier: opponentTier ?? p.tier,
    opponentDivision: opponentDivision ?? p.division,
    deckId,
    deckTier: getDeckTierNumber(deckId),
    result,
    abandoned: Boolean(abandoned),
    antiSpamFactor,
    ratingBefore: currentTechnicalRating,
    ratingAfter: p.rating,
    uncertaintyBefore,
    uncertaintyAfter: p.uncertainty,
    lpDelta,
    lp: p.lp,
    tier: p.tier,
    division: p.division,
    divisionRoman: p.divisionRoman,
    rank: { league: p.tier, division: p.division, divisionRoman: p.divisionRoman },
    promoEvent,
    matchId,
    bestOf: normalizeBestOf(bestOf),
    matchScore
  };

  next.history = [entry, ...(next.history ?? [])].slice(0, 100);

  // Memoria anti-repetición
  p.recentDeckIds = [deckId, ...(p.recentDeckIds ?? [])].slice(0, 5);
  p.recentOpponentNames = [opponentName, ...(p.recentOpponentNames ?? [])].slice(0, 10);
  p.lastOpponents = [botId, ...(p.lastOpponents ?? [])].slice(0, 5);

  return next;
}

/**
 * Selector de emparejamiento para Ranked (Fake Online). Genera oponentes
 * ajustados al rango/división del jugador con distribución de bots (Nexo 3/1) y anti-repetición.
 */
export function chooseRankedMatch(ladder, { isPromotion = false } = {}) {
  const p = ladder.player;
  const inPlacements = Boolean(p.placements?.active);
  const tier = inPlacements ? (p.placements.provisionalTier ?? "Bronce") : (p.tier ?? "Bronce");
  const division = inPlacements ? (p.placements.provisionalDivision ?? 5) : (p.division ?? 5);
  const promoActive = isPromotion || Boolean(p.promoSeries || (!inPlacements && p.lp >= 100 && division === 1));

  const opponent = generateRankedOpponent({
    tier,
    division,
    isPromotion: promoActive,
    recentDeckIds: p.recentDeckIds ?? [],
    recentOpponents: p.recentOpponentNames ?? []
  });

  return {
    id: opponent.botId,
    botId: opponent.botId,
    name: opponent.opponentName,
    title: opponent.opponentTitle,
    avatarId: opponent.avatarId,
    deckId: opponent.deckId,
    deckTier: opponent.deckTier,
    rating: opponent.opponentRating,
    technicalRating: opponent.opponentRating,
    difficulty: opponent.botId === NEXO3_BOT_ID ? "expert" : "normal",
    style: opponent.botId === NEXO3_BOT_ID ? "Nexo 3 (Especializado)" : "Nexo 1 (Estratégico)",
    opponentTier: opponent.opponentTier,
    opponentDivision: opponent.opponentDivision,
    opponentDivisionRoman: opponent.opponentDivisionRoman,
    sprite: opponent.sprite,
    archetype: opponent.archetype,
    isPromotion: opponent.isPromotion
  };
}

/**
 * Selector general de emparejamiento local. Si se solicita ranked=true o no hay bots
 * en el roster fijo, genera rival Fake Online. Si se llama como test/challenge sobre bots,
 * selecciona del roster de bots disponibles.
 */
export function chooseLocalMatch(ladder, { deckId = null, difficulty = "normal", ranked = false } = {}) {
  if (ranked || !ladder.bots?.length) {
    return chooseRankedMatch(ladder);
  }
  const p = ladder.player;
  const filtered = ladder.bots.filter((bot) => difficulty === "all" || bot.difficulty === difficulty || (difficulty === "normal" && bot.difficulty === "easy"));
  const candidates = filtered.length ? filtered : ladder.bots;
  if (!candidates.length) return chooseRankedMatch(ladder);
  const recent = new Set(p.lastOpponents ?? []);
  const matchScore = (bot) => Math.abs(bot.rating - p.rating) + (recent.has(bot.id) ? 180 : 0) + (deckId && bot.deckId === deckId ? 35 : 0);
  const sorted = [...candidates].sort((a, b) => matchScore(a) - matchScore(b) || String(a.id).localeCompare(b.id));
  const selected = sorted[0];
  p.lastOpponents = [selected.id, ...(p.lastOpponents ?? [])].slice(0, 5);
  return selected;
}

export function ladderView(ladder) {
  const p = ladder.player;
  const inPlacements = Boolean(p.placements?.active);
  const placements = p.placements ?? null;
  const rank = leagueForRating(p.technicalRating ?? p.rating ?? 1200);
  const tier = inPlacements ? "Unranked" : (p.tier ?? rank.league);
  const division = inPlacements ? (placements?.provisionalDivision ?? 5) : (p.division ?? rank.division ?? 5);
  const divisionRoman = inPlacements ? (placements?.provisionalDivisionRoman ?? "V") : (p.divisionRoman ?? DIVISION_ROMAN[division] ?? "V");
  const deckEntries = Object.entries(p.deckRatings ?? {}).map(([deckId, data]) => ({ deckId, ...data }));

  return {
    league: tier,
    tier,
    inPlacements,
    placements,
    provisionalTier: placements?.provisionalTier ?? "Bronce",
    provisionalDivision: placements?.provisionalDivision ?? 5,
    provisionalDivisionRoman: placements?.provisionalDivisionRoman ?? "V",
    division,
    divisionRoman,
    rankLabel: inPlacements ? `Unranked (${placements?.provisionalTier ?? "Bronce"} ${placements?.provisionalDivisionRoman ?? "V"} prov.)` : `${tier} ${divisionRoman}`,
    rating: p.rating,
    technicalRating: p.technicalRating ?? p.rating,
    uncertainty: p.uncertainty ?? 350,
    lp: inPlacements ? (placements?.gamesPlayed ?? 0) * 10 : (p.lp ?? 0),
    wins: p.wins ?? 0,
    losses: p.losses ?? 0,
    draws: p.draws ?? 0,
    streak: p.streak ?? 0,
    promoSeries: p.promoSeries ?? null,
    demotionShield: p.demotionShield ?? 1,
    rankedDeckId: p.rankedDeckId ?? "chaos-turbo",
    season: ladder.season,
    promotion: ladder.season.promotion ?? null,
    deckEntries,
    champions: championsLadder(ladder)
  };
}

/**
 * Registra el abandono o cierre del juego durante un duelo clasificatorio en curso.
 * Se penaliza inmediatamente como una derrota en la ladder con pérdida de LP / calibración.
 */
export function recordRankedAbandonment(ladder) {
  if (!ladder?.activeRankedMatch?.active) return null;
  const match = ladder.activeRankedMatch;
  const updatedLadder = applyLadderResult(ladder, {
    botId: match.botId,
    deckId: match.deckId ?? ladder.player?.rankedDeckId ?? "chaos-turbo",
    result: "loss",
    abandoned: true,
    mode: "ladder",
    opponentRating: match.opponentRating,
    opponentName: match.opponentName,
    opponentTier: match.opponentTier,
    opponentDivision: match.opponentDivision,
    matchScore: "Abandono"
  });
  const lastEntry = updatedLadder.history?.[0];
  updatedLadder.activeRankedMatch = null;
  updatedLadder.quitPenalty = {
    applied: true,
    timestamp: Date.now(),
    opponentName: match.opponentName,
    deckId: match.deckId ?? "chaos-turbo",
    lpDelta: lastEntry?.lpDelta ?? -20,
    lp: updatedLadder.player.lp,
    tier: updatedLadder.player.tier,
    divisionRoman: updatedLadder.player.divisionRoman,
    isPlacement: Boolean(ladder.player?.placements?.active)
  };
  return updatedLadder;
}


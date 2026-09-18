import { rankSpriteFile, renderRankBadge } from "./ranked-modal.js";
import { getRepresentativeCardForDeck, getDeckCardImagePath } from "../ranking/representative-cards.js";
import { DIVISION_ROMAN, getDeckTierNumber, getDeckTierLabel } from "../ranking/deck-tiers.js";
import { DECK_PRESETS } from "../decks/decks.js";

/**
 * Widget de perfil compacto para la cabecera del menú principal (Home).
 */
export function renderHomeDuelistWidget({ app, esc }) {
  const player = app.ladder?.player ?? {};
  const isPlacements = Boolean(player.placements?.active);
  const tier = isPlacements ? "Unranked" : (player.tier ?? "Bronce");
  const divisionRoman = isPlacements ? "" : (player.divisionRoman ?? "V");
  const name = player.name ?? "Duelista";
  const lp = isPlacements ? (player.placements?.gamesPlayed ?? 0) * 10 : (player.lp ?? 0);
  const sprite = rankSpriteFile(tier);
  const rankLabel = isPlacements
    ? `Calibrando (${player.placements?.gamesPlayed ?? 0}/10)`
    : `${tier} ${divisionRoman} · ${lp} LP`;

  return `<button type="button" class="home-duelist-widget" data-action="open-profile" aria-label="Ver perfil de ${esc(name)}">
    <div class="duelist-widget-scarab-frame">
      <img src="./sprites/${sprite}" alt="${esc(tier)}" class="duelist-widget-scarab" />
    </div>
    <div class="duelist-widget-copy">
      <strong class="duelist-widget-name">${esc(name)}</strong>
      <span class="duelist-widget-rank">${esc(rankLabel)}</span>
    </div>
    <span class="duelist-widget-arrow" aria-hidden="true">›</span>
  </button>`;
}

/**
 * Página completa del Perfil de Duelista.
 */
export function renderProfilePage({ app, esc, getCard, builderDeckById, playableDecks }) {
  const player = app.ladder?.player ?? {};
  const isPlacements = Boolean(player.placements?.active);
  const tier = isPlacements ? "Unranked" : (player.tier ?? "Bronce");
  const division = isPlacements ? null : (player.division ?? 5);
  const divisionRoman = isPlacements ? "" : (player.divisionRoman ?? (DIVISION_ROMAN[division] ?? "V"));
  const name = player.name ?? "Duelista";
  const lp = isPlacements ? (player.placements?.gamesPlayed ?? 0) * 10 : (player.lp ?? 0);
  const rankBadgeHtml = renderRankBadge(tier, division, "large", { esc });

  const signatureDeckId = player.rankedDeckId ?? "chaos-turbo";
  const signatureDeck = builderDeckById ? builderDeckById(signatureDeckId) : (playableDecks().find((d) => d.id === signatureDeckId) ?? playableDecks()[0]);
  const repCard = getRepresentativeCardForDeck(signatureDeck, getCard);
  const cardImg = getDeckCardImagePath(repCard);

  // Estadísticas globales Ranked
  const rankedGames = player.games ?? 0;
  const rankedWins = player.wins ?? 0;
  const rankedLosses = player.losses ?? 0;
  const rankedWinRate = rankedGames > 0 ? Math.round((rankedWins / rankedGames) * 100) : 0;
  const streak = player.streak ?? 0;
  const streakText = streak > 0 ? `+${streak} Victorias` : streak < 0 ? `${streak} Derrotas` : "Sin racha";

  // Estadísticas Casuales / Bots
  const botStats = (app.botRegistry?.bots ?? []).reduce((acc, bot) => {
    acc.games += Number(bot.games ?? 0);
    acc.wins += Number(bot.wins ?? 0);
    return acc;
  }, { games: 0, wins: 0 });

  // Desglose de mazos jugados del historial
  const history = app.ladder?.history ?? [];
  const deckUsageMap = new Map();
  for (const match of history) {
    const dId = match.deckId ?? signatureDeckId;
    const current = deckUsageMap.get(dId) ?? { id: dId, games: 0, wins: 0, losses: 0 };
    current.games += 1;
    if (match.result === "win") current.wins += 1;
    else if (match.result === "loss") current.losses += 1;
    deckUsageMap.set(dId, current);
  }
  const deckRatings = player.deckRatings ?? {};
  const playedDecks = [...deckUsageMap.values()]
    .map((item) => {
      const deckObj = builderDeckById ? builderDeckById(item.id) : (playableDecks().find((d) => d.id === item.id) ?? { name: item.id });
      const winRate = item.games > 0 ? Math.round((item.wins / item.games) * 100) : 0;
      const elo = deckRatings[item.id]?.rating ?? 1200;
      return { ...item, name: deckObj.name, winRate, elo };
    })
    .sort((a, b) => b.games - a.games);

  // Historial reciente de partidas (últimas 8)
  const recentMatches = history.slice(0, 8).map((entry) => {
    const isWin = entry.result === "win";
    const deltaText = entry.lpDelta !== undefined
      ? (entry.lpDelta >= 0 ? `+${entry.lpDelta} LP` : `${entry.lpDelta} LP`)
      : "";
    const outcomeLabel = entry.abandoned ? "Abandono" : isWin ? "Victoria" : entry.result === "loss" ? "Derrota" : "Empate";
    const outcomeClass = isWin ? "win" : entry.result === "loss" ? "loss" : "draw";
    const oppTierSprite = rankSpriteFile(entry.opponentTier ?? entry.tier ?? "Bronce");

    return `<div class="profile-match-row ${outcomeClass}">
      <div class="match-result-badge ${outcomeClass}">
        <strong>${outcomeLabel}</strong>
        ${deltaText ? `<small>${deltaText}</small>` : ""}
      </div>
      <div class="match-opponent-cell">
        <img src="./sprites/${oppTierSprite}" alt="" class="match-rank-icon" />
        <div>
          <span class="match-opp-name">vs ${esc(entry.opponentName ?? "Rival")}</span>
          <small class="match-opp-tier">${esc(entry.opponentTier ?? "Bronce")} ${esc(DIVISION_ROMAN[entry.opponentDivision] ?? "")}</small>
        </div>
      </div>
      <div class="match-decks-cell">
        <span class="match-my-deck">${esc(entry.deckId ?? signatureDeckId)}</span>
        <small class="match-vs-label">vs ${esc(entry.opponentDeckId ?? "Rival")}</small>
      </div>
      <div class="match-date-cell">
        <small>${entry.date ? new Date(entry.date).toLocaleDateString() : "Reciente"}</small>
      </div>
    </div>`;
  }).join("");

  // Modal edición de nombre si está abierto
  const nameEditModal = app.profileNameEditOpen ? renderNameEditModal({ app, esc, name }) : "";

  return `<section class="page profile-page" aria-labelledby="profile-title">
    <div class="profile-hero-card">
      <div class="profile-hero-backdrop" aria-hidden="true"></div>
      <img src="./sprites/Sprite_Ornamentacion9.png" class="profile-banner-crest" alt="" aria-hidden="true" />
      
      <div class="profile-identity">
        <div class="profile-rank-emblem-slot">
          ${rankBadgeHtml}
        </div>
        <div class="profile-titles">
          <div class="profile-name-row">
            <h1 id="profile-title" class="profile-name">${esc(name)}</h1>
            <button type="button" class="btn-profile-edit" data-action="open-profile-name-edit" aria-label="Cambiar nombre de duelista">✏️ Editar</button>
          </div>
          <span class="profile-rank-status">
            ${isPlacements ? `Unranked · Calibración (${player.placements?.gamesPlayed ?? 0}/10 partidas)` : `${tier} ${divisionRoman} · ${lp} LP`}
          </span>
          <div class="profile-chips">
            <span class="profile-chip">Racha: ${esc(streakText)}</span>
            <span class="profile-chip">${player.demotionShield > 0 ? "🛡️ Escudo de descenso" : "Sin escudo"}</span>
            <span class="profile-chip">MMR: ${Math.round(player.technicalRating ?? player.rating ?? 1200)}</span>
          </div>
        </div>
      </div>

      <div class="profile-signature-deck-card">
        <div class="sig-card-visual">
          <img src="${cardImg}" alt="${esc(repCard?.name ?? "Carta")}" class="sig-card-img" />
          <span class="sig-card-badge">CARTA INSIGNIA</span>
        </div>
        <div class="sig-deck-details">
          <small class="sig-label">MAZO PREDILECTO</small>
          <strong class="sig-deck-name">${esc(signatureDeck?.name ?? signatureDeckId)}</strong>
          <span class="sig-card-name">${esc(repCard?.name ?? "")}</span>
          <button type="button" class="btn-sig-change" data-action="open-ranked-deck-picker">Cambiar Mazo</button>
        </div>
      </div>
    </div>

    <div class="profile-content-grid">
      <div class="profile-panel profile-stats-panel">
        <div class="panel-header">
          <img src="./sprites/Sprite_Submenu5.png" alt="" class="panel-icon" aria-hidden="true" />
          <h2>Estadísticas Generales</h2>
        </div>
        <div class="stats-overview-grid">
          <div class="stat-box">
            <span class="stat-label">PARTIDAS RANKED</span>
            <strong class="stat-value">${rankedGames}</strong>
            <small class="stat-sub">${rankedWins}V - ${rankedLosses}D</small>
          </div>
          <div class="stat-box">
            <span class="stat-label">WIN RATE GLOBAL</span>
            <strong class="stat-value ${rankedWinRate >= 50 ? "positive" : ""}">${rankedWinRate}%</strong>
            <small class="stat-sub">En clasificatoria</small>
          </div>
          <div class="stat-box">
            <span class="stat-label">DUELOS CASUALES</span>
            <strong class="stat-value">${botStats.games}</strong>
            <small class="stat-sub">Contra Bots de Práctica</small>
          </div>
          <div class="stat-box">
            <span class="stat-label">CALIBRACIÓN</span>
            <strong class="stat-value">${isPlacements ? `${player.placements?.gamesPlayed ?? 0}/10` : "10/10"}</strong>
            <small class="stat-sub">${isPlacements ? "En progreso" : "Completada"}</small>
          </div>
        </div>

        <div class="panel-header sub-header">
          <h3>Rendimiento por Mazo</h3>
        </div>
        <div class="played-decks-list">
          ${playedDecks.length === 0 ? `<div class="empty-list-note">Aún no has disputado partidas con registro de mazo.</div>` : playedDecks.map((d) => `
            <div class="played-deck-item">
              <div class="played-deck-info">
                <strong>${esc(d.name)}</strong>
                <small>${d.games} ${d.games === 1 ? "partida" : "partidas"} · Rating: ${Math.round(d.elo)}</small>
              </div>
              <div class="played-deck-bar-wrap">
                <div class="played-deck-bar" style="width: ${d.winRate}%"></div>
              </div>
              <span class="played-deck-rate">${d.winRate}%</span>
            </div>`).join("")}
        </div>
      </div>

      <div class="profile-panel profile-history-panel">
        <div class="panel-header">
          <img src="./sprites/Sprite_Submenu6.png" alt="" class="panel-icon" aria-hidden="true" />
          <h2>Historial de Duelos</h2>
        </div>
        <div class="profile-matches-container">
          ${recentMatches || `<div class="empty-list-note">No hay duelos registrados en el historial de Ranked.</div>`}
        </div>
      </div>
    </div>

    ${nameEditModal}
  </section>`;
}

/**
 * Modal de Onboarding para jugadores primerizos.
 */
export function renderOnboardingModal({ app, esc, playableDecks, getCard }) {
  if (!app.onboardingOpen) return "";
  const presets = typeof playableDecks === "function" ? playableDecks() : (playableDecks ?? []);
  const currentDeckId = app.onboardingDeckId ?? "chaos-turbo";

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const d of presets) {
    const t = getDeckTierNumber(d.id);
    if (tierCounts[t] !== undefined) tierCounts[t]++;
  }

  const deckOptions = presets.map((deck) => {
    const isSelected = deck.id === currentDeckId;
    const tierNum = getDeckTierNumber(deck.id);
    const tierLabel = getDeckTierLabel(tierNum);
    const repCard = getRepresentativeCardForDeck(deck, getCard);
    const cardImg = getDeckCardImagePath(repCard);
    const repCardName = repCard?.name ?? "Insignia";

    return `<button type="button" 
      class="onboarding-deck-card ${isSelected ? "selected" : ""}" 
      data-action="onboarding-select-deck" 
      data-deck-id="${deck.id}"
      data-deck-name="${esc(deck.name.toLowerCase())}"
      data-rep-name="${esc(repCardName.toLowerCase())}"
      data-deck-tier="${tierNum}">
      <div class="onboarding-card-thumb-wrap">
        <img src="${cardImg}" alt="${esc(deck.name)}" class="onboarding-card-thumb" loading="lazy" />
        <span class="deck-tier-tag tier-${tierNum}">${esc(tierLabel)}</span>
      </div>
      <div class="onboarding-deck-text">
        <strong>${esc(deck.name)}</strong>
        <small>★ ${esc(repCardName)}</small>
        <span class="onboarding-deck-cards-count">${deck.main?.length ?? 40} cartas</span>
      </div>
      ${isSelected ? '<span class="onboarding-selected-pill">✓ ELEGIDO</span>' : ''}
    </button>`;
  }).join("");

  return `<div class="modal-backdrop onboarding-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div class="onboarding-modal-panel">
      <div class="onboarding-top-bar">
        <div class="onboarding-tablet-crest">
          <img src="./sprites/Sprite_Menu3.png" alt="" class="onboarding-crest-img" />
        </div>
        <div class="onboarding-header">
          <span class="eyebrow">BIENVENIDO A GOAT LOCAL LAB</span>
          <h2 id="onboarding-title">Inscripción del Duelista</h2>
          <p>Inscribe tu nombre en la sagrada Tabla de los Duelistas y escoge tu mazo predilecto para comenzar tu andadura.</p>
        </div>
      </div>

      <div class="onboarding-field">
        <label for="onboarding-name-input">Nombre o Alias del Duelista:</label>
        <input type="text" id="onboarding-name-input" maxlength="20" placeholder="Escribe tu nombre..." value="${esc(app.onboardingDraftName !== undefined ? app.onboardingDraftName : (app.ladder?.player?.name === "Duelista" ? "" : (app.ladder?.player?.name ?? "")))}" autocomplete="off" />
      </div>

      <div class="onboarding-field onboarding-decks-field">
        <div class="onboarding-decks-head">
          <label>Mazo Insignia Predilecto (${presets.length} disponibles):</label>
          <div class="onboarding-search-wrap">
            <input type="text" id="onboarding-deck-search" placeholder="Buscar mazo o carta insignia..." autocomplete="off" />
          </div>
        </div>
        <div class="onboarding-tier-tabs" role="tablist">
          <button type="button" class="onboarding-tier-tab active" data-onboarding-tier="all">Todos (${presets.length})</button>
          <button type="button" class="onboarding-tier-tab" data-onboarding-tier="1">Tier 1 (${tierCounts[1]})</button>
          <button type="button" class="onboarding-tier-tab" data-onboarding-tier="2">Tier 2 (${tierCounts[2]})</button>
          <button type="button" class="onboarding-tier-tab" data-onboarding-tier="3">Tier 3 (${tierCounts[3]})</button>
          <button type="button" class="onboarding-tier-tab" data-onboarding-tier="4">Tier 4 (${tierCounts[4]})</button>
        </div>
        <div class="onboarding-decks-grid" id="onboarding-deck-grid">
          ${deckOptions}
        </div>
      </div>

      <div class="onboarding-actions">
        <button type="button" class="btn-onboarding-submit" data-action="onboarding-confirm">
          Comenzar Aventura ➔
        </button>
      </div>
    </div>
  </div>`;
}

function renderNameEditModal({ app, esc, name }) {
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editar Nombre">
    <div class="profile-name-modal">
      <div class="modal-head">
        <h3>Editar Nombre de Duelista</h3>
        <button type="button" class="btn-close-modal" data-action="close-profile-modals">×</button>
      </div>
      <div class="modal-body">
        <input type="text" id="profile-name-input" maxlength="20" value="${esc(name)}" placeholder="Tu nombre..." />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-submit-name" data-action="profile-save-name">Guardar</button>
        <button type="button" class="btn-cancel-name" data-action="close-profile-modals">Cancelar</button>
      </div>
    </div>
  </div>`;
}

export function bindOnboardingEvents({ on }) {
  const searchInput = document.querySelector("#onboarding-deck-search");
  const cards = document.querySelectorAll(".onboarding-deck-card");
  const tabs = document.querySelectorAll(".onboarding-tier-tab");
  if (!searchInput && !tabs.length) return;

  let activeTier = "all";

  const filterCards = () => {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    cards.forEach((card) => {
      const name = card.dataset.deckName || "";
      const rep = card.dataset.repName || "";
      const tier = card.dataset.deckTier || "";

      const matchesSearch = !query || name.includes(query) || rep.includes(query);
      const matchesTier = activeTier === "all" || tier === activeTier;

      card.style.display = matchesSearch && matchesTier ? "" : "none";
    });
  };

  if (searchInput) {
    on(searchInput, "input", filterCards);
  }

  tabs.forEach((tab) => {
    on(tab, "click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTier = tab.dataset.onboardingTier || "all";
      filterCards();
    });
  });
}

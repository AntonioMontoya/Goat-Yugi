import { renderRankBadge } from "./ranked-modal.js";
import { DIVISION_ROMAN, getDeckTierNumber, getDeckTierLabel } from "../ranking/deck-tiers.js";
import { getRepresentativeCardForDeck, getDeckCardImagePath } from "../ranking/representative-cards.js";

export function renderPlayLobbyPage({
  app,
  builderDeckById,
  selectedBotSpec,
  describeDeckPlan,
  buildDeckKnowledge,
  deckSelectMarkup,
  botSelectMarkup,
  esc,
  NEXO2_ALL_DECK_IDS,
  NEXO2_ALL_OPPONENT_DECK_IDS,
  NEXO2_BOT_ID,
  NEXO_CANDIDATE_BOT_ID,
  getCard,
}) {
  const modes = [
    ["bot", "Contra una IA Nexo", "Compara la base estable y su parche candidato con el mismo mazo.", "BOT"],
    ["local", "1 contra 1 local", "Dos jugadores en la misma mesa.", "LOCAL"]
  ];
  if (app.playMode === "ranked") app.playMode = "bot";
  const selectedDeck = builderDeckById(app.playDeckId); const selectedBot = selectedBotSpec();
  const opponentDeck = builderDeckById(app.playOpponentDeckId);
  const opponentPlan = describeDeckPlan(buildDeckKnowledge(opponentDeck.id, opponentDeck));

  const currentTierNum = getDeckTierNumber(selectedDeck.id);
  const currentTierLabel = getDeckTierLabel(currentTierNum);
  const currentRepCard = getRepresentativeCardForDeck(selectedDeck, getCard);
  const currentDeckArt = getDeckCardImagePath(currentRepCard);

  const modeMarkup = modes.map(([id, title, copy, tag]) => {
    const selected = app.playMode === id;
    const state = selected ? "SELECCIONADO" : "ELEGIR";
    return `<button type="button" class="mode-card ${selected ? "selected" : ""}" data-play-mode="${id}" aria-pressed="${selected}"><span class="mode-icon">${tag}</span><strong>${title}</strong><p>${copy}</p><span class="mode-state">${state}</span></button>`;
  }).join("");
  const startTitle = app.playMode === "local" ? "Controla ambos jugadores" : "Entra en la mesa";
  const startCopy = app.playMode === "local" ? "Modo manual estilo EDOPRO: ambas manos se muestran y cada jugador responde a su propia prioridad." : "Las acciones de carta y los botones de fase aparecerán según la ventana legal del motor.";
  const startLabel = "Comenzar duelo";
  const pilotOnly = app.playMode === "bot" && app.playBotId === NEXO2_BOT_ID;

  const playerDeckCard = `
    <div class="side-card deck-pick casual-deck-showcase-panel">
      <div class="side-title"><span>MAZO JUGADOR 1</span><span class="tiny-label">${selectedDeck.main?.length ?? 40} CARTAS</span></div>
      <div class="hero-deck-showcase in-lobby">
        <div class="hero-deck-art-frame">
          <img class="hero-deck-thumb" src="${esc(currentDeckArt)}" alt="${esc(currentRepCard?.name ?? selectedDeck.name)}" loading="lazy" />
        </div>
        <div class="hero-deck-meta">
          <strong class="hero-deck-title" title="${esc(selectedDeck.name)}">${esc(selectedDeck.name)}</strong>
          <div class="hero-deck-badges">
            <span class="deck-tier-tag tier-${currentTierNum}">${esc(currentTierLabel)}</span>
            <span class="deck-cards-count">${selectedDeck.main?.length ?? 40} cartas</span>
          </div>
          <span class="hero-deck-meta-rep">★ ${esc(currentRepCard?.name ?? "Insignia")}</span>
          <select id="play-deck" aria-label="Seleccionar mazo del jugador uno">${deckSelectMarkup(app.playDeckId)}</select>
          <button type="button" class="ghost-button mini hero-deck-switch-btn" data-action="open-play-deck-picker">
            🔄 Cambiar mazo
          </button>
        </div>
      </div>
      <div class="deck-quick-links">
        <button type="button" class="text-button" data-action="open-decks">Editar mazos -&gt;</button>
      </div>
    </div>
  `;

  const opponentCard = app.playMode === "local"
    ? `<div class="side-card deck-pick"><div class="side-title"><span>MAZO JUGADOR 2</span><span class="tiny-label">MANUAL</span></div><select id="play-opponent-deck" aria-label="Seleccionar mazo del jugador dos">${deckSelectMarkup(app.playOpponentDeckId)}</select><p>En modo local ambos jugadores se controlan desde la misma mesa.</p><span class="readiness-mark">Preparado</span></div>`
    : `<div class="side-card deck-pick"><div class="side-title"><span>BOT RIVAL</span><span class="tiny-label">OPONENTE IA</span></div><select id="play-bot" aria-label="Seleccionar inteligencia rival">${botSelectMarkup(app.playBotId)}</select><select id="play-opponent-deck" aria-label="Seleccionar mazo rival">${deckSelectMarkup(app.playOpponentDeckId, { pilotOnly })}</select><span class="readiness-mark">${selectedBot.id === NEXO2_BOT_ID ? "Nexo 3" : "Nexo 1"}</span></div>`;

  return `<section class="page menu-page play-page"><div class="page-head"><div><span class="eyebrow">JUEGO CASUAL / DUELOS AMISTOSOS</span><h1>Juego Casual</h1><p>Enfréntate a la IA (Nexo 1 o Nexo 3) o disputa un duelo en la misma mesa sin presión competitiva.</p></div><div class="head-actions"><button class="ghost-button" data-action="open-sandbox">Modo Prueba (Escenarios) →</button><span class="resource-chip">OFFLINE</span><span class="resource-chip">OCGCORE GOAT</span></div></div><div class="mode-grid">${modeMarkup}</div><div class="play-config">${playerDeckCard}${opponentCard}<div class="side-card start-card"><span class="eyebrow">TODO LISTO</span><h2>${startTitle}</h2><p>${startCopy}</p><button class="primary-button wide" data-action="start-play">${app.playMode === "local" ? "Abrir mesa 1vs1" : startLabel}</button></div></div></section>`;
}

export function renderSettingsPage({ app }) {
  const settings = app.settings;
  return `<section class="page menu-page settings-page"><div class="page-head"><div><span class="eyebrow">SETTINGS / LOCAL PROFILE</span><h1>Ajustes</h1><p>Preferencias de interfaz guardadas en este navegador. No modifican las reglas del duelo.</p></div></div><div class="settings-grid"><div class="side-card"><div class="side-title"><span>INTERFAZ DE LA MESA</span><span class="tiny-label">LOCAL</span></div><label class="setting-row"><span><strong>Animaciones del duelo</strong><small>Completa, reducida o desactivada. También respeta la preferencia del sistema.</small></span><select data-motion-level aria-label="Nivel de animaciones"><option value="full" ${settings.motionLevel === "full" ? "selected" : ""}>Completa</option><option value="reduced" ${settings.motionLevel === "reduced" ? "selected" : ""}>Reducida</option><option value="off" ${settings.motionLevel === "off" ? "selected" : ""}>Desactivada</option></select></label><label class="setting-row"><span><strong>Confirmar acciones</strong><small>Muestra una confirmación antes de acciones irreversibles.</small></span><input type="checkbox" data-setting="confirmActions" ${settings.confirmActions ? "checked" : ""}/></label><label class="setting-row"><span><strong>Sonido del duelo</strong><small>Señales locales para fases, cadenas, FLIP, resolución y LP.</small></span><input type="checkbox" data-setting="sfxEnabled" ${settings.sfxEnabled ? "checked" : ""}/></label><label class="setting-row"><span><strong>Menús compactos</strong><small>Muestra más opciones con una jerarquía sencilla, como el menú principal.</small></span><input type="checkbox" data-setting="compactMenus" ${settings.compactMenus ? "checked" : ""}/></label><label class="setting-row"><span><strong>Controles táctiles</strong><small>Aumenta botones y separaciones para jugar con el dedo.</small></span><input type="checkbox" data-setting="touchControls" ${settings.touchControls ? "checked" : ""}/></label><label class="setting-row"><span><strong>Contraste alto</strong><small>Refuerza marcos, texto y selección activa.</small></span><input type="checkbox" data-setting="highContrast" ${settings.highContrast ? "checked" : ""}/></label><label class="setting-row"><span><strong>Texto grande</strong><small>Aumenta la lectura de menús sin cambiar el campo.</small></span><input type="checkbox" data-setting="largeText" ${settings.largeText ? "checked" : ""}/></label><label class="setting-row setting-volume"><span><strong>Volumen general</strong><small>Música y efectos · <output data-sfx-volume-output>${Math.round(settings.sfxVolume)} %</output> · se aplica al instante.</small></span><input type="range" min="0" max="100" step="1" value="${Math.round(settings.sfxVolume)}" data-sfx-volume aria-label="Volumen general"/></label></div><div class="side-card settings-guide"><span class="eyebrow">LECTURA RÁPIDA</span><h2>Una acción, un lugar</h2><p>Selecciona una carta legal y sus acciones aparecerán junto a ella; el inspector permanece abierto para poder leer el efecto.</p><button class="ghost-button" data-settings-reset>Restaurar preferencias</button></div></div></section>`;
}

export function renderLadderPage({ app, ladderView, chooseLocalMatch, getDeck, esc, playableDecks = () => [], getCard }) {
  const view = ladderView(app.ladder);
  const p = app.ladder.player;
  const allDecks = typeof playableDecks === "function" ? playableDecks() : [];
  const currentDeckId = app.ladder?.player?.rankedDeckId ?? app.duelDeckId ?? app.playDeckId ?? "chaos-turbo";
  const currentDeck = allDecks.find((d) => d.id === currentDeckId) ?? allDecks[0];
  const currentTierNum = getDeckTierNumber(currentDeckId);
  const currentTierLabel = getDeckTierLabel(currentTierNum);
  const currentRepCard = getRepresentativeCardForDeck(currentDeck, getCard);
  const currentDeckArt = getDeckCardImagePath(currentRepCard);
  const deckEntries = view.deckEntries ?? [];

  const totalGames = view.wins + view.losses + view.draws;
  const winRate = totalGames > 0 ? Math.round((view.wins / totalGames) * 100) : 0;
  const promo = view.promoSeries;

  // Banner de Serie de Promoción o Placements si está activo
  let promoHtml = "";
  if (view.inPlacements && view.placements) {
    const pl = view.placements;
    const gameMarkers = [];
    for (let i = 0; i < (pl.totalGames || 10); i++) {
      const g = pl.games?.[i];
      if (!g) gameMarkers.push(`<span class="promo-dot pending" title="Pendiente">⚪</span>`);
      else if (g.result === "win") gameMarkers.push(`<span class="promo-dot win" title="Victoria">✔</span>`);
      else gameMarkers.push(`<span class="promo-dot loss" title="Derrota">✘</span>`);
    }
    promoHtml = `
      <div class="promo-series-banner placement-series-banner">
        <div class="promo-header">
          <span class="eyebrow gold">🎯 PARTIDAS DE POSICIONAMIENTO</span>
          <h3>Fase de Calibración (${pl.gamesPlayed} / ${pl.totalGames || 10})</h3>
        </div>
        <div class="promo-tracker">
          <span class="promo-goal">Rango provisional: <strong>${esc(view.provisionalTier)} ${esc(view.provisionalDivisionRoman)}</strong> (${pl.wins}V - ${pl.losses}D)</span>
          <div class="promo-dots">${gameMarkers.join("")}</div>
        </div>
      </div>
    `;
  } else if (promo) {
    const gameMarkers = [];
    for (let i = 0; i < promo.targetWins + 1; i++) {
      const g = promo.games?.[i];
      if (!g) gameMarkers.push(`<span class="promo-dot pending" title="Pendiente">⚪</span>`);
      else if (g.result === "win") gameMarkers.push(`<span class="promo-dot win" title="Victoria">✔</span>`);
      else gameMarkers.push(`<span class="promo-dot loss" title="Derrota">✘</span>`);
    }
    promoHtml = `
      <div class="promo-series-banner">
        <div class="promo-header">
          <span class="eyebrow gold">⚔️ FASE DE PROMOCIÓN</span>
          <h3>Ascenso a ${esc(promo.toTier)} V</h3>
        </div>
        <div class="promo-tracker">
          <span class="promo-goal">Gana ${promo.targetWins} de ${promo.bestOf} duelos:</span>
          <div class="promo-dots">${gameMarkers.join("")}</div>
        </div>
      </div>
    `;
  }

  return `
    <section class="page ladder-page">
      <div class="page-head">
        <div>
          <span class="eyebrow">RANKED LADDER / ${esc(app.ladder.season.name)}</span>
          <h1>Ligas Clasificatorias</h1>
          <p>Compite en la ladder local estilo League of Legends con matchmaking Fake Online, Puntos de Liga (LP) y ascensos de rango.</p>
        </div>
        <div class="head-actions">
          <span class="resource-chip">${app.ladder.season.active ? "TEMPORADA ACTIVA" : "TEMPORADA ARCHIVADA"}</span>
          <button class="ghost-button" data-action="reset-ladder">Reiniciar temporada</button>
        </div>
      </div>

      <!-- Hero Banner del Rango con Mazo Seleccionado antes de Estadísticas -->
      <div class="ladder-hero ranked-league-hero tier-${esc(view.tier.toLowerCase())}">
        <div class="hero-rank-emblem">
          ${renderRankBadge(view.tier, view.division, "large", { esc })}
        </div>
        <div class="hero-rank-info">
          <span class="eyebrow">${view.inPlacements ? "CALIBRACIÓN DE RANGO" : "RANGO COMPETITIVO"}</span>
          <h2>${view.inPlacements ? "Unranked" : `${esc(view.tier)} ${esc(view.divisionRoman)}`}</h2>
          ${view.inPlacements ? `<div class="provisional-pill">Rango Provisional: <strong>${esc(view.provisionalTier)} ${esc(view.provisionalDivisionRoman)}</strong></div>` : ""}
          <div class="lp-track-wrap">
            <div class="lp-track">
              <span class="lp-fill" style="width:${view.inPlacements ? Math.round(((view.placements?.gamesPlayed ?? 0) / 10) * 100) : view.lp}%"></span>
            </div>
            <div class="lp-labels">
              <strong>${view.inPlacements ? `Partidas: ${view.placements?.gamesPlayed ?? 0} / 10` : `${view.lp} / 100 LP`}</strong>
              <small>Rating Técnico: ${view.technicalRating}</small>
            </div>
          </div>

          ${!view.inPlacements && p.demotionShield > 0 ? `<div class="demotion-shield-badge">🛡️ Protección de descenso activa</div>` : ""}
        </div>

        <!-- Mazo Seleccionado: Antes del panel de victorias/derrotas -->
        <div class="hero-deck-showcase">
          <div class="hero-deck-art-frame">
            <img class="hero-deck-thumb" src="${esc(currentDeckArt)}" alt="${esc(currentRepCard?.name ?? currentDeck?.name)}" loading="lazy" />
          </div>
          <div class="hero-deck-meta">
            <span class="eyebrow gold">TU MAZO CLASIFICATORIO</span>
            <strong class="hero-deck-title">${esc(currentDeck?.name ?? "Mazo")}</strong>
            <div class="hero-deck-badges">
              <span class="deck-tier-tag tier-${currentTierNum}">${esc(currentTierLabel)}</span>
              <span class="deck-cards-count">${currentDeck?.main?.length ?? 40} cartas</span>
            </div>
            <button type="button" class="ghost-button mini hero-deck-switch-btn" data-action="open-ranked-deck-picker">
              🔄 Cambiar mazo
            </button>
          </div>
        </div>

        <div class="hero-stats">
          <div class="stat-item">
            <span>PARTIDAS</span>
            <b>${totalGames}</b>
          </div>
          <div class="stat-item">
            <span>VICTORIAS</span>
            <b class="good-text">${view.wins}</b>
          </div>
          <div class="stat-item">
            <span>WINRATE</span>
            <b>${winRate}%</b>
          </div>
          <div class="stat-item">
            <span>RACHA</span>
            <b class="${view.streak > 0 ? "good-text" : view.streak < 0 ? "danger-text" : ""}">${view.streak > 0 ? `+${view.streak}` : view.streak}</b>
          </div>
        </div>
      </div>

      ${promoHtml}

      <!-- Centro: Gran botón ornamental para Buscar Partida -->
      <div class="ranked-center-matchmaking">
        <div class="ranked-cta-plate">
          <img src="./sprites/Sprite_Ornamentacion.png" class="ranked-plate-ornament left" alt="" aria-hidden="true" />
          <div class="ranked-cta-core">
            <button type="button" class="primary-button ranked-cta-huge" data-action="start-ranked-queue">
              <span class="huge-cta-icon">⚔️</span>
              <div class="huge-cta-text-col">
                <span class="huge-cta-title">BUSCAR PARTIDA</span>
                <span class="huge-cta-subtitle">MATCHMAKING COMPETITIVO RANKED</span>
              </div>
            </button>
            <div class="ranked-features-strip">
              <span class="ranked-feature-item">🤖 Bots de Rango Nexo 3 & Nexo 1</span>
              <span class="ranked-feature-item">🔀 Sistema Fake Online por Tiers</span>
              <span class="ranked-feature-item">🛡️ Detección Anti-Abandono</span>
            </div>
          </div>
          <img src="./sprites/Sprite_Ornamentacion.png" class="ranked-plate-ornament right" alt="" aria-hidden="true" />
        </div>
      </div>

      <!-- Grid de Estadísticas y Registros -->
      <div class="ladder-grid">
        <!-- Rating por Deck -->
        <div class="side-card history-card">
          <div class="side-title">
            <span>RENDIMIENTO POR MAZO</span>
            <span class="tiny-label">${deckEntries.length} MAZOS JUGADOS</span>
          </div>
          ${deckEntries.length ? deckEntries.map((entry) => {
            const deckName = getDeck ? getDeck(entry.deckId)?.name ?? entry.deckId : entry.deckId;
            const entryGames = entry.games || (entry.wins + entry.losses + entry.draws) || 1;
            const entryWr = Math.round((entry.wins / entryGames) * 100);
            return `
              <div class="history-line">
                <span class="history-result win">◆</span>
                <div>
                  <strong>${esc(deckName)}</strong>
                  <small>${entry.games} duelos · ${entry.wins}W / ${entry.losses}L (${entryWr}% WR)</small>
                </div>
                <span class="history-delta up">${entry.rating}</span>
              </div>
            `;
          }).join("") : `
            <div class="empty-state">
              <span class="empty-icon">◇</span>
              <strong>Sin partidas con mazos</strong>
              <p>Juega en la ladder para registrar estadísticas por mazo.</p>
            </div>
          `}
        </div>

        <!-- Historial de Duelos Ranked -->
        <div class="side-card history-card ladder-history-card">
          <div class="side-title">
            <span>HISTORIAL DE DUELOS</span>
            <span class="tiny-label">${app.ladder.history.length} REGISTROS</span>
          </div>
          ${app.ladder.history.length ? app.ladder.history.slice(0, 10).map((entry) => {
            const isWin = entry.result === "win";
            const isDraw = entry.result === "draw";
            const deckName = getDeck ? getDeck(entry.deckId)?.name ?? entry.deckId : entry.deckId;
            const lpString = entry.lpDelta !== undefined ? `${entry.lpDelta >= 0 ? "+" : ""}${entry.lpDelta} LP` : "";
            const oppRank = entry.opponentTier ? `${esc(entry.opponentTier)} ${DIVISION_ROMAN[entry.opponentDivision] ?? ""}` : "";
            return `
              <div class="history-line ranked-history-row">
                <span class="history-result ${entry.result}">${isWin ? "W" : isDraw ? "D" : "L"}</span>
                <div class="history-opponent-cell">
                  <strong>${esc(entry.opponentName ?? "Rival")} ${oppRank ? `<small class="opp-rank-tag">${oppRank}</small>` : ""} ${entry.abandoned ? `<small class="abandon-badge">ABANDONO</small>` : ""}</strong>
                  <small>${esc(deckName)} · ${new Date(entry.date).toLocaleDateString("es-ES")}</small>
                </div>
                <span class="history-delta ${isWin ? "up" : isDraw ? "" : "down"}">${lpString}</span>
              </div>
            `;
          }).join("") : `
            <div class="empty-state">
              <strong>Sin partidas puntuadas</strong>
              <p>Inicia una partida competitiva para comenzar tu escalada.</p>
            </div>
          `}
        </div>
      </div>
    </section>
  `;
}

export function renderResearchPage({ CARDS, OCGCORE_CARD_ENTRIES, OCGCORE_MISSING_SCRIPTS, OCGCORE_ASSET_SOURCE, CARD_DATABASE_VERSION }) {
  const supported = OCGCORE_CARD_ENTRIES.length - OCGCORE_MISSING_SCRIPTS.length;
  return `<section class="page research-page"><div class="page-head"><div><span class="eyebrow">FORMAT SPEC / CATALOG</span><h1>Catálogo GoatFormat</h1><p>Fuente completa cargada; la cobertura de reglas se mantiene separada y visible.</p></div><div class="head-actions"><span class="resource-chip">${CARDS.length} CARTAS</span><span class="resource-chip">${OCGCORE_CARD_ENTRIES.length} RUNTIME READY</span></div></div><div class="research-grid"><div class="research-intro"><div class="scope-card"><span class="eyebrow">FUENTE VERSIONADA</span><h2>CSV trazable</h2><p>El catálogo usa el CSV pegado en el proyecto. Cada fila conserva su ID estable, texto, procedencia, legalidad, familia de efecto y estado de validación. Las prohibidas publicadas aparte quedan separadas.</p><div class="source-links"><a href="https://www.goatformat.com/home/category/card-pool" target="_blank" rel="noreferrer">GoatFormat Card Pool ↗</a><a href="https://www.goatformat.com/basics.html" target="_blank" rel="noreferrer">Basic Mechanics ↗</a></div></div><div class="coverage-card"><div class="coverage-head"><span>OCGCORE RUNTIME READY</span><strong>${OCGCORE_CARD_ENTRIES.length}/${OCGCORE_CARD_ENTRIES.length}</strong></div><div class="coverage-bar"><span style="width:100%"></span></div><div class="coverage-legend"><span><i class="legend-dot green"></i>${supported} scripts cargados</span><span><i class="legend-dot amber"></i>${OCGCORE_MISSING_SCRIPTS.length} normales vía CDB</span></div><p>Las ${OCGCORE_CARD_ENTRIES.length} cartas tienen passcode/runtime asignado; ${supported} usan script y las ${OCGCORE_MISSING_SCRIPTS.length} normales se resuelven con la CDB y las reglas generales del core.</p></div></div><div class="research-list"><div class="side-card"><div class="side-title"><span>CONTRATOS</span><span class="tiny-label">LOCAL</span></div><div class="contract-line"><span class="contract-icon confirmed">✓</span><div><strong>Catálogo completo de la fuente</strong><small>${CARDS.length} registros únicos y hash de origen guardado.</small></div><span class="contract-state">CONFIRMED</span></div><div class="contract-line"><span class="contract-icon confirmed">✓</span><div><strong>Banlist April 2005</strong><small>El constructor resuelve límites por ID estable.</small></div><span class="contract-state">CONFIRMED</span></div><div class="contract-line"><span class="contract-icon confirmed">✓</span><div><strong>Backend OCGCore</strong><small>La mesa visual y el modo headless usan MODE_GOAT y la misma fuente técnica.</small></div><span class="contract-state">CONFIRMED</span></div><div class="contract-line"><span class="contract-icon partial">~</span><div><strong>Rulings y Damage Step</strong><small>La base del core está activa; los casos históricos deben conservar escenarios de regresión.</small></div><span class="contract-state">PARTIAL</span></div></div><div class="side-card data-map"><div class="side-title"><span>DATOS Y VERSIONES</span><span class="tiny-label">LOCAL</span></div><div class="data-row"><span>Engine</span><b>OCGCore ${OCGCORE_ASSET_SOURCE.scriptRepositoryRevision.slice(0, 8)}</b></div><div class="data-row"><span>Format</span><b>goat-tcg-apr-2005-v0.1</b></div><div class="data-row"><span>Card DB</span><b>${CARD_DATABASE_VERSION}</b></div><div class="data-row"><span>Replay</span><b>DLP1 / varint</b></div><div class="data-row"><span>Persistencia</span><b>runs / checkpoints / chunks</b></div></div></div></div></section>`;
}

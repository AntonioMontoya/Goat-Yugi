import { DIVISION_ROMAN, getDeckTierNumber, getDeckTierLabel } from "../ranking/deck-tiers.js";
import { getRepresentativeCardForDeck, getDeckCardImagePath } from "../ranking/representative-cards.js";

/**
 * Retorna el nombre de archivo PNG del sprite para cada rango competitivo.
 */
export function rankSpriteFile(tier) {
  const norm = String(tier ?? "").trim().toLowerCase();
  if (norm === "bronce") return "Bronce.png";
  if (norm === "oro") return "Oro.png";
  if (norm === "esmeralda" || norm === "esperalda") return "Esmeralda.png";
  if (norm === "diamante") return "Diamante.png";
  return "Unranked.png";
}

/**
 * Renderiza el emblema del rango usando los sprites de escarabajo egipcio (Unranked, Bronce, Oro, Esmeralda, Diamante).
 */
export function renderRankBadge(tier = "Bronce", division = 5, size = "large", { esc = (s) => s } = {}) {
  const normTier = String(tier).trim().toLowerCase();
  const roman = DIVISION_ROMAN[division] ?? "V";
  const sprite = rankSpriteFile(normTier);
  const isUnranked = normTier === "unranked";

  let colorPrimary = "#cd7f32";
  let glowColor = "rgba(205, 127, 50, 0.4)";

  if (normTier === "oro") {
    colorPrimary = "#ffd700";
    glowColor = "rgba(255, 215, 0, 0.5)";
  } else if (normTier === "esmeralda" || normTier === "esperalda") {
    colorPrimary = "#50c878";
    glowColor = "rgba(80, 200, 120, 0.5)";
  } else if (normTier === "diamante") {
    colorPrimary = "#00e5ff";
    glowColor = "rgba(0, 229, 255, 0.6)";
  } else if (isUnranked) {
    colorPrimary = "#8a9ba8";
    glowColor = "rgba(138, 155, 168, 0.4)";
  }

  const dim = size === "large" ? 104 : size === "medium" ? 64 : 40;

  return `
    <div class="rank-emblem-wrap size-${size} rank-emblem-${esc(normTier)}" style="--rank-color:${colorPrimary}; --rank-glow:${glowColor}; width:${dim}px; height:${dim}px;">
      <img class="rank-emblem-sprite ${isUnranked ? "unranked-sprite" : `tier-sprite-${esc(normTier)}`}" src="./sprites/${esc(sprite)}" alt="${esc(tier)} ${esc(roman)}" style="width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 4px 14px ${glowColor});" />
    </div>
  `;
}

/**
 * Modal y overlays de Matchmaking Fake Online:
 * - Penalización de Anti-Quit
 * - Selección de Mazo Clasificatorio (Deck Picker con cartas representativas)
 * - Buscando partida (Radar + Cronómetro)
 * - ¡Partida encontrada! (Aceptación)
 * - Pantalla Versus (Cara a Cara)
 * - Pantalla de Resultados de Ranked (LP ganados/perdidos)
 */
export function renderRankedOverlays({ app, esc, builderDeckById, playableDecks, getCard }) {
  if (app.rankedSurrenderConfirmation && app.rankedSurrenderConfirmation.open) {
    return renderRankedSurrenderModal({ app, esc });
  }

  if (app.quitPenaltyModal && app.quitPenaltyModal.open) {
    return renderAntiQuitPenaltyModal({ modal: app.quitPenaltyModal, esc });
  }

  if (app.rankedDeckPicker && app.rankedDeckPicker.open) {
    return renderRankedDeckPickerModal({ app, esc, playableDecks, getCard });
  }

  const q = app.rankedQueue;
  const resultModal = app.rankedResultModal;

  if (resultModal && resultModal.open) {
    return renderRankedResultModal({ modal: resultModal, esc });
  }

  if (!q || q.state === "idle") return "";

  if (q.state === "searching") {
    const elapsedSec = Math.floor((Date.now() - (q.startTime || Date.now())) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    const estSec = q.estimatedTime || 12;
    const estMm = String(Math.floor(estSec / 60)).padStart(2, "0");
    const estSs = String(estSec % 60).padStart(2, "0");

    return `
      <div class="ranked-modal-backdrop" id="ranked-queue-backdrop">
        <div class="ranked-queue-card">
          <div class="queue-radar-box">
            <div class="radar-sweep"></div>
            <div class="radar-ping"></div>
            <div class="radar-core">⚔️</div>
          </div>
          <div class="queue-title-box">
            <span class="eyebrow">MATCHMAKING COMPETITIVO</span>
            <h3>Buscando oponente...</h3>
            <p>Buscando un duelista en tu rango (${esc(app.ladder?.player?.tier ?? "Bronce")} ${DIVISION_ROMAN[app.ladder?.player?.division ?? 5] ?? "V"})</p>
          </div>
          <div class="queue-timer-box">
            <div class="timer-display">
              <span>TIEMPO</span>
              <strong>${mm}:${ss}</strong>
            </div>
            <div class="timer-separator">/</div>
            <div class="timer-display estimated">
              <span>ESTIMADO</span>
              <strong>${estMm}:${estSs}</strong>
            </div>
          </div>
          <button type="button" class="ghost-button wide cancel-queue-btn" data-action="cancel-ranked-queue">
            Cancelar búsqueda
          </button>
        </div>
      </div>
    `;
  }

  if (q.state === "found") {
    const timeLeft = Math.max(0, Math.ceil((q.acceptDeadline - Date.now()) / 1000));
    const percentLeft = Math.max(0, Math.min(100, (timeLeft / 10) * 100));

    return `
      <div class="ranked-modal-backdrop flash-in" id="ranked-found-backdrop">
        <div class="ranked-match-found-card">
          <div class="found-badge-icon">⚡</div>
          <span class="eyebrow gold">¡PARTIDA ENCONTRADA!</span>
          <h2>Duelo Clasificatorio</h2>
          <p>Se ha emparejado un contendiente para tu ascenso.</p>
          
          <div class="accept-progress-track">
            <div class="accept-progress-bar" style="width:${percentLeft}%"></div>
          </div>
          
          <div class="found-actions">
            <button type="button" class="primary-button match-accept-btn" data-action="accept-ranked-match">
              <span>⚔️ ¡ACEPTAR DUELO! (${timeLeft}s)</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (q.state === "versus") {
    const opp = q.opponent;
    const playerTier = app.ladder?.player?.tier ?? "Bronce";
    const playerDiv = app.ladder?.player?.division ?? 5;
    const playerDeck = typeof builderDeckById === "function" ? builderDeckById(app.duelDeckId) : (app.builderDeckById ? app.builderDeckById(app.duelDeckId) : { name: "Mazo Principal" });

    return `
      <div class="ranked-modal-backdrop fade-in" id="ranked-versus-backdrop">
        <div class="ranked-versus-screen">
          <div class="versus-head">
            <span class="eyebrow">LADDER RANKED</span>
            <h2>ENFRENTAMIENTO DECISIVO</h2>
          </div>

          <div class="versus-stage">
            <!-- Jugador -->
            <div class="versus-card player-side">
              <div class="card-avatar-box">
                <div class="avatar-ring">${renderRankBadge(playerTier, playerDiv, "medium", { esc })}</div>
              </div>
              <div class="card-info">
                <span class="card-badge">TÚ</span>
                <h3>${esc(app.ladder?.player?.name ?? "Duelista")}</h3>
                <span class="card-rank">${esc(playerTier)} ${DIVISION_ROMAN[playerDiv] ?? "V"}</span>
                <small class="card-deck">${esc(playerDeck.name)}</small>
              </div>
            </div>

            <!-- Centro VS -->
            <div class="versus-center">
              <div class="vs-emblem">VS</div>
              <span class="vs-sub">AL MEJOR DE 1</span>
            </div>

            <!-- Rival Fake Online -->
            <div class="versus-card opponent-side">
              <div class="card-avatar-box enemy-lord-box">
                <img class="versus-enemy-lord-img" src="./sprites/${esc(opp.sprite ?? "EnemyLord.png")}" alt="${esc(opp.name)}" />
                <div class="avatar-ring-overlay">${renderRankBadge(opp.opponentTier, opp.opponentDivision, "small", { esc })}</div>
              </div>
              <div class="card-info">
                <span class="card-badge opponent">RIVAL ONLINE</span>
                <h3>${esc(opp.name)}</h3>
                <span class="card-rank">${esc(opp.opponentTier)} ${opp.opponentDivisionRoman}</span>
                <small class="card-title">${esc(opp.title)}</small>
                <span class="engine-tag">${esc(opp.style)}</span>
              </div>
            </div>
          </div>

          <div class="versus-footer">
            <button type="button" class="primary-button enter-duel-btn" data-action="enter-ranked-duel">
              ¡INICIAR DUELO AHORA! ➔
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return "";
}

/**
 * Modal de resultado tras finalizar un duelo de Ranked.
 */
export function renderRankedResultModal({ modal, esc }) {
  const isWin = modal.result === "win";
  const lpDelta = modal.lpDelta || 0;
  const newLp = modal.lp || 0;
  const tier = modal.tier || "Bronce";
  const divRoman = modal.divisionRoman || "V";
  const promoEvent = modal.promoEvent;

  let highlightMessage = "";
  if (promoEvent?.type === "placements-completed") {
    highlightMessage = `<div class="event-banner promo-win">🎉 ¡POSICIONAMIENTO COMPLETADO! (${promoEvent.wins}V - ${promoEvent.losses}D) 🎉<br><small>Has sido clasificado en <strong>${esc(promoEvent.tier)} ${esc(promoEvent.divisionRoman)}</strong> con 50 LP y escudo de protección.</small></div>`;
  } else if (promoEvent?.type === "placement-game") {
    highlightMessage = `<div class="event-banner promo-unlock">🎯 PARTIDA DE POSICIONAMIENTO ${promoEvent.gameNumber} DE ${promoEvent.totalGames}<br><small>Rango Provisional: <strong>${esc(promoEvent.provisionalTier)} ${esc(promoEvent.provisionalDivisionRoman)}</strong> (${promoEvent.wins} Victorias - ${promoEvent.losses} Derrotas)</small></div>`;
  } else if (promoEvent?.type === "promoted-tier") {
    highlightMessage = `<div class="event-banner promo-win">🎉 ¡ENHORABUENA! HAS ASCENDIDO A ${esc(promoEvent.to.toUpperCase())} V 🎉</div>`;
  } else if (promoEvent?.type === "division-up") {
    highlightMessage = `<div class="event-banner div-win">⬆️ ¡ASCENSO A ${esc(tier.toUpperCase())} ${esc(divRoman)}!</div>`;
  } else if (promoEvent?.type === "promo-unlocked") {
    highlightMessage = `<div class="event-banner promo-unlock">⚔️ ¡FASE DE PROMOCIÓN DESBLOQUEADA! Gana 2 de 3 duelos para ascender a ${esc(promoEvent.to)}.</div>`;
  } else if (promoEvent?.type === "failed-promo") {
    highlightMessage = `<div class="event-banner promo-fail">❌ Promoción no conseguida. Te mantienes en ${esc(tier)} con 75 LP.</div>`;
  } else if (promoEvent?.type === "demotion-warning") {
    highlightMessage = `<div class="event-banner shield-break">🛡️ ¡Escudo de descenso consumido! Una derrota más a 0 LP provocará un descenso.</div>`;
  } else if (promoEvent?.type === "division-down" || promoEvent?.type === "tier-demoted") {
    highlightMessage = `<div class="event-banner div-down">⬇️ Has descendido a ${esc(tier)} ${esc(divRoman)}.</div>`;
  }

  const isPlacementGame = promoEvent?.type === "placement-game";
  const displayTier = isPlacementGame ? promoEvent.provisionalTier : tier;
  const displayDivRoman = isPlacementGame ? promoEvent.provisionalDivisionRoman : divRoman;
  const displayDivision = isPlacementGame ? promoEvent.provisionalDivision : (modal.division || 5);

  return `
    <div class="ranked-modal-backdrop flash-in" id="ranked-result-backdrop">
      <div class="ranked-result-card ${isWin ? "is-win" : "is-loss"}">
        <div class="result-banner-header">
          <span class="result-label">${isWin ? "VICTORIA" : "DERROTA"}</span>
          <div class="result-badge-display">
            ${renderRankBadge(displayTier, displayDivision, "large", { esc })}
          </div>
          <h2>${esc(displayTier)} ${esc(displayDivRoman)}${isPlacementGame ? " <small style='font-size:0.5em; opacity:0.8;'>(Provisional)</small>" : ""}</h2>
        </div>

        ${highlightMessage}

        ${isPlacementGame ? `
          <div class="lp-delta-box">
            <span class="lp-tag">${promoEvent.wins}V - ${promoEvent.losses}D</span>
            <div class="lp-bar-container">
              <div class="lp-bar-fill" style="width:${promoEvent.gameNumber * 10}%"></div>
            </div>
            <span class="lp-total-count">Partida ${promoEvent.gameNumber} / 10 completada</span>
          </div>
        ` : `
          <div class="lp-delta-box">
            <span class="lp-tag">${isWin ? "+" : ""}${lpDelta} LP</span>
            <div class="lp-bar-container">
              <div class="lp-bar-fill" style="width:${newLp}%"></div>
            </div>
            <span class="lp-total-count">${newLp} / 100 LP</span>
          </div>
        `}

        <div class="result-card-actions">
          <button type="button" class="primary-button wide" data-action="close-ranked-result">
            Continuar
          </button>
        </div>
      </div>
    </div>
  `;
}

export function clearRankedQueueTimers(app) {
  if (app.rankedQueue?.searchTimer) clearTimeout(app.rankedQueue.searchTimer);
  if (app.rankedQueue?.countdownTimer) clearTimeout(app.rankedQueue.countdownTimer);
  if (app.rankedQueue?.clockTimer) clearInterval(app.rankedQueue.clockTimer);
  if (app.rankedQueue) {
    app.rankedQueue.searchTimer = null;
    app.rankedQueue.countdownTimer = null;
    app.rankedQueue.clockTimer = null;
  }
}

export function startRankedQueue({ app, chooseRankedMatch, render, onMatchFound = null }) {
  clearRankedQueueTimers(app);
  const playerDeckId = app.ladder?.player?.rankedDeckId ?? app.duelDeckId ?? app.playDeckId ?? "chaos-turbo";
  app.duelDeckId = playerDeckId;
  app.playDeckId = playerDeckId;

  const estimatedSec = Math.floor(Math.random() * 5) + 12;
  const searchDurationSec = Math.floor(Math.random() * 3) + 3;
  const searchDurationMs = searchDurationSec * 1000;

  app.rankedQueue = {
    state: "searching",
    startTime: Date.now(),
    estimatedTime: estimatedSec,
    opponent: null,
    acceptDeadline: null,
    searchTimer: null,
    countdownTimer: null,
    clockTimer: null,
  };

  app.rankedQueue.clockTimer = setInterval(() => {
    if (app.rankedQueue?.state === "searching" || app.rankedQueue?.state === "found") {
      render();
    }
  }, 1000);

  app.rankedQueue.searchTimer = setTimeout(() => {
    if (app.rankedQueue?.state !== "searching") return;

    const opponent = chooseRankedMatch(app.ladder);
    app.rankedQueue.state = "found";
    app.rankedQueue.opponent = opponent;
    app.rankedQueue.acceptDeadline = Date.now() + 10000;
    onMatchFound?.(opponent);

    app.rankedQueue.countdownTimer = setTimeout(() => {
      if (app.rankedQueue?.state === "found") {
        cancelRankedQueue({ app, render });
        app.toast = "Tiempo agotado para aceptar el duelo clasificatorio.";
        render();
      }
    }, 10000);

    render();
  }, searchDurationMs);

  render();
}

export function cancelRankedQueue({ app, render }) {
  clearRankedQueueTimers(app);
  app.rankedQueue = {
    state: "idle",
    startTime: null,
    estimatedTime: 12,
    opponent: null,
    acceptDeadline: null,
  };
  render();
}

export function acceptRankedMatch({ app, render }) {
  if (app.rankedQueue?.state !== "found") return;
  if (app.rankedQueue?.countdownTimer) clearTimeout(app.rankedQueue.countdownTimer);
  app.rankedQueue.countdownTimer = null;
  app.rankedQueue.state = "versus";
  render();
}

export function enterRankedDuel({ app, startDuel, navigate }) {
  const opp = app.rankedQueue?.opponent;
  clearRankedQueueTimers(app);
  app.rankedQueue = {
    state: "idle",
    startTime: null,
    estimatedTime: 12,
    opponent: null,
    acceptDeadline: null,
  };
  if (!opp) return;

  const playerDeckId = app.ladder?.player?.rankedDeckId ?? app.duelDeckId ?? app.playDeckId ?? "chaos-turbo";
  app.duelDeckId = playerDeckId;
  app.playDeckId = playerDeckId;

  // Registrar duelo activo para el sistema Anti-Quit
  if (app.ladder) {
    app.ladder.activeRankedMatch = {
      active: true,
      botId: opp.botId,
      opponentName: opp.name,
      opponentTier: opp.opponentTier,
      opponentDivision: opp.opponentDivision,
      opponentRating: opp.rating,
      mode: "ladder",
      deckId: playerDeckId,
      startTime: Date.now(),
      opponentSprite: opp.sprite ?? "EnemyLord.png",
      isPromotion: Boolean(opp.isPromotion),
    };
  }

  startDuel({
    deckId: playerDeckId,
    opponentDeckId: opp.deckId,
    ladder: {
      botId: opp.botId,
      opponentRating: opp.rating,
      opponentName: opp.name,
      opponentTier: opp.opponentTier,
      opponentDivision: opp.opponentDivision,
      mode: "ladder",
      isRankedMatch: true,
      opponentSprite: opp.sprite ?? "EnemyLord.png",
      isPromotion: Boolean(opp.isPromotion),
    },
    fresh: true,
  });

  app.toast = `Duelo Clasificatorio vs ${opp.name} (${opp.opponentTier} ${opp.opponentDivisionRoman}).`;
  navigate("duel");
}

export function renderAntiQuitPenaltyModal({ modal, esc }) {
  const penalty = modal?.penalty ?? modal ?? {};
  const isPlacement = Boolean(penalty.isPlacement);
  const oppName = penalty.opponentName ?? "Rival";
  const lpDelta = penalty.lpDelta ?? -20;
  const lpText = isPlacement ? "Calibración contada como Derrota" : `${lpDelta} LP`;
  const currentRank = penalty.tier ? `${esc(penalty.tier)} ${esc(penalty.divisionRoman ?? "")} (${penalty.lp ?? 0} LP)` : "";

  return `
    <div class="ranked-modal-backdrop" id="ranked-penalty-backdrop">
      <div class="ranked-modal-card anti-quit-modal-card">
        <div class="anti-quit-header">
          <div class="anti-quit-icon">⚠️</div>
          <span class="eyebrow danger">ABANDONO DE PARTIDA DETECTADO</span>
          <h3>Penalización por Desconexión</h3>
        </div>
        <div class="anti-quit-body">
          <p>Has salido del juego durante un duelo clasificatorio en curso contra <strong>${esc(oppName)}</strong>.</p>
          <div class="anti-quit-notice-box">
            <p>De acuerdo con las reglas de la temporada competitiva, cerrar la aplicación o abandonar un duelo puntuable se penaliza de inmediato como una <strong>DERROTA</strong>.</p>
          </div>
          <div class="anti-quit-stats-grid">
            <div class="anti-quit-stat">
              <span>SANCIÓN DE CLASIFICACIÓN</span>
              <strong class="danger-text">${esc(lpText)}</strong>
            </div>
            ${currentRank ? `
            <div class="anti-quit-stat">
              <span>ESTADO ACTUAL</span>
              <strong>${currentRank}</strong>
            </div>` : ""}
          </div>
        </div>
        <div class="anti-quit-footer">
          <button type="button" class="primary-button wide" data-action="dismiss-quit-penalty">
            Entendido
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderRankedSurrenderModal({ app, esc }) {
  const match = app.ladder?.activeRankedMatch ?? {};
  const oppName = match.opponentName ?? "Rival";
  const isPlacement = Boolean(app.ladder?.player?.placements?.active);
  const currentRank = app.ladder?.player?.tier
    ? `${esc(app.ladder.player.tier)} ${esc(app.ladder.player.divisionRoman ?? "")} (${app.ladder.player.lp ?? 0} LP)`
    : "";
  const penaltyNotice = isPlacement
    ? "Se contará como una derrota en tus partidas de calibración."
    : "Perderás puntos de clasificación (~20 LP) de forma inmediata.";

  return `
    <div class="ranked-modal-backdrop" id="ranked-surrender-backdrop">
      <div class="ranked-modal-card anti-quit-modal-card">
        <div class="anti-quit-header">
          <div class="anti-quit-icon">⚠️</div>
          <span class="eyebrow danger">CONFIRMAR ABANDONO · RANKED</span>
          <h3>¿Abandonar el duelo?</h3>
        </div>
        <div class="anti-quit-body">
          <p>Estás en medio de una partida clasificatoria contra <strong>${esc(oppName)}</strong>.</p>
          <div class="anti-quit-notice-box">
            <p>Si sales al menú o reinicias el duelo, se considerará una <strong>DERROTA INMEDIATA</strong> por abandono y <strong>perderás puntos de clasificación (LP)</strong>.<br>${esc(penaltyNotice)}</p>
          </div>
          ${currentRank ? `
          <div class="anti-quit-stats-grid" style="grid-template-columns: 1fr; margin-bottom: 16px;">
            <div class="anti-quit-stat">
              <span>TU RANGO ACTUAL</span>
              <strong>${currentRank}</strong>
            </div>
          </div>` : ""}
        </div>
        <div class="anti-quit-footer">
          <button type="button" class="ghost-button" data-action="cancel-ranked-surrender">
            Continuar jugando
          </button>
          <button type="button" class="primary-button btn-surrender-confirm" data-action="confirm-ranked-surrender">
            Aceptar y abandonar (-LP)
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderRankedDeckPickerModal({ app, esc, playableDecks, getCard }) {
  const isCasual = app.deckPickerContext === "play";
  const currentDeckId = isCasual
    ? (app.playDeckId ?? app.duelDeckId ?? "chaos-turbo")
    : (app.ladder?.player?.rankedDeckId ?? app.duelDeckId ?? "chaos-turbo");
  const allDecks = typeof playableDecks === "function" ? playableDecks() : (playableDecks ?? []);

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const d of allDecks) {
    const t = getDeckTierNumber(d.id);
    if (tierCounts[t] !== undefined) tierCounts[t]++;
  }

  const deckCardsHtml = allDecks.map((deck) => {
    const isCurrent = deck.id === currentDeckId;
    const tierNum = getDeckTierNumber(deck.id);
    const tierLabel = getDeckTierLabel(tierNum);
    const repCard = getRepresentativeCardForDeck(deck, getCard);
    const cardArt = getDeckCardImagePath(repCard);
    const repCardName = repCard?.name ?? "Insignia";

    return `
      <div class="deck-picker-card ${isCurrent ? "selected-deck-card" : ""}" 
           ${isCurrent ? "" : `data-action="select-ranked-deck" data-deck-id="${esc(deck.id)}"`}
           data-deck-item-id="${esc(deck.id)}" 
           data-deck-name="${esc(deck.name.toLowerCase())}" 
           data-rep-name="${esc(repCardName.toLowerCase())}"
           data-deck-tier="${tierNum}"
           tabindex="${isCurrent ? "-1" : "0"}"
           role="button"
           title="${isCurrent ? "Mazo actualmente seleccionado" : `Seleccionar ${esc(deck.name)}`}">
        <div class="deck-picker-art-wrap">
          <img class="deck-picker-card-art" src="${esc(cardArt)}" alt="${esc(repCardName)}" loading="lazy" />
          <span class="deck-picker-tier-badge tier-${tierNum}">${esc(tierLabel)}</span>
        </div>
        <div class="deck-picker-card-info">
          <strong class="deck-picker-name" title="${esc(deck.name)}">${esc(deck.name)}</strong>
          <span class="deck-picker-rep-card">★ ${esc(repCardName)}</span>
          <span class="deck-picker-count">${deck.main?.length ?? 40} cartas</span>
        </div>
        <div class="deck-picker-card-action">
          ${isCurrent 
            ? '<span class="current-deck-pill">✓ SELECCIONADO</span>' 
            : `<button type="button" class="primary-button mini select-deck-btn" data-action="select-ranked-deck" data-deck-id="${esc(deck.id)}" tabindex="-1">Elegir mazo</button>`}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="ranked-modal-backdrop" id="ranked-deck-picker-backdrop">
      <div class="ranked-modal-card ranked-deck-picker-card">
        <div class="deck-picker-header">
          <div class="deck-picker-title-box">
            <span class="eyebrow gold">${isCasual ? "SELECCIÓN DE MAZO · PARTIDA CASUAL" : "SELECCIÓN DE MAZO COMPETITIVO"}</span>
            <h3>${isCasual ? "Elige tu mazo para el duelo" : "Elige tu mazo para la temporada"}</h3>
            <p>${isCasual ? "Selecciona el mazo con el que jugarás tu enfrentamiento amistoso o contra la IA." : "Selecciona el mazo con el que disputarás tus partidas clasificatorias."}</p>
          </div>
          <button type="button" class="ghost-button mini close-picker-btn" data-action="close-ranked-deck-picker" aria-label="Cerrar selección de mazo">✕ Cerrar</button>
        </div>

        <div class="deck-picker-toolbar">
          <div class="deck-picker-search-wrap">
            <input type="text" id="ranked-deck-search" placeholder="Buscar mazo o carta insignia..." autocomplete="off" />
          </div>
          <div class="deck-picker-tabs" role="tablist">
            <button type="button" class="deck-picker-tier-tab active" data-tier-tab="all">Todos (${allDecks.length})</button>
            <button type="button" class="deck-picker-tier-tab" data-tier-tab="1">Tier 1 (${tierCounts[1]})</button>
            <button type="button" class="deck-picker-tier-tab" data-tier-tab="2">Tier 2 (${tierCounts[2]})</button>
            <button type="button" class="deck-picker-tier-tab" data-tier-tab="3">Tier 3 (${tierCounts[3]})</button>
            <button type="button" class="deck-picker-tier-tab" data-tier-tab="4">Tier 4 (${tierCounts[4]})</button>
          </div>
        </div>

        <div class="deck-picker-count-bar">
          <span id="deck-picker-count">${allDecks.length} mazos disponibles</span>
        </div>

        <div class="deck-picker-grid" id="ranked-deck-grid">
          ${deckCardsHtml}
        </div>
      </div>
    </div>
  `;
}

export function bindRankedPickerEvents({ on }) {
  const searchInput = document.querySelector("#ranked-deck-search");
  const countLabel = document.querySelector("#deck-picker-count");
  const cards = document.querySelectorAll(".deck-picker-card");
  const tabs = document.querySelectorAll(".deck-picker-tier-tab");
  const backdrop = document.querySelector("#ranked-deck-picker-backdrop");
  if (!searchInput && !tabs.length) return;

  let activeTier = "all";

  const filterCards = () => {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const name = card.dataset.deckName || "";
      const rep = card.dataset.repName || "";
      const tier = card.dataset.deckTier || "";

      const matchesSearch = !query || name.includes(query) || rep.includes(query);
      const matchesTier = activeTier === "all" || tier === activeTier;

      const visible = matchesSearch && matchesTier;
      card.style.display = visible ? "" : "none";
      if (visible) visibleCount++;
    });

    if (countLabel) {
      countLabel.textContent = `${visibleCount} ${visibleCount === 1 ? "mazo disponible" : "mazos disponibles"}`;
    }
  };

  if (searchInput) {
    on(searchInput, "input", filterCards);
    setTimeout(() => { if (document.activeElement !== searchInput) searchInput.focus(); }, 60);
  }

  tabs.forEach((tab) => {
    on(tab, "click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTier = tab.dataset.tierTab;
      filterCards();
    });
  });

  cards.forEach((card) => {
    on(card, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const selectBtn = card.querySelector(".select-deck-btn");
        if (selectBtn) selectBtn.click();
        else card.click();
      }
    });
  });

  if (backdrop) {
    on(backdrop, "click", (e) => {
      if (e.target === backdrop) {
        const closeBtn = backdrop.querySelector("[data-action='close-ranked-deck-picker']");
        closeBtn?.click();
      }
    });
  }
}


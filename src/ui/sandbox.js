import { CARDS, getCard } from "../engine/cards.js";
import { CARD_KIND } from "../engine/constants.js";
import { DECK_PRESETS, getDeck } from "../decks/decks.js";
import { CARD_WORK_STATUS_LABELS, cardWorkStatus } from "../storage/card-review.js";

const SCENARIOS_STORAGE_KEY = "goat-local-lab-custom-scenarios-v1";

export function loadSavedScenarios() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCENARIOS_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedScenarios(scenarios) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios));
    return true;
  } catch {
    return false;
  }
}

export function createDefaultScenarioState(savedDecks = []) {
  const p1DeckId = DECK_PRESETS[0]?.id ?? "chaos-turbo";
  const p2DeckId = DECK_PRESETS[1]?.id ?? "goat-control";
  return {
    startingPlayer: 0,
    turn: 1,
    phase: "MAIN1",
    players: [
      {
        lp: 8000,
        hand: [],
        monsterZone: [null, null, null, null, null],
        spellTrapZone: [null, null, null, null, null],
        grave: [],
        banished: [],
        deckPreset: p1DeckId,
        deckMode: "preset",
        deck: [],
      },
      {
        lp: 8000,
        hand: [],
        monsterZone: [null, null, null, null, null],
        spellTrapZone: [null, null, null, null, null],
        grave: [],
        banished: [],
        deckPreset: p2DeckId,
        deckMode: "preset",
        deck: [],
      },
    ],
    picker: {
      open: false,
      targetPlayer: 0,
      targetZone: "hand",
      targetIndex: null,
      search: "",
      filterKind: "all",
      workStatus: "all",
      auditStatus: "all",
      sourceTab: "catalog", // "catalog" | "saved-decks"
      selectedDeckId: p1DeckId,
      page: 1,
      pageSize: 40,
    },
    savedScenarios: loadSavedScenarios(),
    scenarioName: "Escenario Personalizado",
    audit: {
      cardId: null,
      seed: 2005,
      description: "",
      steps: [],
      assertions: [],
      lastSnapshot: null,
    },
  };
}

function cardImageFileName(name) {
  const cleaned = String(name ?? "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return `${cleaned || "unnamed-card"}.jpg`;
}

function cardImagePath(card) {
  return `./goat-card-images/${encodeURIComponent(card?.imageFile ?? cardImageFileName(card?.name))}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function getCardOrFallback(cardIdOrObj) {
  if (!cardIdOrObj) return null;
  const id = typeof cardIdOrObj === "object" ? (cardIdOrObj.cardId ?? cardIdOrObj.id) : cardIdOrObj;
  return getCard(id) ?? null;
}

export function renderSandboxPage(sandbox, { savedDecks = [], favoriteCardIds = new Set(), cardWorkStatuses = new Map() } = {}) {
  const state = sandbox && Array.isArray(sandbox.players) ? sandbox : createDefaultScenarioState(savedDecks);
  const allDecks = [...DECK_PRESETS, ...savedDecks];
  const p0 = state.players[0];
  const p1 = state.players[1];
  const pickerModal = state.picker?.open ? renderPickerModal(state, allDecks, favoriteCardIds, cardWorkStatuses) : "";

  return `
    <section class="page sandbox-page">
      <div class="page-head">
        <div>
          <span class="eyebrow">SANDBOX / MODO PRUEBA</span>
          <h1>Configuración de Escenario</h1>
          <p>Define manos, Campo, Cementerio, Destierro, LP y mazos, y prueba la situación con control local 1vs1.</p>
        </div>
        <div class="head-actions">
          <span class="resource-chip">100% AISLADO</span>
          <span class="resource-chip">HOTSEAT 1VS1</span>
          <button class="primary-button" data-sandbox-action="start-duel">Comenzar Duelo de Prueba</button>
        </div>
      </div>

      <div class="sandbox-global-panel side-card">
        <div class="side-title">
          <span>PARÁMETROS GLOBALES DE LA PARTIDA</span>
          <span class="tiny-label">REGLAS GOAT</span>
        </div>
        <div class="sandbox-global-grid">
          <label class="sandbox-field">
            <span>Jugador que inicia</span>
            <select id="sandbox-starting-player">
              <option value="0" ${state.startingPlayer === 0 ? "selected" : ""}>Jugador 1 (Tú)</option>
              <option value="1" ${state.startingPlayer === 1 ? "selected" : ""}>Jugador 2 (Rival)</option>
            </select>
          </label>
          <div class="sandbox-field">
            <span>Punto de entrada autoritativo</span>
            <strong>Turno 1 · Main Phase 1</strong>
            <small>OCGCore crea el turno y sus ventanas legales; el editor no falsifica el contador interno.</small>
          </div>
          <div class="sandbox-field">
            <span>Guardar / Cargar Escenario</span>
            <div class="sandbox-save-row">
              <input id="sandbox-scenario-name" placeholder="Nombre del escenario..." value="${esc(state.scenarioName)}" />
              <button class="ghost-button" data-sandbox-action="save-scenario">Guardar</button>
            </div>
          </div>
          ${state.savedScenarios.length ? `
          <div class="sandbox-field">
            <span>Escenarios guardados</span>
            <div class="sandbox-save-row">
              <select id="sandbox-load-select">
                <option value="">-- Cargar escenario guardado --</option>
                ${state.savedScenarios.map((s, idx) => `<option value="${idx}">${esc(s.name)} (${new Date(s.savedAt).toLocaleDateString("es-ES")})</option>`).join("")}
              </select>
              <button class="ghost-button" data-sandbox-action="load-scenario">Cargar</button>
              <button class="ghost-button danger-button" data-sandbox-action="delete-scenario">Borrar</button>
            </div>
          </div>` : ""}
        </div>
      </div>

      <div class="sandbox-players-container">
        ${renderPlayerSandboxPanel(0, p0, "Jugador 1 (Tú)", allDecks, state)}
        ${renderPlayerSandboxPanel(1, p1, "Jugador 2 (Rival)", allDecks, state)}
      </div>

      <div class="sandbox-bottom-bar">
        <button class="ghost-button" data-sandbox-action="reset-all">Restablecer Escenario</button>
        <button class="primary-button wide-cta" data-sandbox-action="start-duel">Comenzar Duelo de Prueba</button>
      </div>

      ${pickerModal}
    </section>
  `;
}

function renderPlayerSandboxPanel(playerId, player, title, allDecks, sandbox) {
  const isCustomDeck = player.deckMode === "custom";
  const currentDeck = allDecks.find((d) => d.id === player.deckPreset) ?? allDecks[0];
  const deckCount = isCustomDeck ? (player.deck?.length ?? 0) : (currentDeck?.main?.length ?? 0);
  const deckLabel = isCustomDeck ? "Personalizado" : (currentDeck?.name ?? "Preset");

  return `
    <div class="sandbox-player-card side-card player-${playerId}">
      <div class="player-header">
        <div class="player-title">
          <span class="player-badge">P${playerId + 1}</span>
          <h3>${title}</h3>
        </div>
        <div class="player-lp-field">
          <label>LP: <input type="number" step="100" min="0" max="99000" class="lp-input" data-player="${playerId}" value="${player.lp}" /></label>
          <div class="quick-lp-buttons">
            <button class="mini-btn" data-sandbox-quick-lp="${playerId}" data-lp="8000">8000</button>
            <button class="mini-btn" data-sandbox-quick-lp="${playerId}" data-lp="4000">4000</button>
            <button class="mini-btn" data-sandbox-quick-lp="${playerId}" data-lp="2000">2000</button>
            <button class="mini-btn" data-sandbox-quick-lp="${playerId}" data-lp="1000">1000</button>
          </div>
        </div>
      </div>

      <!-- Zona de Mano -->
      <div class="sandbox-zone-block">
        <div class="zone-header">
          <span>MANO (${player.hand.length} cartas)</span>
          <div class="zone-actions">
            <button class="mini-btn primary" data-sandbox-open-picker="hand" data-player="${playerId}">+ Añadir a mano</button>
            ${player.hand.length ? `<button class="mini-btn" data-sandbox-clear-zone="hand" data-player="${playerId}">Vaciar</button>` : ""}
          </div>
        </div>
        <div class="sandbox-cards-strip">
          ${player.hand.length ? player.hand.map((cardId, index) => renderCardStripItem(cardId, playerId, "hand", index)).join("") : `<div class="empty-strip-hint">Mano vacía. Haz clic en "+ Añadir a mano" para agregar cartas.</div>`}
        </div>
      </div>

      <!-- Campo: Zona de Monstruos (5 Ranuras) -->
      <div class="sandbox-zone-block">
        <div class="zone-header">
          <span>ZONA DE MONSTRUOS (Campo)</span>
          ${player.monsterZone.some(Boolean) ? `<button class="mini-btn" data-sandbox-clear-zone="monsterZone" data-player="${playerId}">Limpiar monstruos</button>` : ""}
        </div>
        <div class="sandbox-slots-grid monster-slots">
          ${player.monsterZone.map((slot, seq) => renderMonsterSlot(slot, playerId, seq)).join("")}
        </div>
      </div>

      <!-- Campo: Zona de Magias y Trampas (5 Ranuras) -->
      <div class="sandbox-zone-block">
        <div class="zone-header">
          <span>ZONA DE MAGIAS Y TRAMPAS (Campo)</span>
          ${player.spellTrapZone.some(Boolean) ? `<button class="mini-btn" data-sandbox-clear-zone="spellTrapZone" data-player="${playerId}">Limpiar M/T</button>` : ""}
        </div>
        <div class="sandbox-slots-grid spell-slots">
          ${player.spellTrapZone.map((slot, seq) => renderSpellTrapSlot(slot, playerId, seq)).join("")}
        </div>
      </div>

      <!-- Cementerio y Desterradas -->
      <div class="sandbox-zone-row">
        <div class="sandbox-zone-block half-zone">
          <div class="zone-header">
            <span>CEMENTERIO (${player.grave.length})</span>
            <button class="mini-btn primary" data-sandbox-open-picker="grave" data-player="${playerId}">+ Añadir</button>
          </div>
          <div class="sandbox-cards-strip mini-strip">
            ${player.grave.length ? player.grave.map((cardId, index) => renderCardStripItem(cardId, playerId, "grave", index)).join("") : `<div class="empty-strip-hint">Cementerio vacío</div>`}
          </div>
        </div>
        <div class="sandbox-zone-block half-zone">
          <div class="zone-header">
            <span>DESTERRADAS (${player.banished.length})</span>
            <button class="mini-btn primary" data-sandbox-open-picker="banished" data-player="${playerId}">+ Añadir</button>
          </div>
          <div class="sandbox-cards-strip mini-strip">
            ${player.banished.length ? player.banished.map((cardId, index) => renderCardStripItem(cardId, playerId, "banished", index)).join("") : `<div class="empty-strip-hint">Sin desterradas</div>`}
          </div>
        </div>
      </div>

      <!-- Mazo Restante / Base -->
      <div class="sandbox-zone-block deck-config-block">
        <div class="zone-header">
          <span>MAZO DE PRUEBA</span>
          <span class="tiny-label">${deckLabel} · ${deckCount} cartas</span>
        </div>
        <div class="deck-select-row">
          <select class="sandbox-deck-select" data-player="${playerId}">
            <option value="__custom__" ${isCustomDeck ? "selected" : ""}>Personalizado (${player.deck?.length ?? 0} cartas)</option>
            ${allDecks.map((d) => `<option value="${esc(d.id)}" ${!isCustomDeck && d.id === player.deckPreset ? "selected" : ""}>${esc(d.name)} (${d.main?.length ?? 40} cartas)</option>`).join("")}
          </select>
          <button class="mini-btn" data-sandbox-open-picker="deck" data-player="${playerId}">Ver / Añadir al mazo</button>
        </div>
        ${isCustomDeck ? `
        <div class="sandbox-cards-strip mini-strip deck-cards-strip">
          ${player.deck?.length ? player.deck.map((cardId, index) => renderCardStripItem(cardId, playerId, "deck", index)).join("") : `<div class="empty-strip-hint">Mazo personalizado vacío</div>`}
        </div>` : ""}
        <p class="fine-print">Usa un preset o elige <strong>Personalizado</strong> para partir de 0 cartas y añadir exactamente las que quieras. En un preset, las cartas configuradas fuera del mazo se descuentan al iniciar.</p>
      </div>
    </div>
  `;
}

function renderMonsterSlot(slot, playerId, seq) {
  if (!slot) {
    return `
      <div class="sandbox-slot empty-slot" data-sandbox-open-slot="monsterZone" data-player="${playerId}" data-seq="${seq}">
        <span class="slot-num">M${seq + 1}</span>
        <button class="slot-add-btn" type="button">+ Ranura ${seq + 1}</button>
        <small>Vacía</small>
      </div>
    `;
  }
  const card = getCardOrFallback(slot);
  const pos = slot.position ?? "ATTACK";
  const isAttack = pos === "ATTACK" || pos === "FACEUP_ATTACK";
  const isDefFaceUp = pos === "FACEUP_DEFENSE" || pos === "DEFENSE";
  const isDefFaceDown = pos === "FACEDOWN_DEFENSE" || pos === "SET" || pos === "FACEDOWN";

  return `
    <div class="sandbox-slot filled-slot ${isDefFaceDown ? "pos-set" : isDefFaceUp ? "pos-def" : "pos-atk"}">
      <div class="slot-card-preview">
        ${card ? `<img src="${esc(cardImagePath(card))}" alt="${esc(card.name)}" class="slot-img ${isDefFaceDown ? "face-down" : ""}" />` : ""}
        <span class="slot-card-name">${esc(card?.name ?? "Monstruo")}</span>
      </div>
      <div class="slot-pos-controls">
        <button class="pos-btn ${isAttack ? "active" : ""}" data-set-monster-pos="ATTACK" data-player="${playerId}" data-seq="${seq}" title="Ataque Boca Arriba">ATK</button>
        <button class="pos-btn ${isDefFaceUp ? "active" : ""}" data-set-monster-pos="FACEUP_DEFENSE" data-player="${playerId}" data-seq="${seq}" title="Defensa Boca Arriba">DEF ↑</button>
        <button class="pos-btn ${isDefFaceDown ? "active" : ""}" data-set-monster-pos="FACEDOWN_DEFENSE" data-player="${playerId}" data-seq="${seq}" title="Defensa Boca Abajo (Set)">SET ↓</button>
      </div>
      <button class="slot-remove-btn" data-sandbox-remove-slot="monsterZone" data-player="${playerId}" data-seq="${seq}" title="Quitar carta">&times;</button>
    </div>
  `;
}

function renderSpellTrapSlot(slot, playerId, seq) {
  if (!slot) {
    return `
      <div class="sandbox-slot empty-slot spell-slot-empty" data-sandbox-open-slot="spellTrapZone" data-player="${playerId}" data-seq="${seq}">
        <span class="slot-num">S${seq + 1}</span>
        <button class="slot-add-btn" type="button">+ Ranura ${seq + 1}</button>
        <small>Vacía</small>
      </div>
    `;
  }
  const card = getCardOrFallback(slot);
  const pos = slot.position ?? "SET";
  const isSet = pos === "SET" || pos === "FACEDOWN" || pos === "FACEDOWN_DEFENSE";

  return `
    <div class="sandbox-slot filled-slot ${isSet ? "pos-set" : "pos-faceup"}">
      <div class="slot-card-preview">
        ${card ? `<img src="${esc(cardImagePath(card))}" alt="${esc(card.name)}" class="slot-img ${isSet ? "face-down" : ""}" />` : ""}
        <span class="slot-card-name">${esc(card?.name ?? "Magia/Trampa")}</span>
      </div>
      <div class="slot-pos-controls">
        <button class="pos-btn ${isSet ? "active" : ""}" data-set-spell-pos="SET" data-player="${playerId}" data-seq="${seq}" title="Colocada Boca Abajo">SET ↓</button>
        <button class="pos-btn ${!isSet ? "active" : ""}" data-set-spell-pos="FACEUP" data-player="${playerId}" data-seq="${seq}" title="Boca Arriba Activa">Boca Arriba</button>
      </div>
      <button class="slot-remove-btn" data-sandbox-remove-slot="spellTrapZone" data-player="${playerId}" data-seq="${seq}" title="Quitar carta">&times;</button>
    </div>
  `;
}

function renderCardStripItem(cardId, playerId, zone, index) {
  const card = getCardOrFallback(cardId);
  if (!card) return "";

  return `
    <div class="strip-card-item" title="${esc(card.name)}">
      <img src="${esc(cardImagePath(card))}" alt="${esc(card.name)}" class="strip-thumb" />
      <span class="strip-name">${esc(card.name)}</span>
      <button class="strip-remove-btn" data-sandbox-remove-card="${zone}" data-player="${playerId}" data-index="${index}" title="Eliminar">&times;</button>
    </div>
  `;
}

function pickerCardsForState(sandbox, allDecks, favoriteCardIds = new Set(), cardWorkStatuses = new Map()) {
  const picker = sandbox.picker;
  // Filter cards
  let filtered = CARDS;
  if (picker.sourceTab === "saved-decks") {
    const chosenDeck = allDecks.find((d) => d.id === picker.selectedDeckId) ?? allDecks[0];
    const deckCardIds = new Set([...(chosenDeck?.main ?? []), ...(chosenDeck?.fusion ?? []), ...(chosenDeck?.side ?? [])]);
    filtered = CARDS.filter((c) => deckCardIds.has(c.id));
  }

  if (picker.filterKind === "favorites") {
    filtered = filtered.filter((card) => favoriteCardIds instanceof Set ? favoriteCardIds.has(card.id) : favoriteCardIds.includes(card.id));
  } else if (picker.filterKind === "monster") {
    filtered = filtered.filter((c) => c.kind === CARD_KIND.MONSTER || c.kind === CARD_KIND.TOKEN);
  } else if (picker.filterKind === "spell") {
    filtered = filtered.filter((c) => c.kind === CARD_KIND.SPELL);
  } else if (picker.filterKind === "trap") {
    filtered = filtered.filter((c) => c.kind === CARD_KIND.TRAP);
  }

  if (picker.workStatus && picker.workStatus !== "all") {
    filtered = filtered.filter((card) => cardWorkStatus(cardWorkStatuses, card.id) === picker.workStatus);
  }

  if (picker.search.trim()) {
    const q = picker.search.trim().toLowerCase();
    filtered = filtered.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.race && c.race.toLowerCase().includes(q)) ||
      (c.attribute && c.attribute.toLowerCase().includes(q)) ||
      (c.text && c.text.toLowerCase().includes(q))
    );
  }

  const pageSize = picker.pageSize || 48;
  const requestedPage = picker.page || 1;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const currentPageCards = filtered.slice((page - 1) * pageSize, page * pageSize);

  return { filtered, currentPageCards, page, totalPages };
}

function renderPickerCardGrid(cards) {
  return cards.map((card) => `
    <div class="picker-card-card" data-sandbox-select-card="${card.id}">
      <img src="${esc(cardImagePath(card))}" alt="${esc(card.name)}" loading="lazy" />
      <div class="picker-card-meta">
        <strong>${esc(card.name)}</strong>
        <small>${card.kind === CARD_KIND.MONSTER ? `★${card.level ?? ""} ${card.atk ?? 0}/${card.def ?? 0}` : esc(card.spellType ?? card.trapType ?? card.kind)}</small>
      </div>
    </div>
  `).join("");
}

function renderPickerPagination(page, totalPages) {
  if (totalPages <= 1) return "";
  return `
    <button class="mini-btn" data-sandbox-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>&larr; Anterior</button>
    <span>Página ${page} de ${totalPages}</span>
    <button class="mini-btn" data-sandbox-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Siguiente &rarr;</button>
  `;
}

export function renderSandboxPickerResults(sandbox, allDecks = [], favoriteCardIds = new Set(), cardWorkStatuses = new Map()) {
  const { filtered, currentPageCards, page, totalPages } = pickerCardsForState(sandbox, allDecks, favoriteCardIds, cardWorkStatuses);
  return {
    count: filtered.length,
    page,
    totalPages,
    cardsMarkup: renderPickerCardGrid(currentPageCards),
    paginationMarkup: renderPickerPagination(page, totalPages),
  };
}

function renderPickerModal(sandbox, allDecks, favoriteCardIds, cardWorkStatuses) {
  const picker = sandbox.picker;
  const targetLabel = picker.targetZone === "auditCard" ? "Carta"
    : picker.targetZone === "monsterZone" ? `Monstruo Ranura ${Number(picker.targetIndex) + 1}`
    : picker.targetZone === "spellTrapZone" ? `Magia/Trampa Ranura ${Number(picker.targetIndex) + 1}`
    : picker.targetZone === "hand" ? "Mano"
    : picker.targetZone === "grave" ? "Cementerio"
    : picker.targetZone === "banished" ? "Desterradas"
    : "Mazo";
  const pickerResults = renderSandboxPickerResults(sandbox, allDecks, favoriteCardIds, cardWorkStatuses);

  return `
    <div class="sandbox-modal-backdrop" data-sandbox-close-picker>
      <div class="sandbox-modal-container" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h3>${picker.targetZone === "auditCard" ? "Seleccionar carta" : `Seleccionar Carta para P${picker.targetPlayer + 1}`} &middot; <span class="accent-text">${targetLabel}</span></h3>
            <small id="sandbox-picker-count">Total: ${pickerResults.count} cartas encontradas</small>
          </div>
          <button class="modal-close-btn" data-sandbox-close-picker>&times;</button>
        </div>

        <div class="picker-tabs">
          <button class="picker-tab ${picker.sourceTab === "catalog" ? "active" : ""}" data-sandbox-picker-tab="catalog">Catálogo Completo (${CARDS.length} cartas)</button>
          <button class="picker-tab ${picker.sourceTab === "saved-decks" ? "active" : ""}" data-sandbox-picker-tab="saved-decks">Desde Mazos Guardados</button>
        </div>

        ${picker.sourceTab === "saved-decks" ? `
        <div class="picker-deck-select-row">
          <label>Mazo origen:
            <select id="picker-deck-source-select">
              ${allDecks.map((d) => `<option value="${esc(d.id)}" ${d.id === picker.selectedDeckId ? "selected" : ""}>${esc(d.name)} (${d.main?.length ?? 40} cartas)</option>`).join("")}
            </select>
          </label>
          <button class="ghost-button mini-btn" data-sandbox-import-whole-deck="${picker.targetPlayer}">Importar mazo completo a P${picker.targetPlayer + 1}</button>
        </div>` : ""}

        <div class="picker-controls">
          <input type="text" id="sandbox-picker-search" placeholder="Buscar por nombre, tipo, texto, atk/def..." value="${esc(picker.search)}" autofocus />
          <label class="picker-work-filter">Funciona
            <select id="sandbox-picker-work-status">
              <option value="all" ${picker.workStatus === "all" ? "selected" : ""}>Todos</option>
              ${Object.entries(CARD_WORK_STATUS_LABELS).map(([status, label]) => `<option value="${status}" ${picker.workStatus === status ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <div class="picker-kind-filters">
            <button class="kind-chip ${picker.filterKind === "all" ? "active" : ""}" data-sandbox-filter-kind="all">Todas</button>
            <button class="kind-chip ${picker.filterKind === "favorites" ? "active" : ""}" data-sandbox-filter-kind="favorites">★ Favoritas (${favoriteCardIds instanceof Set ? favoriteCardIds.size : favoriteCardIds.length})</button>
            <button class="kind-chip ${picker.filterKind === "monster" ? "active" : ""}" data-sandbox-filter-kind="monster">Monstruos</button>
            <button class="kind-chip ${picker.filterKind === "spell" ? "active" : ""}" data-sandbox-filter-kind="spell">Magias</button>
            <button class="kind-chip ${picker.filterKind === "trap" ? "active" : ""}" data-sandbox-filter-kind="trap">Trampas</button>
          </div>
        </div>

        <div id="sandbox-picker-results" class="picker-cards-grid">${pickerResults.cardsMarkup}</div>

        <div id="sandbox-picker-pagination" class="picker-pagination">${pickerResults.paginationMarkup}</div>
      </div>
    </div>
  `;
}

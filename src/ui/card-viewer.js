import { CARDS, getCard } from "../engine/cards.js";
import { CARD_KIND, VALIDATION_STATUS } from "../engine/constants.js";
import { isFavoriteCard, saveFavoriteCardIds, toggleFavoriteCardId } from "../storage/card-favorites.js";
import { CARD_WORK_STATUS_LABELS, cardWorkStatus, saveCardWorkStatuses, setCardWorkStatus } from "../storage/card-review.js";
import { CARD_AUDIT_STATUS_LABELS, cardAuditRecord, cardAuditStatusLabel } from "../engine/card-audit.js";

const DEFAULT_PAGE_SIZE = 48;
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

const KIND_LABELS = Object.freeze({
  [CARD_KIND.MONSTER]: "Monstruo",
  [CARD_KIND.SPELL]: "Magia",
  [CARD_KIND.TRAP]: "Trampa",
  [CARD_KIND.TOKEN]: "Token",
});

const STATUS_LABELS = Object.freeze({
  [VALIDATION_STATUS.SUPPORTED]: "Listo",
  [VALIDATION_STATUS.PARTIAL]: "Parcial",
  [VALIDATION_STATUS.EXPERIMENTAL]: "Experimental",
  [VALIDATION_STATUS.UNSUPPORTED]: "No soportado",
});

export function createDefaultCardViewerState() {
  return {
    search: "",
    sort: "name",
    kind: "all",
    status: "all",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    selectedCardId: null,
    favoriteOnly: false,
    workStatus: "all",
    auditStatus: "all",
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function kindLabel(kind) {
  return KIND_LABELS[kind] ?? String(kind ?? "Carta");
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? String(status ?? "Sin estado");
}

function workStatusOptions(selected) {
  return Object.entries(CARD_WORK_STATUS_LABELS).map(([status, label]) => `<option value="${status}" ${selected === status ? "selected" : ""}>${label}</option>`).join("");
}

function resultsLabel(count) {
  return `${count} ${count === 1 ? "carta" : "cartas"} encontradas`;
}

function cardSearchText(card) {
  return [
    card.name,
    card.kind,
    kindLabel(card.kind),
    card.attribute,
    card.race,
    card.spellType,
    card.trapType,
    card.text,
    card.visibleText,
    card.effectFamily,
    card.effectTemplate,
    card.status,
    cardAuditRecord(card.id)?.status,
  ].filter(Boolean).join(" ").toLocaleLowerCase("es");
}

function compareCards(left, right, sort) {
  if (sort === "id") return Number(left.id) - Number(right.id);
  if (sort === "name-desc") return collator.compare(right.name, left.name);
  if (sort === "kind") return collator.compare(kindLabel(left.kind), kindLabel(right.kind)) || collator.compare(left.name, right.name);
  if (sort === "atk") return (Number(right.atk) || 0) - (Number(left.atk) || 0) || collator.compare(left.name, right.name);
  if (sort === "status") return collator.compare(statusLabel(left.status), statusLabel(right.status)) || collator.compare(left.name, right.name);
  return collator.compare(left.name, right.name);
}

export function cardViewerResults(state, cards = CARDS) {
  const query = String(state?.search ?? "").trim().toLocaleLowerCase("es");
  const kind = state?.kind ?? "all";
  const status = state?.status ?? "all";
  const favoriteCardIds = state?.favoriteCardIds;
  const workStatus = state?.workStatus ?? "all";
  const cardWorkStatuses = state?.cardWorkStatuses;
  const auditStatus = state?.auditStatus ?? "all";
  let filtered = cards.filter((card) => {
    if (kind !== "all" && card.kind !== kind) return false;
    if (status !== "all" && card.status !== status) return false;
    if (state?.favoriteOnly === true && !isFavoriteCard(favoriteCardIds, card.id)) return false;
    if (workStatus !== "all" && cardWorkStatus(cardWorkStatuses, card.id) !== workStatus) return false;
    if (auditStatus !== "all" && cardAuditRecord(card.id)?.status !== auditStatus) return false;
    return !query || cardSearchText(card).includes(query);
  });
  filtered = [...filtered].sort((left, right) => compareCards(left, right, state?.sort ?? "name"));
  const pageSize = Math.max(1, Number(state?.pageSize) || DEFAULT_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(state?.page) || 1), totalPages);
  return {
    cards: filtered,
    currentPage: filtered.slice((page - 1) * pageSize, page * pageSize),
    count: filtered.length,
    page,
    totalPages,
  };
}

function cardMeta(card) {
  if (card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN) {
    return `${card.attribute ?? ""} · ${card.race ?? kindLabel(card.kind)} · ${card.atk ?? 0}/${card.def ?? 0}`.replace(/^ · | · $/g, "");
  }
  return card.spellType ?? card.trapType ?? kindLabel(card.kind);
}

function cardTileMarkup(card, cardMarkup, favoriteCardIds, cardWorkStatuses) {
  const visual = typeof cardMarkup === "function"
    ? cardMarkup({ cardId: card.id, faceUp: true }, { compact: true, imageLoading: "lazy" })
    : `<div class="card-viewer-art-fallback">${escapeHtml(card.name)}</div>`;
  const favorite = isFavoriteCard(favoriteCardIds, card.id);
  const workStatus = cardWorkStatus(cardWorkStatuses, card.id);
  const audit = cardAuditRecord(card.id);
  return `<article class="card-viewer-tile ${favorite ? "is-favorite" : ""}">
    <button type="button" class="card-viewer-tile-open" data-card-viewer-card="${card.id}" aria-label="Ver ${escapeHtml(card.name)}">
      <span class="card-viewer-tile-visual">${visual}</span>
      <span class="card-viewer-tile-copy"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(cardMeta(card))}</small><em>${escapeHtml(statusLabel(card.status))}</em><span class="card-audit-badge audit-${String(audit?.status ?? "auxiliary").toLowerCase()}">${escapeHtml(audit ? cardAuditStatusLabel(audit.status) : "Registro auxiliar")}</span></span>
    </button>
    <button type="button" class="card-viewer-favorite" data-card-viewer-favorite="${card.id}" aria-pressed="${favorite}" aria-label="${favorite ? "Quitar de favoritos" : "Añadir a favoritos"}: ${escapeHtml(card.name)}" title="${favorite ? "Quitar de favoritos" : "Añadir a favoritos"}">${favorite ? "★" : "☆"}</button>
    <label class="card-viewer-work-row"><span>Funciona</span><select data-card-viewer-work-status="${card.id}" aria-label="Funciona: ${escapeHtml(card.name)}">${workStatusOptions(workStatus)}</select></label>
  </article>`;
}

function paginationMarkup(page, totalPages) {
  if (totalPages <= 1) return "";
  return `<button type="button" class="ghost-button mini-btn" data-card-viewer-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>← Anterior</button><span>Página ${page} de ${totalPages}</span><button type="button" class="ghost-button mini-btn" data-card-viewer-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Siguiente →</button>`;
}

export function renderCardViewerResults(state, { cardMarkup, favoriteCardIds, cardWorkStatuses } = {}) {
  const results = cardViewerResults({ ...state, favoriteCardIds: favoriteCardIds ?? state?.favoriteCardIds, cardWorkStatuses: cardWorkStatuses ?? state?.cardWorkStatuses });
  return {
    ...results,
    cardsMarkup: results.currentPage.length
      ? results.currentPage.map((card) => cardTileMarkup(card, cardMarkup, favoriteCardIds ?? state?.favoriteCardIds, cardWorkStatuses ?? state?.cardWorkStatuses)).join("")
      : `<div class="card-viewer-empty">${state?.favoriteOnly ? "Aún no tienes cartas favoritas con estos filtros." : "No hay cartas que coincidan con la búsqueda."}</div>`,
    paginationMarkup: paginationMarkup(results.page, results.totalPages),
  };
}

function popupMarkup(card, cardMarkup, favoriteCardIds, cardWorkStatuses, { hasPrevious = false, hasNext = false } = {}) {
  const visual = typeof cardMarkup === "function"
    ? cardMarkup({ cardId: card.id, faceUp: true }, { imageLoading: "eager" })
    : `<div class="card-viewer-art-fallback">${escapeHtml(card.name)}</div>`;
  const favorite = isFavoriteCard(favoriteCardIds, card.id);
  const workStatus = cardWorkStatus(cardWorkStatuses, card.id);
  const audit = cardAuditRecord(card.id);
  const stats = card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN
    ? `<div class="card-viewer-stat"><span>ATK</span><strong>${card.atk ?? 0}</strong></div><div class="card-viewer-stat"><span>DEF</span><strong>${card.def ?? 0}</strong></div>`
    : `<div class="card-viewer-stat wide"><span>TIPO</span><strong>${escapeHtml(card.spellType ?? card.trapType ?? kindLabel(card.kind))}</strong></div>`;
  return `<div class="card-viewer-modal-backdrop" data-card-viewer-close>
    <div class="card-viewer-modal-stage">
      <button type="button" class="card-viewer-nav" data-card-viewer-prev ${hasPrevious ? "" : "disabled"} aria-label="Carta anterior" title="Carta anterior (←)">←<span>Anterior</span></button>
      <div class="card-viewer-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${escapeHtml(card.name)}">
        <button type="button" class="card-viewer-modal-close" data-card-viewer-close aria-label="Cerrar detalle">×</button>
        <div class="card-viewer-modal-visual">${visual}</div>
        <div class="card-viewer-modal-copy">
          <div class="card-viewer-modal-title"><span class="eyebrow">${escapeHtml(kindLabel(card.kind))} · ID ${escapeHtml(card.id)}</span><div class="card-viewer-modal-review"><label>Funciona<select data-card-viewer-work-status="${card.id}" aria-label="Funciona: ${escapeHtml(card.name)}">${workStatusOptions(workStatus)}</select></label><button type="button" class="card-viewer-modal-favorite ${favorite ? "is-favorite" : ""}" data-card-viewer-favorite="${card.id}" aria-pressed="${favorite}" aria-label="${favorite ? "Quitar de favoritos" : "Añadir a favoritos"}">${favorite ? "★ Favorita" : "☆ Añadir a favoritos"}</button></div></div>
          <h2>${escapeHtml(card.name)}</h2>
        <div class="card-viewer-stats">${stats}</div>
        <div class="card-viewer-detail-row"><span>Atributo</span><strong>${escapeHtml(card.attribute ?? "—")}</strong></div>
        <div class="card-viewer-detail-row"><span>Tipo / Raza</span><strong>${escapeHtml(card.race ?? card.spellType ?? card.trapType ?? "—")}</strong></div>
        <div class="card-viewer-detail-row"><span>Estado de implementación</span><strong class="card-viewer-status status-${String(card.status ?? "").toLowerCase()}">${escapeHtml(statusLabel(card.status))}</strong></div>
        <div class="card-viewer-audit-panel"><div><span>AUDITORIA CARTA POR CARTA</span><strong class="card-audit-badge audit-${String(audit?.status ?? "auxiliary").toLowerCase()}">${escapeHtml(audit ? cardAuditStatusLabel(audit.status) : "Registro auxiliar")}</strong></div>${audit ? `<small>${audit.contract.obligations.length} obligaciones declaradas · huella ${audit.fingerprint}</small><button type="button" class="ghost-button mini-btn" data-card-viewer-audit-card="${card.id}">Preparar evidencia en Sandbox</button>` : `<small>Token o registro auxiliar fuera de las 1.686 cartas jugables.</small>`}</div>
        <div class="card-viewer-effect"><span>EFECTO / TEXTO</span><p>${escapeHtml(card.visibleText ?? card.text ?? "Sin texto registrado.")}</p></div>
        <div class="card-viewer-detail-row"><span>Familia</span><strong>${escapeHtml(card.effectFamily ?? card.effectTemplate ?? "Catálogo")}</strong></div>
        </div>
      </div>
      <button type="button" class="card-viewer-nav" data-card-viewer-next ${hasNext ? "" : "disabled"} aria-label="Carta siguiente" title="Carta siguiente (→)">→<span>Siguiente</span></button>
    </div>
  </div>`;
}

export function renderCardViewerPage(state, { cardMarkup, favoriteCardIds, cardWorkStatuses } = {}) {
  const viewer = state ?? createDefaultCardViewerState();
  const favorites = favoriteCardIds ?? viewer.favoriteCardIds;
  const reviews = cardWorkStatuses ?? viewer.cardWorkStatuses;
  const results = renderCardViewerResults(viewer, { cardMarkup, favoriteCardIds: favorites, cardWorkStatuses: reviews });
  const selected = viewer.selectedCardId == null ? null : getCard(viewer.selectedCardId);
  const selectedIndex = selected ? results.cards.findIndex((card) => Number(card.id) === Number(selected.id)) : -1;
  const favoriteCount = favorites instanceof Set ? favorites.size : new Set(Array.isArray(favorites) ? favorites : []).size;
  return `<section class="page card-viewer-page">
    <div class="page-head">
      <div><span class="eyebrow">CATÁLOGO / GOAT FORMAT</span><h1>Visor de Cartas</h1><p>Explora el pool completo, ordena sus cartas y abre cualquier ficha para leerla con detalle.</p></div>
      <div class="head-actions"><span class="resource-chip">${CARDS.length} CARTAS</span><span class="resource-chip">LOCAL / OFFLINE</span></div>
    </div>
    <div class="card-viewer-toolbar side-card">
      <div class="card-viewer-controls">
        <label>Buscar carta<input id="card-viewer-search" type="search" value="${escapeHtml(viewer.search)}" placeholder="Nombre, efecto, atributo, familia..." autocomplete="off" /></label>
        <label>Ordenar por<select id="card-viewer-sort"><option value="name" ${viewer.sort === "name" ? "selected" : ""}>Nombre A–Z</option><option value="name-desc" ${viewer.sort === "name-desc" ? "selected" : ""}>Nombre Z–A</option><option value="id" ${viewer.sort === "id" ? "selected" : ""}>ID de carta</option><option value="kind" ${viewer.sort === "kind" ? "selected" : ""}>Tipo de carta</option><option value="atk" ${viewer.sort === "atk" ? "selected" : ""}>ATK más alto</option><option value="status" ${viewer.sort === "status" ? "selected" : ""}>Estado</option></select></label>
        <label>Tipo<select id="card-viewer-kind"><option value="all" ${viewer.kind === "all" ? "selected" : ""}>Todos</option><option value="${CARD_KIND.MONSTER}" ${viewer.kind === CARD_KIND.MONSTER ? "selected" : ""}>Monstruos</option><option value="${CARD_KIND.SPELL}" ${viewer.kind === CARD_KIND.SPELL ? "selected" : ""}>Magias</option><option value="${CARD_KIND.TRAP}" ${viewer.kind === CARD_KIND.TRAP ? "selected" : ""}>Trampas</option><option value="${CARD_KIND.TOKEN}" ${viewer.kind === CARD_KIND.TOKEN ? "selected" : ""}>Tokens</option></select></label>
        <label>Estado<select id="card-viewer-status"><option value="all" ${viewer.status === "all" ? "selected" : ""}>Todos</option>${Object.entries(STATUS_LABELS).map(([status, label]) => `<option value="${status}" ${viewer.status === status ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
        <label>Funciona<select id="card-viewer-work-status"><option value="all" ${viewer.workStatus === "all" ? "selected" : ""}>Todos</option>${Object.entries(CARD_WORK_STATUS_LABELS).map(([status, label]) => `<option value="${status}" ${viewer.workStatus === status ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>Auditoria<select id="card-viewer-audit-status"><option value="all" ${viewer.auditStatus === "all" ? "selected" : ""}>Todos</option>${Object.entries(CARD_AUDIT_STATUS_LABELS).map(([status, label]) => `<option value="${status}" ${viewer.auditStatus === status ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      </div>
      <div class="card-viewer-toolbar-footer"><span id="card-viewer-count">${resultsLabel(results.count)}</span><div class="card-viewer-toolbar-actions"><button type="button" class="text-button ${viewer.favoriteOnly ? "active" : ""}" data-card-viewer-favorites-filter aria-pressed="${viewer.favoriteOnly}">★ Favoritos (${favoriteCount})</button><button type="button" class="text-button" data-card-viewer-reset>Limpiar filtros</button></div></div>
    </div>
    <div id="card-viewer-results" class="card-viewer-results"><div id="card-viewer-grid" class="card-viewer-grid">${results.cardsMarkup}</div><div id="card-viewer-pagination" class="card-viewer-pagination">${results.paginationMarkup}</div></div>
    ${selected ? popupMarkup(selected, cardMarkup, favorites, reviews, { hasPrevious: selectedIndex > 0, hasNext: selectedIndex >= 0 && selectedIndex < results.cards.length - 1 }) : ""}
  </section>`;
}

export function bindCardViewerEvents({ app, render, cardMarkup, openSandboxAudit }) {
  const viewer = app.cardViewer;
  if (!viewer) return;

  const toggleFavorite = (cardId, { modal = false } = {}) => {
    app.favoriteCardIds = toggleFavoriteCardId(app.favoriteCardIds, cardId);
    saveFavoriteCardIds(app.favoriteCardIds);
    if (modal) render();
    else refresh();
  };

  const setWorkStatus = (cardId, status, { modal = false } = {}) => {
    app.cardWorkStatuses = setCardWorkStatus(app.cardWorkStatuses, cardId, status);
    saveCardWorkStatuses(app.cardWorkStatuses);
    if (modal) render();
    else refresh();
  };

  const navigateSelected = (delta) => {
    const results = cardViewerResults({ ...viewer, favoriteCardIds: app.favoriteCardIds, cardWorkStatuses: app.cardWorkStatuses });
    const index = results.cards.findIndex((card) => Number(card.id) === Number(viewer.selectedCardId));
    const next = results.cards[index + delta];
    if (next) {
      viewer.selectedCardId = next.id;
      render();
    }
  };

  const bindTilesAndPages = () => {
    document.querySelectorAll("[data-card-viewer-card]").forEach((button) => button.addEventListener("click", () => {
      viewer.selectedCardId = Number(button.dataset.cardViewerCard);
      render();
    }));
    document.querySelectorAll("[data-card-viewer-favorite]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(Number(button.dataset.cardViewerFavorite), { modal: Boolean(button.closest(".card-viewer-modal")) });
    }));
    document.querySelectorAll("[data-card-viewer-work-status]").forEach((select) => select.addEventListener("change", (event) => {
      event.stopPropagation();
      setWorkStatus(Number(select.dataset.cardViewerWorkStatus), event.target.value, { modal: Boolean(select.closest(".card-viewer-modal")) });
    }));
    document.querySelectorAll("[data-card-viewer-page]").forEach((button) => button.addEventListener("click", () => {
      const page = Number(button.dataset.cardViewerPage);
      if (page > 0) {
        viewer.page = page;
        refresh();
      }
    }));
  };

  const refresh = () => {
    const results = renderCardViewerResults(viewer, { cardMarkup, favoriteCardIds: app.favoriteCardIds, cardWorkStatuses: app.cardWorkStatuses });
    const grid = document.querySelector("#card-viewer-grid");
    const pagination = document.querySelector("#card-viewer-pagination");
    const count = document.querySelector("#card-viewer-count");
    if (!grid || !pagination || !count) {
      render();
      return;
    }
    grid.innerHTML = results.cardsMarkup;
    pagination.innerHTML = results.paginationMarkup;
    count.textContent = resultsLabel(results.count);
    const favoritesFilter = document.querySelector("[data-card-viewer-favorites-filter]");
    if (favoritesFilter) {
      const favoriteCount = app.favoriteCardIds instanceof Set ? app.favoriteCardIds.size : 0;
      favoritesFilter.textContent = `★ Favoritos (${favoriteCount})`;
      favoritesFilter.classList.toggle("active", viewer.favoriteOnly === true);
      favoritesFilter.setAttribute("aria-pressed", String(viewer.favoriteOnly === true));
    }
    bindTilesAndPages();
  };

  document.querySelector("#card-viewer-search")?.addEventListener("input", (event) => {
    viewer.search = event.target.value;
    viewer.page = 1;
    refresh();
  });
  document.querySelector("#card-viewer-sort")?.addEventListener("change", (event) => { viewer.sort = event.target.value; viewer.page = 1; refresh(); });
  document.querySelector("#card-viewer-kind")?.addEventListener("change", (event) => { viewer.kind = event.target.value; viewer.page = 1; refresh(); });
  document.querySelector("#card-viewer-status")?.addEventListener("change", (event) => { viewer.status = event.target.value; viewer.page = 1; refresh(); });
  document.querySelector("#card-viewer-work-status")?.addEventListener("change", (event) => { viewer.workStatus = event.target.value; viewer.page = 1; refresh(); });
  document.querySelector("#card-viewer-audit-status")?.addEventListener("change", (event) => { viewer.auditStatus = event.target.value; viewer.page = 1; refresh(); });
  document.querySelector("[data-card-viewer-audit-card]")?.addEventListener("click", (event) => {
    if (typeof openSandboxAudit === "function") openSandboxAudit(Number(event.currentTarget.dataset.cardViewerAuditCard));
  });
  document.querySelector("[data-card-viewer-favorites-filter]")?.addEventListener("click", () => { viewer.favoriteOnly = !viewer.favoriteOnly; viewer.page = 1; render(); });
  document.querySelector("[data-card-viewer-reset]")?.addEventListener("click", () => { Object.assign(viewer, createDefaultCardViewerState()); render(); });
  document.querySelectorAll("[data-card-viewer-close]").forEach((element) => element.addEventListener("click", (event) => {
    if (event.target === element || event.currentTarget.matches("button")) {
      viewer.selectedCardId = null;
      render();
    }
  }));
  document.querySelector("[data-card-viewer-prev]")?.addEventListener("click", () => navigateSelected(-1));
  document.querySelector("[data-card-viewer-next]")?.addEventListener("click", () => navigateSelected(1));
  if (app.cardViewerKeyHandler) document.removeEventListener("keydown", app.cardViewerKeyHandler);
  app.cardViewerKeyHandler = (event) => {
    if (viewer.selectedCardId == null || !document.querySelector(".card-viewer-modal")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); navigateSelected(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); navigateSelected(1); }
    if (event.key === "Escape") { event.preventDefault(); viewer.selectedCardId = null; render(); }
  };
  document.addEventListener("keydown", app.cardViewerKeyHandler);
  bindTilesAndPages();
}

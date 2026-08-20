import { CARD_KIND, VALIDATION_STATUS } from "../engine/constants.js";
import { copyLimit, listStatus } from "../format/banlist.js";

function cardDetails(card) {
  if (!card) return "Carta no disponible";
  if (card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN) {
    const levelStr = card.level ? ` ★${card.level}` : "";
    const stats = `${card.atk ?? "?"}/${card.def ?? "?"}`;
    return `${stats}${levelStr} · ${card.race ?? "Monstruo"}`;
  }
  return `${card.spellType ?? card.trapType ?? card.effectFamily ?? card.kind} · ${card.kind}`;
}

function cardKindClass(card) {
  if (!card) return "kind-unknown";
  if (card.subtype === "Fusion" || card.kind === "FUSION") return "kind-fusion";
  if (card.kind === CARD_KIND.MONSTER) return "kind-monster";
  if (card.kind === CARD_KIND.SPELL) return "kind-spell";
  if (card.kind === CARD_KIND.TRAP) return "kind-trap";
  return "kind-other";
}

function banlistBadgeMarkup(limit) {
  if (limit === 0) return `<span class="builder-ban-badge forbidden" title="Prohibida (0 copias)">✕</span>`;
  if (limit === 1) return `<span class="builder-ban-badge limited" title="Limitada (1 copia)">1</span>`;
  if (limit === 2) return `<span class="builder-ban-badge semi-limited" title="Semi-limitada (2 copias)">2</span>`;
  return "";
}

export function builderCardTileMarkup(card, {
  count = 0,
  zoneCount = null,
  totalCount = null,
  limit = 3,
  index = null,
  zone = "main",
  draggable = true,
  disabled = false,
  catalog = false,
  selected = false,
  meta = null,
} = {}, { cardMarkup, esc, zoneLabel = "Main" } = {}) {
  if (!card) {
    return `<div class="builder-card-tile missing"><div class="builder-card-visual"><div class="card builder-card-missing"><span>?</span></div></div></div>`;
  }

  const name = card.name ?? "Carta no disponible";
  const kindClass = cardKindClass(card);
  const effectiveLimit = limit ?? copyLimit(card.id);
  const activeZoneCount = zoneCount !== null ? zoneCount : count;
  const activeTotalCount = totalCount !== null ? totalCount : count;
  const banBadge = banlistBadgeMarkup(effectiveLimit);
  const isMaxed = effectiveLimit === 0 || activeTotalCount >= effectiveLimit;

  const visual = typeof cardMarkup === "function"
    ? cardMarkup({ cardId: card.id, faceUp: true }, { compact: true, imageLoading: catalog ? "lazy" : "eager" })
    : `<div class="card builder-card-missing"><span>?</span></div>`;

  const copyBadge = catalog
    ? `<span class="builder-card-count catalog-count ${activeTotalCount > 0 ? "in-deck" : ""}" title="${activeTotalCount} de ${effectiveLimit} en el mazo">${activeTotalCount}/${effectiveLimit}</span>`
    : `<span class="builder-card-count deck-count" title="${activeZoneCount} copia(s) en ${esc(zoneLabel)}">×${activeZoneCount}</span>`;

  const quickActionBtn = catalog
    ? `<button type="button" class="builder-card-quick-btn add" data-builder-quick-add="${card.id}" data-builder-zone="${esc(zone)}" ${isMaxed ? "disabled" : ""} aria-label="Añadir ${esc(name)}" title="Añadir copia (+)">+</button>`
    : `<button type="button" class="builder-card-quick-btn remove" data-builder-quick-remove="${card.id}" data-builder-zone="${esc(zone)}" ${index !== null ? `data-remove-index="${index}"` : ""} aria-label="Quitar ${esc(name)}" title="Quitar copia (-)">×</button>`;

  const visualBlock = `
    <div class="builder-card-visual" aria-hidden="true">
      ${visual}
      ${banBadge}
      ${copyBadge}
      ${index !== null ? `<span class="builder-card-index">${String(index + 1).padStart(2, "0")}</span>` : ""}
      ${quickActionBtn}
    </div>
  `;

  const className = [
    "builder-card-tile",
    catalog ? "catalog-card-tile" : "deck-card-tile",
    kindClass,
    selected ? "is-selected" : "",
    isMaxed && catalog ? "is-maxed" : "",
    disabled ? "disabled" : ""
  ].filter(Boolean).join(" ");

  return `
    <div
      class="${className}"
      data-builder-select-card="${card.id}"
      data-card-id="${card.id}"
      data-drag-kind="${catalog ? "catalog" : "deck"}"
      data-drag-zone="${esc(zone)}"
      ${index !== null ? `data-drag-index="${index}"` : ""}
      draggable="${draggable && !disabled ? "true" : "false"}"
      role="button"
      tabindex="0"
      aria-label="${esc(name)} (${activeTotalCount}/${effectiveLimit})"
    >
      ${visualBlock}
    </div>
  `;
}

export function builderInspectorMarkup(card, {
  currentZone = "main",
  zoneCount = 0,
  totalCount = 0,
  limit = 3,
  isFavorite = false,
  esc = (s) => s,
  cardMarkup,
} = {}) {
  if (!card) {
    return `
      <div class="builder-inspector-dock is-empty">
        <div class="inspector-empty-content">
          <span class="inspector-hint-icon">✦</span>
          <div class="inspector-hint-text">
            <strong>Selecciona cualquier carta</strong>
            <small>Toca una carta del mazo o catálogo para ajustar copias (+ / -), moverla o ver sus detalles.</small>
          </div>
        </div>
      </div>
    `;
  }

  const name = card.name ?? "Carta";
  const kindClass = cardKindClass(card);
  const effectiveLimit = limit ?? copyLimit(card.id);
  const banBadge = banlistBadgeMarkup(effectiveLimit);
  const canAdd = effectiveLimit > 0 && totalCount < effectiveLimit;
  const canRemove = zoneCount > 0;
  const canRemoveAll = totalCount > 0;

  const visual = typeof cardMarkup === "function"
    ? cardMarkup({ cardId: card.id, faceUp: true }, { compact: true, imageLoading: "eager" })
    : `<div class="card builder-card-missing"><span>?</span></div>`;

  const statsDetails = card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN
    ? `<span class="inspector-stat-chip"><b>ATK</b> ${card.atk ?? 0}</span><span class="inspector-stat-chip"><b>DEF</b> ${card.def ?? 0}</span>${card.level ? `<span class="inspector-stat-chip level">★ ${card.level}</span>` : ""}<span class="inspector-stat-chip attr">${esc(card.attribute ?? "ATRIBUTO")}</span>`
    : `<span class="inspector-stat-chip type">${esc(card.spellType ?? card.trapType ?? card.kind)}</span>`;

  const zoneNames = { main: "Main Deck", fusion: "Fusion Deck", side: "Side Deck" };
  const currentZoneName = zoneNames[currentZone] ?? "Deck";

  return `
    <div class="builder-inspector-dock is-active ${kindClass}" role="region" aria-label="Inspector de ${esc(name)}">
      <div class="inspector-card-preview" data-builder-inspect-detail="${card.id}" title="Toca para ver ficha completa">
        <div class="inspector-visual-wrap">${visual}${banBadge}</div>
        <span class="inspector-zoom-hint">🔍 Detalle</span>
      </div>

      <div class="inspector-main-info">
        <div class="inspector-head">
          <strong class="inspector-title" title="${esc(name)}">${esc(name)}</strong>
          <span class="inspector-kind-badge ${kindClass}">${esc(card.race ?? card.spellType ?? card.trapType ?? card.kind)}</span>
        </div>
        <div class="inspector-stats-row">
          ${statsDetails}
        </div>
        <p class="inspector-effect-snippet" title="${esc(card.visibleText ?? card.text ?? "")}">
          ${esc(card.visibleText ?? card.text ?? "Sin texto de efecto.")}
        </p>
      </div>

      <div class="inspector-stepper-zone">
        <div class="stepper-zone-indicator">
          <span>ZONA ACTIVA: <b>${esc(currentZoneName.toUpperCase())}</b></span>
          <small>${totalCount} de ${effectiveLimit} copias en todo el mazo</small>
        </div>

        <div class="stepper-controls-row">
          <button
            type="button"
            class="builder-touch-btn stepper-btn remove-btn"
            data-builder-remove-copy="${card.id}"
            data-builder-zone="${esc(currentZone)}"
            ${canRemove ? "" : "disabled"}
            aria-label="Quitar una copia de ${esc(name)}"
          >
            <span class="btn-icon">−</span>
            <span class="btn-label">Quitar</span>
          </button>

          <div class="stepper-value-badge ${zoneCount > 0 ? "has-copies" : "empty"}">
            <span class="stepper-big-num">${zoneCount}</span>
            <span class="stepper-limit-label">/ ${effectiveLimit}</span>
          </div>

          <button
            type="button"
            class="builder-touch-btn stepper-btn add-btn"
            data-builder-add-copy="${card.id}"
            data-builder-zone="${esc(currentZone)}"
            ${canAdd ? "" : "disabled"}
            aria-label="Añadir una copia de ${esc(name)}"
          >
            <span class="btn-icon">+</span>
            <span class="btn-label">Añadir</span>
          </button>
        </div>

        <div class="inspector-actions-row">
          <button
            type="button"
            class="builder-action-chip"
            data-builder-remove-all="${card.id}"
            ${canRemoveAll ? "" : "disabled"}
            title="Retirar todas las copias de esta carta del mazo"
          >
            Retirar todas (${totalCount})
          </button>

          <button
            type="button"
            class="builder-action-chip highlight"
            data-builder-inspect-detail="${card.id}"
          >
            🔍 Ver ficha completa
          </button>

          <button
            type="button"
            class="builder-action-chip close"
            data-builder-clear-selection
            aria-label="Deseleccionar carta"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  `;
}

export function builderDetailModalMarkup(card, {
  currentZone = "main",
  zoneCount = 0,
  totalCount = 0,
  limit = 3,
  isFavorite = false,
  esc = (s) => s,
  cardMarkup,
} = {}) {
  if (!card) return "";

  const name = card.name ?? "Carta";
  const kindClass = cardKindClass(card);
  const effectiveLimit = limit ?? copyLimit(card.id);
  const banBadge = banlistBadgeMarkup(effectiveLimit);
  const canAdd = effectiveLimit > 0 && totalCount < effectiveLimit;
  const canRemove = zoneCount > 0;

  const visual = typeof cardMarkup === "function"
    ? cardMarkup({ cardId: card.id, faceUp: true }, { imageLoading: "eager" })
    : `<div class="card builder-card-missing"><span>?</span></div>`;

  const stats = card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN
    ? `<div class="card-viewer-stat"><span>ATK</span><strong>${card.atk ?? 0}</strong></div><div class="card-viewer-stat"><span>DEF</span><strong>${card.def ?? 0}</strong></div>${card.level ? `<div class="card-viewer-stat"><span>NIVEL</span><strong>★ ${card.level}</strong></div>` : ""}`
    : `<div class="card-viewer-stat wide"><span>TIPO</span><strong>${esc(card.spellType ?? card.trapType ?? card.kind)}</strong></div>`;

  return `
    <div class="card-viewer-modal-backdrop" data-builder-close-detail>
      <div class="card-viewer-modal-stage">
        <div class="card-viewer-modal builder-detail-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${esc(name)}">
          <button type="button" class="card-viewer-modal-close" data-builder-close-detail aria-label="Cerrar detalle">×</button>
          <div class="card-viewer-modal-visual">${visual}${banBadge}</div>
          <div class="card-viewer-modal-copy">
            <div class="card-viewer-modal-title">
              <span class="eyebrow">${esc(card.kind)} · ID ${esc(card.id)} · ${listStatus(card.id)}</span>
            </div>
            <h2>${esc(name)}</h2>
            <div class="card-viewer-stats">${stats}</div>
            <div class="card-viewer-detail-row"><span>Atributo</span><strong>${esc(card.attribute ?? "—")}</strong></div>
            <div class="card-viewer-detail-row"><span>Tipo / Subtipo</span><strong>${esc(card.race ?? card.spellType ?? card.trapType ?? "—")} ${card.subtype ? `(${esc(card.subtype)})` : ""}</strong></div>
            <div class="card-viewer-detail-row"><span>Límite Goat 2005</span><strong class="limit-status-${effectiveLimit}">${esc(listStatus(card.id))} (${effectiveLimit} máx.)</strong></div>
            <div class="card-viewer-effect">
              <span>EFECTO / TEXTO</span>
              <p>${esc(card.visibleText ?? card.text ?? "Sin texto registrado.")}</p>
            </div>
            <div class="builder-modal-stepper-bar">
              <div class="modal-stepper-info">
                <span>EN ${esc(currentZone.toUpperCase())}: <b>${zoneCount}</b> / ${effectiveLimit}</span>
                <small>Total en mazo: ${totalCount} copias</small>
              </div>
              <div class="modal-stepper-btns">
                <button
                  type="button"
                  class="builder-touch-btn stepper-btn remove-btn"
                  data-builder-remove-copy="${card.id}"
                  data-builder-zone="${esc(currentZone)}"
                  ${canRemove ? "" : "disabled"}
                >
                  − Quitar
                </button>
                <button
                  type="button"
                  class="builder-touch-btn stepper-btn add-btn"
                  data-builder-add-copy="${card.id}"
                  data-builder-zone="${esc(currentZone)}"
                  ${canAdd ? "" : "disabled"}
                >
                  + Añadir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

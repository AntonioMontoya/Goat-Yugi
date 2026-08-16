import { CARD_KIND } from "../engine/constants.js";

function cardKindClass(card) {
  if (!card) return "kind-unknown";
  if (card.fusion || card.kind === CARD_KIND.FUSION) return "kind-fusion";
  if (card.kind === CARD_KIND.MONSTER) return "kind-monster";
  if (card.kind === CARD_KIND.SPELL) return "kind-spell";
  if (card.kind === CARD_KIND.TRAP) return "kind-trap";
  return "kind-other";
}

function cardStatsBadge(card) {
  if (!card) return "";
  if (card.kind === CARD_KIND.MONSTER) {
    const level = card.level ? `★${card.level} ` : "";
    const attr = card.attribute ? `${card.attribute} ` : "";
    return `<span class="tile-stat-badge monster-stat">${level}${attr}ATK ${card.atk ?? "?"} / DEF ${card.def ?? "?"}</span>`;
  }
  if (card.kind === CARD_KIND.SPELL) {
    return `<span class="tile-stat-badge spell-stat">MAGIA ${card.spellType ? `· ${card.spellType}` : ""}</span>`;
  }
  if (card.kind === CARD_KIND.TRAP) {
    return `<span class="tile-stat-badge trap-stat">TRAMPA ${card.trapType ? `· ${card.trapType}` : ""}</span>`;
  }
  return `<span class="tile-stat-badge">${card.kind}</span>`;
}

export function builderCardTileMarkup(card, { count = 0, limit = null, index = null, zone = null, draggable = false, disabled = false, catalog = false, meta = null } = {}, { cardMarkup, esc, zoneLabel } = {}) {
  const name = card?.name ?? "Carta no disponible";
  const copyLabel = count === 1 ? "1 copia" : `${count} copias`;
  const kindClass = cardKindClass(card);
  const visual = card ? cardMarkup({ cardId: card.id, faceUp: true }, { compact: false, imageLoading: catalog ? "lazy" : "eager" }) : `<div class="card builder-card-missing"><span>?</span></div>`;
  const image = `<div class="builder-card-visual" aria-hidden="true" data-card-inspect="${card?.id ?? ""}">${visual}${index !== null ? `<span class="builder-card-index">${String(index + 1).padStart(2, "0")}</span>` : ""}<span class="builder-card-count" title="${esc(copyLabel)}">×${count}</span>${limit !== null ? `<span class="builder-card-limit">${count}/${limit}</span>` : ""}</div>`;
  const stats = cardStatsBadge(card);
  const content = `${image}<div class="builder-card-info"><span class="builder-card-name" title="${esc(name)}" data-card-inspect="${card?.id ?? ""}">${esc(name)}</span>${stats}</div>`;
  const className = `builder-card-tile ${kindClass} ${catalog ? "catalog-card-tile" : "deck-card-tile"} ${disabled ? "disabled" : ""}`;
  if (catalog) return `<div class="${className}" data-drag-kind="catalog" data-card-id="${card?.id ?? ""}">${content}<button type="button" class="builder-card-add" data-add-card="${card?.id ?? ""}" aria-label="Añadir ${esc(name)} al ${esc(zoneLabel)}">+</button></div>`;
  return `<div class="${className}" data-drag-kind="deck" data-card-id="${card?.id ?? ""}" data-drag-zone="${esc(zone ?? "main")}" data-drag-index="${index ?? 0}" draggable="${draggable ? "true" : "false"}">${content}<button type="button" class="builder-card-remove" data-remove-zone="${esc(zone ?? "main")}" data-remove-index="${index ?? 0}" aria-label="Retirar ${esc(name)}">×</button></div>`;
}

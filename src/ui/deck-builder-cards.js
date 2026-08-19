import { CARD_KIND } from "../engine/constants.js";

function cardDetails(card) {
  if (!card) return "Carta no disponible";
  return card.kind === CARD_KIND.MONSTER ? `${card.atk ?? "?"}/${card.def ?? "?"} · ${card.race ?? "Monstruo"}` : card.spellType ?? card.trapType ?? card.effectFamily ?? card.kind;
}

export function builderCardTileMarkup(card, { count = 0, limit = null, index = null, zone = null, draggable = false, disabled = false, catalog = false, meta = null } = {}, { cardMarkup, esc, zoneLabel } = {}) {
  const name = card?.name ?? "Carta no disponible";
  const copyLabel = count === 1 ? "1 copia" : `${count} copias`;
  const visual = card ? cardMarkup({ cardId: card.id, faceUp: true }, { compact: true, imageLoading: catalog ? "lazy" : "eager" }) : `<div class="card builder-card-missing"><span>?</span></div>`;
  const image = `<div class="builder-card-visual" aria-hidden="true">${visual}${index !== null ? `<span class="builder-card-index">${String(index + 1).padStart(2, "0")}</span>` : ""}<span class="builder-card-count" title="${esc(copyLabel)}">×${count}</span>${limit !== null ? `<span class="builder-card-limit">${count}/${limit}</span>` : ""}</div>`;
  const content = `${image}<span class="builder-card-name" title="${esc(name)}">${esc(name)}</span><small class="builder-card-meta">${esc(meta ?? cardDetails(card))}</small>`;
  const className = `builder-card-tile ${catalog ? "catalog-card-tile" : "deck-card-tile"} ${disabled ? "disabled" : ""}`;
  if (catalog) return `<button type="button" class="${className}" data-add-card="${card?.id ?? ""}" data-drag-kind="catalog" data-card-id="${card?.id ?? ""}" draggable="${disabled ? "false" : "true"}" ${disabled ? "disabled" : ""} aria-label="Añadir ${esc(name)} al ${esc(zoneLabel)}">${content}<span class="builder-card-add" aria-hidden="true">+</span></button>`;
  return `<div class="${className}" data-drag-kind="deck" data-card-id="${card?.id ?? ""}" data-drag-zone="${esc(zone ?? "main")}" data-drag-index="${index ?? 0}" draggable="${draggable ? "true" : "false"}">${content}<button type="button" class="builder-card-remove" data-remove-zone="${esc(zone ?? "main")}" data-remove-index="${index ?? 0}" aria-label="Retirar ${esc(name)}">×</button></div>`;
}

import { getCard } from "../engine/cards.js";

function playerLabel(player, manual, kind) {
  const zone = kind === "extra" ? "Extra Deck" : "Cementerio";
  if (manual) return `Jugador ${Number(player?.id ?? 0) + 1} · ${zone}`;
  return Number(player?.id) === 0 ? `Tu ${zone}` : `${zone} de Astra`;
}

function renderPreviewContent(instance, cardMarkup, escapeHtml) {
  if (!instance?.cardId) {
    return `<div class="pile-preview-empty">Selecciona una carta para ver sus detalles</div>`;
  }
  const card = getCard(instance.cardId);
  if (!card) {
    return `<div class="pile-preview-empty">Información de carta no disponible</div>`;
  }
  const isMonster = card.kind === "MONSTER" || card.kind === "TOKEN";
  let typeLabel = card.kind ?? "CARTA";
  if (isMonster) {
    typeLabel = [card.race, card.attribute].filter(Boolean).join(" · ") || card.kind;
  } else if (card.spellType) {
    typeLabel = `Mágica · ${card.spellType}`;
  } else if (card.trapType) {
    typeLabel = `Trampa · ${card.trapType}`;
  }

  let statsMarkup = "";
  if (isMonster) {
    statsMarkup = `
      <div class="pile-preview-stats">
        <span>ATK <strong>${escapeHtml(card.atk ?? 0)}</strong></span>
        ${Number.isFinite(Number(card.def)) ? `<span>DEF <strong>${escapeHtml(card.def)}</strong></span>` : ""}
        ${card.level ? `<span>★ <strong>${escapeHtml(card.level)}</strong></span>` : ""}
      </div>
    `;
  } else {
    statsMarkup = `
      <div class="pile-preview-stats">
        <span>TIPO <strong>${escapeHtml(card.spellType ?? card.trapType ?? card.kind)}</strong></span>
      </div>
    `;
  }

  return `
    <div class="pile-preview-art">${cardMarkup({ ...instance, faceUp: true })}</div>
    <div class="pile-preview-info">
      <div class="pile-preview-type">${escapeHtml(typeLabel)}</div>
      <h3 class="pile-preview-name">${escapeHtml(card.name ?? "Carta")}</h3>
      ${statsMarkup}
      <div class="pile-preview-text-box">
        <p class="pile-preview-text">${escapeHtml(card.text ?? "Esta carta no tiene texto de efecto.")}</p>
      </div>
    </div>
  `;
}

export function decorateDuelPiles({ view, cardMarkup, escapeHtml, onInspectCard = null }) {
  const piles = [...document.querySelectorAll('[data-pile="grave"], [data-pile="extra"]')];
  if (!view || typeof cardMarkup !== "function" || !piles.length) return;

  piles.forEach((pile) => {
    pile.onclick = () => {
      document.querySelector("[data-pile-dialog]")?.remove();

      const player = view.players?.find((candidate) => Number(candidate.id) === Number(pile.dataset.playerId));
      const kind = pile.dataset.pile === "extra" ? "extra" : "grave";
      const isExtra = kind === "extra";
      const cards = isExtra
        ? [...(player?.extraDeck ?? [])].filter((instance) => instance?.cardId)
        : [...(player?.graveyard ?? player?.grave ?? [])].reverse();
      const dialog = document.createElement("div");
      dialog.className = "pile-dialog";
      dialog.dataset.pileDialog = kind;
      const title = playerLabel(player, view.manual, kind);
      const visibleCount = isExtra ? Number(player?.extraCount ?? cards.length) : cards.length;
      const empty = isExtra && visibleCount > 0 && !cards.length
        ? "El Extra Deck rival permanece oculto durante esta partida."
        : isExtra ? "El Extra Deck está vacío." : "El Cementerio está vacío.";
      const partial = isExtra && cards.length !== visibleCount ? " · información parcial" : "";

      dialog.innerHTML = `<div class="pile-dialog-backdrop" data-pile-close aria-hidden="true"></div><section class="pile-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="pile-dialog-title"><header class="pile-dialog-header"><div class="pile-dialog-title-block"><span class="eyebrow">${isExtra ? "DUEL ZONE / EXTRA DECK" : "DUEL ZONE / PUBLIC"}</span><h2 id="pile-dialog-title">${escapeHtml(title)}</h2><small><strong class="pile-count-badge">${visibleCount} carta${visibleCount === 1 ? "" : "s"}</strong>${partial}</small></div><button type="button" class="pile-dialog-close" data-pile-close aria-label="Cerrar ${escapeHtml(title)}">×</button></header><div class="pile-dialog-body"><aside class="pile-card-preview" aria-label="Detalles de la carta seleccionada"></aside><div class="pile-card-list"></div></div></section>`;

      const closeDialog = () => {
        window.removeEventListener("keydown", onKey);
        dialog.remove();
        pile?.focus?.({ preventScroll: true });
      };

      const onKey = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeDialog();
        }
      };
      window.addEventListener("keydown", onKey);

      const list = dialog.querySelector(".pile-card-list");
      const preview = dialog.querySelector(".pile-card-preview");

      if (!cards.length) {
        if (list) list.innerHTML = `<div class="pile-empty">${escapeHtml(empty)}</div>`;
        if (preview) preview.innerHTML = `<div class="pile-preview-empty">No hay cartas para mostrar.</div>`;
      } else {
        const cardItems = [];

        const selectCard = (index) => {
          if (index < 0 || index >= cards.length) return;
          cardItems.forEach((el, i) => {
            el.classList.toggle("selected", i === index);
            el.setAttribute("aria-selected", i === index ? "true" : "false");
          });
          if (preview) {
            preview.innerHTML = renderPreviewContent(cards[index], cardMarkup, escapeHtml);
          }
        };

        cards.forEach((instance, index) => {
          const card = getCard(instance.cardId);
          const item = document.createElement("article");
          item.className = "pile-card-item" + (index === 0 ? " selected" : "");
          item.tabIndex = 0;
          item.setAttribute("role", "button");
          item.setAttribute("aria-selected", index === 0 ? "true" : "false");
          item.setAttribute("aria-label", `Ver ${card?.name ?? "carta"}`);

          item.addEventListener("click", () => {
            selectCard(index);
          });
          item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectCard(index);
            }
          });

          item.innerHTML = `<div class="pile-card-visual">${cardMarkup({ ...instance, faceUp: true }, { compact: true })}</div><div><strong>${escapeHtml(card?.name ?? "Carta")}</strong><small>${escapeHtml(card?.kind ?? "Carta")}</small></div>`;
          list?.append(item);
          cardItems.push(item);
        });

        if (preview) {
          preview.innerHTML = renderPreviewContent(cards[0], cardMarkup, escapeHtml);
        }
      }

      dialog.addEventListener("click", (event) => {
        if (event?.target?.closest?.("[data-pile-close]")) {
          event.preventDefault?.();
          closeDialog();
        }
      });

      document.body.append(dialog);
      dialog.querySelector(".pile-dialog-close")?.focus?.({ preventScroll: true });
    };
  });
}

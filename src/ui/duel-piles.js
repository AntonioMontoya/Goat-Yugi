import { getCard } from "../engine/cards.js";

function playerLabel(player, manual, kind) {
  const zone = kind === "extra" ? "Extra Deck" : "Cementerio";
  if (manual) return `Jugador ${Number(player?.id ?? 0) + 1} · ${zone}`;
  return Number(player?.id) === 0 ? `Tu ${zone}` : `${zone} de Astra`;
}

export function decorateDuelPiles({ view, cardMarkup, escapeHtml, onInspectCard = null }) {
  document.querySelector("[data-pile-dialog]")?.remove();
  const piles = [...document.querySelectorAll('[data-pile="grave"], [data-pile="extra"]')];
  if (!view || typeof cardMarkup !== "function" || !piles.length) return;
  piles.forEach((pile) => pile.addEventListener("click", () => {
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
    dialog.innerHTML = `<div class="pile-dialog-backdrop" data-pile-close></div><section class="pile-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="pile-dialog-title"><header><div><span class="eyebrow">${isExtra ? "DUEL ZONE / EXTRA DECK" : "DUEL ZONE / PUBLIC"}</span><h2 id="pile-dialog-title">${escapeHtml(title)}</h2><small><strong class="pile-count-badge">${visibleCount} carta${visibleCount === 1 ? "" : "s"}</strong>${partial}</small></div><button type="button" class="pile-dialog-close" data-pile-close aria-label="Cerrar ${escapeHtml(title)}">×</button></header><div class="pile-card-list"></div></section>`;
    const list = dialog.querySelector(".pile-card-list");
    if (!cards.length) list.innerHTML = `<div class="pile-empty">${escapeHtml(empty)}</div>`;
    cards.forEach((instance, index) => {
      const card = getCard(instance.cardId);
      const item = document.createElement("article");
      item.className = "pile-card-item" + (index === 0 ? " pile-top-card" : "");
      if (typeof onInspectCard === "function") {
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Inspeccionar ${card?.name ?? "carta"}`);
        const inspect = () => onInspectCard({ ...instance, faceUp: true }, player);
        item.addEventListener("click", inspect);
        item.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(); } });
      }
      item.innerHTML = `<div class="pile-card-visual">${cardMarkup({ ...instance, faceUp: true }, { compact: true })}</div><div><strong>${escapeHtml(card?.name ?? "Carta")}</strong><small>${escapeHtml(card?.kind ?? "Carta")} · ${escapeHtml(card?.text ?? "")}</small></div>`;
      list.append(item);
    });
    dialog.addEventListener("click", (event) => { if (event.target.closest("[data-pile-close]")) dialog.remove(); });
    document.body.append(dialog);
    dialog.querySelector(".pile-dialog-close")?.focus();
  }));
}

import { SPRITE_MENU_ITEMS } from "./navigation.js";
import { renderHomeDuelistWidget } from "./profile-page.js";

export function renderHomePage({ app = null, escapeHtml, savedDuel = null }) {
  const items = SPRITE_MENU_ITEMS.map((item, index) => `
    <button type="button" class="sprite-menu-item" data-index="${index}" data-mode-target="${item.mode}" aria-label="${escapeHtml(item.label)}">
      <span class="menu-sigil" aria-hidden="true"><img src="./sprites/${item.sprite}.png" alt="" draggable="false" /></span>
      <span class="menu-item-copy"><strong>${escapeHtml(item.label)}</strong><small>${String(index + 1).padStart(2, "0")}</small></span>
    </button>`).join("");

  const duelistWidget = app ? renderHomeDuelistWidget({ app, esc: escapeHtml }) : "";

  const savedBanner = savedDuel ? `
    <aside class="home-saved-duel-banner" role="status" aria-label="Partida guardada">
      <div class="saved-duel-badge">⚔️ PARTIDA EN CURSO</div>
      <div class="saved-duel-details">
        <span class="saved-duel-title">vs <strong>${escapeHtml(savedDuel.opponentName ?? "Rival")}</strong></span>
        <span class="saved-duel-sub">${savedDuel.isRanked ? "Clasificatoria (Ranked)" : "Casual"} · Turno ${savedDuel.turn ?? 1}</span>
      </div>
      <div class="saved-duel-actions">
        <button type="button" class="btn-resume-duel" data-action="resume-saved-duel" aria-label="Reanudar partida en curso">Reanudar</button>
        <button type="button" class="btn-discard-duel" data-action="discard-saved-duel" aria-label="Descartar partida en curso">Descartar</button>
      </div>
    </aside>` : "";

  return `<section class="home-page" aria-labelledby="home-title">
    <canvas id="home-particles" aria-hidden="true"></canvas>
    <div class="home-atmosphere" aria-hidden="true"></div>
    ${duelistWidget}
    <img src="./sprites/Sprite_Estandarte.png" class="home-standard home-standard-left" alt="" aria-hidden="true" />
    <img src="./sprites/Sprite_Estandarte.png" class="home-standard home-standard-right" alt="" aria-hidden="true" />
    <div class="home-title-banner">
      <img src="./sprites/Sprite_Estandarte2.png" alt="" aria-hidden="true" />
      <span>SIMULADOR LOCAL · FORMATO 2005</span>
      <h1 id="home-title">GOAT LOCAL LAB</h1>
    </div>
    ${savedBanner}
    <div class="sprite-carousel-shell">
      <button type="button" class="carousel-nav carousel-prev" id="btn-prev" aria-label="Anterior"></button>
      <div class="sprite-carousel" role="listbox" aria-label="Modos de juego">${items}</div>
      <button type="button" class="carousel-nav carousel-next" id="btn-next" aria-label="Siguiente"></button>
      <div class="sprite-menu-info" aria-live="polite">
        <span class="selected-mode-kicker">SELECCIÓN ACTUAL</span>
        <h2 id="sprite-menu-title">JUGAR</h2>
        <p id="sprite-menu-desc">Prepara un duelo local o enfréntate a un bot.</p>
      </div>
      <img src="./sprites/Sprite_Ornamentacion9.png" class="carousel-rule carousel-rule-bottom" alt="" aria-hidden="true" />
    </div>
    <div class="home-controls" aria-label="Controles del menú"><span><kbd>←</kbd><kbd>→</kbd> Elegir</span><span><kbd>Enter</kbd> Abrir</span></div>
  </section>`;
}

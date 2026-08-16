import { SPRITE_MENU_ITEMS } from "./navigation.js";

export function renderHomePage({ escapeHtml }) {
  const items = SPRITE_MENU_ITEMS.map((item, index) => `
    <button type="button" class="sprite-menu-item" data-index="${index}" data-mode-target="${item.mode}" aria-label="${escapeHtml(item.label)}">
      <span class="menu-sigil" aria-hidden="true"><img src="./sprites/${item.sprite}.png" alt="" draggable="false" /></span>
      <span class="menu-item-copy"><strong>${escapeHtml(item.label)}</strong><small>${String(index + 1).padStart(2, "0")}</small></span>
    </button>`).join("");

  return `<section class="home-page" aria-labelledby="home-title">
    <canvas id="home-particles" aria-hidden="true"></canvas>
    <div class="home-atmosphere" aria-hidden="true"></div>
    <img src="./sprites/Sprite_Estandarte.png" class="home-standard home-standard-left" alt="" aria-hidden="true" />
    <img src="./sprites/Sprite_Estandarte.png" class="home-standard home-standard-right" alt="" aria-hidden="true" />
    <div class="home-title-banner">
      <img src="./sprites/Sprite_Estandarte2.png" alt="" aria-hidden="true" />
      <span>SIMULADOR LOCAL · FORMATO 2005</span>
      <h1 id="home-title">GOAT LOCAL LAB</h1>
    </div>
    <div class="sprite-carousel-shell">
      <button type="button" class="carousel-nav carousel-prev" id="btn-prev" aria-label="Anterior"></button>
      <div class="sprite-carousel" role="listbox" aria-label="Modos de juego">${items}</div>
      <button type="button" class="carousel-nav carousel-next" id="btn-next" aria-label="Siguiente"></button>
      <div class="sprite-menu-info" aria-live="polite">
        <span class="selected-mode-kicker">SELECCIÓN ACTUAL</span>
        <h2 id="sprite-menu-title">JUGAR</h2>
        <p id="sprite-menu-desc">Prepara un duelo local o enfréntate a un bot.</p>
        <button type="button" class="home-enter-btn" id="btn-enter-mode">ENTRAR AL MODO</button>
      </div>
      <img src="./sprites/Sprite_Ornamentacion9.png" class="carousel-rule carousel-rule-bottom" alt="" aria-hidden="true" />
    </div>
    <div class="home-controls" aria-label="Controles del menú"><span><kbd>←</kbd><kbd>→</kbd> Elegir</span><span><kbd>Enter</kbd> o Tocar para Abrir</span></div>
  </section>`;
}

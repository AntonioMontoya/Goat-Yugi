export function renderAppShell({ app, content, menu, rank, escapeHtml }) {
  const isDuel = app.mode === "duel";
  const isHome = app.mode === "home";
  const isSubmenu = !isDuel && !isHome;
  
  return `<div class="app-shell section-${app.mode} ${isHome ? 'mode-home' : isDuel ? 'mode-duel' : 'mode-sub'}">
    ${!isDuel ? `<header class="topbar sprite-topbar">
      <img src="./sprites/Sprite_Ornamentación6.png" class="sprite-img sprite-topbar-ornament" alt="" aria-hidden="true" />
      <button class="brand sprite-brand" data-home aria-label="Ir al inicio">
        <img src="./sprites/Sprite_Ornamentacion.png" class="sprite-img brand-icon" alt="" />
        <span><strong>GOAT LOCAL LAB</strong><small>2005 TCG</small></span>
      </button>
      ${menu}
      <div class="top-status"><span class="live-dot"></span> OFFLINE <span class="separator">/</span> ${rank}</div>
    </header>` : ''}
    ${isSubmenu ? '<canvas id="submenu-particles" aria-hidden="true"></canvas><div class="submenu-atmosphere" aria-hidden="true"></div>' : ''}
    ${isDuel ? '<canvas id="duel-particles-dust" class="duel-particle-layer" aria-hidden="true"></canvas><canvas id="duel-particles-embers" class="duel-particle-layer" aria-hidden="true"></canvas>' : ''}
    <main id="main-content" tabindex="-1">${content}</main>
    <div class="toast" role="status">${escapeHtml(app.toast)}</div>
    ${!isDuel && !isHome ? `<footer class="footer-bar sprite-footer"><img class="sprite-footer-plate" src="./sprites/Sprite_Submenu11.png" alt="" aria-hidden="true" /><div class="sprite-footer-copy"><span>LOCAL ONLY · SIN SERVIDOR</span><span>GOAT TCG APRIL 2005</span><span class="footer-right">RULES ENGINE: <b>${app.duelError ? "NO DISPONIBLE" : "OCGCORE / GOAT"}</b></span></div></footer>` : ''}
  </div>`;
}

export function navigateApp({ app, mode, parseMode, modeHash, leaveFullscreen, rerender, history = true, focus = true }) {
  app.mode = parseMode(`#/${mode}`);
  if (app.mode !== "duel") leaveFullscreen();
  app.menuOpen = false;
  const hash = modeHash(app.mode);
  if (history && window.location.hash !== hash) window.history.pushState({ mode: app.mode }, "", hash);
  rerender();
  window.scrollTo({ top: 0, behavior: "auto" });
  if (focus) window.requestAnimationFrame(() => document.querySelector("#main-content")?.focus({ preventScroll: true }));
}

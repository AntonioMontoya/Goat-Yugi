export const MENU_ITEMS = Object.freeze([
  Object.freeze({ mode: "home", label: "Inicio", icon: "HOME", sprite: "Sprite_Menu", desc: "Volver al menú principal." }),
  Object.freeze({ mode: "play", label: "Jugar", icon: "PLAY", sprite: "Sprite_Menu6", desc: "Preparar la caja de cartas para batalla local o contra bots." }),
  Object.freeze({ mode: "sandbox", label: "Modo Prueba", icon: "LAB", sprite: "Sprite_Menu8", desc: "Experimentación mágica: define cartas, posiciones y LP exactos." }),
  Object.freeze({ mode: "card-viewer", label: "Cartas", icon: "CARD", sprite: "Sprite_Menu4", desc: "Explorar la colección completa y consultar rulings." }),
  Object.freeze({ mode: "deck-builder", label: "Mazos", icon: "DECK", sprite: "Sprite_Menu2", desc: "Gestión de decks y validación de formato 2005." }),
  Object.freeze({ mode: "bots", label: "Bots", icon: "BOT", sprite: "Sprite_Menu", desc: "Desafiar oponentes IA y configurar perfiles." }),
  Object.freeze({ mode: "ladder", label: "Ranked", icon: "RANK", sprite: "Sprite_Menu5", desc: "Competición local y registro de rango." }),
  Object.freeze({ mode: "settings", label: "Ajustes", icon: "SET", sprite: "Sprite_Menu7", desc: "Configuración visual, animaciones y opciones del sistema." }),
]);

export const AUXILIARY_ITEMS = Object.freeze([
  Object.freeze({ mode: "training", label: "Entrenamiento", icon: "TRAIN", sprite: "Sprite_Menu3", desc: "Conocimiento y estudio: entrenar nuevos modelos de IA." }),
  Object.freeze({ mode: "research", label: "Especificación", icon: "INFO", sprite: "Sprite_Menu3", desc: "Información técnica." }),
]);

export const SECTION_ITEMS = Object.freeze([
  ...MENU_ITEMS.filter((item) => item.mode !== "home"),
]);

export const SPRITE_MENU_ITEMS = Object.freeze(
  [...SECTION_ITEMS],
);

const MODES = new Set([...MENU_ITEMS, ...AUXILIARY_ITEMS].map((item) => item.mode));
// Duel is an internal route: it must be reachable after starting a match but
// should not appear as a persistent top-level menu item.
const ROUTE_MODES = new Set([...MODES, "duel"]);

export function isMenuMode(mode) {
  return MODES.has(mode);
}

export function modeFromHash(hash = "") {
  const candidate = String(hash).replace(/^#\/?/, "").trim();
  return ROUTE_MODES.has(candidate) ? candidate : "home";
}

export function hashForMode(mode) {
  return `#/${ROUTE_MODES.has(mode) ? mode : "home"}`;
}

export function menuMarkup({ activeMode, open, escapeHtml }) {
  const activeIndex = Math.max(0, SECTION_ITEMS.findIndex((item) => item.mode === activeMode));
  const current = SECTION_ITEMS[activeIndex] ?? SECTION_ITEMS[0];
  const previous = SECTION_ITEMS[(activeIndex - 1 + SECTION_ITEMS.length) % SECTION_ITEMS.length];
  const next = SECTION_ITEMS[(activeIndex + 1) % SECTION_ITEMS.length];
  const buttons = [MENU_ITEMS[0], ...SECTION_ITEMS].map(({ mode, label, sprite, desc }, index) => {
    const selected = activeMode === mode;
    return `<button type="button" class="nav-item ${selected ? "active" : ""}" data-mode="${mode}" ${selected ? 'aria-current="page"' : ""}>
      <img src="../sprites/${sprite}.png" alt="" aria-hidden="true" />
      <span class="nav-item-copy"><small>${String(index + 1).padStart(2, "0")}</small><strong>${escapeHtml(label)}</strong><em>${escapeHtml(desc)}</em></span>
    </button>`;
  }).join("");

  return `<div class="section-switcher" aria-label="Cambiar de sección">
      <button type="button" class="section-arrow" data-mode="${previous.mode}" aria-label="Anterior: ${escapeHtml(previous.label)}"><span aria-hidden="true">&lsaquo;</span></button>
      <button type="button" class="section-current" data-menu-toggle aria-controls="main-menu" aria-expanded="${open}">
        <img src="../sprites/${current.sprite}.png" alt="" aria-hidden="true" />
        <span><small>SECCIÓN ${activeIndex + 1} / ${SECTION_ITEMS.length}</small><strong>${escapeHtml(current.label)}</strong></span>
        <b aria-hidden="true">${open ? "×" : "▾"}</b>
      </button>
      <button type="button" class="section-arrow" data-mode="${next.mode}" aria-label="Siguiente: ${escapeHtml(next.label)}"><span aria-hidden="true">&rsaquo;</span></button>
    </div>
    <button type="button" class="home-control" data-home aria-label="Volver al menú principal"><span aria-hidden="true">⌂</span><b>Inicio</b></button>
    <nav class="main-nav" id="main-menu" aria-label="Todas las secciones" data-open="${open}">
      <div class="main-nav-head"><span>IR A UNA SECCIÓN</span><button type="button" data-menu-toggle aria-label="Cerrar secciones">×</button></div>
      <div class="main-nav-grid">${buttons}</div>
    </nav>`;
}

export function bindMenuKeyboard(root = document) {
  const menu = root.querySelector("#main-menu");
  const items = [...(menu?.querySelectorAll("[data-mode]") ?? [])];
  items.forEach((item, index) => item.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      item.click();
      return;
    }
    const columns = 2;
    let target = null;
    if (event.key === "ArrowLeft") target = (index - 1 + items.length) % items.length;
    if (event.key === "ArrowRight") target = (index + 1) % items.length;
    if (event.key === "ArrowUp") target = (index - columns + items.length) % items.length;
    if (event.key === "ArrowDown") target = (index + columns) % items.length;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = items.length - 1;
    if (target === null) return;
    event.preventDefault();
    items[target]?.focus({ preventScroll: true });
  }));
}

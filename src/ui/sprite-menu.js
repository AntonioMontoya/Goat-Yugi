import { navigateApp } from "./app-shell.js";
import { ParticleSystem } from "./particles.js";
import { SPRITE_MENU_ITEMS, hashForMode, modeFromHash } from "./navigation.js";

let particles = null;
let selectedIndex = Math.max(0, SPRITE_MENU_ITEMS.findIndex((item) => item.mode === "play"));
let keyHandler = null;
let menuGestureCleanup = null;

function relativeSlot(index) {
  const total = SPRITE_MENU_ITEMS.length;
  let distance = (index - selectedIndex + total) % total;
  if (distance > total / 2) distance -= total;
  return distance;
}

function updateCarouselVisuals({ focus = false } = {}) {
  const items = [...document.querySelectorAll(".sprite-menu-item")];
  items.forEach((item, index) => {
    const slot = relativeSlot(index);
    const visible = Math.abs(slot) <= 2;
    item.dataset.slot = visible ? String(slot) : "hidden";
    item.classList.toggle("selected", slot === 0);
    item.setAttribute("aria-selected", String(slot === 0));
    item.setAttribute("aria-hidden", String(!visible));
    item.tabIndex = slot === 0 ? 0 : -1;
  });

  const selectedItem = SPRITE_MENU_ITEMS[selectedIndex];
  const title = document.getElementById("sprite-menu-title");
  const description = document.getElementById("sprite-menu-desc");
  const enterBtn = document.getElementById("btn-enter-mode");
  if (title) title.textContent = selectedItem.label.toUpperCase();
  if (description) description.textContent = selectedItem.desc;
  if (enterBtn) enterBtn.textContent = `ENTRAR A ${selectedItem.label.toUpperCase()}`;
  if (focus) items[selectedIndex]?.focus({ preventScroll: true });
}

function selectOffset(offset, options) {
  selectedIndex = (selectedIndex + offset + SPRITE_MENU_ITEMS.length) % SPRITE_MENU_ITEMS.length;
  updateCarouselVisuals(options);
}

function openSelected({ app, rerender, leaveFullscreen }) {
  const mode = SPRITE_MENU_ITEMS[selectedIndex].mode;
  destroySpriteMenu();
  navigateApp({ app, mode, parseMode: modeFromHash, modeHash: hashForMode, leaveFullscreen, rerender });
}

export function initSpriteMenu(app, rerender, leaveFullscreen) {
  destroySpriteMenu();
  const canvas = document.getElementById("home-particles");
  if (canvas && app.settings.motionLevel !== "off") {
    particles = new ParticleSystem(canvas, { type: "gold", density: 40, direction: "up", maxSize: 2, minSpeed: 0.08, maxSpeed: 0.3 });
    particles.init();
  }

  selectedIndex = Math.max(0, SPRITE_MENU_ITEMS.findIndex((item) => item.mode === "play"));
  updateCarouselVisuals();

  keyHandler = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target?.matches?.("input, select, textarea, [contenteditable='true']")) return;
    if (document.querySelector('[role="dialog"]')) return;
    if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      selectOffset(-1, { focus: true });
    } else if (["ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      selectOffset(1, { focus: true });
    } else if (event.key === "Enter") {
      event.preventDefault();
      openSelected({ app, rerender, leaveFullscreen });
    }
  };
  document.addEventListener("keydown", keyHandler);

  // Single-tap to open mode immediately on touch
  document.querySelectorAll(".sprite-menu-item").forEach((item, index) => {
    item.addEventListener("click", () => {
      selectedIndex = index;
      openSelected({ app, rerender, leaveFullscreen });
    });
  });

  document.getElementById("btn-enter-mode")?.addEventListener("click", () => {
    openSelected({ app, rerender, leaveFullscreen });
  });

  document.getElementById("btn-prev")?.addEventListener("click", () => selectOffset(-1, { focus: true }));
  document.getElementById("btn-next")?.addEventListener("click", () => selectOffset(1, { focus: true }));

  const carousel = document.querySelector(".sprite-carousel-shell");
  let touchStartX = 0;
  let touchStartY = 0;

  const onTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  };

  const onTouchEnd = (e) => {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
      selectOffset(dx > 0 ? -1 : 1, { focus: false });
    }
  };

  carousel?.addEventListener("touchstart", onTouchStart, { passive: true });
  carousel?.addEventListener("touchend", onTouchEnd, { passive: true });

  menuGestureCleanup = () => {
    carousel?.removeEventListener("touchstart", onTouchStart);
    carousel?.removeEventListener("touchend", onTouchEnd);
  };
}

export function destroySpriteMenu() {
  particles?.destroy();
  particles = null;
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = null;
  menuGestureCleanup?.();
  menuGestureCleanup = null;
}

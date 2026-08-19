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
  if (title) title.textContent = selectedItem.label.toUpperCase();
  if (description) description.textContent = selectedItem.desc;
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
    particles = new ParticleSystem(canvas, { type: "gold", density: 54, direction: "up", maxSize: 2, minSpeed: 0.08, maxSpeed: 0.34 });
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

  document.querySelectorAll(".sprite-menu-item").forEach((item, index) => {
    item.addEventListener("click", () => {
      if (selectedIndex === index) openSelected({ app, rerender, leaveFullscreen });
      else {
        selectedIndex = index;
        updateCarouselVisuals({ focus: true });
      }
    });
  });
  document.getElementById("btn-prev")?.addEventListener("click", () => selectOffset(-1, { focus: true }));
  document.getElementById("btn-next")?.addEventListener("click", () => selectOffset(1, { focus: true }));

  const carousel = document.querySelector(".sprite-carousel-shell");
  let pointerStart = null;
  let wheelLocked = false;
  const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
  const onPointerUp = (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) selectOffset(dx > 0 ? -1 : 1, { focus: true });
  };
  const onWheel = (event) => {
    if (wheelLocked || Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 18) return;
    event.preventDefault();
    wheelLocked = true;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    selectOffset(delta > 0 ? 1 : -1, { focus: true });
    window.setTimeout(() => { wheelLocked = false; }, 380);
  };
  carousel?.addEventListener("pointerdown", onPointerDown);
  carousel?.addEventListener("pointerup", onPointerUp);
  carousel?.addEventListener("pointercancel", () => { pointerStart = null; });
  carousel?.addEventListener("wheel", onWheel, { passive: false });
  menuGestureCleanup = () => {
    carousel?.removeEventListener("pointerdown", onPointerDown);
    carousel?.removeEventListener("pointerup", onPointerUp);
    carousel?.removeEventListener("wheel", onWheel);
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

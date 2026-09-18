import { navigateApp } from "./app-shell.js";
import { ParticleSystem } from "./particles.js";
import { SPRITE_MENU_ITEMS, hashForMode, modeFromHash } from "./navigation.js";

let particles = null;
let selectedIndex = Math.max(0, SPRITE_MENU_ITEMS.findIndex((item) => item.mode === "ladder"));
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

  selectedIndex = Math.max(0, SPRITE_MENU_ITEMS.findIndex((item) => item.mode === "ladder"));
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

  const carousel = document.querySelector(".sprite-carousel-shell");
  const carouselTrack = carousel?.querySelector(".sprite-carousel");

  let pointerStart = null;
  let isDragging = false;
  let preventItemClick = false;
  let wheelAccumulator = 0;
  let wheelTimer = null;

  document.querySelectorAll(".sprite-menu-item").forEach((item, index) => {
    item.addEventListener("click", (e) => {
      if (preventItemClick) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (selectedIndex === index) openSelected({ app, rerender, leaveFullscreen });
      else {
        selectedIndex = index;
        updateCarouselVisuals({ focus: true });
      }
    });
  });
  document.getElementById("btn-prev")?.addEventListener("click", () => selectOffset(-1, { focus: true }));
  document.getElementById("btn-next")?.addEventListener("click", () => selectOffset(1, { focus: true }));

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0 && event.pointerType === "mouse") return;
    if (event.target?.closest?.(".carousel-nav")) return;
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastTime: Date.now(),
      id: event.pointerId
    };
    isDragging = false;
  };

  const onPointerMove = (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;

    if (!isDragging) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        isDragging = true;
        preventItemClick = true;
        try { carousel?.setPointerCapture(event.pointerId); } catch (_) {}
      }
    }

    if (isDragging && carouselTrack) {
      pointerStart.lastX = event.clientX;
      pointerStart.lastTime = Date.now();
      carouselTrack.style.transition = "none";
      carouselTrack.style.transform = `translateX(${dx * 0.75}px)`;
    }
  };

  const onPointerUp = (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dt = Math.max(1, Date.now() - pointerStart.lastTime);
    const vx = (event.clientX - pointerStart.lastX) / dt;
    const wasDragging = isDragging;

    if (carousel?.hasPointerCapture?.(event.pointerId)) {
      try { carousel.releasePointerCapture(event.pointerId); } catch (_) {}
    }

    pointerStart = null;
    isDragging = false;

    if (carouselTrack) {
      carouselTrack.style.transition = "transform 0.28s cubic-bezier(0.2, 0.82, 0.22, 1)";
      carouselTrack.style.transform = "";
    }

    if (wasDragging) {
      if (dx < -36 || vx < -0.22) {
        selectOffset(1, { focus: true });
      } else if (dx > 36 || vx > 0.22) {
        selectOffset(-1, { focus: true });
      }
      setTimeout(() => { preventItemClick = false; }, 80);
    }
  };

  const onPointerCancel = (event) => {
    if (carouselTrack) {
      carouselTrack.style.transition = "";
      carouselTrack.style.transform = "";
    }
    pointerStart = null;
    isDragging = false;
    setTimeout(() => { preventItemClick = false; }, 80);
  };

  const onWheel = (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 4) return;
    event.preventDefault();
    wheelAccumulator += delta;
    if (Math.abs(wheelAccumulator) >= 36) {
      const step = wheelAccumulator > 0 ? 1 : -1;
      wheelAccumulator = 0;
      selectOffset(step, { focus: true });
    }
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { wheelAccumulator = 0; }, 160);
  };

  carousel?.addEventListener("pointerdown", onPointerDown);
  carousel?.addEventListener("pointermove", onPointerMove);
  carousel?.addEventListener("pointerup", onPointerUp);
  carousel?.addEventListener("pointercancel", onPointerCancel);
  carousel?.addEventListener("wheel", onWheel, { passive: false });

  menuGestureCleanup = () => {
    carousel?.removeEventListener("pointerdown", onPointerDown);
    carousel?.removeEventListener("pointermove", onPointerMove);
    carousel?.removeEventListener("pointerup", onPointerUp);
    carousel?.removeEventListener("pointercancel", onPointerCancel);
    carousel?.removeEventListener("wheel", onWheel);
    clearTimeout(wheelTimer);
    if (carouselTrack) {
      carouselTrack.style.transition = "";
      carouselTrack.style.transform = "";
    }
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

/**
 * iPad Touch & Gesture Controller (Singleton)
 * Provides long-press inspection, haptic feedback, tap-outside dismissals,
 * and Safari WebKit touch audio initialization without memory leaks or duplicate listeners.
 */

let isInitialized = false;
let touchTimer = null;
let touchStartPos = { x: 0, y: 0 };
let activeTouchCard = null;
let isClearingSelection = false;

const context = {
  app: null,
  render: null,
  onInspectCard: null,
  onClearSelection: null,
  duelAudio: null,
};

export function initIpadTouchController(options = {}) {
  // Update the latest callbacks & state references
  Object.assign(context, options);

  if (isInitialized) return;
  isInitialized = true;

  // 1. Audio context unlock on first touch
  const unlockAudio = () => {
    if (context.duelAudio?.unlock) {
      void context.duelAudio.unlock();
    }
  };
  window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
  window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });

  // 2. Prevent double-tap zoom on UI buttons/cards in iOS Safari
  let lastTap = 0;
  document.addEventListener("touchend", (event) => {
    const currentTime = Date.now();
    const tapLength = currentTime - lastTap;
    const target = event.target;
    if (tapLength < 300 && tapLength > 0 && !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName)) {
      event.preventDefault();
    }
    lastTap = currentTime;
  }, { passive: false });

  // 3. Long-press on cards to inspect details (420ms)
  let holdVisualTimer = null;
  document.addEventListener("pointerdown", (event) => {
    const cardEl = event.target.closest?.("[data-card-uid], [data-card-id]");
    if (!cardEl) return;

    const cardId = cardEl.dataset.cardId || cardEl.dataset.cardUid;
    touchStartPos = { x: event.clientX, y: event.clientY };
    activeTouchCard = cardEl;

    if (touchTimer) clearTimeout(touchTimer);
    if (holdVisualTimer) clearTimeout(holdVisualTimer);

    holdVisualTimer = setTimeout(() => {
      if (activeTouchCard === cardEl) {
        cardEl.classList.add("touch-holding");
      }
    }, 180);

    touchTimer = setTimeout(() => {
      if (activeTouchCard === cardEl) {
        cardEl.classList.remove("touch-holding");
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (_) {}
        }
        if (typeof context.onInspectCard === "function") {
          context.onInspectCard(cardId, cardEl);
        }
      }
    }, 420);
  }, { passive: true });

  const cancelLongPress = () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    if (holdVisualTimer) {
      clearTimeout(holdVisualTimer);
      holdVisualTimer = null;
    }
    if (activeTouchCard) {
      activeTouchCard.classList.remove("touch-holding");
      activeTouchCard = null;
    }
  };

  document.addEventListener("pointerup", cancelLongPress, { passive: true });
  document.addEventListener("pointercancel", cancelLongPress, { passive: true });
  document.addEventListener("pointermove", (event) => {
    if (!touchTimer) return;
    const dist = Math.hypot(event.clientX - touchStartPos.x, event.clientY - touchStartPos.y);
    if (dist > 12) {
      cancelLongPress();
    }
  }, { passive: true });

  // 4. Tap outside to clear card popover or selection
  document.addEventListener("pointerdown", (event) => {
    if (context.app?.mode !== "duel" || isClearingSelection) return;
    const isCard = event.target.closest?.(
      "[data-card-uid], [data-card-id], .card, .card-action-popover, .duel-card-inspector, .phase-command, .response-option, .duel-menu, button, select"
    );
    if (!isCard && (context.app?.selectedCardUid !== null || context.app?.inspectedCard !== null)) {
      if (typeof context.onClearSelection === "function") {
        isClearingSelection = true;
        try {
          context.onClearSelection();
        } finally {
          isClearingSelection = false;
        }
      }
    }
  }, { passive: true });
}

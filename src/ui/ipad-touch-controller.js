/**
 * iPad Touch & Gesture Controller
 * Provides long-press inspection, haptic feedback, tap-outside dismissals,
 * and Safari WebKit touch audio initialization.
 */

export function initIpadTouchController({ app, render, onInspectCard, onClearSelection, duelAudio }) {
  let touchTimer = null;
  let touchStartPos = { x: 0, y: 0 };
  let activeTouchCard = null;

  // 1. Audio context unlock on first touch
  const unlockAudio = () => {
    if (duelAudio?.unlock) {
      void duelAudio.unlock();
    }
  };
  window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
  window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });

  // 2. Prevent double-tap zoom on UI elements
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

  // 3. Long-press on cards to inspect details
  document.addEventListener("pointerdown", (event) => {
    const cardEl = event.target.closest("[data-card-uid], [data-card-id]");
    if (!cardEl) return;

    const cardId = cardEl.dataset.cardId || cardEl.dataset.cardUid;
    touchStartPos = { x: event.clientX, y: event.clientY };
    activeTouchCard = cardEl;

    cardEl.classList.add("touch-holding");

    touchTimer = setTimeout(() => {
      if (activeTouchCard === cardEl) {
        cardEl.classList.remove("touch-holding");
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (_) {}
        }
        if (typeof onInspectCard === "function") {
          onInspectCard(cardId, cardEl);
        }
      }
    }, 420);
  }, { passive: true });

  const cancelLongPress = () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
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
    if (app.mode !== "duel") return;
    const isCard = event.target.closest("[data-card-uid], [data-card-id], .card, .card-action-popover, .duel-card-inspector, .phase-command, .response-option, .duel-menu");
    if (!isCard && (app.selectedCardUid !== null || app.inspectedCard !== null)) {
      if (typeof onClearSelection === "function") {
        onClearSelection();
      }
    }
  }, { passive: true });
}

export const SAVED_DECKS_KEY = "goat-local-lab-decks-v1";
export const SETTINGS_KEY = "goat-local-lab-settings-v1";
export const PLAY_SELECTION_KEY = "goat-local-lab-play-selection-v1";
export const ACTIVE_DUEL_SESSION_KEY = "goat-local-lab-active-duel-session-v1";

export function loadSavedDecks() {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_DECKS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((deck) => deck && typeof deck.id === "string" && Array.isArray(deck.main) && Array.isArray(deck.fusion) && Array.isArray(deck.side))
      : [];
  } catch {
    return [];
  }
}

export function persistSavedDecks(decks) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const defaults = { motionLevel: "full", reducedMotion: false, confirmActions: true, boardTilt: false, sfxEnabled: true, sfxVolume: 35, compactMenus: true, touchControls: false, highContrast: false, largeText: false };
  if (typeof localStorage === "undefined") return defaults;
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    const motionLevel = ["full", "reduced", "off"].includes(stored?.motionLevel) ? stored.motionLevel : stored?.reducedMotion === true ? "reduced" : "full";
    return { motionLevel, reducedMotion: motionLevel !== "full", confirmActions: stored?.confirmActions !== false, boardTilt: stored?.boardTilt === true, sfxEnabled: stored?.sfxEnabled !== false, sfxVolume: Number.isFinite(Number(stored?.sfxVolume)) ? Math.max(0, Math.min(100, Number(stored.sfxVolume))) : 35, compactMenus: stored?.compactMenus !== false, touchControls: stored?.touchControls === true, highContrast: stored?.highContrast === true, largeText: stored?.largeText === true };
  } catch { return defaults; }
}

export function persistSettings(settings) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional in offline/locked WebViews. */ }
}

export function loadPlaySelection(defaultBotId = "nexo") {
  const defaults = { mode: "bot", botId: defaultBotId, deckId: "chaos-turbo", opponentDeckId: "goat-control" };
  if (typeof localStorage === "undefined") return defaults;
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(PLAY_SELECTION_KEY) ?? "{}")) }; } catch { return defaults; }
}

export function persistPlaySelection(selection) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(PLAY_SELECTION_KEY, JSON.stringify(selection)); } catch { /* Keep selection in memory when storage is unavailable. */ }
}

export const ACTIVE_DUEL_STORAGE_KEY = "goat-local-lab-active-duel-v1";

export function saveActiveDuelState(app) {
  if (!app.duel || app.duel.kind !== "ocgcore" || app.duel.winner !== null || app.activeSandboxScenario) {
    clearActiveDuelState();
    return;
  }
  try {
    const payload = {
      seed: app.duel.seed,
      startingPlayer: app.duel.startingPlayer ?? 0,
      duelDeckId: app.duelDeckId,
      opponentDeckId: app.opponentDeckId,
      playMode: app.playMode,
      playBotId: app.playBotId,
      duelManual: app.duelManual,
      pendingLadder: app.pendingLadder,
      decisionJournal: app.duel.decisionJournal ?? [],
      turn: app.duel.turn ?? 1,
      phase: app.duel.phase ?? "DRAW",
      opponentName: app.duelBotProfile?.name ?? (app.pendingLadder?.opponentName ?? "Rival"),
      isRanked: !!app.pendingLadder?.isRankedMatch || !!app.ladder?.activeRankedMatch?.active,
      savedAt: Date.now(),
    };
    const serialized = JSON.stringify(payload);
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_DUEL_STORAGE_KEY, serialized);
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ACTIVE_DUEL_SESSION_KEY, serialized);
  } catch (_) {}
}

export function clearActiveDuelState() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(ACTIVE_DUEL_STORAGE_KEY);
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(ACTIVE_DUEL_SESSION_KEY);
  } catch (_) {}
}

export function loadSavedActiveDuelState() {
  try {
    let stored = null;
    if (typeof localStorage !== "undefined") stored = localStorage.getItem(ACTIVE_DUEL_STORAGE_KEY);
    if (!stored && typeof sessionStorage !== "undefined") stored = sessionStorage.getItem(ACTIVE_DUEL_SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed.seed === "number" && parsed.duelDeckId && parsed.opponentDeckId) {
      return parsed;
    }
  } catch (_) {}
  return null;
}


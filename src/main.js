import "./styles.css"; import "./ui/duel-hud.css"; import "./ui/sprite-theme.css"; import "./ui/responsive-menu-system.css"; import "./ui/adaptive-polish.css"; import "./ui/visual-remaster.css"; import "./ui/ipad-touch.css";
import { initIpadTouchController } from "./ui/ipad-touch-controller.js";
import { CARD_DATABASE_VERSION, CARD_KIND, VALIDATION_STATUS } from "./engine/constants.js";
import { CARDS, getCard } from "./engine/cards.js";
import { copyLimit, listStatus } from "./format/banlist.js";
import { createDuel, legalActions, observe, step } from "./engine/game.js";
import { DECK_PRESETS, applySideDeckSwap, createCustomDeck, deckFromYdk, deckToYdk, getDeck, validateDeck } from "./decks/decks.js";
import { NEXO_CANDIDATE_BOT_ID, UNIVERSAL_BOT_ID, botDescriptor, createBotForDeck, createBotRegistry, ensureBotDeckProfile, listActiveBotSpecs, hydrateBot, recordBotGame, recordBotModel, upsertBotIdentity } from "./bots/bot-system.js";
import { DEFAULT_CORE_OPPONENT_DECKS, evaluateUniversalPolicy, universalQualityGate } from "./training/training.js";
import { applyLadderResult, chooseLocalMatch, createLocalMatch, initialLadder, ladderView, recordMatchGame, upsertLadderBot } from "./ranking/ladder.js";
import { hasReasoningCertification } from "./bots/intelligence.js";
import { duelResultMarkup } from "./duel-result.js";
import { loadLocalState, saveLocalState } from "./storage/local.js";
import { loadBotRegistry, saveBotRegistry } from "./storage/bot-registry.js";
import { cardForCode, createOcgcoreSession } from "./engine/ocgcore-session.js";
import { OCGCORE_ASSET_SOURCE, OCGCORE_CARD_ENTRIES, OCGCORE_MISSING_SCRIPTS } from "./data/ocgcore-assets.js";
import { bindMenuKeyboard, hashForMode, menuMarkup, modeFromHash } from "./ui/navigation.js";
import { initSpriteMenu, destroySpriteMenu } from "./ui/sprite-menu.js"; import { renderHomePage } from "./ui/home-page.js"; import { installMenuScrollNavigation } from "./ui/menu-scroll.js";
import { initSubmenuAtmosphere } from "./ui/submenu-atmosphere.js";
import { initDuelAtmosphere } from "./ui/duel-atmosphere.js";
import { createActionRegistry, registerAction } from "./ui/action-registry.js"; import { builderCardTileMarkup } from "./ui/deck-builder-cards.js"; import { decorateDeckLibrary } from "./ui/deck-library.js"; import { decorateDuelPiles } from "./ui/duel-piles.js";
import { createDefaultScenarioState, loadSavedScenarios, persistSavedScenarios, renderSandboxPage } from "./ui/sandbox.js";
import { startSandboxDuel as startSandboxDuelDriver, bindSandboxEvents } from "./ui/sandbox-driver.js";
import { bindCardViewerEvents, createDefaultCardViewerState, renderCardViewerPage } from "./ui/lazy-card-viewer.js";
import { loadFavoriteCardIds } from "./storage/card-favorites.js";
import { CARD_WORK_STATUS_LABELS, loadCardWorkStatuses } from "./storage/card-review.js";
import { orchestrateTraining } from "./ui/training-orchestrator.js";
import { renderBotsPage } from "./ui/bots-page.js";
import { installTrainingControls } from "./ui/training-controls.js";
import { navigateApp, renderAppShell } from "./ui/app-shell.js";
import { buildDeckKnowledge, describeDeckPlan } from "./bots/deck-strategy.js";
import { deriveDuelFeedbackEvents, isPhaseAction, phaseLabel, visibleInstanceUids } from "./ui/duel-presentation.js";
import { isFusionMaterialSelection, renderCardSelectionModal, syncCardSelection, toggleCardSelection } from "./ui/card-selection.js";
import { renderSortCardModal, moveSortedCard, syncSortState } from "./ui/sort-card.js";
import { renderCardAnnouncementModal } from "./ui/card-announcement.js";
import { renderMultiChoiceModal, syncMultiChoiceState, toggleMultiChoice } from "./ui/multi-choice.js";
import { adjustCounter, renderCounterAllocationModal, syncCounterState } from "./ui/counter-allocation.js";
import { acceptDuelLoad, beginDuelLoad, isCurrentDuelLoad } from "./ui/duel-load-guard.js";
import { duelStartOverlayMarkup } from "./ui/duel-overlays.js";
import { renderSummonPositionModal } from "./ui/summon-position.js";
import { actionsForCard, createDuelInteractionModel } from "./ui/duel-interaction.js";
import { AUTO_PHASE_DELAY_MS, automaticPhasePlan } from "./ui/duel-phase-flow.js";
import { cardAffordanceBadges, renderCardActionPopover, renderDecisionBar, renderDuelCardInspector, renderDuelTopbar, renderEventCue, renderEventDrawer, renderOpenActionShortcuts, renderPhaseAdvanceConfirmation, renderPhaseRail, renderResponseTray } from "./ui/duel-hud.js";
import { createDuelAudioController } from "./ui/duel-audio.js";
const root = document.querySelector("#app"); const actionRegistry = createActionRegistry(); const duelAudio = createDuelAudioController();
let duelPresentationTimer = null; let duelBotTimer = null; let duelPhaseTimer = null; let duelPhaseTimerKey = null; let lifeMotionTimer = null;
const SAVED_DECKS_KEY = "goat-local-lab-decks-v1"; const SETTINGS_KEY = "goat-local-lab-settings-v1"; const PLAY_SELECTION_KEY = "goat-local-lab-play-selection-v1"; const ACTIVE_DUEL_SESSION_KEY = "goat-local-lab-active-duel-session-v1";
function loadSavedDecks() {
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
function persistSavedDecks(decks) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}
function persistBuilderDraft() { if (!app.savedDecks.some((deck) => deck.id === app.builderDeck?.id)) return; const saved = createCustomDeck(structuredClone(app.builderDeck)); app.builderDeck = saved; app.savedDecks = [...app.savedDecks.filter((deck) => deck.id !== saved.id), saved]; persistSavedDecks(app.savedDecks); }
function loadSettings() {
  const defaults = { motionLevel: "full", reducedMotion: false, confirmActions: true, boardTilt: false, sfxEnabled: true, sfxVolume: 35, compactMenus: true, touchControls: false, highContrast: false, largeText: false };
  if (typeof localStorage === "undefined") return defaults;
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    const motionLevel = ["full", "reduced", "off"].includes(stored?.motionLevel) ? stored.motionLevel : stored?.reducedMotion === true ? "reduced" : "full";
    return { motionLevel, reducedMotion: motionLevel !== "full", confirmActions: stored?.confirmActions !== false, boardTilt: stored?.boardTilt === true, sfxEnabled: stored?.sfxEnabled !== false, sfxVolume: Number.isFinite(Number(stored?.sfxVolume)) ? Math.max(0, Math.min(100, Number(stored.sfxVolume))) : 35, compactMenus: stored?.compactMenus !== false, touchControls: stored?.touchControls === true, highContrast: stored?.highContrast === true, largeText: stored?.largeText === true };
  } catch { return defaults; }
}
function persistSettings() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings)); } catch { /* Storage is optional in offline/locked WebViews. */ }
}
function loadPlaySelection() {
  const defaults = { mode: "bot", botId: UNIVERSAL_BOT_ID, deckId: "chaos-turbo", opponentDeckId: "goat-control" };
  if (typeof localStorage === "undefined") return defaults;
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(PLAY_SELECTION_KEY) ?? "{}")) }; } catch { return defaults; }
}
function persistPlaySelection() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(PLAY_SELECTION_KEY, JSON.stringify({ mode: app.playMode, botId: app.playBotId, deckId: app.playDeckId, opponentDeckId: app.playOpponentDeckId })); } catch { /* Keep the current selection in memory when storage is unavailable. */ }
}
function saveActiveDuelState() {
  if (!app.duel || app.duel.kind !== "ocgcore" || app.duel.winner !== null || app.activeSandboxScenario) {
    clearActiveDuelState();
    return;
  }
  try {
    if (typeof sessionStorage === "undefined") return;
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
      savedAt: Date.now(),
    };
    sessionStorage.setItem(ACTIVE_DUEL_SESSION_KEY, JSON.stringify(payload));
  } catch (_) {}
}
function clearActiveDuelState() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(ACTIVE_DUEL_SESSION_KEY);
    }
  } catch (_) {}
}
function loadSavedActiveDuelState() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const stored = sessionStorage.getItem(ACTIVE_DUEL_SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed.seed === "number" && parsed.duelDeckId && parsed.opponentDeckId) {
      return parsed;
    }
  } catch (_) {}
  return null;
}
function builderDeckById(deckId) {
  if (DECK_PRESETS.some((deck) => deck.id === deckId)) return getDeck(deckId);
  const saved = app.savedDecks.find((deck) => deck.id === deckId);
  if (saved) return structuredClone(saved);
  return createCustomDeck();
}
function builderZoneLabel(zone) {
  return ({ main: "MAIN", fusion: "FUSION", side: "SIDE" })[zone] ?? String(zone).toUpperCase();
}
const initialPlaySelection = loadPlaySelection();
const app = {
  mode: modeFromHash(window.location.hash),
  menuOpen: false,
  settings: loadSettings(),
  playMode: ["bot", "local", "ranked"].includes(initialPlaySelection.mode) ? initialPlaySelection.mode : "bot",
  playBotId: initialPlaySelection.botId,
  playDeckId: initialPlaySelection.deckId,
  playOpponentDeckId: initialPlaySelection.opponentDeckId,
  selectedCardUid: null,
  inspectedCard: null,
  boardTilt: false,
  duel: null,
  duelManual: false,
  duelLoading: false,
  duelError: null,
  duelLoadEpoch: 0,
  duelBot: createBotForDeck({ botId: UNIVERSAL_BOT_ID, deckId: initialPlaySelection.opponentDeckId }),
  duelBotProfile: null,
  duelDeckId: initialPlaySelection.deckId,
  opponentDeckId: initialPlaySelection.opponentDeckId,
  pendingLadder: null,
  builderDeckId: "chaos-turbo",
  builderDeck: getDeck("chaos-turbo"),
  builderSearch: "", builderDeckSearch: "", builderDeckLibraryOpen: false,
  builderFilter: "all",
  builderWorkFilter: "all",
  builderSort: "name",
  builderZone: "main",
  builderCatalogLimit: 200,
  builderMotion: null,
  duelMotion: null,
  lifeMotion: [],
  duelPresentation: null,
  duelPresentationQueue: [], duelPresentationStartedAt: 0,
  duelFeedbackSeen: new Set(),
  resultDismissed: false,
  duelActionOptionsOpen: false,
  duelPhaseConfirmation: null,
  duelEventLog: { open: false, search: "", filter: "all", scrollTop: 0 },
  summonFlowKind: null,
  cardSelection: { key: null, indices: [] },
  sortOrder: { key: null, order: [] },
  multiChoice: { key: null, indices: [] },
  counterAllocation: { key: null, counters: [] },
  duelStart: null,
  savedDecks: loadSavedDecks(),
  sandbox: createDefaultScenarioState(loadSavedDecks()),
  cardViewer: createDefaultCardViewerState(),
  favoriteCardIds: loadFavoriteCardIds(),
  cardWorkStatuses: loadCardWorkStatuses(),
  cardViewerKeyHandler: null,
  activeSandboxScenario: null,
  activeSandboxDecks: null,
  ladder: loadLocalState(initialLadder),
  botRegistry: loadBotRegistry(createBotRegistry),
  botCatalogDeckId: "goat-control",
  botCatalogPersonaId: "oracle",
  lastBotRecordedSeed: null,
  training: {
    running: false,
    status: "IDLE",
    complete: 0,
    total: 100,
    results: [],
    candidate: null,
    stats: null,
    evaluation: null,
    bytes: 0,
    seed: 7000,
    startedAt: null,
    speed: 0,
    checkpoint: 0,
    workers: 1,
    resources: null,
    approved: false,
    engine: "ocgcore",
    algorithm: "ocgcore-public-strategic-v4",
    botId: UNIVERSAL_BOT_ID,
    model: null,
    certification: null,
    targetIntelligence: 100,
    error: null,
    abortController: null,
    deckId: "chaos-turbo",
    opponentDeckIds: [...DEFAULT_CORE_OPPONENT_DECKS]
  },
  toast: "Motor listo. Elige un modo para empezar."
};
const activeBotIds = new Set(listActiveBotSpecs().map((bot) => bot.id));
app.ladder.bots = app.ladder.bots.filter((bot) => activeBotIds.has(bot.id));
app.boardTilt = app.settings.boardTilt;
app.sandbox = createDefaultScenarioState(app.savedDecks);
const availableDeckIds = new Set([...DECK_PRESETS, ...app.savedDecks].map((deck) => deck.id));
if (!availableDeckIds.has(app.playDeckId)) app.playDeckId = "chaos-turbo";
if (!availableDeckIds.has(app.playOpponentDeckId)) app.playOpponentDeckId = "goat-control";
for (const bot of initialLadder().bots) if (activeBotIds.has(bot.id) && !app.ladder.bots.some((candidate) => candidate.id === bot.id)) app.ladder = upsertLadderBot(app.ladder, bot);
if (!activeBotIds.has(app.playBotId)) app.playBotId = UNIVERSAL_BOT_ID;
app.duelDeckId = app.playDeckId;
app.opponentDeckId = app.playOpponentDeckId;
persistPlaySelection();
async function installBundledBotModels() {
  const bundled = [];
  let changed = false;
  for (const entry of bundled) {
    try {
      const response = await fetch(entry.url, { cache: "no-store" });
      if (!response.ok) continue;
      const model = await response.json();
      if (!model?.algorithm || !hasReasoningCertification(model.certification)) continue;
      const current = app.botRegistry.bots.find((bot) => bot.id === entry.id)?.profiles?.[entry.deckId]?.model;
      if (current && hasReasoningCertification(current.certification) && Number(current.version) >= Number(model.version)) continue;
      app.botRegistry = upsertBotIdentity(app.botRegistry, { ...entry, intelligence: model.intelligence, targetIntelligence: model.targetIntelligence, state: model.state });
      app.botRegistry = recordBotModel(app.botRegistry, { botId: entry.id, deckId: entry.deckId, model });
      const stored = app.botRegistry.bots.find((bot) => bot.id === entry.id);
      const profile = stored?.profiles?.[entry.deckId];
      if (stored && profile) app.ladder = upsertLadderBot(app.ladder, { ...stored, deckId: entry.deckId, intelligence: profile.intelligence, technicalRating: profile.technicalRating, uncertainty: profile.uncertainty });
      changed = true;
    } catch {
      // The app remains fully playable when an optional bundled model is absent.
    }
  }
  if (!changed) return;
  saveBotRegistry(app.botRegistry);
  saveLocalState(app.ladder);
  render();
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function sameCardUid(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
}
function actionNeedsConfirmation(action) {
  return action?.type === "SURRENDER";
}
function canProceedWithAction(action) {
  if (!app.settings.confirmActions || !actionNeedsConfirmation(action)) return true;
  return typeof window.confirm !== "function" || window.confirm("¿Quieres rendirte y terminar el duelo?");
}
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue with the textarea fallback used by older/offline WebViews.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand?.("copy") ?? false;
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
async function copyBuilderYdk() {
  const copied = await copyText(deckToYdk(app.builderDeck));
  app.toast = copied ? "Formato YDK copiado al portapapeles." : "No se pudo copiar el YDK; usa la importación/exportación manual.";
  render();
}
function actionButton(action, extraClass = "") {
  return `<button type="button" class="action-button ${extraClass}" data-action-id="${esc(registerAction(actionRegistry, action))}" aria-label="${esc(action.label)}">${esc(action.label)}</button>`;
}
function fullscreenLabel() {
  return document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa";
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else throw new Error("El navegador no ofrece pantalla completa.");
  } catch (error) {
    app.toast = `Pantalla completa no disponible: ${error.message}`;
  }
  render();
}
function leaveFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) void document.exitFullscreen();
}
function cardLabel(cardId) {
  return getCard(cardId)?.name ?? `Card ${cardId}`;
}
function cardImageFileName(name) {
  const cleaned = String(name ?? "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return `${cleaned || "unnamed-card"}.jpg`;
}
function cardImagePath(card) {
  return `./goat-card-images/${encodeURIComponent(card?.imageFile ?? cardImageFileName(card?.name))}`;
}
function statusPill(status) {
  const text = status === VALIDATION_STATUS.SUPPORTED ? "LISTO" : status === VALIDATION_STATUS.EXPERIMENTAL ? "EXPERIMENTAL" : status;
  return `<span class="status-pill status-${String(status).toLowerCase()}">${esc(text)}</span>`;
}
function cardMarkup(instance, { hidden = false, compact = false, motion = false, imageLoading = "eager" } = {}) {
  if (!instance) return `<div class="field-slot empty"><span>—</span></div>`;
  const card = instance.cardId === null ? null : getCard(instance.cardId);
  const monsterLike = card
    ? card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN
    : Number(instance.location) === 4 || instance.zone === "MONSTER";
  const imageBacked = card?.kind !== CARD_KIND.TOKEN;
  const defense = monsterLike && (instance.defensePosition === true || instance.position === "DEFENSE");
  if (hidden || !card) return `<div class="card back face-down ${defense ? "defense-position" : "attack-position"} ${compact ? "compact" : ""}"><img class="card-back-image" src="./goat-card-images/Back_Image.jpg" alt="Dorso de carta" loading="eager" decoding="sync" draggable="false" /></div>`;
  if (instance.faceUp === false) return `<div class="card back face-down known-set ${defense ? "defense-position" : "attack-position"} ${compact ? "compact" : ""}" title="Colocada: ${esc(card.name)}"><img class="card-back-image" src="./goat-card-images/Back_Image.jpg" alt="Dorso de carta" loading="eager" decoding="sync" draggable="false" /><small class="set-card-identity"><b>SET</b>${esc(card.name)}</small></div>`;
  const fallback = `<div class="card-fallback"${imageBacked ? " hidden" : ""}>
    <div class="card-top"><span>${esc(monsterLike ? card.kind === CARD_KIND.TOKEN ? "TOKEN" : "MONSTER" : card.kind)}</span><span>${card.level ? `★${card.level}` : ""}</span></div>
    <div class="card-name">${esc(card.name)}</div>
    ${monsterLike ? `<div class="card-stats">${card.atk} <span>/</span> ${card.def}</div>` : `<div class="card-type">${esc(card.spellType ?? card.trapType ?? card.kind)}</div>`}
    <div class="card-text">${esc(card.text)}</div>
  </div>`;
  return `<div class="card ${imageBacked ? "image-card" : ""} ${String(card.kind).toLowerCase()} ${instance.faceUp ? "face-up" : "face-down"} ${defense ? "defense-position" : "attack-position"} ${compact ? "compact" : ""}" title="${esc(card.name)}">
    ${imageBacked ? `<img class="card-image" src="${esc(cardImagePath(card))}" alt="${esc(card.name)}" loading="eager" decoding="sync" draggable="false" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" />` : ""}
    ${fallback}
  </div>`;
}
function zoneMarkup(instances, { hidden = false, motion = false, playerId = null, zone = null, actions = [], model = null } = {}) {
  return instances.map((instance, sequence) => {
    if (instance) {
      const visual = cardMarkup(instance, { hidden, motion: duelMotionFor(instance, motion) });
      const directSelection = actions.find((action) => action.selectionCards?.length === 1 && action.selectionCards.some((candidate) =>
        Number(candidate.controller) === Number(instance.controller)
        && Number(candidate.location) === Number(instance.location)
        && Number(candidate.sequence) === Number(instance.sequence)));
      if (directSelection) {
        return `<button type="button" class="board-card-button target-ready" data-action-id="${esc(registerAction(actionRegistry, directSelection))}" aria-label="Seleccionar esta carta como objetivo"><span class="target-ready-badge">OBJETIVO</span>${visual}</button>`;
      }
      if (hidden || !instance.cardId) return visual;
      const selected = sameCardUid(instance.uid, app.selectedCardUid);
      const legalActions = model ? actionsForCard(model, instance) : cardActionsFor(actions, instance);
      const actionReady = legalActions.length > 0;
      const name = getCard(instance.cardId)?.name ?? "carta";
      const actionHint = actionReady ? " · acción disponible" : "";
      const popover = selected && model ? renderCardActionPopover({ instance, model, getCard, esc, registerAction: (action) => registerAction(actionRegistry, action) }) : "";
      return `<div class="board-card-wrap ${popover ? "has-card-actions" : ""}"><button type="button" class="board-card-button ${selected ? "selected" : ""} ${actionReady ? "action-ready" : ""}" data-card-inspect="${esc(instance.uid)}" aria-expanded="${selected}" aria-label="Seleccionar ${esc(name)} en el Campo${actionHint}">${visual}${model ? cardAffordanceBadges(model, instance, { esc }) : ""}</button>${popover}</div>`;
    }
    const placement = actions.find((action) => action.placement
      && Number(action.placement.player) === Number(playerId)
      && action.placement.zone === zone
      && Number(action.placement.sequence) === sequence);
    if (!placement) return `<div class="field-slot empty"><span>${sequence + 1}</span></div>`;
    const zoneName = zone === "monster" ? "Zona de Monstruos" : "Zona de Magias/Trampas";
    return `<button type="button" class="field-slot empty selectable-zone" data-action-id="${esc(registerAction(actionRegistry, placement))}" aria-label="Elegir ${esc(zoneName)} ${sequence + 1}"><span>${sequence + 1}</span><strong>ELEGIR</strong></button>`;
  }).join("");
}
function duelMotionFor(instance, motion = app.duelMotion) {
  if (!instance || !motion) return false;
  if (Array.isArray(motion)) return motion.includes(String(instance.uid));
  return Boolean(motion);
}
function rankMarkup() {
  const view = ladderView(app.ladder);
  return `<div class="rank-chip"><span class="rank-orb">${esc(view.league.slice(0, 1))}</span><span><strong>${esc(view.league)}${view.division ? ` ${["IV", "III", "II", "I"][view.division - 1]}` : ""}</strong><small>${view.lp} LP · ${view.rating} rating</small></span></div>`;
}
function playableDecks() {
  return [...DECK_PRESETS, ...app.savedDecks];
}
function deckSelectMarkup(selected) {
  return playableDecks().map((deck) => `<option value="${esc(deck.id)}" ${deck.id === selected ? "selected" : ""}>${esc(deck.name)} · ${deck.main.length} cartas</option>`).join("");
}
function availableBotSpecs() {
  return listActiveBotSpecs();
}
function selectedBotSpec(botId = app.playBotId) {
  return availableBotSpecs().find((bot) => bot.id === botId) ?? availableBotSpecs()[0];
}
function botSelectMarkup(selected) {
  return availableBotSpecs().map((bot) => {
    const profile = app.botRegistry.bots.find((candidate) => candidate.id === bot.id)?.profiles?.[bot.deckId];
    return `<option value="${esc(bot.id)}" ${bot.id === selected ? "selected" : ""}>${esc(bot.name)} · IA ${Number(profile?.intelligence ?? bot.intelligence) || 0} · MMR ${Number(profile?.technicalRating ?? bot.rating) || 1200} · ${esc(bot.style)}</option>`;
  }).join("");
}
function renderPlayLobby() {
  const modes = [["bot", "Contra una IA Nexo", "Compara la base estable y su parche candidato con el mismo mazo.", "BOT"], ["local", "1 contra 1 local", "Dos jugadores en la misma mesa.", "LOCAL"], ["ranked", "Ranked local", "Matchmaking, LP e historial sin servidor.", "RANK"]];
  const selectedDeck = builderDeckById(app.playDeckId); const selectedBot = selectedBotSpec();
  const selectedProfile = app.botRegistry.bots.find((bot) => bot.id === selectedBot.id)?.profiles?.[app.playOpponentDeckId];
  const opponentDeck = builderDeckById(app.playOpponentDeckId);
  const opponentPlan = describeDeckPlan(buildDeckKnowledge(opponentDeck.id, opponentDeck));
  const modeMarkup = modes.map(([id, title, copy, tag]) => {
    const selected = app.playMode === id;
    const state = selected ? "SELECCIONADO" : "ELEGIR";
    return `<button type="button" class="mode-card ${selected ? "selected" : ""}" data-play-mode="${id}" aria-pressed="${selected}"><span class="mode-icon">${tag}</span><strong>${title}</strong><p>${copy}</p><span class="mode-state">${state}</span></button>`;
  }).join("");
  const startTitle = app.playMode === "local" ? "Controla ambos jugadores" : app.playMode === "ranked" ? "Busca un rival local" : "Entra en la mesa";
  const startCopy = app.playMode === "local" ? "Modo manual estilo EDOPRO: ambas manos se muestran y cada jugador responde a su propia prioridad." : "Las acciones de carta y los botones de fase aparecerán según la ventana legal del motor.";
  const startLabel = app.playMode === "ranked" ? "Buscar rival ranked" : "Comenzar duelo";
  const opponentCard = app.playMode === "local"
    ? `<div class="side-card deck-pick"><div class="side-title"><span>MAZO JUGADOR 2</span><span class="tiny-label">MANUAL</span></div><select id="play-opponent-deck" aria-label="Seleccionar mazo del jugador dos">${deckSelectMarkup(app.playOpponentDeckId)}</select><p>En modo local ambos jugadores se controlan desde la misma mesa.</p><span class="readiness-mark">Preparado</span></div>`
    : `<div class="side-card deck-pick"><div class="side-title"><span>BOT RIVAL</span><span class="tiny-label">2 VERSIONES NEXO</span></div><select id="play-bot" aria-label="Seleccionar inteligencia rival">${botSelectMarkup(app.playBotId)}</select><select id="play-opponent-deck" aria-label="Seleccionar mazo rival">${deckSelectMarkup(app.playOpponentDeckId)}</select><p>${esc(opponentPlan.identity)}</p><span class="readiness-mark">${selectedBot.id === NEXO_CANDIDATE_BOT_ID ? "Parche candidato · aún no promovido" : selectedProfile?.model?.algorithm ? "Refinamiento del mazo cargado" : "Base estable preparada"}</span></div>`;
  return `<section class="page menu-page play-page"><div class="page-head"><div><span class="eyebrow">PLAY / MATCHMAKING LOCAL</span><h1>Preparar partida</h1><p>Elige Nexo o su candidato y cualquier mazo rival; ambos vuelven a interpretar el deck en cada duelo.</p></div><div class="head-actions"><button class="ghost-button" data-action="open-sandbox">Modo Prueba (Escenarios) →</button><span class="resource-chip">OFFLINE</span><span class="resource-chip">OCGCORE GOAT</span></div></div><div class="mode-grid">${modeMarkup}</div><div class="play-config"><div class="side-card deck-pick"><div class="side-title"><span>MAZO JUGADOR 1</span><span class="tiny-label">${selectedDeck.main.length} CARTAS</span></div><select id="play-deck" aria-label="Seleccionar mazo del jugador uno">${deckSelectMarkup(app.playDeckId)}</select><p>${esc(selectedDeck.archetype ?? "Lista local editable")} - validacion de formato activa</p><button class="text-button" data-action="open-decks">Editar mazos -&gt;</button></div>${opponentCard}<div class="side-card start-card"><span class="eyebrow">TODO LISTO</span><h2>${startTitle}</h2><p>${startCopy}</p><button class="primary-button wide" data-action="start-play">${app.playMode === "local" ? "Abrir mesa 1vs1" : startLabel}</button></div></div></section>`;
}
function renderSettings() {
  const settings = app.settings;
  return `<section class="page menu-page settings-page"><div class="page-head"><div><span class="eyebrow">SETTINGS / LOCAL PROFILE</span><h1>Ajustes</h1><p>Preferencias de interfaz guardadas en este navegador. No modifican las reglas del duelo.</p></div></div><div class="settings-grid"><div class="side-card"><div class="side-title"><span>INTERFAZ DE LA MESA</span><span class="tiny-label">LOCAL</span></div><label class="setting-row"><span><strong>Animaciones del duelo</strong><small>Completa, reducida o desactivada. También respeta la preferencia del sistema.</small></span><select data-motion-level aria-label="Nivel de animaciones"><option value="full" ${settings.motionLevel === "full" ? "selected" : ""}>Completa</option><option value="reduced" ${settings.motionLevel === "reduced" ? "selected" : ""}>Reducida</option><option value="off" ${settings.motionLevel === "off" ? "selected" : ""}>Desactivada</option></select></label><label class="setting-row"><span><strong>Confirmar acciones</strong><small>Muestra una confirmación antes de acciones irreversibles.</small></span><input type="checkbox" data-setting="confirmActions" ${settings.confirmActions ? "checked" : ""}/></label><label class="setting-row"><span><strong>Vista inclinada</strong><small>Perspectiva de mesa para jugar; se puede cambiar en duelo.</small></span><input type="checkbox" data-setting="boardTilt" ${settings.boardTilt ? "checked" : ""}/></label><label class="setting-row"><span><strong>Sonido del duelo</strong><small>Señales locales para fases, cadenas, FLIP, resolución y LP.</small></span><input type="checkbox" data-setting="sfxEnabled" ${settings.sfxEnabled ? "checked" : ""}/></label><label class="setting-row"><span><strong>Menús compactos</strong><small>Muestra más opciones con una jerarquía sencilla, como el menú principal.</small></span><input type="checkbox" data-setting="compactMenus" ${settings.compactMenus ? "checked" : ""}/></label><label class="setting-row"><span><strong>Controles táctiles</strong><small>Aumenta botones y separaciones para jugar con el dedo.</small></span><input type="checkbox" data-setting="touchControls" ${settings.touchControls ? "checked" : ""}/></label><label class="setting-row"><span><strong>Contraste alto</strong><small>Refuerza marcos, texto y selección activa.</small></span><input type="checkbox" data-setting="highContrast" ${settings.highContrast ? "checked" : ""}/></label><label class="setting-row"><span><strong>Texto grande</strong><small>Aumenta la lectura de menús sin cambiar el campo.</small></span><input type="checkbox" data-setting="largeText" ${settings.largeText ? "checked" : ""}/></label><label class="setting-row setting-volume"><span><strong>Volumen de efectos</strong><small><output data-sfx-volume-output>${Math.round(settings.sfxVolume)} %</output> · se silencia al perder el foco.</small></span><input type="range" min="0" max="100" step="1" value="${Math.round(settings.sfxVolume)}" data-sfx-volume aria-label="Volumen de efectos"/></label></div><div class="side-card settings-guide"><span class="eyebrow">LECTURA RÁPIDA</span><h2>Una acción, un lugar</h2><p>Selecciona una carta legal y sus acciones aparecerán junto a ella; el inspector permanece abierto para poder leer el efecto.</p><button class="ghost-button" data-settings-reset>Restaurar preferencias</button></div></div></section>`;
}
function renderBots() {
  const deck = builderDeckById(app.botCatalogDeckId);
  return renderBotsPage({ deck, deckPresets: playableDecks(), escapeHtml: esc });
}
function shell(content) {
  return renderAppShell({ app, content, menu: menuMarkup({ activeMode: app.mode, open: app.menuOpen, escapeHtml: esc }), rank: rankMarkup(), escapeHtml: esc });
}
function navigate(mode, { history = true, focus = true } = {}) {
  navigateApp({ app, mode, parseMode: modeFromHash, modeHash: hashForMode, leaveFullscreen, rerender: render, history, focus });
}
function installTrainingWorkerControl() {
  installTrainingControls({ app, decks: playableDecks(), rerender: render });
}
function render() {
  actionRegistry.clear();
  const renderedDuelView = app.mode === "duel" && app.duel ? (app.duel.kind === "ocgcore" ? app.duel.view() : observe(app.duel, 0)) : null;
  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  document.documentElement.classList.toggle("reduced-motion", app.settings.motionLevel !== "full" || systemReducedMotion);
  document.documentElement.classList.toggle("motion-off", app.settings.motionLevel === "off");
  document.documentElement.classList.toggle("duel-active", app.mode === "duel"); document.documentElement.classList.toggle("simple-menus", app.settings.compactMenus); document.documentElement.classList.toggle("touch-controls", app.settings.touchControls); document.documentElement.classList.toggle("high-contrast", app.settings.highContrast); document.documentElement.classList.toggle("large-ui-text", app.settings.largeText);
  if (app.mode !== "card-viewer" && app.cardViewerKeyHandler) { document.removeEventListener("keydown", app.cardViewerKeyHandler); app.cardViewerKeyHandler = null; }
  const content = app.mode === "home" ? renderHomePage({ escapeHtml: esc }) : app.mode === "play" ? renderPlayLobby() : app.mode === "bots" ? renderBots() : app.mode === "sandbox" ? renderSandboxPage(app.sandbox, { savedDecks: app.savedDecks, favoriteCardIds: app.favoriteCardIds, cardWorkStatuses: app.cardWorkStatuses }) : app.mode === "card-viewer" ? renderCardViewerPage(app.cardViewer, { cardMarkup, favoriteCardIds: app.favoriteCardIds, cardWorkStatuses: app.cardWorkStatuses, rerender: render }) : app.mode === "duel" ? renderDuel(renderedDuelView) : app.mode === "deck-builder" ? renderDeckBuilder() : app.mode === "training" ? renderTraining() : app.mode === "ladder" ? renderLadder() : app.mode === "settings" ? renderSettings() : renderResearch();
  root.innerHTML = shell(content); installMenuScrollNavigation(root, app.mode, { navigate }); initSubmenuAtmosphere({ mode: app.mode, motionLevel: app.settings.motionLevel }); initDuelAtmosphere({ mode: app.mode, motionLevel: app.settings.motionLevel });
  const eventList = root.querySelector(".event-drawer-list"); if (eventList) eventList.scrollTop = app.duelEventLog.scrollTop;
  
  if (app.mode === "home") {
    initSpriteMenu(app, render, leaveFullscreen);
  } else {
    destroySpriteMenu();
  }

  const inspector = document.querySelector('[data-testid="card-inspector"]');
  if (inspector) inspector.classList.add('visible');
  if (app.mode === "deck-builder") {
    const builderFilter = document.querySelector("#builder-filter");
    if (builderFilter && !builderFilter.querySelector('option[value="favorites"]')) {
      builderFilter.insertBefore(new Option(`★ Favoritas (${app.favoriteCardIds.size})`, "favorites"), builderFilter.options[1] ?? null);
    }
    if (builderFilter) builderFilter.value = app.builderFilter;
    const builderToolbar = builderFilter?.closest(".builder-toolbar");
    if (builderToolbar && !builderToolbar.querySelector("#builder-work-filter")) {
      const workFilter = document.createElement("select");
      workFilter.id = "builder-work-filter";
      workFilter.setAttribute("aria-label", "Filtrar por funcionamiento");
      workFilter.innerHTML = `<option value="all">Funciona: todos</option>${Object.entries(CARD_WORK_STATUS_LABELS).map(([status, label]) => `<option value="${status}">Funciona: ${label}</option>`).join("")}`;
      builderToolbar.append(workFilter);
    }
    const builderWorkFilter = document.querySelector("#builder-work-filter");
    if (builderWorkFilter) builderWorkFilter.value = app.builderWorkFilter;
  }
  if (app.mode === "training") installTrainingWorkerControl(); if (app.mode === "deck-builder") decorateDeckLibrary({ searchValue: app.builderDeckSearch, open: app.builderDeckLibraryOpen, onSearch: (value) => { app.builderDeckSearch = value; }, onToggle: (value) => { app.builderDeckLibraryOpen = value; render(); } }); if (app.mode === "duel") decorateDuelPiles({ view: renderedDuelView, cardMarkup, escapeHtml: esc, onInspectCard: (instance, player) => { if (!instance?.cardId) return; app.inspectedCard = { ...instance, ownerName: playerName(player, Boolean(app.duelManual || renderedDuelView?.manual)) }; app.selectedCardUid = null; render(); } });
  bindEvents();
  positionCardPopovers();
  scheduleOcgcoreBotStep();
  scheduleAutomaticPhaseAdvance();
  if (app.duelMotion || app.builderMotion) window.setTimeout(() => { app.duelMotion = false; app.builderMotion = null; }, 360);
}
function positionCardPopovers() {
  const inspector = document.querySelector("[data-testid='card-inspector']")?.getBoundingClientRect();
  document.querySelectorAll("[data-testid='card-action-popover']").forEach((popover) => {
    popover.style.removeProperty("--popover-nudge-x");
    popover.classList.remove("is-below");
    let rect = popover.getBoundingClientRect();
    if (rect.top < 54) { popover.classList.add("is-below"); rect = popover.getBoundingClientRect(); }
    const safeLeft = 8;
    const safeRight = window.innerWidth - 8;
    let nudge = rect.left < safeLeft ? safeLeft - rect.left : rect.right > safeRight ? safeRight - rect.right : 0;
    if (inspector && rect.right > inspector.left && rect.left < inspector.right) nudge -= rect.right - inspector.left + 8;
    if (nudge !== 0) popover.style.setProperty("--popover-nudge-x", `${Math.round(nudge)}px`);
  });
}
function currentDuelView() {
  if (!app.duel) return null;
  return app.duel.kind === "ocgcore" ? app.duel.view() : observe(app.duel, app.duel.priorityPlayer ?? 0);
}
function duelInstanceByUid(view, uid) {
  const wanted = String(uid);
  for (const player of view?.players ?? []) {
    for (const instance of [
      ...(player.hand ?? []), ...(player.monsterZone ?? []), ...(player.spellTrapZone ?? []),
      ...(player.fieldZone ?? []), ...(player.graveyard ?? player.grave ?? []), ...(player.banished ?? []),
    ]) if (instance && String(instance.uid) === wanted) return { instance, player };
  }
  return null;
}
function inspectKnownCard(uid) {
  const found = duelInstanceByUid(currentDuelView(), uid);
  if (!found?.instance?.cardId) return false;
  app.inspectedCard = { ...found.instance, ownerName: playerName(found.player, Boolean(app.duelManual || currentDuelView()?.manual)) };
  return true;
}
function playDuelCue(cue) {
  duelAudio.play(cue?.soundId ?? cue?.kind, {
    chainLink: cue?.chainLink,
    enabled: app.settings.sfxEnabled,
    volume: Number(app.settings.sfxVolume) / 100,
  });
}
function cueDuration(cue) {
  const duration = cue?.duration !== undefined ? Number(cue.duration) : 750;
  if (app.settings.motionLevel === "reduced") return Math.min(420, duration);
  if (app.settings.motionLevel === "off") return Math.min(150, duration);
  return duration;
}
function setDuelPresentation(input) {
  const cues = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!cues.length) return;
  for (const cue of cues) {
    playDuelCue(cue);
  }
}

function refreshDuelPresentationSurface() {
  scheduleOcgcoreBotStep();
  scheduleAutomaticPhaseAdvance();
}
function clearDuelBotTimer() {
  if (duelBotTimer) window.clearTimeout(duelBotTimer);
  duelBotTimer = null;
}
function scheduleOcgcoreBotStep() {
  if (duelBotTimer || app.mode !== "duel" || app.duel?.kind !== "ocgcore") return;
  if (app.duelStart?.open) return;
  if (app.duelPresentation) return;
  const view = app.duel.view();
  if (!view.botPending || view.winner !== null) return;
  const session = app.duel;
  const delay = view.phasePaused && !view.pendingType ? AUTO_PHASE_DELAY_MS : 750;
  duelBotTimer = window.setTimeout(() => {
    duelBotTimer = null;
    if (app.duel !== session || app.mode !== "duel") return;
    const before = session.view();
    const result = session.respondBot();
    const after = result.view;
    if (result.action) {
      recordDuelTransition(result.action, before, after);
      app.toast = `${app.duelBotProfile?.name ?? "Nexo"}: ${result.action.label}`;
    }
    settlePendingLadder();
    saveActiveDuelState();
    render();
  }, delay);
}
function recordDuelTransition(action, before, after) {
  const beforeUids = new Set(visibleInstanceUids(before));
  app.duelMotion = visibleInstanceUids(after).filter((uid) => !beforeUids.has(uid));
  app.selectedCardUid = null;
  app.inspectedCard = null;
  app.duelActionOptionsOpen = false;
  app.duelPhaseConfirmation = null;
  app.cardSelection = { key: null, indices: [] };
  app.sortOrder = { key: null, order: [] };
  app.multiChoice = { key: null, indices: [] };
  app.counterAllocation = { key: null, counters: [] };
  if (["summon", "special-summon", "position"].includes(action?.actionKind)) app.summonFlowKind = action.actionKind;
  setLifeMotion(before, after);
  const cues = deriveDuelFeedbackEvents({ action, before, after });
  if (cues.some((cue) => cue.kind === "summon")) app.summonFlowKind = null;
  setDuelPresentation(cues);
}

function setLifeMotion(before, after) {
  if (lifeMotionTimer) window.clearTimeout(lifeMotionTimer);
  app.lifeMotion = (after?.players ?? []).map((player, playerId) => ({
    playerId,
    delta: Number(player?.lp ?? 0) - Number(before?.players?.[playerId]?.lp ?? player?.lp ?? 0),
    value: Number(player?.lp ?? 0),
  })).filter((entry) => entry.delta !== 0);
  if (!app.lifeMotion.length) return;
  lifeMotionTimer = window.setTimeout(() => {
    app.lifeMotion = [];
    lifeMotionTimer = null;
    if (app.mode === "duel") render();
  }, app.settings.reducedMotion ? 420 : 1450);
}

function renderDuel(view = null) {
  if (!app.duel) {
    if (app.duelError) return `<section class="page duel-page"><div class="empty-state duel-load-error"><span class="empty-icon">!</span><strong>No se pudo iniciar OCGCore</strong><p>${esc(app.duelError.message ?? String(app.duelError))}</p><button class="primary-button" data-duel-retry>Reintentar duelo</button></div></section>`;
    if (!app.duelLoading) resumeOrStartDuel();
    return `<section class="page duel-page"><div class="empty-state"><span class="empty-icon">◌</span><strong>Preparando duelo autoritativo</strong><p>Inicializando OCGCore en modo GOAT y cargando las cartas históricas…</p></div></section>`;
  }
  if (app.duel.kind === "ocgcore") return renderOcgcoreDuel(view);
  return renderCompactFallbackDuel(view);
}

function renderCompactFallbackDuel(view = observe(app.duel, 0)) {
  const opponent = view.players[1];
  const me = view.players[0];
  const userActions = app.duel.priorityPlayer === 0 ? legalActions(app.duel, 0) : [];
  const ended = app.duel.winner !== null;
  const resultLabel = ended ? (view.winner === 0 ? "VICTORIA" : view.winner === 1 ? "DERROTA" : "EMPATE") : app.duel.priorityPlayer === 0 ? "TU DECIDES" : "ASTRA PIENSA";
  return `<section class="page duel-page">
    <div class="page-head duel-head"><div><span class="eyebrow">LIVE DUEL / LOCAL FALLBACK</span><h1>Tu mesa de pruebas</h1><p>Partida local contra Astra · ${esc(getDeck(app.opponentDeckId).name)} · semilla ${app.duel.seed}</p></div><div class="head-actions"><button class="ghost-button" data-action="open-play">Preparar otra partida</button><button class="ghost-button" data-action="toggle-fullscreen">${fullscreenLabel()}</button><button class="ghost-button" data-action="new-duel">Nuevo duelo</button></div></div>
    <div class="duel-layout"><div class="table-frame">
      <div class="table-ribbon"><span class="phase-live"><i></i>${phaseLabel(view.phase)}</span><span>TURN ${String(view.turn).padStart(2, "0")}</span><span>DECISIONS ${app.duel.decisionCount}</span><span class="ribbon-right">PRIORITY / ${view.priorityPlayer === 0 ? "YOU" : "ASTRA"}</span></div>
      <div class="duel-board">
        <div class="hand-strip opponent-hand">${playerHandMarkup(opponent, app.selectedCardUid, false, userActions)}</div>
        <div class="opponent-row player-row is-opponent"><div class="player-meta"><span class="avatar opponent-avatar">A</span><div><strong>ASTRA</strong><small>${esc(getDeck(app.opponentDeckId).name)}</small></div><div class="lp"><span>LP</span><b>${opponent.lp.toLocaleString("es-ES")}</b></div></div><div class="hand-count">HAND <b>${opponent.handCount}</b><span class="deck-count">DECK ${opponent.deckCount}</span></div></div>
        ${duelistFieldMarkup(opponent, [], { opponent: true })}
        <div class="duel-mid"><div class="turn-arrow">${resultLabel}</div>${turnStatusMarkup(view)}${phaseStripMarkup(view, userActions)}${responseActionsMarkup(view, userActions, false)}</div>
        ${duelistFieldMarkup(me, [], { opponent: false })}
        <div class="player-row player-bottom is-player"><div class="player-meta"><span class="avatar player-avatar">Y</span><div><strong>TÚ</strong><small>${esc(getDeck(app.duelDeckId).name)}</small></div><div class="lp"><span>LP</span><b>${me.lp.toLocaleString("es-ES")}</b></div></div><div class="hand-count">HAND <b>${me.handCount}</b><span class="deck-count">DECK ${me.deckCount}</span></div></div>
        <div class="hand-strip player-hand">${playerHandMarkup(me, app.selectedCardUid, false, userActions)}</div>
      </div>${eventFeedMarkup(view)}<div data-duel-presentation-host>${presentationMarkup(view)}</div>
    </div></div>
  </section>`;
}

function phaseStripMarkup(view, userActions, manual = false, model = null) {
  const interaction = model ?? createDuelInteractionModel({ ...view, actions: userActions }, { manual });
  return renderPhaseRail({ view, model: interaction, esc, registerAction: (action) => registerAction(actionRegistry, action) });
}

function responseActionsMarkup(view, actions, manual = false, model = null) {
  const interaction = model ?? createDuelInteractionModel({ ...view, actions }, { manual });
  if (app.duelPhaseConfirmation) return renderPhaseAdvanceConfirmation({ view, model: interaction, pending: app.duelPhaseConfirmation, esc });
  if (interaction.mode === "open") return renderOpenActionShortcuts({ model: interaction, esc, registerAction: (action) => registerAction(actionRegistry, action) });
  if (interaction.mode === "resolving" || interaction.mode === "result") return "";
  if (interaction.mode === "response") return renderResponseTray({ view, model: interaction, revealed: app.duelActionOptionsOpen, cardForCode, cardMarkup, esc, registerAction: (action) => registerAction(actionRegistry, action) });
  const responses = actions.filter((action) => !isPhaseAction(action));
  if (view.sort?.cards?.length) {
    app.sortOrder = syncSortState(app.sortOrder, view);
    return renderSortCardModal({ view, state: app.sortOrder, esc, cardMarkup, registerAction: (action) => registerAction(actionRegistry, action) });
  }
  if (view.announcement?.options?.length) return renderCardAnnouncementModal({ view, esc });
  if (view.multiChoice?.options?.length) {
    app.multiChoice = syncMultiChoiceState(app.multiChoice, view);
    return renderMultiChoiceModal({ view, state: app.multiChoice, esc, registerAction: (action) => registerAction(actionRegistry, action) });
  }
  if (view.counterSelection?.cards?.length) {
    app.counterAllocation = syncCounterState(app.counterAllocation, view);
    return renderCounterAllocationModal({ view, state: app.counterAllocation, esc, cardMarkup, registerAction: (action) => registerAction(actionRegistry, action) });
  }
  if (!responses.length) return "";
  if (view.pendingType === "SELECT_POSITION") return renderSummonPositionModal({ view, prompt: interaction.prompt, responses, context: app.summonFlowKind, esc, registerAction: (action) => registerAction(actionRegistry, action) });
  const hasCardChoices = responses.some((action) => Array.isArray(action.selectionCards));
  const materialChoice = isFusionMaterialSelection(view)
    || view.selection?.mode === "sum"
    || Number(view.selection?.minimum) > 1
    || Number(view.selection?.maximum) > 1;
  if (materialChoice && view.selection?.candidates?.length) {
    app.cardSelection = syncCardSelection(app.cardSelection, view);
    return renderCardSelectionModal({ view, actions: responses, state: app.cardSelection, esc, cardMarkup, registerAction: (action) => registerAction(actionRegistry, action) });
  }
  const fieldChoices = responses.filter((action) => action.selectionCards?.length === 1 && action.selectionCards.every((card) => [4, 8].includes(Number(card.location))));
  if (fieldChoices.length && fieldChoices.length === responses.filter((action) => action.selectionCards?.length).length) {
    return renderDecisionBar({ view, model: interaction, actions: responses, directField: true, esc, registerAction: (action) => registerAction(actionRegistry, action) });
  }
  if (hasCardChoices && view.selection?.candidates?.length) {
    app.cardSelection = syncCardSelection(app.cardSelection, view);
    return renderCardSelectionModal({ view, actions: responses, state: app.cardSelection, esc, cardMarkup, registerAction: (action) => registerAction(actionRegistry, action) });
  }
  return renderDecisionBar({ view, model: interaction, actions: responses, esc, registerAction: (action) => registerAction(actionRegistry, action) });
}

function isDirectFieldSelectionView(view) {
  const candidates = view?.selection?.candidates ?? [];
  return view?.pendingType === "SELECT_CARD"
    && Number(view.selection?.minimum) === 1
    && Number(view.selection?.maximum) === 1
    && candidates.length > 0
    && candidates.every((card) => [4, 8].includes(Number(card.location)));
}

function pileMarkup(player, kind) {
  const grave = player.graveyard ?? player.grave ?? [];
  const isGrave = kind === "grave"; const isExtra = kind === "extra";
  const count = isGrave ? grave.length : isExtra ? player.extraCount ?? player.extraDeck?.length ?? 0 : player.deckCount ?? player.deck?.length ?? 0;
  const top = isGrave ? grave.at(-1) : null;
  const preview = top?.cardId ? getCard(top.cardId) : isExtra ? getCard(player.extraDeck?.find((card) => card?.cardId)?.cardId) : null;
  const name = preview?.name ?? null;
  const label = isGrave ? "GY" : isExtra ? "FUSION / EXTRA" : "DECK"; const aria = isGrave ? "Cementerio" : isExtra ? "Fusion o Extra Deck" : "Deck";
  const isInteractive = isGrave || isExtra; const tag = isInteractive ? "button" : "div"; const attributes = isInteractive ? ` type="button" data-pile="${kind}" data-player-id="${player.id}"` : "";
  const fallback = isGrave ? "Vacío" : isExtra ? (count ? "Cartas disponibles" : "Vacío") : "Boca abajo";
  return `<${tag} class="field-pile ${kind}"${attributes} aria-label="${aria}: ${count} cartas"><span>${label}</span><b class="pile-count-badge">${count}</b><small>${name ? esc(name) : fallback}</small></${tag}>`;
}

function duelistFieldMarkup(player, actions, { opponent = false, priority = false, model = null } = {}) {
  const classes = `zone-line duelist-field ${opponent ? "opponent-zones" : "player-zones"} ${priority ? "has-priority" : ""}`;
  const monsterOptions = { motion: app.duelMotion, playerId: player.id, zone: "monster", actions, model };
  const spellOptions = { motion: app.duelMotion, playerId: player.id, zone: "spell", actions, model };
  return `<div class="${classes}">
    <div class="field-aux-column"><div class="field-zone-box"><span>CAMPO</span><div class="field-zone-slot">${zoneMarkup(player.fieldZone ?? [null], { motion: app.duelMotion, actions, model })}</div></div>${pileMarkup(player, "extra")}</div>
    <div class="field-zone-row monster-row"><span class="zone-row-label">MONSTRUOS</span><div class="zone-slots">${zoneMarkup(player.monsterZone, monsterOptions)}</div></div>
    <div class="field-zone-row spell-row"><span class="zone-row-label">MAGIAS / TRAMPAS</span><div class="zone-slots zone-backrow">${zoneMarkup(player.spellTrapZone, spellOptions)}</div></div>
    <div class="field-piles field-pile-column">${pileMarkup(player, "grave")}${pileMarkup(player, "deck")}</div>
  </div>`;
}

function eventFeedMarkup(view) {
  return renderEventDrawer(view, { esc, state: app.duelEventLog });
}

function presentationMarkup(view = null) { return renderEventCue(app.duelPresentation, { motionLevel: app.settings.motionLevel, elapsed: app.duelPresentation ? Date.now() - app.duelPresentationStartedAt : 0, cardForCode, cardMarkup, esc }); }

function duelBotName(view = null) {
  return view?.bot?.name ?? app.duelBotProfile?.name ?? "Astra";
}

function turnStatusMarkup(view, manual = false) {
  const model = createDuelInteractionModel(view, { manual });
  return `<div class="turn-status mode-${esc(model.mode)}"><span class="turn-status-orb"></span><div><strong>${esc(model.priorityName)} puede actuar</strong><small>Turno ${view.turn ?? "—"} · ${esc(phaseLabel(view.phase))}</small></div></div>`;
}

function seriesMarkup() {
  const pending = app.pendingLadder;
  const match = pending?.match;
  if (!match || match.completed || app.duel?.winner === null || app.duel?.winner === undefined) return "";
  const deck = pending.currentDeck ?? builderDeckById(app.duelDeckId);
  const selectedIn = pending.sideInCard;
  const selectedOut = pending.sideOutCard;
  const score = `${match.playerWins}-${match.opponentWins}`;
  const side = deck.side ?? [];
  const main = deck.main ?? [];
  return `<div class="series-panel side-card"><div class="side-title"><span>MATCH BO${match.bestOf}</span><span class="tiny-label">SERIE ${score}</span></div><p>Partida ${match.gameNumber} terminada. Puedes intercambiar cartas antes de continuar.</p><div class="series-swap"><div><strong>ENTRA DESDE SIDE</strong><div class="series-card-list">${side.map((cardId) => `<button type="button" class="text-button ${selectedIn === cardId ? "selected" : ""}" data-series-side-in="${cardId}">${esc(cardLabel(cardId))}</button>`).join("") || `<span class="muted">Sin Side Deck</span>`}</div></div><div><strong>SALE DEL MAIN</strong><div class="series-card-list">${main.slice(0, 24).map((cardId) => `<button type="button" class="text-button ${selectedOut === cardId ? "selected" : ""}" data-series-side-out="${cardId}">${esc(cardLabel(cardId))}</button>`).join("")}</div></div></div>    <div class="series-actions"><button class="ghost-button" data-action="apply-series-swap" ${selectedIn === undefined || selectedOut === undefined ? "disabled" : ""}>Aplicar cambio</button><button class="primary-button" data-action="next-series-game">Siguiente partida</button><button class="text-button" data-action="end-series">Abandonar serie</button></div></div>`;
}

function duelResultMarkupProxy(view) {
  return duelResultMarkup(view, { app, esc, duelBotName });
}

function playerName(player, manual) {
  return manual ? `JUGADOR ${player.id + 1}` : player.id === 0 ? "TÚ" : duelBotName();
}

function lifePointMarkup(player) {
  const motion = app.lifeMotion.find((entry) => entry.playerId === player.id);
  const state = motion ? (motion.delta < 0 ? "life-loss" : "life-gain") : "";
  const delta = motion ? `${motion.delta > 0 ? "+" : "−"}${Math.abs(motion.delta).toLocaleString("es-ES")}` : "";
  const lpPercent = Math.max(0, Math.min(100, (player.lp / 8000) * 100));
  const barClass = player.lp <= 2000 ? 'lp-bar-critical' : '';
  return `<div class="lp ${state}"><span>LP</span><b>${player.lp.toLocaleString("es-ES")}</b>${motion ? `<em class="lp-delta">${esc(delta)}</em>` : ""}<div class="lp-bar-track"><div class="lp-bar-fill ${barClass}" style="width:${lpPercent}%"></div></div></div>`;
}

function cardActionsFor(actions, instance) {
  return actions.filter((action) => action.cardUid
    ? sameCardUid(action.cardUid, instance.uid)
    : action.cardCode !== undefined && instance.runtimeCode !== undefined && String(action.cardCode) === String(instance.runtimeCode));
}

function playerHandMarkup(player, selectedUid, manual, actions = [], model = null) {
  const interactive = manual || player.id === 0;
  const label = manual ? playerName(player, true) : player.id === 0 ? "TU MANO" : "MANO RIVAL";
  const hint = manual ? `${player.hand.length} cartas visibles` : interactive ? "Haz clic en una carta para ver sus acciones" : `${player.hand.length} cartas ocultas`;
  return `<div class="hand-label"><span>${label}</span><span>${hint}</span></div><div class="hand-row ${manual ? "manual-hand" : ""}">${player.hand.map((instance, index) => {
    const selected = interactive && instance && sameCardUid(instance.uid, selectedUid);
    const legalActions = instance && model ? actionsForCard(model, instance) : []; const fanOffset = index - (player.hand.length - 1) / 2; const fanAngle = Math.max(-5, Math.min(5, fanOffset * 1.6)); const fanLift = Math.min(10, Math.abs(fanOffset) * 2.5);
    const actionReady = legalActions.length > 0;
    const card = interactive && instance ? `<button type="button" class="hand-card-button ${selected ? "selected" : ""} ${actionReady ? "action-ready" : ""}" data-card-inspect="${esc(instance.uid)}" aria-expanded="${selected}" aria-label="Seleccionar ${esc(getCard(instance.cardId)?.name ?? "carta")}">${cardMarkup(instance, { motion: duelMotionFor(instance) })}${model ? cardAffordanceBadges(model, instance, { esc }) : ""}</button>` : cardMarkup(instance, { hidden: !manual, motion: duelMotionFor(instance) });
    const popover = selected && model ? renderCardActionPopover({ instance, model, placement: player.id === 1 ? "below" : "above", getCard, esc, registerAction: (action) => registerAction(actionRegistry, action) }) : "";
    return `<div class="hand-card-wrap ${popover ? "has-card-actions" : ""}" style="--fan-angle:${fanAngle}deg;--fan-lift:${fanLift}px">${card}${popover}</div>`;
  }).join("")}</div>`;
}

function renderOcgcoreDuel(view = app.duel.view()) {
  const manual = Boolean(app.duelManual || view.manual);
  const interaction = createDuelInteractionModel(view, { manual });
  const stagedResponse = interaction.mode === "response" && !app.duelActionOptionsOpen;
  const affordanceInteraction = stagedResponse ? { ...interaction, actionsByCard: new Map() } : interaction;
  const playerOne = view.players[0];
  const playerTwo = view.players[1];
  const userActions = view.actions;
  const playerOneDeck = app.pendingLadder?.currentDeck ?? app.activeSandboxDecks?.[0] ?? builderDeckById(app.duelDeckId);
  const playerTwoDeck = app.activeSandboxDecks?.[1] ?? builderDeckById(app.opponentDeckId);
  const opponentName = duelBotName(view);
  const title = app.activeSandboxScenario ? "Partida de Prueba 1vs1" : manual ? "1vs1 local" : `${playerOneDeck.name} vs ${opponentName}`;
  const subtitle = app.activeSandboxScenario ? "Escenario manual · OCGCore GOAT" : `Semilla ${view.seed} · ${playerTwoDeck.name}`;
  return `<section class="page duel-page">
     ${renderDuelTopbar({ view, model: interaction, manual, title, subtitle, sandbox: Boolean(app.activeSandboxScenario), fullscreenLabel: fullscreenLabel(), boardTilt: app.boardTilt, esc })}
     <div class="duel-layout"><div class="table-frame ${app.boardTilt ? "tilted" : ""} ${app.inspectedCard ? "has-inspector" : ""}">
       <img src="./sprites/Sprite_Pilar.png" class="duel-pillar pillar-left" alt="" />
       <img src="./sprites/Sprite_Pilar.png" class="duel-pillar pillar-right" alt="" />
       <div class="duel-board ${app.duelPresentation ? `feedback-${esc(app.duelPresentation.kind)} tier-${esc(app.duelPresentation.tier || "notable")}` : ""}">
         <div class="hand-strip opponent-hand">${playerHandMarkup(playerTwo, app.selectedCardUid, manual, userActions, affordanceInteraction)}</div>
         <div class="opponent-row player-row is-opponent"><div class="player-meta"><span class="avatar opponent-avatar">${manual ? "2" : esc(opponentName.slice(0, 1).toUpperCase())}</span><div><strong>${esc(playerName(playerTwo, manual))}</strong><small>${esc(playerTwoDeck.name)}</small></div>${lifePointMarkup(playerTwo)}</div><div class="hand-count">HAND <b>${playerTwo.handCount}</b><span class="deck-count">DECK ${playerTwo.deckCount}</span></div></div>
         ${duelistFieldMarkup(playerTwo, userActions, { opponent: true, priority: view.priorityPlayer === 1, model: affordanceInteraction })}
          <div class="duel-mid">${phaseStripMarkup(view, userActions, manual, interaction)}<div class="duel-feedback-dock" data-testid="duel-feedback-dock">${responseActionsMarkup(view, userActions, manual, interaction)}</div></div>
         ${duelistFieldMarkup(playerOne, userActions, { opponent: false, priority: view.priorityPlayer === 0, model: affordanceInteraction })}
         <div class="player-row player-bottom is-player"><div class="player-meta"><span class="avatar player-avatar">${manual ? "1" : "Y"}</span><div><strong>${playerName(playerOne, manual)}</strong><small>${esc(playerOneDeck.name)}</small></div>${lifePointMarkup(playerOne)}</div><div class="hand-count">HAND <b>${playerOne.handCount}</b><span class="deck-count">DECK ${playerOne.deckCount}</span></div></div>
         <div class="hand-strip player-hand">${playerHandMarkup(playerOne, app.selectedCardUid, manual, userActions, affordanceInteraction)}</div>
        </div>${app.inspectedCard ? renderDuelCardInspector({ snapshot: app.inspectedCard, getCard, cardMarkup, esc }) : ""}${eventFeedMarkup(view)}<div data-duel-presentation-host>${presentationMarkup(view)}</div>${seriesMarkup()}${duelResultMarkupProxy(view)}${duelStartOverlayMarkup(app.duelStart, { esc })}
    </div></div></section>`;
}

function renderDeckBuilder() {
  const validation = validateDeck(app.builderDeck);
  const query = app.builderSearch.trim().toLowerCase();
  const filter = app.builderFilter;
  const visibleCards = CARDS
    .filter((card) => {
      const engineStatus = card.authoritativeStatus ?? card.status;
      const searchable = `${card.name} ${card.kind} ${card.race ?? ""} ${card.effectFamily ?? ""} ${card.status} ${engineStatus}`.toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (filter === "favorites" && !app.favoriteCardIds.has(card.id)) return false;
      if (filter === "monster" && card.kind !== CARD_KIND.MONSTER) return false;
      if (filter === "spell" && card.kind !== CARD_KIND.SPELL) return false;
      if (filter === "trap" && card.kind !== CARD_KIND.TRAP) return false;
      if (filter === "supported" && engineStatus !== VALIDATION_STATUS.SUPPORTED) return false;
      if (filter === "incomplete" && engineStatus === VALIDATION_STATUS.SUPPORTED) return false;
      if (filter === "limited" && copyLimit(card.id) >= 3) return false;
      if (app.builderWorkFilter !== "all" && app.cardWorkStatuses.get(card.id) !== app.builderWorkFilter) return false;
      return true;
    })
    .sort((a, b) => app.builderSort === "id" ? a.id - b.id : app.builderSort === "kind" ? `${a.kind}-${a.name}`.localeCompare(`${b.kind}-${b.name}`) : a.name.localeCompare(b.name));
  const counts = validation.counts;
  const zoneMarkup = (zone) => app.builderDeck[zone].map((cardId, index) => {
    const card = getCard(cardId);
    const animated = app.builderMotion?.cardId === cardId && app.builderMotion?.zone === zone && app.builderMotion?.index === index;
    const tile = builderCardTileMarkup(card, { count: counts.get(cardId) ?? 0, limit: copyLimit(cardId), index, zone, draggable: true }, { cardMarkup, esc, zoneLabel: builderZoneLabel(app.builderZone) });
    return tile.replace("builder-card-tile ", `builder-card-tile ${animated ? "card-enter " : ""}`);
  }).join("");
  let cardRows = visibleCards.slice(0, app.builderCatalogLimit).map((card) => {
    const limit = copyLimit(card.id);
    const count = counts.get(card.id) ?? 0;
    const blocked = limit === 0 || count >= limit;
    const details = card.kind === CARD_KIND.MONSTER ? `${card.atk ?? "?"}/${card.def ?? "?"} · ${card.race ?? ""}` : card.spellType ?? card.trapType ?? card.effectFamily;
    const engineStatus = card.authoritativeStatus ?? card.status;
    const statusLabel = engineStatus === VALIDATION_STATUS.SUPPORTED ? "OCGCORE LISTA" : engineStatus;
    return builderCardTileMarkup(card, { count, limit, catalog: true, disabled: blocked, meta: `${details} · ${statusLabel} · ${listStatus(card.id)}` }, { cardMarkup, esc, zoneLabel: builderZoneLabel(app.builderZone) }).replace("builder-card-tile ", `builder-card-tile ${statusLabel === "OCGCORE LISTA" ? "supported " : ""}`);
  }).join("");
  if (visibleCards.length > app.builderCatalogLimit) {
    const remaining = visibleCards.length - app.builderCatalogLimit;
    cardRows += `<div class="catalog-more"><span>Mostrando ${app.builderCatalogLimit} de ${visibleCards.length}</span><button class="ghost-button" data-action="show-more-cards">Mostrar ${Math.min(200, remaining)} más</button></div>`;
  }
  const allDecks = [...DECK_PRESETS, ...app.savedDecks];
  const summary = validation.summary;
  return `<section class="page"><div class="page-head"><div><span class="eyebrow">DECK LAB / COMPLETE BUILDER</span><h1>Constructor de mazos</h1><p>Busca, filtra, ordena y mueve cartas entre Main, Fusion y Side con validación TCG April 2005 en tiempo real.</p></div><div class="head-actions"><button class="ghost-button" data-action="copy-ydk">Copiar YDK</button><button class="ghost-button" data-action="duplicate-builder">Duplicar</button><button class="primary-button" data-action="save-preset">${app.savedDecks.some((deck) => deck.id === app.builderDeckId) ? "Guardar cambios" : "Guardar como preset"}</button></div></div><div class="builder-layout"><aside class="deck-library side-card"><div class="side-title"><span>MAZOS</span><span class="tiny-label">${allDecks.length} DISPONIBLES</span></div>${allDecks.map((deck) => `<button class="deck-preset ${deck.id === app.builderDeckId ? "active" : ""}" data-deck-id="${esc(deck.id)}"><span><strong>${esc(deck.name)}</strong><small>${esc(deck.archetype ?? "Custom")} · ${deck.main.length} Main</small></span>${statusPill(deck.readiness ?? "EXPERIMENTAL")}</button>`).join("")}<div class="library-note"><span class="eyebrow">PROCEDENCIA</span><p>Los presets de referencia conservan su procedencia; los decks guardados localmente se pueden editar y exportar sin servidor.</p></div></aside><div class="builder-main"><div class="builder-top"><div><span class="eyebrow">${esc(app.builderDeck.name ?? "CUSTOM")}</span><h2>${summary.main}/40–60 <small>MAIN</small></h2><div class="builder-tags">${(app.builderDeck.tags ?? []).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div></div><div class="deck-counts"><span><b>${summary.monsterCount}</b> MON</span><span><b>${summary.spellCount}</b> SPELL</span><span><b>${summary.trapCount}</b> TRAP</span><span><b>${summary.fusion}</b> FUSION</span><span><b>${summary.side}</b> SIDE</span></div><div class="validation-state ${validation.valid ? "ok" : "bad"}"><span>${validation.valid ? "✓" : "!"}</span><div><strong>${validation.valid ? "Formato válido" : "Revisión necesaria"}</strong><small>${validation.errors.length} errores · ${validation.warnings.length} avisos</small></div></div></div><div class="builder-toolbar"><input id="builder-name" value="${esc(app.builderDeck.name ?? "Custom Deck")}" placeholder="Nombre del deck"/><input id="builder-tag" placeholder="Añadir etiqueta"/><button class="ghost-button" data-action="add-tag">Añadir etiqueta</button><select id="builder-filter"><option value="all" ${filter === "all" ? "selected" : ""}>Todas</option><option value="monster" ${filter === "monster" ? "selected" : ""}>Monstruos</option><option value="spell" ${filter === "spell" ? "selected" : ""}>Magias</option><option value="trap" ${filter === "trap" ? "selected" : ""}>Trampas</option><option value="supported" ${filter === "supported" ? "selected" : ""}>Ejecutables</option><option value="incomplete" ${filter === "incomplete" ? "selected" : ""}>Incompletas</option><option value="limited" ${filter === "limited" ? "selected" : ""}>Limitadas</option></select><select id="builder-sort"><option value="name" ${app.builderSort === "name" ? "selected" : ""}>Orden: nombre</option><option value="kind" ${app.builderSort === "kind" ? "selected" : ""}>Orden: tipo</option><option value="id" ${app.builderSort === "id" ? "selected" : ""}>Orden: ID</option></select></div><div class="builder-columns"><div class="deck-stack"><div class="zone-tabs">${["main", "fusion", "side"].map((zone) => `<button class="zone-tab ${app.builderZone === zone ? "active" : ""}" data-builder-zone="${zone}">${builderZoneLabel(zone)} <b>${app.builderDeck[zone].length}</b></button>`).join("")}</div>${["main", "fusion", "side"].map((zone) => `<div class="deck-zone ${app.builderZone === zone ? "active" : ""}" data-drop-zone="${zone}"><div class="stack-header"><span>${builderZoneLabel(zone)} DECK</span><span>${app.builderDeck[zone].length} cartas</span></div><div class="deck-card-list">${zoneMarkup(zone) || `<div class="drop-empty">Arrastra cartas aquí o añádelas desde el catálogo.</div>`}</div></div>`).join("")}<label class="notes-field">Notas<textarea id="builder-notes" rows="4" placeholder="Procedencia, plan de juego o notas de prueba...">${esc(app.builderDeck.notes ?? "")}</textarea></label><div class="import-box"><div class="stack-header"><span>IMPORTAR YDK</span><button class="text-button" data-action="import-ydk">Importar texto</button></div><textarea id="ydk-import" rows="3" placeholder="#main&#10;30&#10;...\n#extra\n!side"></textarea></div></div><div class="catalog-stack"><div class="stack-header"><span>CATÁLOGO GOATFORMAT (${CARDS.length})</span><input id="card-search" value="${esc(app.builderSearch)}" placeholder="Buscar nombre, familia o estado..." /></div><div class="catalog-list" data-drop-zone="${app.builderZone}">${cardRows}</div></div></div><div class="builder-diagnostics"><span>${summary.limited.length} limitadas</span><span>${summary.forbidden.length} prohibidas</span><span>${summary.exceeded.length} excedidas</span><span>${summary.outOfFormat.length} fuera de formato</span><span>${summary.incomplete.length} incompletas</span><strong class="${summary.botCompatible ? "good-text" : "danger-text"}">${summary.botCompatible ? "BOT COMPATIBLE" : "BOT NO COMPATIBLE"}</strong></div>${validation.errors.length || validation.warnings.length ? `<div class="validation-list">${validation.errors.slice(0, 8).map((error) => `<div class="validation-error">× ${esc(error)}</div>`).join("")}${validation.warnings.slice(0, 8).map((warning) => `<div class="validation-warning">△ ${esc(warning)}</div>`).join("")}</div>` : ""}</div></div></section>`;
}

function trainingMetric(label, value, note = "") { return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`; }

function renderLadder() {
  const view = ladderView(app.ladder);
  const selectedBot = chooseLocalMatch(app.ladder, { difficulty: "all", deckId: app.playDeckId });
  const deckEntries = view.deckEntries;
  const champions = [...app.ladder.bots].sort((a, b) => b.rating - a.rating);
  return `<section class="page ladder-page"><div class="page-head"><div><span class="eyebrow">LOCAL LADDER / ${esc(app.ladder.season.name)}</span><h1>Escalera de duelos</h1><p>Rating técnico, LP, historial y rendimiento por deck permanecen separados y funcionan sin servidor.</p></div><div class="head-actions"><span class="resource-chip">${app.ladder.season.active ? "TEMPORADA ACTIVA" : "TEMPORADA ARCHIVADA"}</span><button class="ghost-button" data-action="reset-ladder">Restaurar ladder local</button></div></div><div class="ladder-hero"><div class="hero-rank"><div class="big-rank-mark">${esc(view.league.slice(0, 1))}</div><div><span class="eyebrow">RANGO ACTUAL</span><h2>${esc(view.league)}${view.division ? ` ${["IV", "III", "II", "I"][view.division - 1]}` : ""}</h2><div class="lp-track"><span style="width:${view.lp}%"></span></div><strong>${view.lp} / 100 LP · rating ${view.rating}</strong></div></div><div class="hero-stats"><div><span>PARTIDAS</span><b>${view.wins + view.losses + view.draws}</b></div><div><span>VICTORIAS</span><b>${view.wins}</b></div><div><span>RACHA</span><b class="${view.streak > 0 ? "good-text" : view.streak < 0 ? "danger-text" : ""}">${view.streak > 0 ? `+${view.streak}` : view.streak}</b></div></div></div><div class="ladder-grid"><div class="side-card match-card"><div class="side-title"><span>PRÓXIMO RIVAL</span><span class="tiny-label">MATCHMAKING LOCAL</span></div><div class="rival-profile"><span class="rival-avatar">${esc(selectedBot.name.slice(0, 1))}</span><div><strong>${esc(selectedBot.name)} <span class="verified">✓</span></strong><small>${esc(getDeck(selectedBot.deckId).name)} · ${esc(selectedBot.style)}</small></div><b>${selectedBot.rating}</b></div><div class="match-meta"><span>Dificultad<b>${esc(selectedBot.difficulty)}</b></span><span>Gap rating<b>${Math.abs(view.rating - selectedBot.rating)}</b></span></div><button class="primary-button wide" data-action="ladder-duel">Duelo puntuable</button><button class="ghost-button wide" data-action="ladder-practice">Partida de práctica</button><p class="fine-print">El matchmaking rota rivales recientes y aplica reducción anti-spam solo a partidas puntuables.</p></div><div class="side-card history-card"><div class="side-title"><span>RATING POR DECK</span><span class="tiny-label">${deckEntries.length} DECKS</span></div>${deckEntries.length ? deckEntries.map((entry) => `<div class="history-line"><span class="history-result win">◆</span><div><strong>${esc(getDeck(entry.deckId).name)}</strong><small>${entry.games} partidas · ${entry.wins}W / ${entry.losses}L / ${entry.draws}D</small></div><span class="history-delta up">${entry.rating}</span></div>`).join("") : `<div class="empty-state"><span class="empty-icon">◇</span><strong>Aún no hay rating por deck</strong><p>La primera partida puntuable abrirá este registro.</p></div>`}</div><div class="side-card rank-rules"><div class="side-title"><span>ESCALERA DE CAMPEONES</span><span class="tiny-label">BOT CHALLENGES</span></div>${champions.map((bot, index) => `<div class="rule-line"><b>#${index + 1}</b><span><strong>${esc(bot.name)}</strong><br/>${esc(getDeck(bot.deckId).name)} · ${esc(bot.style)} · rating ${bot.rating}</span></div>`).join("")}<div class="rule-line"><b>LP</b><span>Ascenso al alcanzar 100 LP; rating y liga visual no se mezclan con el rendimiento del deck.</span></div></div></div><div class="side-card history-card ladder-history-card"><div class="side-title"><span>HISTORIAL LOCAL</span><span class="tiny-label">${app.ladder.history.length} REGISTROS · NO ONLINE</span></div>${app.ladder.history.length ? app.ladder.history.slice(0, 10).map((entry) => `<div class="history-line"><span class="history-result ${entry.result}">${entry.result === "win" ? "W" : entry.result === "loss" ? "L" : "D"}</span><div><strong>${esc(entry.opponentName)}</strong><small>${esc(entry.deckId)} · ${new Date(entry.date).toLocaleDateString("es-ES")} · anti-spam ${Math.round((entry.antiSpamFactor ?? 1) * 100)}%</small></div><span class="history-delta ${entry.ratingAfter >= entry.ratingBefore ? "up" : "down"}">${entry.ratingAfter >= entry.ratingBefore ? "+" : ""}${entry.ratingAfter - entry.ratingBefore}</span></div>`).join("") : `<div class="empty-state"><strong>Sin partidas puntuadas</strong><p>Juega un duelo para empezar el historial local.</p></div>`}</div></section>`;
}

function renderResearch() {
  const supported = OCGCORE_CARD_ENTRIES.length - OCGCORE_MISSING_SCRIPTS.length;
  return `<section class="page research-page"><div class="page-head"><div><span class="eyebrow">FORMAT SPEC / CATALOG</span><h1>Catálogo GoatFormat</h1><p>Fuente completa cargada; la cobertura de reglas se mantiene separada y visible.</p></div><div class="head-actions"><span class="resource-chip">${CARDS.length} CARTAS</span><span class="resource-chip">${OCGCORE_CARD_ENTRIES.length} RUNTIME READY</span></div></div><div class="research-grid"><div class="research-intro"><div class="scope-card"><span class="eyebrow">FUENTE VERSIONADA</span><h2>CSV trazable</h2><p>El catálogo usa el CSV pegado en el proyecto. Cada fila conserva su ID estable, texto, procedencia, legalidad, familia de efecto y estado de validación. Las prohibidas publicadas aparte quedan separadas.</p><div class="source-links"><a href="https://www.goatformat.com/home/category/card-pool" target="_blank" rel="noreferrer">GoatFormat Card Pool ↗</a><a href="https://www.goatformat.com/basics.html" target="_blank" rel="noreferrer">Basic Mechanics ↗</a></div></div><div class="coverage-card"><div class="coverage-head"><span>OCGCORE RUNTIME READY</span><strong>${OCGCORE_CARD_ENTRIES.length}/${OCGCORE_CARD_ENTRIES.length}</strong></div><div class="coverage-bar"><span style="width:100%"></span></div><div class="coverage-legend"><span><i class="legend-dot green"></i>${supported} scripts cargados</span><span><i class="legend-dot amber"></i>${OCGCORE_MISSING_SCRIPTS.length} normales vía CDB</span></div><p>Las ${OCGCORE_CARD_ENTRIES.length} cartas tienen passcode/runtime asignado; ${supported} usan script y las ${OCGCORE_MISSING_SCRIPTS.length} normales se resuelven con la CDB y las reglas generales del core.</p></div></div><div class="research-list"><div class="side-card"><div class="side-title"><span>CONTRATOS</span><span class="tiny-label">LOCAL</span></div><div class="contract-line"><span class="contract-icon confirmed">✓</span><div><strong>Catálogo completo de la fuente</strong><small>${CARDS.length} registros únicos y hash de origen guardado.</small></div><span class="contract-state">CONFIRMED</span></div><div class="contract-line"><span class="contract-icon confirmed">✓</span><div><strong>Banlist April 2005</strong><small>El constructor resuelve límites por ID estable.</small></div><span class="contract-state">CONFIRMED</span></div><div class="contract-line"><span class="contract-icon confirmed">✓</span><div><strong>Backend OCGCore</strong><small>La mesa visual y el modo headless usan MODE_GOAT y la misma fuente técnica.</small></div><span class="contract-state">CONFIRMED</span></div><div class="contract-line"><span class="contract-icon partial">~</span><div><strong>Rulings y Damage Step</strong><small>La base del core está activa; los casos históricos deben conservar escenarios de regresión.</small></div><span class="contract-state">PARTIAL</span></div></div><div class="side-card data-map"><div class="side-title"><span>DATOS Y VERSIONES</span><span class="tiny-label">LOCAL</span></div><div class="data-row"><span>Engine</span><b>OCGCore ${OCGCORE_ASSET_SOURCE.scriptRepositoryRevision.slice(0, 8)}</b></div><div class="data-row"><span>Format</span><b>goat-tcg-apr-2005-v0.1</b></div><div class="data-row"><span>Card DB</span><b>${CARD_DATABASE_VERSION}</b></div><div class="data-row"><span>Replay</span><b>DLP1 / varint</b></div><div class="data-row"><span>Persistencia</span><b>runs / checkpoints / chunks</b></div></div></div></div></section>`;
}

async function resumeSavedDuel(savedState) {
  const loadEpoch = beginDuelLoad(app);
  clearDuelBotTimer();
  clearAutomaticPhaseTimer();
  if (lifeMotionTimer) window.clearTimeout(lifeMotionTimer);
  lifeMotionTimer = null;
  app.lifeMotion = [];
  app.selectedCardUid = null;
  app.inspectedCard = null;
  app.activeSandboxScenario = null;
  app.activeSandboxDecks = null;
  app.duelDeckId = savedState.duelDeckId;
  app.opponentDeckId = savedState.opponentDeckId;
  app.playMode = savedState.playMode ?? "bot";
  app.playBotId = savedState.playBotId ?? UNIVERSAL_BOT_ID;
  app.pendingLadder = savedState.pendingLadder ?? null;
  app.duelManual = savedState.duelManual ?? false;

  const deck = builderDeckById(app.duelDeckId);
  const opponentDeck = builderDeckById(app.opponentDeckId);
  const selectedBotId = app.pendingLadder?.botId ?? app.playBotId;
  const storedBot = app.botRegistry?.bots?.find((bot) => bot.id === selectedBotId);
  const storedModel = storedBot?.profiles?.[app.opponentDeckId]?.model;
  const trainedModel = storedModel?.policyWeights || storedModel?.featureWeights || storedModel?.parameters ? storedModel : null;
  const opponentBot = app.duelManual ? null : createBotForDeck({ botId: selectedBotId, deckId: app.opponentDeckId, deck: opponentDeck, seed: savedState.seed ^ 0x9e3779b9, manifest: trainedModel ?? (storedBot?.custom ? storedBot : null) });
  app.duelBotProfile = opponentBot ? botDescriptor(opponentBot) : null;
  app.lastBotRecordedSeed = null;

  app.duelLoading = true;
  app.duelError = null;
  app.duelStart = null;
  setDuelPresentation(null);
  if (app.duel?.destroy) app.duel.destroy();
  app.duel = null;

  const session = await createOcgcoreSession({
    deckA: deck.main,
    deckB: opponentDeck.main,
    fusionA: deck.fusion ?? [],
    fusionB: opponentDeck.fusion ?? [],
    seed: savedState.seed,
    startingPlayer: savedState.startingPlayer,
    manual: true,
    pacedBot: false,
    pacedPhases: false,
    bot: opponentBot,
  });

  const journal = Array.isArray(savedState.decisionJournal) ? savedState.decisionJournal : [];
  for (const entry of journal) {
    if (session.destroyed || session.winner !== null) break;
    if (entry.kind === "continue") {
      session.continuePhase();
    } else if (entry.response) {
      session.duel.respond(entry.response);
      session.decisionCount += 1;
      session.advance();
    }
  }

  session.manual = app.duelManual;
  session.pacedBot = !app.duelManual;
  session.pacedPhases = true;
  session.decisionJournal = [...journal];

  if (!acceptDuelLoad(app, loadEpoch, session)) return false;
  app.duel = session;
  app.duelLoading = false;
  app.duelError = null;
  saveActiveDuelState();
  app.toast = "Partida reanudada correctamente.";
  render();
  return true;
}

function resumeOrStartDuel(options = {}) {
  const savedState = loadSavedActiveDuelState();
  if (savedState && !options.fresh && !app.activeSandboxScenario) {
    resumeSavedDuel(savedState).catch((e) => {
      console.warn("[GOAT Lab] Reanudación fallida, iniciando nuevo duelo:", e);
      clearActiveDuelState();
      startDuel(options);
    });
    return;
  }
  startDuel(options);
}

function flipCoinStartingPlayer() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % 2;
  }
  return Math.random() < 0.5 ? 0 : 1;
}

function startDuel({ deckId = app.duelDeckId, opponentDeckId = app.opponentDeckId, botId = null, ladder = null, deckOverride = null, opponentDeckOverride = null, fresh = false } = {}) {
  if (fresh) clearActiveDuelState();
  app.duelEventLog = { open: false, search: "", filter: "all", scrollTop: 0 };
  const loadEpoch = beginDuelLoad(app);
  clearDuelBotTimer();
  clearAutomaticPhaseTimer();
  if (lifeMotionTimer) window.clearTimeout(lifeMotionTimer);
  lifeMotionTimer = null;
  app.lifeMotion = [];
  app.selectedCardUid = null;
  app.inspectedCard = null;
  app.activeSandboxScenario = null;
  app.activeSandboxDecks = null;
  app.duelDeckId = deckId;
  app.opponentDeckId = opponentDeckId;
  const deck = deckOverride ? structuredClone(deckOverride) : builderDeckById(deckId);
  const opponentDeck = opponentDeckOverride ? structuredClone(opponentDeckOverride) : builderDeckById(opponentDeckId);
  if (ladder && ladder.mode !== "practice" && !ladder.match) {
    const match = createLocalMatch(app.ladder, { botId: ladder.botId, mode: ladder.mode ?? "ladder", bestOf: ladder.bestOf ?? 3, deckId, sideDeck: deck.side ?? [] });
    app.pendingLadder = match ? { ...ladder, match, currentDeck: deck, opponentDeckId } : ladder;
  } else if (ladder) {
    app.pendingLadder = { ...ladder, currentDeck: deck, opponentDeckId };
  } else {
    app.pendingLadder = null;
  }
  app.duelManual = app.playMode === "local";
  const seed = Math.floor(Math.random() * 0xffffffff);
  const selectedBotId = ladder?.botId ?? botId ?? app.playBotId;
  const storedBot = app.botRegistry?.bots?.find((bot) => bot.id === selectedBotId);
  const storedModel = storedBot?.profiles?.[opponentDeckId]?.model;
  const trainedModel = storedModel?.policyWeights || storedModel?.featureWeights || storedModel?.parameters ? storedModel : null;
  const opponentBot = app.duelManual ? null : createBotForDeck({ botId: selectedBotId, deckId: opponentDeckId, deck: opponentDeck, seed: seed ^ 0x9e3779b9, manifest: trainedModel ?? (storedBot?.custom ? storedBot : null) });
  app.duelBotProfile = opponentBot ? botDescriptor(opponentBot) : null;
  app.lastBotRecordedSeed = null;
  if (app.duelBotProfile) {
    try {
      app.botRegistry = ensureBotDeckProfile(app.botRegistry, { botId: app.duelBotProfile.id, deckId: opponentDeckId });
      saveBotRegistry(app.botRegistry);
    } catch {
      // A user-created ladder entry may not have a catalog profile yet.
    }
  }
  app.duelLoading = true;
  app.duelError = null;
  app.selectedCardUid = null;
  app.duelMotion = null;
  app.duelActionOptionsOpen = false;
  app.duelPhaseConfirmation = null;
  app.sortOrder = { key: null, order: [] };
  app.multiChoice = { key: null, indices: [] };
  app.counterAllocation = { key: null, counters: [] };
  app.duelFeedbackSeen = new Set();
  app.resultDismissed = false;
  const startingPlayer = flipCoinStartingPlayer();
  app.duelStart = { open: true, winner: startingPlayer, side: startingPlayer === 0 ? "CARA" : "CRUZ", configured: false };
  setDuelPresentation(null);
  if (app.duel?.destroy) app.duel.destroy();
  app.duel = null;
  createOcgcoreSession({ deckA: deck.main, deckB: opponentDeck.main, fusionA: deck.fusion ?? [], fusionB: opponentDeck.fusion ?? [], seed, startingPlayer, manual: app.duelManual, pacedBot: !app.duelManual, pacedPhases: true, bot: opponentBot })
    .then((session) => {
      if (!acceptDuelLoad(app, loadEpoch, session)) return;
      app.duel = session;
      app.duelLoading = false;
      app.duelError = null;
      saveActiveDuelState();
      render();
    })
    .catch((error) => {
      if (!isCurrentDuelLoad(app, loadEpoch)) return;
      app.duelLoading = false;
      app.duelError = error;
      app.duel = null;
      app.toast = `No se inició el duelo: el motor GOAT autoritativo no está disponible. ${error.message}`;
      render();
    });
}

function startSandboxDuel(scenario = app.sandbox) {
  app.duelEventLog = { open: false, search: "", filter: "all", scrollTop: 0 };
  startSandboxDuelDriver({
    app,
    scenario,
    clearDuelBotTimer,
    builderDeckById,
    createOcgcoreSession,
    setDuelPresentation,
    phaseLabel,
    navigate,
    render,
  });
}

function runBotTurns() {
  if (app.duelManual) { settlePendingLadder(); return; }
  if (app.duel?.kind === "ocgcore") {
    app.duel.advance();
    settlePendingLadder();
    return;
  }
  if (!app.duel || app.duel.winner !== null) { settlePendingLadder(); return; }
  let guard = 0;
  while (app.duel.winner === null && app.duel.priorityPlayer === 1 && guard < 80) {
    const view = observe(app.duel, 1);
    const actions = legalActions(app.duel, 1);
    if (!actions.length) break;
    const action = app.duelBot.chooseAction(view, actions);
    try { step(app.duel, action); } catch { break; }
    guard += 1;
  }
  settlePendingLadder();
}

function settlePendingLadder() {
  if (!app.duel || app.duel.winner === null) return;
  clearActiveDuelState();
  const result = app.duel.winner === 0 ? "win" : app.duel.winner === 1 ? "loss" : "draw";
  if (app.duelBotProfile && app.lastBotRecordedSeed !== app.duel.seed) {
    const botResult = result === "win" ? "loss" : result === "loss" ? "win" : "draw";
    app.botRegistry = recordBotGame(app.botRegistry, {
      botId: app.duelBotProfile.id,
      deckId: app.opponentDeckId,
      opponentDeckId: app.duelDeckId,
      result: botResult,
      opponentRating: app.ladder.player.rating,
      decisions: app.duel.view().decisionCount,
      terminationReason: "WIN",
    });
    saveBotRegistry(app.botRegistry);
    app.lastBotRecordedSeed = app.duel.seed;
  }
  if (!app.pendingLadder) return;
  if (app.pendingLadder.mode === "practice") {
    app.toast = `Partida de práctica terminada: ${result === "win" ? "victoria" : result === "loss" ? "derrota" : "empate"}. No afecta a la ladder.`;
    app.pendingLadder = null;
    return;
  }
  if (app.pendingLadder.match) {
    if (app.pendingLadder.settledSeed === app.duel.seed) return;
    const match = recordMatchGame(app.pendingLadder.match, { result, seed: app.duel.seed });
    app.pendingLadder = { ...app.pendingLadder, match, settledSeed: app.duel.seed };
    if (!match.completed) {
      app.toast = `Partida ${match.gameNumber} terminada (${match.playerWins}-${match.opponentWins}). Puedes preparar la siguiente.`;
      return;
    }
    app.ladder = applyLadderResult(app.ladder, { botId: match.botId, deckId: match.deckId, result: match.seriesResult, mode: match.mode, opponentRating: match.opponentRating, opponentName: match.opponentName, matchId: match.id, bestOf: match.bestOf, matchScore: `${match.playerWins}-${match.opponentWins}` });
    saveLocalState(app.ladder);
    app.toast = `Serie BO${match.bestOf} terminada ${match.playerWins}-${match.opponentWins}. Rating ${app.ladder.player.rating}.`;
    app.pendingLadder = null;
    return;
  }
  app.ladder = applyLadderResult(app.ladder, { ...app.pendingLadder, result, deckId: app.duelDeckId, opponentName: app.pendingLadder.opponentName });
  saveLocalState(app.ladder);
  app.toast = `Ladder registrada: ${result === "win" ? "victoria" : result === "loss" ? "derrota" : "empate"}. Rating ${app.ladder.player.rating}.`;
  app.pendingLadder = null;
}

function submitOcgcoreAction(action) {
  const before = currentDuelView();
  app.duel.respond(action);
  const intermediate = currentDuelView();
  const phaseAction = action?.uiPhaseTarget
    ? (intermediate?.actions ?? []).find((candidate) => isPhaseAction(candidate) && candidate.phaseTarget === action.uiPhaseTarget)
    : null;
  if (phaseAction) app.duel.respond(phaseAction);
  const after = currentDuelView();
  recordDuelTransition(phaseAction ?? action, before, after);
  saveActiveDuelState();
  return after;
}

function executeDuelAction(action) {
  if (!action || !app.duel || !canProceedWithAction(action)) return;
  if (app.duel.kind === "ocgcore" && action.coreResponse) {
    submitOcgcoreAction(action);
    app.toast = `Respuesta aceptada por OCGCore: ${action.label}`;
    settlePendingLadder();
  } else {
    try {
      const before = currentDuelView();
      step(app.duel, action);
      runBotTurns();
      recordDuelTransition(action, before, currentDuelView());
      app.toast = `Acción aceptada: ${action.label}`;
    } catch (error) { app.toast = `El motor rechazó la acción: ${error.message}`; }
  }
  render();
}

function clearAutomaticPhaseTimer() {
  if (duelPhaseTimer) window.clearTimeout(duelPhaseTimer);
  duelPhaseTimer = null;
  duelPhaseTimerKey = null;
}

function scheduleAutomaticPhaseAdvance() {
  if (app.mode !== "duel" || app.duel?.kind !== "ocgcore" || app.duelStart?.open || app.duelPresentation || app.duelPresentationQueue.length) {
    clearAutomaticPhaseTimer();
    return;
  }
  const session = app.duel;
  const plan = automaticPhasePlan(currentDuelView());
  if (!plan) { clearAutomaticPhaseTimer(); return; }
  if (duelPhaseTimer && duelPhaseTimerKey === plan.key) return;
  clearAutomaticPhaseTimer();
  duelPhaseTimerKey = plan.key;
  duelPhaseTimer = window.setTimeout(() => {
    duelPhaseTimer = null;
    const expectedKey = duelPhaseTimerKey;
    duelPhaseTimerKey = null;
    if (app.duel !== session || app.mode !== "duel" || app.duelPresentation || app.duelPresentationQueue.length) return;
    const before = currentDuelView();
    const currentPlan = automaticPhasePlan(before);
    if (!currentPlan || currentPlan.key !== expectedKey) return;
    const action = currentPlan.kind === "continue-phase"
      ? { actionKind: "phase", label: `Continuar ${phaseLabel(before.phase)}` }
      : currentPlan.action;
    if (currentPlan.kind === "continue-phase") session.continuePhase();
    else session.respond(action);
    const after = currentDuelView();
    recordDuelTransition(action, before, after);
    app.toast = `Fase: ${phaseLabel(after.phase)}.`;
    settlePendingLadder();
    saveActiveDuelState();
    render();
  }, AUTO_PHASE_DELAY_MS);
}

function bindEvents() {
  document.querySelectorAll("[data-home]").forEach((button) => button.addEventListener("click", () => navigate("home")));
  document.querySelectorAll("[data-menu-toggle]").forEach((button) => button.addEventListener("click", () => { app.menuOpen = !app.menuOpen; render(); }));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.mode)));
  bindMenuKeyboard(document);
  document.querySelectorAll("[data-play-mode]").forEach((button) => button.addEventListener("click", () => { app.playMode = button.dataset.playMode; persistPlaySelection(); render(); }));
  document.querySelector("#play-deck")?.addEventListener("change", (event) => { app.playDeckId = event.target.value; app.duelDeckId = app.playDeckId; persistPlaySelection(); render(); });
  document.querySelector("#play-opponent-deck")?.addEventListener("change", (event) => { app.playOpponentDeckId = event.target.value; app.opponentDeckId = app.playOpponentDeckId; persistPlaySelection(); render(); });
  document.querySelector("#play-bot")?.addEventListener("change", (event) => {
    app.playBotId = activeBotIds.has(event.target.value) ? event.target.value : UNIVERSAL_BOT_ID;
    persistPlaySelection();
    render();
  });
  document.querySelector("#bots-deck")?.addEventListener("change", (event) => {
    app.botCatalogDeckId = event.target.value;
    render();
  });
  document.querySelectorAll("[data-card-inspect]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const uid = button.dataset.cardInspect;
    const closingPopover = sameCardUid(app.selectedCardUid, uid);
    if (closingPopover) {
      app.selectedCardUid = null;
      app.inspectedCard = null;
      render();
      return;
    }
    if (!inspectKnownCard(uid)) return;
    app.selectedCardUid = uid;
    render();
  }));
  document.querySelector("[data-card-clear]")?.addEventListener("click", () => { app.selectedCardUid = null; app.inspectedCard = null; render(); });
  document.querySelector("[data-card-inspector-close]")?.addEventListener("click", () => { app.selectedCardUid = null; app.inspectedCard = null; render(); });
  document.querySelector("[data-duel-menu-toggle]")?.addEventListener("click", (event) => { const menu = event.currentTarget.closest(".duel-menu"); const open = menu?.dataset.open !== "true"; if (!menu) return; menu.dataset.open = String(open); event.currentTarget.setAttribute("aria-expanded", String(open)); });
  document.querySelector(".duel-page")?.addEventListener("click", (event) => {
    if ((!app.selectedCardUid && !app.inspectedCard) || event.target.closest("[data-card-inspect], [data-testid='card-action-popover'], [data-testid='card-inspector']")) return;
    app.selectedCardUid = null;
    app.inspectedCard = null;
    document.querySelectorAll("[data-testid='card-action-popover']").forEach((popover) => popover.remove());
    document.querySelector("[data-testid='card-inspector']")?.remove();
    document.querySelectorAll(".board-card-button.selected, .hand-card-button.selected").forEach((card) => card.classList.remove("selected"));
  });
  document.querySelectorAll("[data-action-options-reveal]").forEach((button) => button.addEventListener("click", () => { app.duelActionOptionsOpen = true; render(); }));
  document.querySelector("[data-phase-advance-cancel]")?.addEventListener("click", () => { app.duelPhaseConfirmation = null; render(); });
  document.querySelector("[data-phase-advance-confirm]")?.addEventListener("click", () => { const pending = app.duelPhaseConfirmation; app.duelPhaseConfirmation = null; if (pending?.action) executeDuelAction(pending.action); else render(); });
  document.querySelector("[data-duel-retry]")?.addEventListener("click", () => { if (app.activeSandboxScenario) startSandboxDuel(app.activeSandboxScenario); else startDuel(); });
  const filterEventLog = () => { const query = document.querySelector("[data-event-search]")?.value.trim().toLocaleLowerCase("es") ?? ""; const kind = document.querySelector("[data-event-filter]")?.value ?? "all"; app.duelEventLog.search = query; app.duelEventLog.filter = kind; document.querySelectorAll("[data-event-entry]").forEach((row) => { row.hidden = Boolean(query && !row.dataset.eventSearchText.includes(query)) || (kind !== "all" && row.dataset.eventKind !== kind); }); };
  const eventDrawer = document.querySelector(".duel-event-drawer"); eventDrawer?.addEventListener("toggle", () => { app.duelEventLog.open = eventDrawer.open; });
  const eventList = document.querySelector(".event-drawer-list"); eventList?.addEventListener("scroll", () => { app.duelEventLog.scrollTop = eventList.scrollTop; }, { passive: true });
  document.querySelector("[data-event-search]")?.addEventListener("input", filterEventLog);
  document.querySelector("[data-event-filter]")?.addEventListener("change", filterEventLog);
  document.querySelectorAll("[data-log-card-code]").forEach((button) => button.addEventListener("click", () => { const card = cardForCode(Number(button.dataset.logCardCode)); if (!card) return; app.inspectedCard = { cardId: card.id, ownerName: "Historial del duelo", location: 0 }; app.selectedCardUid = null; render(); }));
  document.querySelectorAll("[data-card-choice-index]").forEach((button) => button.addEventListener("click", () => { const view = currentDuelView(); if (view?.pendingType === "SELECT_UNSELECT_CARD") { const action = view.actions.find((candidate) => Number(candidate.coreResponse?.index) === Number(button.dataset.cardChoiceIndex)); if (!action || !app.duel || app.duel.kind !== "ocgcore") return; const before = view; app.duel.respond(action); const after = currentDuelView(); recordDuelTransition(action, before, after); app.toast = `Selección aceptada por OCGCore: ${action.label}`; settlePendingLadder(); render(); return; } const locked = (view?.selection?.candidates ?? []).filter((candidate) => candidate.required).map((candidate) => candidate.index); app.cardSelection = toggleCardSelection(syncCardSelection(app.cardSelection, view), button.dataset.cardChoiceIndex, view?.selection?.maximum, locked); render(); }));
  document.querySelector("[data-selection-clear]")?.addEventListener("click", () => { const required = (currentDuelView()?.selection?.candidates ?? []).filter((candidate) => candidate.required).map((candidate) => Number(candidate.index)); app.cardSelection = { ...app.cardSelection, indices: required }; render(); });
  document.querySelectorAll("[data-sort-position]").forEach((button) => button.addEventListener("click", () => { app.sortOrder = moveSortedCard(app.sortOrder, button.dataset.sortPosition, button.dataset.sortDirection); render(); }));
  document.querySelectorAll("[data-multi-choice-index]").forEach((button) => button.addEventListener("click", () => { const view = currentDuelView(); app.multiChoice = toggleMultiChoice(syncMultiChoiceState(app.multiChoice, view), button.dataset.multiChoiceIndex, view?.multiChoice?.count); render(); }));
  document.querySelectorAll("[data-counter-index]").forEach((button) => button.addEventListener("click", () => { const view = currentDuelView(); app.counterAllocation = adjustCounter(syncCounterState(app.counterAllocation, view), button.dataset.counterIndex, button.dataset.counterDelta, view); render(); }));
  const announcementSearch = document.querySelector("[data-announcement-search]");
  const announcementSelect = document.querySelector("[data-announcement-select]");
  announcementSearch?.addEventListener("input", () => { const query = announcementSearch.value.trim().toLocaleLowerCase("es"); let visible = 0; for (const option of announcementSelect?.options ?? []) { const matches = !query || option.dataset.search.includes(query); option.hidden = !matches; if (matches) { visible += 1; if (visible === 1) option.selected = true; } } const count = document.querySelector("[data-announcement-count]"); if (count) count.textContent = `${visible} cartas coinciden.`; });
  document.querySelector("[data-announcement-confirm]")?.addEventListener("click", () => { const view = currentDuelView(); const runtimeCode = Number(document.querySelector("[data-announcement-select]")?.value); const option = view?.announcement?.options?.find((candidate) => Number(candidate.runtimeCode) === runtimeCode); if (!option?.coreResponse) return; const action = { label: `Declarar ${option.name}`, actionKind: "announce-card", cardCode: option.runtimeCode, coreResponse: option.coreResponse }; submitOcgcoreAction(action); app.toast = `Carta declarada: ${option.name}.`; settlePendingLadder(); render(); });
  document.querySelector("[data-duel-start-continue]")?.addEventListener("click", () => { app.duelStart = null; const view = currentDuelView(); if (view?.phasePaused) setDuelPresentation({ id: `phase:start:${view.turn}:${view.phase}`, kind: "phase", actor: view.turnPlayer, eyebrow: `TURNO ${String(view.turn).padStart(2, "0")}`, title: phaseLabel(view.phase), detail: "El duelo comienza en Draw Phase.", cardCode: null, duration: 1200, soundId: "phase", blocking: true }); render(); });
  document.querySelector("[data-motion-level]")?.addEventListener("change", (event) => { app.settings.motionLevel = event.target.value; app.settings.reducedMotion = app.settings.motionLevel !== "full"; persistSettings(); render(); });
  document.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", () => { app.settings[input.dataset.setting] = input.checked; app.boardTilt = app.settings.boardTilt; persistSettings(); render(); }));
  document.querySelector("[data-sfx-volume]")?.addEventListener("input", (event) => { app.settings.sfxVolume = Number(event.target.value); const output = document.querySelector("[data-sfx-volume-output]"); if (output) output.textContent = `${app.settings.sfxVolume} %`; persistSettings(); });
  document.querySelector("[data-settings-reset]")?.addEventListener("click", () => { app.settings = { motionLevel: "full", reducedMotion: false, confirmActions: true, boardTilt: false, sfxEnabled: true, sfxVolume: 35, compactMenus: true, touchControls: false, highContrast: false, largeText: false }; app.boardTilt = false; persistSettings(); app.toast = "Preferencias restauradas."; render(); });
  document.querySelectorAll("[data-action-id]").forEach((button) => button.addEventListener("click", () => {
    const action = actionRegistry.get(button.dataset.actionId);
    if (!action || !app.duel) return;
    const interaction = createDuelInteractionModel(currentDuelView(), { manual: Boolean(app.duelManual || currentDuelView()?.manual) });
    if (button.classList.contains("phase-command") && interaction.optionalActions.length) {
      app.duelPhaseConfirmation = { action, label: button.getAttribute("aria-label") ?? action.label };
      clearAutomaticPhaseTimer();
      render();
      return;
    }
    executeDuelAction(action);
  }));
  document.querySelectorAll("[data-card-first-action]").forEach((button) => button.addEventListener("click", () => {
    const action = legalActions(app.duel, 0).find((candidate) => candidate.cardUid === Number(button.dataset.cardFirstAction));
    if (action) { try { step(app.duel, action); app.duelMotion = true; runBotTurns(); } catch (error) { app.toast = error.message; } render(); }
  }));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action)));
  document.querySelectorAll("[data-deck-id]").forEach((button) => button.addEventListener("click", () => { app.builderDeckId = button.dataset.deckId; app.builderDeck = builderDeckById(app.builderDeckId); app.builderZone = "main"; app.builderDeckLibraryOpen = false; render(); }));
  document.querySelectorAll("[data-builder-zone]").forEach((button) => button.addEventListener("click", () => { app.builderZone = button.dataset.builderZone; render(); }));
  document.querySelectorAll("[data-add-card]").forEach((button) => button.addEventListener("click", () => {
    const cardId = Number(button.dataset.addCard);
    const zone = app.builderZone;
    const counts = validateDeck(app.builderDeck).counts;
    if (copyLimit(cardId) <= (counts.get(cardId) ?? 0)) { app.toast = "Se ha alcanzado el límite de copias de esa carta."; render(); return; }
    app.builderDeck[zone].push(cardId);
    app.builderMotion = { cardId, zone, index: app.builderDeck[zone].length - 1 };
    persistBuilderDraft();
    app.toast = `${cardLabel(cardId)} añadida al ${builderZoneLabel(zone)} Deck.`;
    render();
  }));
  document.querySelectorAll("[data-remove-index]").forEach((button) => button.addEventListener("click", () => {
    const zone = button.dataset.removeZone ?? app.builderZone;
    app.builderDeck[zone].splice(Number(button.dataset.removeIndex), 1);
    app.builderMotion = null;
    persistBuilderDraft();
    render();
  }));
  document.querySelector("#card-search")?.addEventListener("input", (event) => { app.builderSearch = event.target.value; app.builderCatalogLimit = 200; render(); const input = document.querySelector("#card-search"); input?.focus(); input?.setSelectionRange(app.builderSearch.length, app.builderSearch.length); });
  document.querySelector("#builder-filter")?.addEventListener("change", (event) => { app.builderFilter = event.target.value; app.builderCatalogLimit = 200; render(); });
  document.querySelector("#builder-work-filter")?.addEventListener("change", (event) => { app.builderWorkFilter = event.target.value; app.builderCatalogLimit = 200; render(); });
  document.querySelector("#builder-sort")?.addEventListener("change", (event) => { app.builderSort = event.target.value; app.builderCatalogLimit = 200; render(); });
  document.querySelector("#builder-name")?.addEventListener("change", (event) => { app.builderDeck.name = event.target.value.trim() || "Custom Deck"; persistBuilderDraft(); render(); });
  document.querySelector("#builder-notes")?.addEventListener("change", (event) => { app.builderDeck.notes = event.target.value; persistBuilderDraft(); });
  document.querySelectorAll("[data-drag-kind]").forEach((element) => element.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", JSON.stringify({ kind: element.dataset.dragKind, cardId: Number(element.dataset.cardId), zone: element.dataset.dragZone, index: element.dataset.dragIndex }));
  }));
  document.querySelectorAll("[data-drop-zone]").forEach((element) => {
    element.addEventListener("dragover", (event) => event.preventDefault());
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      try {
        const payload = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}");
        const targetZone = element.dataset.dropZone;
        const counts = validateDeck(app.builderDeck).counts;
        if (payload.kind === "deck") app.builderDeck[payload.zone].splice(Number(payload.index), 1);
        app.builderDeck[targetZone].push(payload.cardId);
        app.builderMotion = { cardId: payload.cardId, zone: targetZone, index: app.builderDeck[targetZone].length - 1 };
        app.builderZone = targetZone;
        persistBuilderDraft();
        render();
      } catch { app.toast = "No se pudo mover la carta."; }
    });
  });

  // Eventos del Modo Prueba / Sandbox delegados a sandbox-driver
  initIpadTouchController({
    app,
    render,
    onInspectCard: (cardIdOrUid) => {
      if (!cardIdOrUid) return;
      inspectKnownCard(cardIdOrUid);
      app.selectedCardUid = cardIdOrUid;
      render();
    },
    onClearSelection: () => {
      app.selectedCardUid = null;
      app.inspectedCard = null;
      render();
    },
    duelAudio,
  });

  bindSandboxEvents({
    app,
    render,
    builderDeckById,
    getSandboxDecks: () => [...DECK_PRESETS, ...app.savedDecks],
    onStartDuel: () => startSandboxDuel(app.sandbox),
  });
  if (app.mode === "card-viewer") bindCardViewerEvents({
    app,
    render,
    cardMarkup,
    openSandboxAudit: (cardId) => {
      app.sandbox.audit ??= { cardId: null, seed: 2005, description: "", steps: [], assertions: [], lastSnapshot: null };
      app.sandbox.audit.cardId = cardId;
      app.sandbox.audit.steps = [];
      app.sandbox.audit.lastSnapshot = null;
      navigate("sandbox");
    },
  });
}

function handleSecondaryAction(action) {
  if (action === "show-more-cards") { app.builderCatalogLimit += 200; render(); return; }
  if (action === "new-duel") { startDuel({ fresh: true }); app.toast = "Nuevo duelo creado con una semilla diferente."; render(); return; }
  if (action === "view-result-board") { app.resultDismissed = true; render(); return; }
  if (action === "tilt") { app.boardTilt = !app.boardTilt; render(); return; }
  if (action === "reset-builder") { app.builderDeck = builderDeckById(app.builderDeckId); app.builderZone = "main"; app.toast = "Preset restaurado."; render(); return; } if (action === "new-builder") { app.builderDeck = createCustomDeck({ id: `custom-${Date.now()}`, name: "Nuevo deck" }); app.builderDeckId = app.builderDeck.id; app.builderZone = "main"; app.builderSearch = ""; app.builderDeckSearch = ""; app.builderFilter = "all"; app.builderWorkFilter = "all"; app.builderSort = "name"; app.builderCatalogLimit = 200; app.builderMotion = null; app.toast = "Nuevo deck vacío listo para crear desde cero."; render(); return; }
  if (action === "copy-ydk") { void copyBuilderYdk(); return; }
  if (action === "duplicate-builder") { app.builderDeck = createCustomDeck({ ...structuredClone(app.builderDeck), id: `custom-${Date.now()}`, name: `${app.builderDeck.name ?? "Deck"} Copy`, provenance: "local-user" }); app.builderDeckId = app.builderDeck.id; app.toast = "Deck duplicado como copia editable."; render(); return; }
  if (action === "add-tag") { const input = document.querySelector("#builder-tag"); const tag = input?.value.trim(); if (tag) { app.builderDeck.tags = [...new Set([...(app.builderDeck.tags ?? []), tag])]; persistBuilderDraft(); app.toast = `Etiqueta ${tag} añadida.`; } render(); return; }
  if (action === "save-preset") { const source = structuredClone(app.builderDeck); const existingCustom = app.savedDecks.some((deck) => deck.id === source.id); const saved = createCustomDeck({ ...source, id: existingCustom ? source.id : `custom-${Date.now()}`, source: "local-user" }); app.builderDeckId = saved.id; app.builderDeck = saved; app.savedDecks = [...app.savedDecks.filter((deck) => deck.id !== saved.id), saved]; persistSavedDecks(app.savedDecks); app.toast = existingCustom ? "Cambios del deck guardados." : "Deck guardado como preset local."; render(); return; }
  if (action === "import-ydk") { const text = document.querySelector("#ydk-import")?.value ?? ""; try { const imported = deckFromYdk(text); app.builderDeck = createCustomDeck({ id: `custom-${Date.now()}`, name: "YDK importado", main: imported.main, fusion: imported.fusion, side: imported.side }); app.builderDeckId = app.builderDeck.id; app.toast = "YDK importado; revisa la validación del formato."; render(); } catch (error) { app.toast = `No se pudo importar el YDK: ${error.message}`; render(); } return; }
  if (action === "start-training") { startTraining(); return; }
  if (action === "stop-training") { app.training.running = false; app.toast = "Lote cancelado de forma segura; las métricas del último chunk siguen visibles."; render(); return; }
  if (action === "clean-training") { app.training.results = []; app.training.bytes = 0; app.toast = "Datos temporales eliminados del estado de la interfaz; candidato y métricas conservados."; render(); return; }
  if (action === "reset-ladder") { app.ladder = initialLadder(); saveLocalState(app.ladder); app.toast = "Ladder local restaurada."; render(); return; }
  if (action === "ladder-duel") {
    const bot = chooseLocalMatch(app.ladder, { difficulty: "all", deckId: app.playDeckId });
    startDuel({ deckId: "chaos-turbo", opponentDeckId: bot.deckId, ladder: { botId: bot.id, opponentRating: bot.rating, opponentName: bot.name, mode: "ladder" }, fresh: true });
    app.toast = `Duelo puntuable contra ${bot.name}.`; navigate("duel"); return;
  }
}

function renderTraining() {
  const t = app.training;
  const stats = t.stats;
  const evaluation = t.evaluation;
  const status = t.status ?? "IDLE";
  const statusLabel = ({ IDLE: "Esperando trabajo", RUNNING: "Ejecutando duelos", PAUSED: "Pausado en checkpoint", CANCELLED: "Cancelado; candidato conservado", COMPLETED: "Completado", EVALUATING: "Evaluando conjunto separado", FAILED: "Error; checkpoint conservado", CLEANED: "Temporales limpiados", DISCARDED: "Candidato descartado" })[status] ?? status;
  const actionLabel = t.running ? "Pausar" : status === "PAUSED" ? "Reanudar" : "Ejecutar lote real";
  const actionName = t.running ? "pause-training" : status === "PAUSED" ? "resume-training" : "start-training";
  const deckOptions = playableDecks().map((deck) => `<option value="${esc(deck.id)}" ${deck.id === t.deckId ? "selected" : ""}>${esc(deck.name)}</option>`).join("");
  const progress = t.total ? Math.round((t.complete / t.total) * 100) : 0;
  const candidateWeights = Object.entries(t.candidate?.policyWeights ?? {}).slice(0, 6).map(([key, value]) => `<div><span>${esc(key)}</span><b>${Number(value).toFixed(2)}</b></div>`).join("");
  const candidateMarkup = t.candidate
    ? `<div class="candidate-head"><span class="bot-avatar">N</span><div><strong>Nexo</strong><small>${esc(t.candidate.algorithm)} · ${t.approved ? "APROBADO" : "CANDIDATO"}</small></div></div><div class="weight-grid">${candidateWeights}</div><div class="candidate-actions"><button class="text-button" data-action="approve-candidate" ${t.certification?.certified ? "" : "disabled"}>Promover refinamiento</button><button class="text-button" data-action="discard-candidate">Descartar candidato</button></div>`
    : `<div class="empty-state"><strong>Sin candidato</strong><p>El primer checkpoint conservará el refinamiento.</p></div>`;
  const evaluationMarkup = evaluation
    ? `<div class="eval-score"><strong>${Math.round(evaluation.winRate * 100)}%</strong><span>win rate</span></div><div class="eval-lines"><div><span>Partidas</span><b>${evaluation.games}</b></div><div><span>Mazos</span><b>${evaluation.deckCount ?? 0}</b></div><div><span>Inválidas</span><b class="${evaluation.invalid ? "danger-text" : "good-text"}">${evaluation.invalid}</b></div></div>`
    : `<div class="empty-state"><strong>Sin evaluación separada</strong><p>Sus semillas y mazos no participan en el aprendizaje.</p></div>`;
  return `<section class="page training-page"><div class="page-head"><div><span class="eyebrow">NEXO LAB / CURRÍCULO MULTIMAZO</span><h1>Refinar la IA universal</h1><p>El mismo bot aprende sobre varios mazos; sus guardas de coherencia no se pueden sobrescribir.</p></div><div class="head-actions"><span class="resource-chip">OFFLINE</span><span class="resource-chip">WORKERS ${t.workers}</span></div></div><div class="training-grid"><aside class="training-config side-card"><div class="side-title"><span>CONFIGURAR TRABAJO</span><span class="tiny-label">${esc(status)}</span></div><label>Bot<input value="Nexo" disabled/></label><label>Mazo de foco<select id="training-deck" ${t.running ? "disabled" : ""}>${deckOptions}</select></label><label>Presupuesto máximo<input id="training-total" type="number" min="10" max="10000" step="100" value="${t.total}" ${t.running ? "disabled" : ""}/></label><div class="config-row"><span>Checkpoint</span><strong>Cada 25 duelos o al pausar</strong></div><div class="training-actions"><button class="primary-button wide" data-action="${actionName}">${actionLabel}</button><button class="ghost-button wide" data-action="cancel-training" ${t.running || t.candidate ? "" : "disabled"}>Cancelar y conservar</button></div><div class="training-actions"><button class="ghost-button wide" data-action="evaluate-training" ${t.candidate && !t.running ? "" : "disabled"}>Evaluar aparte</button><button class="ghost-button wide" data-action="clean-training" ${t.bytes ? "" : "disabled"}>Limpiar temporales</button></div><p class="fine-print">El presupuesto no otorga nivel. La promoción exige razonamiento intacto, 0 duelos inválidos y evidencia multimazo separada.</p></aside><div class="training-main"><div class="run-banner"><div class="run-status"><span class="status-orb ${t.running ? "running" : status === "COMPLETED" ? "done" : ""}"></span><div><strong>${esc(statusLabel)}</strong><small>${t.complete}/${t.total} duelos</small></div></div><div class="progress"><span style="width:${progress}%"></span></div><div class="progress-number">${progress}%</div></div><div class="metric-grid">${trainingMetric("PARTIDAS", stats?.games ?? t.complete, "OCGCore")}${trainingMetric("WIN RATE", stats ? `${Math.round(stats.winRate * 100)}%` : "—", "entrenamiento")}${trainingMetric("INVÁLIDAS", stats?.invalid ?? "—", "debe ser 0")}${trainingMetric("MODELO", t.bytes ? `${(t.bytes / 1024).toFixed(1)} KB` : "—", "compacto")}</div><div class="resource-panel side-card"><div class="data-row"><span>Checkpoint</span><b>${t.checkpoint ? `${t.checkpoint.completed}/${t.total}` : "pendiente"}</b></div><div class="data-row"><span>Evaluación</span><b>${evaluation ? `${evaluation.games} duelos · ${evaluation.deckCount ?? 0} mazos` : "pendiente"}</b></div><div class="data-row"><span>Promoción</span><b>${t.certification?.certified ? "permitida" : esc(t.certification?.reason ?? "pendiente")}</b></div></div><div class="training-panels"><div class="side-card candidate-card"><div class="side-title"><span>REFINAMIENTO CANDIDATO</span><span class="tiny-label">NEXO</span></div>${candidateMarkup}</div><div class="side-card evaluation-card"><div class="side-title"><span>EVALUACIÓN SEPARADA</span><span class="tiny-label">SEMILLAS NUEVAS</span></div>${evaluationMarkup}</div></div></div></div></section>`;
}

async function startTraining({ resume = false } = {}) {
  return orchestrateTraining({ app, render, saveBotRegistry, resume });
}
function handleAction(action) {
  if (action === "restart-sandbox-duel") {
    if (app.activeSandboxScenario) {
      startSandboxDuel(app.activeSandboxScenario);
      app.toast = "Escenario de prueba reiniciado al estado inicial.";
    }
    return;
  }
  if (action === "edit-sandbox-scenario") {
    navigate("sandbox");
    return;
  }
  if (action === "start-sandbox-duel" || action === "start-duel") {
    startSandboxDuel(app.sandbox);
    return;
  }
  if (action === "open-play") { navigate("play"); return; } if (action === "open-sandbox") { navigate("sandbox"); return; }
  if (action === "start-universal-duel") {
    app.playMode = "bot";
    app.playBotId = UNIVERSAL_BOT_ID;
    app.playOpponentDeckId = app.botCatalogDeckId;
    app.opponentDeckId = app.botCatalogDeckId;
    persistPlaySelection();
    startDuel({ deckId: app.playDeckId, opponentDeckId: app.botCatalogDeckId, botId: app.playBotId, fresh: true });
    app.toast = `Duelo contra Nexo con ${builderDeckById(app.botCatalogDeckId).name}.`;
    navigate("duel");
    return;
  }
  if (action === "open-decks") { navigate("deck-builder"); return; }
  if (action === "open-settings") { navigate("settings"); return; }
  if (action === "toggle-fullscreen") { void toggleFullscreen(); return; }
  if (action === "start-play") {
    app.duelDeckId = app.playDeckId;
    app.opponentDeckId = app.playOpponentDeckId;
    if (app.playMode === "ranked") {
      const bot = chooseLocalMatch(app.ladder, { difficulty: "all", deckId: app.playDeckId });
      startDuel({ deckId: app.playDeckId, opponentDeckId: bot.deckId, ladder: { botId: bot.id, opponentRating: bot.rating, opponentName: bot.name, mode: "ladder" }, fresh: true });
      app.toast = `Duelo ranked contra ${bot.name}.`;
    } else {
      startDuel({ deckId: app.playDeckId, opponentDeckId: app.playOpponentDeckId, botId: app.playBotId, fresh: true });
      app.toast = `Duelo preparado: ${builderDeckById(app.playDeckId).name} contra ${builderDeckById(app.playOpponentDeckId).name}.`;
    }
    navigate("duel");
    return;
  }
  if (action === "pause-training") {
    const training = app.training;
    training.requestedStatus = "PAUSED";
    training.abortController?.abort();
    training.status = "PAUSED";
    app.toast = "Pausa solicitada; el motor cerrará la partida actual y conservará el checkpoint.";
    render();
    return;
  }
  if (action === "resume-training") { startTraining({ resume: true }); return; }
  if (action === "cancel-training") {
    const training = app.training;
    training.requestedStatus = "CANCELLED";
    training.abortController?.abort();
    if (!training.running) training.status = "CANCELLED";
    app.toast = "Cancelación solicitada; candidato y métricas se conservarán.";
    render();
    return;
  }
  if (action === "evaluate-training") {
    const training = app.training;
    if (training.candidate && !training.running) {
      training.status = "EVALUATING";
      render();
      const candidate = hydrateBot(training.candidate?.manifest?.() ?? training.candidate);
      evaluateUniversalPolicy({
        candidate,
        deckIds: training.opponentDeckIds,
        gamesPerDeck: Math.max(1, Math.min(10, Math.floor(Math.max(1, training.complete) / 10))),
        seed: training.seed + 8000,
      }).then((evaluation) => {
        training.evaluation = evaluation;
        const manifest = candidate.manifest?.() ?? candidate;
        const quality = universalQualityGate({ training: training.stats, evaluation, reasoningAudit: manifest.reasoningAudit });
        training.certification = { schema: 1, certified: quality.passed, reason: quality.reason, quality, reasoningAudit: manifest.reasoningAudit };
        training.status = "PAUSED";
        app.toast = "Evaluación separada OCGCore completada.";
      }).catch((error) => {
        training.status = "FAILED";
        training.error = error instanceof Error ? error.message : String(error);
        app.toast = `Evaluación detenida: ${training.error}`;
      }).finally(() => render());
    }
    return;
  }
  if (action === "apply-series-swap") {
    const pending = app.pendingLadder;
    if (pending?.currentDeck && pending.sideInCard !== undefined && pending.sideOutCard !== undefined) {
      try {
        pending.currentDeck = applySideDeckSwap(pending.currentDeck, { mainOut: [pending.sideOutCard], sideIn: [pending.sideInCard] });
        pending.sideInCard = undefined;
        pending.sideOutCard = undefined;
        app.toast = "Side Deck aplicado para la siguiente partida.";
      } catch (error) { app.toast = `Cambio de Side Deck rechazado: ${error.message}`; }
      render();
    }
    return;
  }
  if (action === "next-series-game") {
    const pending = app.pendingLadder;
    if (pending?.match && !pending.match.completed) {
      const currentDeck = pending.currentDeck ?? builderDeckById(app.duelDeckId);
      startDuel({ deckId: app.duelDeckId, opponentDeckId: pending.opponentDeckId ?? app.opponentDeckId, deckOverride: currentDeck, ladder: { ...pending, settledSeed: null }, fresh: true });
      app.toast = `Comienza la partida ${pending.match.gameNumber + 1} de la serie.`;
      render();
    }
    return;
  }
  if (action === "end-series") {
    if (app.pendingLadder?.match) app.toast = `Serie abandonada en ${app.pendingLadder.match.playerWins}-${app.pendingLadder.match.opponentWins}; no se registra rating.`;
    app.pendingLadder = null;
    render();
    return;
  }
  if (action === "approve-candidate") {
    const training = app.training;
    const manifest = training.candidate?.manifest?.() ?? training.candidate;
    if (manifest?.algorithm) {
      try {
        if (!training.certification?.certified) throw new Error("El candidato todavía no ha superado las puertas de calidad.");
        app.botRegistry = recordBotModel(app.botRegistry, { botId: UNIVERSAL_BOT_ID, deckId: training.deckId, model: manifest });
        saveBotRegistry(app.botRegistry);
        const stored = app.botRegistry.bots.find((bot) => bot.id === training.botId);
        const profile = stored?.profiles?.[training.deckId];
        if (training.certification?.certified && stored && profile) {
          app.ladder = upsertLadderBot(app.ladder, { ...stored, deckId: training.deckId, intelligence: profile.intelligence, technicalRating: profile.technicalRating, uncertainty: profile.uncertainty });
          saveLocalState(app.ladder);
        }
        app.playBotId = UNIVERSAL_BOT_ID;
        app.playOpponentDeckId = training.deckId;
        persistPlaySelection();
        training.approved = true;
        app.toast = training.certification?.certified ? `Modelo guardado y habilitado en ladder como IA ${training.certification.targetIntelligence}.` : "Modelo candidato guardado para partida libre; aún no entra en ladder certificada.";
      } catch (error) {
        training.approved = false;
        app.toast = `No se pudo guardar el modelo: ${error.message}`;
      }
    }
    render();
    return;
  }
  if (action === "discard-candidate") { app.training.candidate = null; app.training.approved = false; app.training.status = "DISCARDED"; app.toast = "Candidato descartado; las métricas se conservan."; render(); return; }
  if (action === "clean-training") { app.training.results = []; app.training.bytes = 0; app.training.status = "CLEANED"; app.toast = "Chunks temporales eliminados del estado de la interfaz; métricas y candidato conservados."; render(); return; }
  if (action === "ladder-practice") { const bot = chooseLocalMatch(app.ladder, { difficulty: "all", deckId: app.playDeckId }); startDuel({ deckId: app.duelDeckId, opponentDeckId: bot.deckId, ladder: { botId: bot.id, opponentRating: bot.rating, opponentName: bot.name, mode: "practice" }, fresh: true }); app.toast = `Práctica contra ${bot.name}; no modifica el rating.`; navigate("duel"); return; }
  if (action === "start-training" && app.training.status === "PAUSED") { startTraining({ resume: true }); return; }
  handleSecondaryAction(action);
}
window.addEventListener("popstate", () => navigate(modeFromHash(window.location.hash), { history: false }));
window.addEventListener("hashchange", () => navigate(modeFromHash(window.location.hash), { history: false }));
document.addEventListener("fullscreenchange", () => { if (app.mode === "duel") render(); });
const unlockDuelAudio = () => { void duelAudio.unlock(); };
window.addEventListener("pointerdown", unlockDuelAudio, { once: true, passive: true });
window.addEventListener("keydown", unlockDuelAudio, { once: true });
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const tagName = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
  if (app.menuOpen) {
    app.menuOpen = false;
    render();
    document.querySelector("[data-menu-toggle]")?.focus();
  } else if (app.duelPhaseConfirmation) {
    app.duelPhaseConfirmation = null;
    render();
  } else if (app.selectedCardUid !== null || app.inspectedCard !== null) {
    app.selectedCardUid = null;
    app.inspectedCard = null;
    render();
  }
});
window.addEventListener("error", (event) => {
  console.error("[GOAT Lab Global Error]", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.warn("[GOAT Lab Unhandled Rejection]", event.reason);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (app.mode === "duel" && app.duel) {
      saveActiveDuelState();
    }
  } else {
    if (app.mode === "duel") {
      render();
    }
  }
});
window.addEventListener("pagehide", () => {
  if (app.mode === "duel" && app.duel) {
    saveActiveDuelState();
  }
});
if (!window.location.hash) window.history.replaceState({ mode: app.mode }, "", hashForMode(app.mode)); render(); void installBundledBotModels();

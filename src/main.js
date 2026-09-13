import { loadSavedDecks, persistSavedDecks, loadSettings, persistSettings, loadPlaySelection, persistPlaySelection, saveActiveDuelState as saveActiveDuelStateToStorage, clearActiveDuelState, loadSavedActiveDuelState } from "./ui/app-storage.js";
import { renderDeckBuilderPage, bindDeckBuilderEvents } from "./ui/deck-builder-page.js";
import { renderTrainingPage } from "./ui/training-page.js";
import { handleTrainingAction } from "./ui/training-actions.js";
import { renderPlayLobbyPage, renderSettingsPage, renderLadderPage, renderResearchPage } from "./ui/app-pages.js";
import { preloadDuelImages } from "./assets/card-preloader.js";
import "./styles.css"; import "./ui/duel-hud.css"; import "./ui/sprite-theme.css"; import "./ui/responsive-menu-system.css"; import "./ui/adaptive-polish.css"; import "./ui/visual-remaster.css"; import "./ui/ranked-system.css"; import "./ui/profile-page.css"; import "./ui/ipad-touch.css";
import { initIpadTouchController } from "./ui/ipad-touch-controller.js";
import { renderRankedOverlays, renderRankBadge, rankSpriteFile, clearRankedQueueTimers, startRankedQueue, cancelRankedQueue, acceptRankedMatch, enterRankedDuel, bindRankedPickerEvents } from "./ui/ranked-modal.js";
import { DIVISION_ROMAN } from "./ranking/deck-tiers.js";
import { CARD_DATABASE_VERSION, CARD_KIND, VALIDATION_STATUS } from "./engine/constants.js";
import { CARDS, getCard } from "./engine/cards.js";
import { copyLimit, listStatus } from "./format/banlist.js";
import { createDuel, legalActions, observe, step } from "./engine/game.js";
import { DECK_PRESETS, applySideDeckSwap, createCustomDeck, deckFromYdk, deckToYdk, getDeck, validateDeck } from "./decks/decks.js";
import { NEXO2_ALL_DECK_IDS, NEXO2_ALL_OPPONENT_DECK_IDS, NEXO2_BOT_ID, NEXO2_DECK_IDS, NEXO2_OPPONENT_DECK_IDS, NEXO_CANDIDATE_BOT_ID, UNIVERSAL_BOT_ID, botDescriptor, createBotForDeck, createBotRegistry, ensureBotDeckProfile, isNexo2Deck, isNexo2OpponentDeck, isNexo2MatchupAllowed, listActiveBotSpecs, hydrateBot, recordBotGame, recordBotModel, upsertBotIdentity } from "./bots/bot-system.js";
import { DEFAULT_CORE_OPPONENT_DECKS, evaluateUniversalPolicy, universalQualityGate } from "./training/training.js";
import { applyLadderResult, chooseLocalMatch, chooseRankedMatch, createLocalMatch, initialLadder, ladderView, leagueForRating, recordMatchGame, recordRankedAbandonment, upsertLadderBot } from "./ranking/ladder.js";
import { hasReasoningCertification } from "./bots/intelligence.js";
import { duelResultMarkup } from "./duel-result.js";
import { loadLocalState, saveLocalState } from "./storage/local.js";
import { loadBotRegistry, saveBotRegistry } from "./storage/bot-registry.js";
import { cardForCode, createOcgcoreSession } from "./engine/ocgcore-session.js";
import { OCGCORE_ASSET_SOURCE, OCGCORE_CARD_ENTRIES, OCGCORE_MISSING_SCRIPTS } from "./data/ocgcore-assets.js";
import { bindMenuKeyboard, hashForMode, menuMarkup, modeFromHash } from "./ui/navigation.js";
import { initSpriteMenu, destroySpriteMenu } from "./ui/sprite-menu.js"; import { renderHomePage } from "./ui/home-page.js"; import { installMenuScrollNavigation } from "./ui/menu-scroll.js"; import { renderProfilePage, renderOnboardingModal } from "./ui/profile-page.js";
import { initSubmenuAtmosphere } from "./ui/submenu-atmosphere.js";
import { initDuelAtmosphere } from "./ui/duel-atmosphere.js";
import { morphDom } from "./ui/dom-morph.js";
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
import { playDuelResultAudio, playMatchmakingAudio, syncAppAudio } from "./ui/app-audio.js";
const root = document.querySelector("#app"); const actionRegistry = createActionRegistry(); const duelAudio = createDuelAudioController();
let duelPresentationTimer = null; let duelBotTimer = null; let duelPhaseTimer = null; let duelPhaseTimerKey = null; let lifeMotionTimer = null;
function saveActiveDuelState() { saveActiveDuelStateToStorage(app); }
function persistBuilderDraft() { if (!app.savedDecks.some((deck) => deck.id === app.builderDeck?.id)) return; const saved = createCustomDeck(structuredClone(app.builderDeck)); app.builderDeck = saved; app.savedDecks = [...app.savedDecks.filter((deck) => deck.id !== saved.id), saved]; persistSavedDecks(app.savedDecks); }
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
  menuOpen: false, duelMenuOpen: false,
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
  duelAudioSessionKey: null, lastDuelResultCueKey: null,
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
  duelPriorityPromptKey: null,
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
  rankedQueue: {
    state: "idle",
    startTime: null,
    estimatedTime: 12,
    timerInterval: null,
    acceptTimeout: null,
    acceptDeadline: null,
    searchTimeout: null,
    opponent: null
  },
  rankedResultModal: null,
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
if (app.ladder?.activeRankedMatch?.active && !loadSavedActiveDuelState()) { app.ladder = recordRankedAbandonment(app.ladder) ?? app.ladder; saveLocalState(app.ladder); clearActiveDuelState(); }
if (app.ladder?.quitPenalty?.applied) { app.quitPenaltyModal = { open: true, penalty: { ...app.ladder.quitPenalty } }; app.ladder.quitPenalty = null; saveLocalState(app.ladder); }
if (!app.ladder.player.rankedDeckId) app.ladder.player.rankedDeckId = "chaos-turbo";
if (!app.ladder.player.nameSet && app.ladder.player.name === "Duelista" && (app.ladder.player.games ?? 0) === 0) app.onboardingOpen = true;
if (!app.ladder.player.tier || !["Bronce", "Oro", "Esmeralda", "Diamante"].includes(app.ladder.player.tier)) {
  const norm = leagueForRating(app.ladder.player.rating ?? 1200);
  app.ladder.player.tier = norm.league;
  app.ladder.player.division = norm.division ?? 5;
  app.ladder.player.divisionRoman = norm.divisionRoman ?? "V";
  app.ladder.player.lp = Math.max(0, Math.min(100, Number(app.ladder.player.lp) || 0));
  app.ladder.player.demotionShield = 1;
}
app.boardTilt = app.settings.boardTilt;
app.sandbox = createDefaultScenarioState(app.savedDecks);
const availableDeckIds = new Set([...DECK_PRESETS, ...app.savedDecks].map((deck) => deck.id));
if (!availableDeckIds.has(app.playDeckId)) app.playDeckId = "chaos-turbo";
if (!availableDeckIds.has(app.playOpponentDeckId)) app.playOpponentDeckId = "goat-control";
for (const bot of initialLadder().bots) if (activeBotIds.has(bot.id) && !app.ladder.bots.some((candidate) => candidate.id === bot.id)) app.ladder = upsertLadderBot(app.ladder, bot);
if (!activeBotIds.has(app.playBotId)) app.playBotId = UNIVERSAL_BOT_ID;
if (app.playBotId === NEXO2_BOT_ID && !isNexo2MatchupAllowed(app.playDeckId, app.playOpponentDeckId)) forceNexo2PilotDecks();
app.duelDeckId = app.playDeckId;
app.opponentDeckId = app.playOpponentDeckId;
persistPlaySelection(); async function installBundledBotModels() {}
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function sameCardUid(left, right) { return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right); }
function actionNeedsConfirmation(action) { return action?.type === "SURRENDER"; }
function canProceedWithAction(action) { return (!app.settings.confirmActions || !actionNeedsConfirmation(action)) || (typeof window.confirm !== "function" || window.confirm("¿Quieres rendirte y terminar el duelo?")); }
async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const area = document.createElement("textarea"); area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
    document.body.append(area); area.select(); const copied = document.execCommand?.("copy") ?? false; area.remove(); return copied;
  } catch { return false; }
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
function normalizeAudioVolume(value, fallback = 35) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}
function setAudioVolume(value) {
  const volume = normalizeAudioVolume(value);
  app.settings.sfxVolume = volume;
  duelAudio.setPreferences({ enabled: app.settings.sfxEnabled, volume: volume / 100 });
  document.querySelectorAll("[data-sfx-volume-output], [data-duel-volume-output]").forEach((output) => { output.textContent = `${volume} %`; });
  document.querySelectorAll("[data-sfx-volume], [data-duel-volume]").forEach((control) => { control.value = String(volume); });
  persistSettings();
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
  return `${cleaned || "unnamed-card"}.webp`;
}
function cardImagePath(card) {
  return `./goat-card-images/${encodeURIComponent(card?.imageFile ?? cardImageFileName(card?.name))}`;
}
function statusPill(status) {
  const text = status === VALIDATION_STATUS.SUPPORTED ? "LISTO" : status === VALIDATION_STATUS.EXPERIMENTAL ? "EXPERIMENTAL" : status;
  return `<span class="status-pill status-${String(status).toLowerCase()}">${esc(text)}</span>`;
}
function cardMarkup(instance, { hidden = false, compact = false, motion = false, imageLoading = null } = {}) {
  if (!instance) return `<div class="field-slot empty"><span>—</span></div>`;
  const card = instance.cardId === null ? null : getCard(instance.cardId);
  const monsterLike = card
    ? card.kind === CARD_KIND.MONSTER || card.kind === CARD_KIND.TOKEN
    : Number(instance.location) === 4 || instance.zone === "MONSTER";
  const imageBacked = card?.kind !== CARD_KIND.TOKEN;
  const defense = monsterLike && (instance.defensePosition === true || instance.position === "DEFENSE");
  const cardUid = instance.uid ?? (instance.cardId ? `card-${instance.cardId}` : "");
  if (hidden || !card) return `<div class="card back face-down ${defense ? "defense-position" : "attack-position"} ${compact ? "compact" : ""} ${motion ? "card-place" : ""}" data-card-uid="${esc(cardUid)}"><img class="card-back-image" src="./goat-card-images/Back_Image.webp" alt="Dorso de carta" draggable="false" /></div>`;
  if (instance.faceUp === false) return `<div class="card back face-down known-set ${defense ? "defense-position" : "attack-position"} ${compact ? "compact" : ""} ${motion ? "card-place" : ""}" data-card-uid="${esc(cardUid)}" title="Colocada: ${esc(card.name)}"><img class="card-back-image" src="./goat-card-images/Back_Image.webp" alt="Dorso de carta" draggable="false" /><small class="set-card-identity"><b>SET</b>${esc(card.name)}</small></div>`;
  const fallback = `<div class="card-fallback"${imageBacked ? " hidden" : ""}>
    <div class="card-top"><span>${esc(monsterLike ? card.kind === CARD_KIND.TOKEN ? "TOKEN" : "MONSTER" : card.kind)}</span><span>${card.level ? `★${card.level}` : ""}</span></div>
    <div class="card-name">${esc(card.name)}</div>
    ${monsterLike ? `<div class="card-stats">${card.atk} <span>/</span> ${card.def}</div>` : `<div class="card-type">${esc(card.spellType ?? card.trapType ?? card.kind)}</div>`}
    <div class="card-text">${esc(card.text)}</div>
  </div>`;
  return `<div class="card ${imageBacked ? "image-card" : ""} ${String(card.kind).toLowerCase()} ${instance.faceUp ? "face-up" : "face-down"} ${defense ? "defense-position" : "attack-position"} ${compact ? "compact" : ""} ${motion ? "card-place" : ""}" data-card-uid="${esc(cardUid)}" title="${esc(card.name)}">
    ${imageBacked ? `<img class="card-image" src="${esc(cardImagePath(card))}" alt="${esc(card.name)}" loading="${esc(imageLoading ?? "eager")}" decoding="async" draggable="false" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" />` : ""}
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
      return `<div class="board-card-wrap ${popover ? "has-card-actions" : ""}" data-card-uid="${esc(instance.uid)}"><button type="button" class="board-card-button ${selected ? "selected" : ""} ${actionReady ? "action-ready" : ""}" data-card-inspect="${esc(instance.uid)}" aria-expanded="${selected}" aria-label="Seleccionar ${esc(name)} en el Campo${actionHint}">${visual}${model ? cardAffordanceBadges(model, instance, { esc }) : ""}</button>${popover}</div>`;
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
  if (view.inPlacements) return `<div class="rank-chip tier-unranked"><img class="rank-chip-sprite" src="./sprites/Unranked.png" alt="Unranked" /><span><strong>Unranked</strong><small>${view.placements?.gamesPlayed ?? 0}/10</small></span></div>`;
  const tierName = view.tier ?? view.league ?? "Bronce";
  const roman = view.divisionRoman ?? DIVISION_ROMAN[view.division] ?? "V";
  return `<div class="rank-chip tier-${esc(tierName.toLowerCase())}"><img class="rank-chip-sprite" src="./sprites/${esc(rankSpriteFile(tierName))}" alt="${esc(tierName)}" /><span><strong>${esc(tierName)} ${esc(roman)}</strong><small>${view.lp} LP · ${view.rating} rating</small></span></div>`;
}
function playableDecks() {
  return [...DECK_PRESETS, ...app.savedDecks];
}
function deckSelectMarkup(selected, { pilotOnly = false, opponentOnly = false } = {}) {
  const allDecks = playableDecks();
  const decks = pilotOnly ? allDecks.filter((deck) => isNexo2Deck(deck.id)) : opponentOnly ? allDecks.filter((deck) => isNexo2OpponentDeck(deck.id)) : allDecks;
  const visibleDecks = decks.length ? decks : allDecks;
  const resolvedSelected = visibleDecks.some((deck) => deck.id === selected) ? selected : visibleDecks[0]?.id;
  return visibleDecks.map((deck) => `<option value="${esc(deck.id)}" ${deck.id === resolvedSelected ? "selected" : ""}>${esc(deck.name)} · ${deck.main.length} cartas</option>`).join("");
}
function availableBotSpecs() {
  return listActiveBotSpecs();
}
function nexo2SelectionAllowed(playerDeckId = app.playDeckId, opponentDeckId = app.playOpponentDeckId) {
  return isNexo2MatchupAllowed(playerDeckId, opponentDeckId);
}
function nexo2RestrictionCopy() {
  return `Bot: ${NEXO2_ALL_DECK_IDS.length} mazos propios · rival: ${NEXO2_ALL_OPPONENT_DECK_IDS.length} mazos del catálogo.`;
}
function forceNexo2PilotDecks() {
  const botFallback = NEXO2_ALL_DECK_IDS[0];
  const opponentFallback = NEXO2_ALL_OPPONENT_DECK_IDS[0];
  let changed = false;
  if (!isNexo2OpponentDeck(app.playDeckId)) { app.playDeckId = opponentFallback; changed = true; }
  if (!isNexo2Deck(app.playOpponentDeckId)) { app.playOpponentDeckId = botFallback; changed = true; }
  app.duelDeckId = app.playDeckId;
  app.opponentDeckId = app.playOpponentDeckId;
  return changed;
}
function selectedBotSpec(botId = app.playBotId) {
  return availableBotSpecs().find((bot) => bot.id === botId) ?? availableBotSpecs()[0];
}
function botSelectMarkup(selected) {
  const bots = [{ id: UNIVERSAL_BOT_ID, name: "Nexo 1" }, { id: NEXO2_BOT_ID, name: "Nexo 3" }];
  return bots.map((bot) => `<option value="${esc(bot.id)}" ${bot.id === selected ? "selected" : ""}>${esc(bot.name)}</option>`).join("");
}
function renderPlayLobby() { return renderPlayLobbyPage({ app, builderDeckById, selectedBotSpec, describeDeckPlan, buildDeckKnowledge, deckSelectMarkup, botSelectMarkup, esc, NEXO2_ALL_DECK_IDS, NEXO2_ALL_OPPONENT_DECK_IDS, NEXO2_BOT_ID, NEXO_CANDIDATE_BOT_ID, getCard }); }
function renderSettings() {
  const settings = app.settings;
  return `<section class="page menu-page settings-page"><div class="page-head"><div><span class="eyebrow">SETTINGS / LOCAL PROFILE</span><h1>Ajustes</h1><p>Preferencias de interfaz guardadas en este navegador. No modifican las reglas del duelo.</p></div></div><div class="settings-grid"><div class="side-card"><div class="side-title"><span>INTERFAZ DE LA MESA</span><span class="tiny-label">LOCAL</span></div><label class="setting-row"><span><strong>Animaciones del duelo</strong><small>Completa, reducida o desactivada. También respeta la preferencia del sistema.</small></span><select data-motion-level aria-label="Nivel de animaciones"><option value="full" ${settings.motionLevel === "full" ? "selected" : ""}>Completa</option><option value="reduced" ${settings.motionLevel === "reduced" ? "selected" : ""}>Reducida</option><option value="off" ${settings.motionLevel === "off" ? "selected" : ""}>Desactivada</option></select></label><label class="setting-row"><span><strong>Confirmar acciones</strong><small>Muestra una confirmación antes de acciones irreversibles.</small></span><input type="checkbox" data-setting="confirmActions" ${settings.confirmActions ? "checked" : ""}/></label><label class="setting-row"><span><strong>Sonido del duelo</strong><small>Señales locales para fases, cadenas, FLIP, resolución y LP.</small></span><input type="checkbox" data-setting="sfxEnabled" ${settings.sfxEnabled ? "checked" : ""}/></label><label class="setting-row"><span><strong>Menús compactos</strong><small>Muestra más opciones con una jerarquía sencilla, como el menú principal.</small></span><input type="checkbox" data-setting="compactMenus" ${settings.compactMenus ? "checked" : ""}/></label><label class="setting-row"><span><strong>Controles táctiles</strong><small>Aumenta botones y separaciones para jugar con el dedo.</small></span><input type="checkbox" data-setting="touchControls" ${settings.touchControls ? "checked" : ""}/></label><label class="setting-row"><span><strong>Contraste alto</strong><small>Refuerza marcos, texto y selección activa.</small></span><input type="checkbox" data-setting="highContrast" ${settings.highContrast ? "checked" : ""}/></label><label class="setting-row"><span><strong>Texto grande</strong><small>Aumenta la lectura de menús sin cambiar el campo.</small></span><input type="checkbox" data-setting="largeText" ${settings.largeText ? "checked" : ""}/></label><label class="setting-row setting-volume"><span><strong>Volumen general</strong><small>Música y efectos · <output data-sfx-volume-output>${Math.round(settings.sfxVolume)} %</output> · se aplica al instante.</small></span><input type="range" min="0" max="100" step="1" value="${Math.round(settings.sfxVolume)}" data-sfx-volume aria-label="Volumen general"/></label></div><div class="side-card settings-guide"><span class="eyebrow">LECTURA RÁPIDA</span><h2>Una acción, un lugar</h2><p>Selecciona una carta legal y sus acciones aparecerán junto a ella; el inspector permanece abierto para poder leer el efecto.</p><button class="ghost-button" data-settings-reset>Restaurar preferencias</button></div></div></section>`;
}
function renderBots() { return renderBotsPage({ deck: builderDeckById(app.botCatalogDeckId), deckPresets: playableDecks(), escapeHtml: esc }); }
function shell(content) {
  const overlays = `${renderRankedOverlays({ app, esc, builderDeckById, playableDecks, getCard })}${renderOnboardingModal({ app, esc, playableDecks, getCard })}`;
  return renderAppShell({ app, content, menu: menuMarkup({ activeMode: app.mode, open: app.menuOpen, escapeHtml: esc }), rank: rankMarkup(), escapeHtml: esc, overlays });
}
function navigate(mode, { history = true, focus = true } = {}) {
  app.duelMenuOpen = false;
  navigateApp({ app, mode, parseMode: modeFromHash, modeHash: hashForMode, leaveFullscreen, rerender: render, history, focus });
}
function installTrainingWorkerControl() {
  installTrainingControls({ app, decks: playableDecks(), rerender: render });
}
function render() {
  actionRegistry.clear();
  const renderedDuelView = app.mode === "duel" && app.duel ? (app.duel.kind === "ocgcore" ? app.duel.view() : observe(app.duel, 0)) : null;
  syncDuelPriorityConfirmation(renderedDuelView);
  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  document.documentElement.classList.toggle("reduced-motion", app.settings.motionLevel !== "full" || systemReducedMotion);
  document.documentElement.classList.toggle("motion-off", app.settings.motionLevel === "off");
  document.documentElement.classList.toggle("duel-active", app.mode === "duel"); document.documentElement.classList.toggle("simple-menus", app.settings.compactMenus); document.documentElement.classList.toggle("touch-controls", app.settings.touchControls); document.documentElement.classList.toggle("high-contrast", app.settings.highContrast); document.documentElement.classList.toggle("large-ui-text", app.settings.largeText);
  if (app.mode !== "card-viewer" && app.cardViewerKeyHandler) { document.removeEventListener("keydown", app.cardViewerKeyHandler); app.cardViewerKeyHandler = null; }
  const content = app.mode === "home" ? renderHomePage({ app, escapeHtml: esc, savedDuel: loadSavedActiveDuelState() }) : app.mode === "profile" ? renderProfilePage({ app, esc, getCard, builderDeckById, playableDecks }) : app.mode === "play" ? renderPlayLobby() : app.mode === "bots" ? renderBots() : app.mode === "sandbox" ? renderSandboxPage(app.sandbox, { savedDecks: app.savedDecks, favoriteCardIds: app.favoriteCardIds, cardWorkStatuses: app.cardWorkStatuses }) : app.mode === "card-viewer" ? renderCardViewerPage(app.cardViewer, { cardMarkup, favoriteCardIds: app.favoriteCardIds, cardWorkStatuses: app.cardWorkStatuses, rerender: render }) : app.mode === "duel" ? renderDuel(renderedDuelView) : app.mode === "deck-builder" ? renderDeckBuilder() : app.mode === "training" ? renderTraining() : app.mode === "ladder" ? renderLadder() : app.mode === "settings" ? renderSettings() : renderResearch();
  morphDom(root, shell(content)); syncAppAudio({ app, audio: duelAudio }); installMenuScrollNavigation(root, app.mode, { navigate }); initSubmenuAtmosphere({ mode: app.mode, motionLevel: app.settings.motionLevel }); initDuelAtmosphere({ mode: app.mode, motionLevel: app.settings.motionLevel });
  const eventList = root.querySelector(".event-drawer-list"); if (eventList) eventList.scrollTop = app.duelEventLog.scrollTop;
  
  if (app.mode === "home") {
    initSpriteMenu(app, render, leaveFullscreen);
  } else {
    destroySpriteMenu();
  }

  requestAnimationFrame(() => {
    const inspector = document.querySelector('[data-testid="card-inspector"]');
    if (inspector) inspector.classList.add('visible');
  });
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
  window.requestAnimationFrame(() => {
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
      popover.style.setProperty("--popover-nudge-x", `${Math.round(nudge)}px`);
    });
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
function playDuelCue(cue) { duelAudio.play(cue?.soundId ?? cue?.kind, { chainLink: cue?.chainLink, enabled: app.settings.sfxEnabled, volume: Number(app.settings.sfxVolume) / 100 }); }
function cueDuration(cue) {
  const duration = cue?.duration !== undefined ? Number(cue.duration) : 750;
  if (app.settings.motionLevel === "reduced") return Math.min(420, duration);
  if (app.settings.motionLevel === "off") return Math.min(150, duration);
  return duration;
}
function setDuelPresentation(input) {
  const resetRequested = input === null || input === undefined;
  const occupiedIds = new Set([app.duelPresentation?.id, ...app.duelPresentationQueue.map((cue) => cue?.id), ...app.duelFeedbackSeen].filter(Boolean));
  const cues = (Array.isArray(input) ? input : [input]).filter((cue) => {
    if (!cue) return false;
    if (cue.id && occupiedIds.has(cue.id)) return false;
    if (cue.id) { occupiedIds.add(cue.id); app.duelFeedbackSeen.add(cue.id); }
    if (app.duelFeedbackSeen.size > 256) app.duelFeedbackSeen.delete(app.duelFeedbackSeen.values().next().value);
    return true;
  });
  if (!cues.length) {
    if (!resetRequested) return;
    if (duelPresentationTimer) window.clearTimeout(duelPresentationTimer);
    duelPresentationTimer = null; app.duelPresentation = null;
    app.duelPresentationQueue = []; app.duelPresentationStartedAt = 0;
    return;
  }
  if (app.duelPresentation) { app.duelPresentationQueue.push(...cues); return; }
  app.duelPresentation = cues.shift(); app.duelPresentationStartedAt = Date.now();
  app.duelPresentationQueue.push(...cues);
  playDuelCue(app.duelPresentation);
  const showNext = () => {
    app.duelPresentation = app.duelPresentationQueue.shift() ?? null; app.duelPresentationStartedAt = app.duelPresentation ? Date.now() : 0;
    duelPresentationTimer = null;
    if (app.mode === "duel") refreshDuelPresentationSurface();
    if (app.duelPresentation) { playDuelCue(app.duelPresentation); duelPresentationTimer = window.setTimeout(showNext, cueDuration(app.duelPresentation)); }
  };
  duelPresentationTimer = window.setTimeout(showNext, cueDuration(app.duelPresentation));
}

function refreshDuelPresentationSurface() {
  const board = root.querySelector(".duel-board");
  if (board) {
    for (const name of [...board.classList]) if (name.startsWith("feedback-") || name.startsWith("tier-")) board.classList.remove(name);
    if (app.duelPresentation) board.classList.add(`feedback-${app.duelPresentation.kind}`, `tier-${app.duelPresentation.tier || "notable"}`);
  }
  const host = root.querySelector("[data-duel-presentation-host]");
  if (host) host.innerHTML = presentationMarkup();
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
  const delay = view.phasePaused && !view.pendingType ? AUTO_PHASE_DELAY_MS : app.settings.motionLevel === "full" ? 720 : 240;
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
  if (app.inspectedCard?.uid) { const u = duelInstanceByUid(after, app.inspectedCard.uid); if (u?.instance?.cardId) app.inspectedCard = { ...u.instance, ownerName: playerName(u.player, Boolean(app.duelManual || after?.manual)) }; }
  app.duelActionOptionsOpen = false;
  app.duelPhaseConfirmation = null;
  app.duelPriorityPromptKey = null;
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
    if (!app.duelLoading) resumeOrStartDuel(); // if (!app.duelLoading) startDuel()
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
    <div class="page-head duel-head"><div><span class="eyebrow">LIVE DUEL / LOCAL FALLBACK</span><h1>Tu mesa de pruebas</h1><p>Partida local contra Astra · ${esc(getDeck(app.opponentDeckId).name)} · semilla ${app.duel.seed}</p></div><div class="head-actions"><button class="ghost-button" data-action="new-duel">Reiniciar duelo</button><button class="ghost-button" data-action="exit-to-home">Salir al menú principal</button></div></div>
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
  return renderPhaseRail({ view, model: interaction, esc, priorityPromptOpen: Boolean(app.duelPhaseConfirmation?.priorityKey), registerAction: (action) => registerAction(actionRegistry, action) });
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

function freePriorityPrompt(view) {
  const interaction = createDuelInteractionModel(view, { manual: Boolean(app.duelManual || view?.manual) });
  if (!interaction.freePriority || !interaction.declineAction || !interaction.optionalActions.length) return null;
  const key = [
    "free-priority",
    view?.turn ?? "",
    view?.phase ?? "",
    view?.pendingType ?? "",
    view?.priorityPlayer ?? "",
    view?.turnPlayer ?? "",
    view?.decisionCount ?? "",
    view?.timingWindow?.kind ?? "",
    view?.timingWindow?.sourceEventIndex ?? "",
  ].join(":");
  return { key, action: { ...interaction.declineAction, label: "Pasar prioridad" } };
}

function syncDuelPriorityConfirmation(view) {
  if (app.mode !== "duel" || app.duel?.kind !== "ocgcore" || app.duelStart?.open) return;
  const prompt = freePriorityPrompt(view);
  if (!prompt) {
    app.duelPriorityPromptKey = null;
    if (app.duelPhaseConfirmation?.priorityKey) app.duelPhaseConfirmation = null;
    return;
  }
  if (app.duelPriorityPromptKey === prompt.key) return;
  app.duelPriorityPromptKey = prompt.key;
  app.duelPhaseConfirmation = { action: prompt.action, label: "Pasar prioridad", priorityKey: prompt.key };
}

function dismissDuelPhaseConfirmation() {
  const pending = app.duelPhaseConfirmation;
  if (pending?.priorityKey) app.duelPriorityPromptKey = pending.priorityKey;
  app.duelPhaseConfirmation = null;
  render();
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
    return `<div class="hand-card-wrap ${popover ? "has-card-actions" : ""}" data-card-uid="${esc(instance?.uid ?? `hand-${player.id}-${index}`)}" style="--fan-angle:${fanAngle}deg;--fan-lift:${fanLift}px">${card}${popover}</div>`;
  }).join("")}</div>`;
}

function renderOcgcoreDuel(view = app.duel.view()) {
  const manual = Boolean(app.duelManual || view.manual);
  const interaction = createDuelInteractionModel(view, { manual });
  const stagedResponse = interaction.mode === "response" && !app.duelActionOptionsOpen;
  const affordanceInteraction = stagedResponse && !app.selectedCardUid ? { ...interaction, actionsByCard: new Map() } : interaction;
  const playerOne = view.players[0];
  const playerTwo = view.players[1];
  const userActions = view.actions;
  const playerOneDeck = app.pendingLadder?.currentDeck ?? app.activeSandboxDecks?.[0] ?? builderDeckById(app.duelDeckId);
  const playerTwoDeck = app.activeSandboxDecks?.[1] ?? builderDeckById(app.opponentDeckId);
  const opponentName = duelBotName(view);
  const title = app.activeSandboxScenario ? "Partida de Prueba 1vs1" : manual ? "1vs1 local" : `${playerOneDeck.name} vs ${opponentName}`;
  const subtitle = app.activeSandboxScenario ? "Escenario manual · OCGCore GOAT" : `Semilla ${view.seed} · ${playerTwoDeck.name}`;
  const isRanked = Boolean(app.pendingLadder || app.ladder?.activeRankedMatch?.active);
  const pRank = ladderView(app.ladder); const oppTier = app.pendingLadder?.opponentTier ?? app.ladder?.activeRankedMatch?.opponentTier ?? "Bronce";
  const oppDiv = app.pendingLadder?.opponentDivision ?? app.ladder?.activeRankedMatch?.opponentDivision ?? 5;
  const oppDivRoman = DIVISION_ROMAN[oppDiv] ?? "V";
  const playerAvatar = isRanked ? `<div class="avatar player-avatar duel-rank-avatar">${renderRankBadge(pRank.tier, pRank.division, "small", { esc })}</div>` : `<span class="avatar player-avatar">${manual ? "1" : "Y"}</span>`;
  const playerTag = isRanked ? ` <span class="duel-rank-tag">${esc(pRank.tier)}${pRank.inPlacements ? "" : ` ${esc(pRank.divisionRoman)}`}</span>` : "";
  const opponentAvatar = isRanked ? `<div class="avatar opponent-avatar duel-rank-avatar">${renderRankBadge(oppTier, oppDiv, "small", { esc })}</div>` : `<span class="avatar opponent-avatar">${manual ? "2" : esc(opponentName.slice(0, 1).toUpperCase())}</span>`;
  const opponentTag = isRanked ? ` <span class="duel-rank-tag">${esc(oppTier)} ${esc(oppDivRoman)}</span>` : "";
  const oppSprite = app.pendingLadder?.opponentSprite ?? app.ladder?.activeRankedMatch?.opponentSprite ?? "EnemyLord.png";
  const oppArch = String(oppSprite).toLowerCase();
  const archCls = oppArch.includes("arquero") ? "archetype-arquero" : oppArch.includes("guerrero") ? "archetype-guerrero" : oppArch.includes("monje") ? "archetype-monje" : oppArch.includes("sacerdotisa") ? "archetype-sacerdotisa" : "archetype-default";
  const enemyLordBackdrop = isRanked ? `<div class="duel-enemy-lord-backdrop ${archCls}" aria-hidden="true"><div class="rival-particles-field"><span class="rival-dust d1"></span><span class="rival-dust d2"></span><span class="rival-dust d3"></span><span class="rival-dust d4"></span><span class="rival-dust d5"></span><span class="rival-dust d6"></span><span class="rival-dust d7"></span><span class="rival-dust d8"></span></div><img class="duel-enemy-lord-bg-img" src="./sprites/${esc(oppSprite)}" alt="" /></div>` : "";
  return `<section class="page duel-page">
     ${renderDuelTopbar({ view, model: interaction, manual, title, subtitle, sandbox: Boolean(app.activeSandboxScenario), fullscreenLabel: fullscreenLabel(), boardTilt: app.boardTilt, duelMenuOpen: app.duelMenuOpen, esc, botProfile: app.duelBotProfile, volume: app.settings.sfxVolume })}
     <div class="duel-layout"><div class="table-frame ${app.boardTilt ? "tilted" : ""} ${app.inspectedCard ? "has-inspector" : ""}">
       <img src="./sprites/Sprite_Pilar.png" class="duel-pillar pillar-left" alt="" />
       <img src="./sprites/Sprite_Pilar.png" class="duel-pillar pillar-right" alt="" />
       <div class="duel-board ${isRanked ? "has-enemy-lord" : ""} ${app.duelPresentation ? `feedback-${esc(app.duelPresentation.kind)} tier-${esc(app.duelPresentation.tier || "notable")}` : ""}">
         ${enemyLordBackdrop}<div class="hand-strip opponent-hand">${playerHandMarkup(playerTwo, app.selectedCardUid, manual, userActions, affordanceInteraction)}</div>
         <div class="opponent-row player-row is-opponent"><div class="player-meta">${opponentAvatar}<div><strong>${esc(playerName(playerTwo, manual))}${opponentTag}</strong><small>${esc(playerTwoDeck.name)}</small></div>${lifePointMarkup(playerTwo)}</div><div class="hand-count">HAND <b>${playerTwo.handCount}</b><span class="deck-count">DECK ${playerTwo.deckCount}</span></div></div>
         ${duelistFieldMarkup(playerTwo, userActions, { opponent: true, priority: view.priorityPlayer === 1, model: affordanceInteraction })}
          <div class="duel-mid">${phaseStripMarkup(view, userActions, manual, interaction)}<div class="duel-feedback-dock" data-testid="duel-feedback-dock">${responseActionsMarkup(view, userActions, manual, interaction)}</div></div>
         ${duelistFieldMarkup(playerOne, userActions, { opponent: false, priority: view.priorityPlayer === 0, model: affordanceInteraction })}
         <div class="player-row player-bottom is-player"><div class="player-meta">${playerAvatar}<div><strong>${playerName(playerOne, manual)}${playerTag}</strong><small>${esc(playerOneDeck.name)}</small></div>${lifePointMarkup(playerOne)}</div><div class="hand-count">HAND <b>${playerOne.handCount}</b><span class="deck-count">DECK ${playerOne.deckCount}</span></div></div>
         <div class="hand-strip player-hand">${playerHandMarkup(playerOne, app.selectedCardUid, manual, userActions, affordanceInteraction)}</div>
        </div>${app.inspectedCard ? renderDuelCardInspector({ snapshot: app.inspectedCard, getCard, cardMarkup, esc }) : ""}${eventFeedMarkup(view)}<div data-duel-presentation-host>${presentationMarkup(view)}</div>${seriesMarkup()}${duelResultMarkupProxy(view)}${duelStartOverlayMarkup(app.duelStart, { esc })}
    </div></div></section>`;
}

function renderDeckBuilder() { return renderDeckBuilderPage({ app, validateDeck, CARDS, getCard, copyLimit, listStatus, builderCardTileMarkup, cardMarkup, esc, builderZoneLabel, DECK_PRESETS, statusPill, CARD_KIND, VALIDATION_STATUS }); }
function trainingMetric(label, value, note = "") { return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`; }
function renderLadder() { return renderLadderPage({ app, ladderView, chooseLocalMatch, getDeck, esc, playableDecks, getCard }); }
function renderResearch() { return renderResearchPage({ CARDS, OCGCORE_CARD_ENTRIES, OCGCORE_MISSING_SCRIPTS, OCGCORE_ASSET_SOURCE, CARD_DATABASE_VERSION }); }
async function resumeSavedDuel(savedState) {
  const loadEpoch = beginDuelLoad(app);
  app.duelAudioSessionKey = `duel:${savedState.seed}:resume`; app.lastDuelResultCueKey = null; duelAudio.startDuelMusic(app.duelAudioSessionKey);
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
  app.duelPriorityPromptKey = null;
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
  const requestedBotId = ladder?.botId ?? botId ?? app.playBotId;
  if (requestedBotId === NEXO2_BOT_ID && !ladder?.isRankedMatch && !isNexo2MatchupAllowed(deckId, opponentDeckId)) {
    app.playBotId = UNIVERSAL_BOT_ID;
    persistPlaySelection();
    app.toast = `Nexo 2 necesita dos mazos del catálogo universal (${NEXO2_ALL_DECK_IDS.length} disponibles).`;
    if (app.mode === "play") render();
    return;
  }
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
  app.duelMenuOpen = false;
  app.activeSandboxScenario = null;
  app.activeSandboxDecks = null;
  app.duelDeckId = deckId;
  app.opponentDeckId = opponentDeckId;
  const deck = deckOverride ? structuredClone(deckOverride) : builderDeckById(deckId);
  const opponentDeck = opponentDeckOverride ? structuredClone(opponentDeckOverride) : builderDeckById(opponentDeckId);
  if (ladder && ladder.mode !== "practice" && !ladder.match && !ladder.isRankedMatch) {
    const match = createLocalMatch(app.ladder, { botId: ladder.botId, mode: ladder.mode ?? "ladder", bestOf: ladder.bestOf ?? 3, deckId, sideDeck: deck.side ?? [] });
    app.pendingLadder = match ? { ...ladder, match, currentDeck: deck, opponentDeckId } : ladder;
  } else if (ladder) {
    app.pendingLadder = { ...ladder, currentDeck: deck, opponentDeckId };
  } else {
    app.pendingLadder = null;
  }
  app.duelManual = app.playMode === "local";
  const seed = Math.floor(Math.random() * 0xffffffff);
  app.duelAudioSessionKey = `duel:${seed}:${loadEpoch}`; app.lastDuelResultCueKey = null; duelAudio.startDuelMusic(app.duelAudioSessionKey);
  const selectedBotId = requestedBotId;
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
  app.duelPriorityPromptKey = null;
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
  preloadDuelImages({ deck, opponentDeck, cardImagePath, getCard });
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
  app.duelAudioSessionKey = `sandbox:${app.duelLoadEpoch}`; app.lastDuelResultCueKey = null; duelAudio.startDuelMusic(app.duelAudioSessionKey);
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
  if (app.ladder) { app.ladder.activeRankedMatch = null; saveLocalState(app.ladder); }
  const result = app.duel.winner === 0 ? "win" : app.duel.winner === 1 ? "loss" : "draw";
  playDuelResultAudio({ app, audio: duelAudio, result });
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
  const lastEntry = app.ladder.history?.[0];
  if (lastEntry && app.pendingLadder.mode === "ladder") {
    app.rankedResultModal = {
      open: true,
      result,
      lpDelta: lastEntry.lpDelta,
      lp: lastEntry.lp,
      tier: lastEntry.tier,
      division: lastEntry.division,
      divisionRoman: lastEntry.divisionRoman,
      promoEvent: lastEntry.promoEvent,
      promoSeries: app.ladder.player.promoSeries,
      opponentName: app.pendingLadder.opponentName,
    };
  }
  app.toast = `Ladder registrada: ${result === "win" ? "victoria" : result === "loss" ? "derrota" : "empate"}. ${lastEntry ? `${lastEntry.tier} ${lastEntry.divisionRoman} (${lastEntry.lp} LP)` : `Rating ${app.ladder.player.rating}`}.`;
  app.pendingLadder = null;
}

function submitOcgcoreAction(action) {
  const before = currentDuelView();
  app.duel.respond(action);
  const after = currentDuelView();
  recordDuelTransition(action, before, after);
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

let renderAbortController = null;

function bindEvents() {
  if (renderAbortController) {
    renderAbortController.abort();
  }
  renderAbortController = new AbortController();
  const { signal } = renderAbortController;
  const on = (el, type, listener, options = {}) => {
    if (!el) return;
    el.addEventListener(type, listener, { ...options, signal });
  };
  const onAll = (selector, type, listener, options = {}) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.addEventListener(type, listener, { ...options, signal });
    });
  };

  onAll("[data-home]", "click", () => navigate("home"));
  onAll("[data-menu-toggle]", "click", () => { app.menuOpen = !app.menuOpen; render(); });
  if (app.menuOpen) {
    on(document, "click", (event) => {
      if (!event.target.closest("#main-menu, [data-menu-toggle]")) {
        app.menuOpen = false;
        render();
      }
    });
  }
  on(document, "input", (e) => { if (e.target?.id === "onboarding-name-input") app.onboardingDraftName = e.target.value; });
  onAll("[data-mode]", "click", (event) => navigate(event.currentTarget.dataset.mode));
  bindMenuKeyboard(document, { signal });
  onAll("[data-play-mode]", "click", (event) => { app.playMode = event.currentTarget.dataset.playMode; persistPlaySelection(); render(); });
  on(document.querySelector("#play-deck"), "change", (event) => {
    const nextDeckId = event.target.value;
    if (app.playBotId === NEXO2_BOT_ID && !isNexo2OpponentDeck(nextDeckId)) {
      forceNexo2PilotDecks();
      app.toast = `Nexo 2 permite ${NEXO2_ALL_OPPONENT_DECK_IDS.length} mazos rivales del catálogo.`;
    } else app.playDeckId = nextDeckId;
    app.duelDeckId = app.playDeckId;
    persistPlaySelection();
    render();
  });
  on(document.querySelector("#play-opponent-deck"), "change", (event) => {
    const nextDeckId = event.target.value;
    if (app.playBotId === NEXO2_BOT_ID && !isNexo2Deck(nextDeckId)) {
      forceNexo2PilotDecks();
      app.toast = `Nexo 2 puede utilizar los ${NEXO2_ALL_DECK_IDS.length} mazos del catálogo.`;
    } else app.playOpponentDeckId = nextDeckId;
    app.opponentDeckId = app.playOpponentDeckId;
    persistPlaySelection();
    render();
  });
  on(document.querySelector("#play-bot"), "change", (event) => {
    const requested = activeBotIds.has(event.target.value) ? event.target.value : UNIVERSAL_BOT_ID;
    if (requested === NEXO2_BOT_ID) {
      const changed = forceNexo2PilotDecks();
      app.playBotId = requested;
      app.toast = changed
        ? `Nexo 2 seleccionado: puedes usar cualquiera de los ${NEXO2_ALL_DECK_IDS.length} mazos contra cualquiera del catálogo.`
        : `Nexo 2 seleccionado. Elige dos mazos del catálogo universal (${NEXO2_ALL_DECK_IDS.length}).`;
    } else app.playBotId = requested;
    persistPlaySelection();
    render();
  });
  on(document.querySelector("#bots-deck"), "change", (event) => {
    app.botCatalogDeckId = event.target.value;
    render();
  });
  onAll("[data-card-inspect]", "click", (event) => {
    event.stopPropagation();
    const uid = event.currentTarget.dataset.cardInspect;
    const closingPopover = sameCardUid(app.selectedCardUid, uid);
    if (closingPopover) {
      app.selectedCardUid = null;
      app.inspectedCard = null;
      render();
      return;
    }
    if (!inspectKnownCard(uid)) return;
    app.selectedCardUid = uid;
    const view = currentDuelView();
    if (view?.pendingType === "SELECT_CHAIN" || view?.pendingType === "SELECT_EFFECTYN") {
      app.duelActionOptionsOpen = true;
    }
    render();
  });
  on(document.querySelector("[data-card-clear]"), "click", () => { app.selectedCardUid = null; app.inspectedCard = null; render(); });
  on(document.querySelector("[data-card-inspector-close]"), "click", () => { app.selectedCardUid = null; app.inspectedCard = null; render(); });
  on(document.querySelector("[data-duel-menu-toggle]"), "click", (event) => { event.stopPropagation(); const menu = event.currentTarget.closest(".duel-menu"); const open = !app.duelMenuOpen; if (menu) menu.dataset.open = String(open); app.duelMenuOpen = open; render(); });
  onAll(".duel-menu-panel button", "click", () => { app.duelMenuOpen = false; });
  on(document, "click", (event) => { if (app.duelMenuOpen && !event.target.closest(".duel-menu")) { app.duelMenuOpen = false; render(); } });
  on(document.querySelector(".duel-page"), "click", (event) => {
    if ((!app.selectedCardUid && !app.inspectedCard) || event.target.closest("[data-card-inspect], [data-testid='card-action-popover'], [data-testid='card-inspector']")) return;
    app.selectedCardUid = null;
    app.inspectedCard = null;
    document.querySelectorAll("[data-testid='card-action-popover']").forEach((popover) => popover.remove());
    document.querySelector("[data-testid='card-inspector']")?.remove();
    document.querySelectorAll(".board-card-button.selected, .hand-card-button.selected").forEach((card) => card.classList.remove("selected"));
  });
  onAll("[data-action-options-reveal]", "click", () => { app.duelActionOptionsOpen = true; render(); });
  on(document.querySelector("[data-phase-advance-cancel]"), "click", () => { dismissDuelPhaseConfirmation(); });
  on(document.querySelector("[data-phase-advance-confirm]"), "click", () => { const pending = app.duelPhaseConfirmation; app.duelPhaseConfirmation = null; if (pending?.action) executeDuelAction(pending.action); else render(); });
  on(document.querySelector("[data-duel-retry]"), "click", () => { if (app.activeSandboxScenario) startSandboxDuel(app.activeSandboxScenario); else startDuel(); });
  const filterEventLog = () => { const query = document.querySelector("[data-event-search]")?.value.trim().toLocaleLowerCase("es") ?? ""; const kind = document.querySelector("[data-event-filter]")?.value ?? "all"; app.duelEventLog.search = query; app.duelEventLog.filter = kind; document.querySelectorAll("[data-event-entry]").forEach((row) => { row.hidden = Boolean(query && !row.dataset.eventSearchText.includes(query)) || (kind !== "all" && row.dataset.eventKind !== kind); }); };
  const eventDrawer = document.querySelector(".duel-event-drawer"); on(eventDrawer, "toggle", () => { app.duelEventLog.open = eventDrawer.open; });
  const eventList = document.querySelector(".event-drawer-list"); on(eventList, "scroll", () => { app.duelEventLog.scrollTop = eventList.scrollTop; }, { passive: true });
  on(document.querySelector("[data-event-search]"), "input", filterEventLog);
  on(document.querySelector("[data-event-filter]"), "change", filterEventLog);
  onAll("[data-log-card-code]", "click", (event) => { const card = cardForCode(Number(event.currentTarget.dataset.logCardCode)); if (!card) return; app.inspectedCard = { cardId: card.id, ownerName: "Historial del duelo", location: 0 }; app.selectedCardUid = null; render(); });
  onAll("[data-card-choice-index]", "click", (event) => { const button = event.currentTarget; const view = currentDuelView(); if (view?.pendingType === "SELECT_UNSELECT_CARD") { const action = view.actions.find((candidate) => Number(candidate.coreResponse?.index) === Number(button.dataset.cardChoiceIndex)); if (!action || !app.duel || app.duel.kind !== "ocgcore") return; const before = view; app.duel.respond(action); const after = currentDuelView(); recordDuelTransition(action, before, after); app.toast = `Selección aceptada por OCGCore: ${action.label}`; settlePendingLadder(); render(); return; } const locked = (view?.selection?.candidates ?? []).filter((candidate) => candidate.required).map((candidate) => candidate.index); app.cardSelection = toggleCardSelection(syncCardSelection(app.cardSelection, view), button.dataset.cardChoiceIndex, view?.selection?.maximum, locked); render(); });
  on(document.querySelector("[data-selection-clear]"), "click", () => { const required = (currentDuelView()?.selection?.candidates ?? []).filter((candidate) => candidate.required).map((candidate) => Number(candidate.index)); app.cardSelection = { ...app.cardSelection, indices: required }; render(); });
  onAll("[data-sort-position]", "click", (event) => { const button = event.currentTarget; app.sortOrder = moveSortedCard(app.sortOrder, button.dataset.sortPosition, button.dataset.sortDirection); render(); });
  onAll("[data-multi-choice-index]", "click", (event) => { const button = event.currentTarget; const view = currentDuelView(); app.multiChoice = toggleMultiChoice(syncMultiChoiceState(app.multiChoice, view), button.dataset.multiChoiceIndex, view?.multiChoice?.count); render(); });
  onAll("[data-counter-index]", "click", (event) => { const button = event.currentTarget; const view = currentDuelView(); app.counterAllocation = adjustCounter(syncCounterState(app.counterAllocation, view), button.dataset.counterIndex, button.dataset.counterDelta, view); render(); });
  const announcementSearch = document.querySelector("[data-announcement-search]");
  const announcementSelect = document.querySelector("[data-announcement-select]");
  on(announcementSearch, "input", () => { const query = announcementSearch.value.trim().toLocaleLowerCase("es"); let visible = 0; for (const option of announcementSelect?.options ?? []) { const matches = !query || option.dataset.search.includes(query); option.hidden = !matches; if (matches) { visible += 1; if (visible === 1) option.selected = true; } } const count = document.querySelector("[data-announcement-count]"); if (count) count.textContent = `${visible} cartas coinciden.`; });
  on(document.querySelector("[data-announcement-confirm]"), "click", () => { const view = currentDuelView(); const runtimeCode = Number(document.querySelector("[data-announcement-select]")?.value); const option = view?.announcement?.options?.find((candidate) => Number(candidate.runtimeCode) === runtimeCode); if (!option?.coreResponse) return; const action = { label: `Declarar ${option.name}`, actionKind: "announce-card", cardCode: option.runtimeCode, coreResponse: option.coreResponse }; submitOcgcoreAction(action); app.toast = `Carta declarada: ${option.name}.`; settlePendingLadder(); render(); });
  on(document.querySelector("[data-duel-start-continue]"), "click", () => { app.duelStart = null; const view = currentDuelView(); if (view?.phasePaused) setDuelPresentation({ id: `phase:start:${view.turn}:${view.phase}`, kind: "phase", actor: view.turnPlayer, eyebrow: `TURNO ${String(view.turn).padStart(2, "0")}`, title: phaseLabel(view.phase), detail: "El duelo comienza en Draw Phase.", cardCode: null, duration: 1200, soundId: "phase", blocking: true }); render(); });
  on(document.querySelector("[data-motion-level]"), "change", (event) => { app.settings.motionLevel = event.target.value; app.settings.reducedMotion = app.settings.motionLevel !== "full"; persistSettings(); render(); });
  onAll("[data-setting]", "change", (event) => { const input = event.currentTarget; app.settings[input.dataset.setting] = input.checked; app.boardTilt = app.settings.boardTilt; persistSettings(); render(); });
  onAll("[data-sfx-volume], [data-duel-volume]", "input", (event) => { setAudioVolume(event.currentTarget.value); });
  on(document.querySelector("[data-settings-reset]"), "click", () => { app.settings = { motionLevel: "full", reducedMotion: false, confirmActions: true, boardTilt: false, sfxEnabled: true, sfxVolume: 35, compactMenus: true, touchControls: false, highContrast: false, largeText: false }; app.boardTilt = false; persistSettings(); app.toast = "Preferencias restauradas."; render(); });
  onAll("[data-action-id]", "click", (event) => {
    const button = event.currentTarget;
    const action = actionRegistry.get(button.dataset.actionId);
    if (!action || !app.duel) return;
    const view = currentDuelView();
    const interaction = createDuelInteractionModel(view, { manual: Boolean(app.duelManual || view?.manual) });
    if (button.classList.contains("phase-command") && interaction.optionalActions.length) {
      const priorityPrompt = interaction.freePriority ? freePriorityPrompt(view) : null;
      app.duelPhaseConfirmation = {
        action,
        label: button.getAttribute("aria-label") ?? action.label,
        ...(priorityPrompt ? { priorityKey: priorityPrompt.key } : {}),
      };
      clearAutomaticPhaseTimer();
      render();
      return;
    }
    executeDuelAction(action);
  });
  onAll("[data-card-first-action]", "click", (event) => {
    const button = event.currentTarget;
    const action = legalActions(app.duel, 0).find((candidate) => candidate.cardUid === Number(button.dataset.cardFirstAction));
    if (action) { try { step(app.duel, action); app.duelMotion = true; runBotTurns(); } catch (error) { app.toast = error.message; } render(); }
  });
  onAll("[data-action]", "click", (event) => handleAction(event.currentTarget.dataset.action, event.currentTarget));
  bindRankedPickerEvents({ on });
  bindDeckBuilderEvents({ app, render, validateDeck, copyLimit, cardLabel, builderZoneLabel, persistBuilderDraft, builderDeckById, on, onAll });

  // Eventos del Modo Prueba / Sandbox delegados a sandbox-driver
  initIpadTouchController({ app, render, onInspectCard: (uid) => { if (!uid) return; inspectKnownCard(uid); app.selectedCardUid = uid; render(); }, onClearSelection: () => { app.selectedCardUid = null; app.inspectedCard = null; render(); }, duelAudio });
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

function handleSecondaryAction(action, element = null) {
  if (action === "show-more-cards") { app.builderCatalogLimit += 200; render(); return; }
  if (action === "new-duel") {
    if (app.mode === "duel" && app.ladder?.activeRankedMatch?.active && app.duel?.winner === null) {
      app.rankedSurrenderConfirmation = { open: true, targetAction: "new-duel" };
      app.duelMenuOpen = false; render(); return;
    }
    app.duelMenuOpen = false; startDuel({ fresh: true }); app.toast = "Duelo reiniciado con una semilla diferente."; render(); return;
  }
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
  if (action === "reset-ladder") { app.ladder = initialLadder(); app.rankedDeckPicker = { open: true }; saveLocalState(app.ladder); app.toast = "Temporada reiniciada. Elige tu mazo para comenzar."; render(); return; }
  if (action === "start-ranked-queue") { startRankedQueue({ app, chooseRankedMatch, render, onMatchFound: () => playMatchmakingAudio({ app, audio: duelAudio }) }); return; }
  if (action === "cancel-ranked-queue") { cancelRankedQueue({ app, render }); return; }
  if (action === "accept-ranked-match") { acceptRankedMatch({ app, render }); return; }
  if (action === "enter-ranked-duel") { enterRankedDuel({ app, startDuel, navigate }); return; }
  if (action === "close-ranked-result") { app.rankedResultModal = { open: false }; navigate("ladder"); render(); return; }
  if (action === "open-ranked-deck-picker") { app.rankedDeckPicker = { open: true }; render(); return; }
  if (action === "close-ranked-deck-picker") { app.rankedDeckPicker = { open: false }; render(); return; }
  if (action === "select-ranked-deck") {
    const deckId = element?.dataset?.deckId;
    if (deckId) {
      app.ladder.player.rankedDeckId = deckId; app.duelDeckId = deckId; app.playDeckId = deckId;
      persistPlaySelection(); saveLocalState(app.ladder); app.rankedDeckPicker = { open: false };
      app.toast = `Mazo seleccionado para Ranked: ${builderDeckById(deckId).name}.`; render();
    }
    return;
  }
  if (action === "dismiss-quit-penalty") { app.quitPenaltyModal = null; render(); return; }
  if (action === "ladder-duel") {
    const bot = chooseRankedMatch(app.ladder);
    startDuel({ deckId: app.duelDeckId, opponentDeckId: bot.deckId, ladder: { botId: bot.botId ?? bot.id, opponentRating: bot.rating, opponentName: bot.name, opponentTier: bot.opponentTier, opponentDivision: bot.opponentDivision, mode: "ladder", isRankedMatch: true }, fresh: true });
    app.toast = `Duelo puntuable contra ${bot.name}.`; navigate("duel"); return;
  }
}

function renderTraining() {
  return renderTrainingPage({ app, esc, playableDecks });
}
async function startTraining({ resume = false } = {}) {
  return orchestrateTraining({ app, render, saveBotRegistry, resume });
}
function handleAction(action, element = null) {
  if (action === "approve-candidate" || action === "cancel-training" || action === "discard-candidate" || action === "evaluate-training" || action === "pause-training" || action === "clean-training") {
    if (handleTrainingAction({ action, app, render, startTraining, saveBotRegistry, persistPlaySelection })) return;
  }
  if (action === "restart-sandbox-duel") { if (app.activeSandboxScenario) { startSandboxDuel(app.activeSandboxScenario); app.toast = "Escenario de prueba reiniciado al estado inicial."; } return; }
  if (action === "edit-sandbox-scenario") { navigate("sandbox"); return; }
  if (action === "start-sandbox-duel" || action === "start-duel") { startSandboxDuel(app.sandbox); return; }
function abandonActiveRankedMatchIfNeeded() {
  if (app.ladder?.activeRankedMatch?.active) { app.ladder = recordRankedAbandonment(app.ladder) ?? app.ladder; saveLocalState(app.ladder); clearActiveDuelState(); }
}
  if (action === "cancel-ranked-surrender") { app.rankedSurrenderConfirmation = null; render(); return; }
  if (action === "confirm-ranked-surrender") {
    const target = app.rankedSurrenderConfirmation?.targetAction;
    app.rankedSurrenderConfirmation = null;
    abandonActiveRankedMatchIfNeeded(); clearDuelBotTimer(); clearAutomaticPhaseTimer(); app.duelMenuOpen = false;
    if (app.ladder?.quitPenalty?.applied) { app.quitPenaltyModal = { open: true, penalty: { ...app.ladder.quitPenalty } }; app.ladder.quitPenalty = null; saveLocalState(app.ladder); }
    if (target === "new-duel") navigate("ladder"); else if (target === "discard-saved-duel") { clearActiveDuelState(); render(); } else navigate("home");
    return;
  }
  if (action === "exit-to-home") {
    if (app.mode === "duel" && app.ladder?.activeRankedMatch?.active && app.duel?.winner === null) {
      app.rankedSurrenderConfirmation = { open: true, targetAction: "exit-to-home" };
      app.duelMenuOpen = false; render(); return;
    }
    abandonActiveRankedMatchIfNeeded(); clearDuelBotTimer(); clearAutomaticPhaseTimer(); app.duelMenuOpen = false; navigate("home"); return;
  }
  if (action === "resume-saved-duel") { navigate("duel"); return; }
  if (action === "discard-saved-duel") {
    const saved = loadSavedActiveDuelState();
    if (saved?.isRanked || app.ladder?.activeRankedMatch?.active) { app.rankedSurrenderConfirmation = { open: true, targetAction: "discard-saved-duel" }; render(); return; }
    clearActiveDuelState(); app.toast = "Partida descartada."; render(); return;
  }
  if (action === "open-profile") { abandonActiveRankedMatchIfNeeded(); navigate("profile"); return; }
  if (action === "open-profile-name-edit") { app.profileNameEditOpen = true; render(); return; }
  if (action === "open-profile-deck-picker") { app.rankedDeckPicker = { open: true }; render(); return; }
  if (action === "close-profile-modals") { app.profileNameEditOpen = false; render(); return; }
  if (action === "profile-save-name") {
    const val = (document.getElementById("profile-name-input")?.value ?? "").trim();
    if (val) { app.ladder.player.name = val; app.ladder.player.nameSet = true; saveLocalState(app.ladder); app.toast = `Nombre actualizado a ${val}.`; }
    app.profileNameEditOpen = false; render(); return;
  }
  if (action === "onboarding-select-deck") {
    const inputEl = document.getElementById("onboarding-name-input"); if (inputEl) app.onboardingDraftName = inputEl.value;
    const dId = element?.dataset?.deckId; if (dId) { app.onboardingDeckId = dId; render(); } return;
  }
  if (action === "onboarding-confirm") {
    const inputEl = document.getElementById("onboarding-name-input");
    const val = (inputEl ? inputEl.value : (app.onboardingDraftName ?? "")).trim() || "Duelista";
    app.ladder.player.name = val; app.ladder.player.nameSet = true; app.ladder.player.rankedDeckId = app.onboardingDeckId ?? "chaos-turbo"; delete app.onboardingDraftName;
    saveLocalState(app.ladder); app.onboardingOpen = false; app.toast = `¡Bienvenido, ${val}! Tu leyenda ha comenzado.`; render(); return;
  }
  if (action === "open-play") { abandonActiveRankedMatchIfNeeded(); navigate("play"); return; } if (action === "open-sandbox") { abandonActiveRankedMatchIfNeeded(); navigate("sandbox"); return; } if (action === "open-decks") { abandonActiveRankedMatchIfNeeded(); navigate("deck-builder"); return; } if (action === "open-settings") { abandonActiveRankedMatchIfNeeded(); navigate("settings"); return; } if (action === "toggle-fullscreen") { void toggleFullscreen(); return; }
  if (action === "start-universal-duel") {
    app.playMode = "bot"; app.playBotId = UNIVERSAL_BOT_ID; app.playOpponentDeckId = app.botCatalogDeckId; app.opponentDeckId = app.botCatalogDeckId; persistPlaySelection();
    startDuel({ deckId: app.playDeckId, opponentDeckId: app.botCatalogDeckId, botId: app.playBotId, fresh: true });
    app.toast = `Duelo contra Nexo con ${builderDeckById(app.botCatalogDeckId).name}.`; navigate("duel"); return;
  }
  if (action === "start-play") {
    app.duelDeckId = app.playDeckId; app.opponentDeckId = app.playOpponentDeckId;
    if (app.playMode === "ranked") { navigate("ladder"); startRankedQueue({ app, chooseRankedMatch, render }); return; }
    startDuel({ deckId: app.playDeckId, opponentDeckId: app.playOpponentDeckId, botId: app.playBotId, fresh: true });
    app.toast = `Duelo preparado: ${builderDeckById(app.playDeckId).name} contra ${builderDeckById(app.playOpponentDeckId).name}.`; navigate("duel"); return;
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
  if (action === "ladder-practice") {
    const opp = chooseRankedMatch(app.ladder);
    startDuel({ deckId: app.duelDeckId, opponentDeckId: opp.deckId, ladder: { botId: opp.botId, opponentRating: opp.rating, opponentName: opp.name, opponentTier: opp.opponentTier, opponentDivision: opp.opponentDivision, mode: "practice" }, fresh: true });
    app.toast = `Práctica contra ${opp.name} (${opp.opponentTier} ${opp.opponentDivisionRoman}); sin riesgo de LP.`;
    navigate("duel");
    return;
  }
  if (action === "start-training" && app.training.status === "PAUSED") { startTraining({ resume: true }); return; }
  handleSecondaryAction(action, element);
}
window.addEventListener("popstate", () => navigate(modeFromHash(window.location.hash), { history: false }));
window.addEventListener("hashchange", () => navigate(modeFromHash(window.location.hash), { history: false }));
document.addEventListener("fullscreenchange", () => { if (app.mode === "duel") render(); });
const unlockDuelAudio = () => { void duelAudio.unlock(); };
window.addEventListener("pointerdown", unlockDuelAudio, { once: true, passive: true, capture: true });
window.addEventListener("keydown", unlockDuelAudio, { once: true, capture: true });
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const tagName = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
  if (app.duelMenuOpen) {
    app.duelMenuOpen = false;
    render();
    document.querySelector("[data-duel-menu-toggle]")?.focus?.({ preventScroll: true });
    return;
  }
  if (app.menuOpen) {
    app.menuOpen = false;
    render();
    document.querySelector("[data-menu-toggle]")?.focus();
  } else if (app.duelPhaseConfirmation) {
    dismissDuelPhaseConfirmation();
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
  duelAudio.setHidden(document.hidden);
  if (document.hidden) {
    if (app.mode === "duel" && app.duel) saveActiveDuelState();
  } else {
    if (app.mode === "duel") render();
  }
});
const handleGameQuit = () => {
  if (app.mode === "duel" && app.duel) saveActiveDuelState();
};
window.addEventListener("pagehide", handleGameQuit);
window.addEventListener("beforeunload", handleGameQuit);
if (!window.location.hash) window.history.replaceState({ mode: app.mode }, "", hashForMode(app.mode)); render();

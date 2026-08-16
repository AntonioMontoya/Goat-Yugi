import { createDefaultScenarioState, persistSavedScenarios, renderSandboxPickerResults } from "./sandbox.js";
import { auditViewSnapshot, recordedAuditStep } from "../engine/card-audit-recording.js";
import { acceptDuelLoad, beginDuelLoad, isCurrentDuelLoad } from "./duel-load-guard.js";

async function downloadAuditFixture(sandbox) {
  const { auditFixtureFileName, sandboxAuditFixture } = await import("../engine/card-audit-scenario.js");
  const fixture = sandboxAuditFixture(sandbox);
  const blob = new Blob([JSON.stringify(fixture, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = auditFixtureFileName(fixture);
  link.click();
  URL.revokeObjectURL(url);
  return fixture;
}

function scenarioCardId(value) {
  return Number(typeof value === "object" ? value?.cardId ?? value?.id : value) || null;
}

export function scenarioDeckForPlayer(player, baseDeck) {
  if (player?.deckMode === "custom") return Array.isArray(player.deck) ? [...player.deck] : [];
  if (Array.isArray(player?.deck) && player.deck.length) return [...player.deck];
  const occupied = [
    ...(player?.hand ?? []),
    ...(player?.monsterZone ?? []),
    ...(player?.spellTrapZone ?? []),
    ...(player?.grave ?? []),
    ...(player?.banished ?? []),
  ].map(scenarioCardId).filter(Boolean);
  const remaining = [...(baseDeck ?? [])];
  for (const cardId of occupied) {
    const index = remaining.findIndex((candidate) => Number(candidate) === cardId);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

export function startSandboxDuel({
  app,
  scenario = app.sandbox,
  clearDuelBotTimer,
  builderDeckById,
  createOcgcoreSession,
  setDuelPresentation,
  phaseLabel,
  navigate,
  render,
}) {
  const loadEpoch = beginDuelLoad(app);
  scenario = { ...structuredClone(scenario), turn: 1, phase: "MAIN1" };
  app.sandbox.audit ??= { cardId: null, seed: 2005, description: "", steps: [], assertions: [], lastSnapshot: null };
  app.sandbox.audit.steps = [];
  app.sandbox.audit.lastSnapshot = null;
  if (typeof clearDuelBotTimer === "function") clearDuelBotTimer();
  app.lifeMotion = [];
  app.activeSandboxScenario = structuredClone(scenario);
  app.duelDeckId = scenario.players[0].deckPreset ?? "chaos-turbo";
  app.opponentDeckId = scenario.players[1].deckPreset ?? "goat-control";
  app.pendingLadder = null;
  app.duelManual = true;
  app.duelBotProfile = null;
  app.lastBotRecordedSeed = null;
  app.duelLoading = true;
  app.duelError = null;
  app.selectedCardUid = null;
  app.duelMotion = null;
  app.duelActionOptionsOpen = false;
  app.sortOrder = { key: null, order: [] };
  app.multiChoice = { key: null, indices: [] };
  app.counterAllocation = { key: null, counters: [] };
  app.duelFeedbackSeen = new Set();
  app.cardSelection = { key: null, indices: [] };
  app.resultDismissed = false;
  app.duelStart = { open: true, winner: Number(scenario.startingPlayer ?? 0), side: "ESCENARIO", configured: true };
  setDuelPresentation(null);
  if (app.duel?.destroy) app.duel.destroy();
  app.duel = null;
  app.toast = "Cargando escenario en OCGCore...";
  navigate("duel");

  const p0Deck = builderDeckById(scenario.players[0].deckPreset ?? "chaos-turbo");
  const p1Deck = builderDeckById(scenario.players[1].deckPreset ?? "goat-control");
  const p0ScenarioDeck = scenarioDeckForPlayer(scenario.players[0], p0Deck.main);
  const p1ScenarioDeck = scenarioDeckForPlayer(scenario.players[1], p1Deck.main);
  app.activeSandboxDecks = [
    { ...p0Deck, main: p0ScenarioDeck, name: scenario.players[0].deckMode === "custom" ? `Personalizado (${p0ScenarioDeck.length})` : p0Deck.name },
    { ...p1Deck, main: p1ScenarioDeck, name: scenario.players[1].deckMode === "custom" ? `Personalizado (${p1ScenarioDeck.length})` : p1Deck.name },
  ];

  const seed = Number(app.sandbox.audit.seed ?? 2005);
  createOcgcoreSession({
    deckA: p0Deck.main,
    deckB: p1Deck.main,
    fusionA: p0Deck.fusion ?? [],
    fusionB: p1Deck.fusion ?? [],
    seed,
    manual: true,
    onDecision: ({ action, before, after }) => {
      app.sandbox.audit.steps.push(recordedAuditStep(action, before));
      app.sandbox.audit.lastSnapshot = auditViewSnapshot(after);
    },
    scenario: {
      startingPlayer: Number(scenario.startingPlayer ?? 0),
      players: [
        {
          lp: Number(scenario.players[0].lp ?? 8000),
          hand: scenario.players[0].hand,
          monsterZone: scenario.players[0].monsterZone,
          spellTrapZone: scenario.players[0].spellTrapZone,
          grave: scenario.players[0].grave,
          banished: scenario.players[0].banished,
          deck: p0ScenarioDeck,
          fusion: p0Deck.fusion ?? [],
        },
        {
          lp: Number(scenario.players[1].lp ?? 8000),
          hand: scenario.players[1].hand,
          monsterZone: scenario.players[1].monsterZone,
          spellTrapZone: scenario.players[1].spellTrapZone,
          grave: scenario.players[1].grave,
          banished: scenario.players[1].banished,
          deck: p1ScenarioDeck,
          fusion: p1Deck.fusion ?? [],
        },
      ],
    },
  })
    .then((session) => {
      if (!acceptDuelLoad(app, loadEpoch, session)) return;
      app.duel = session;
      app.duelLoading = false;
      app.duelError = null;
      app.toast = `Escenario cargado. Comienza el Jugador ${Number(scenario.startingPlayer ?? 0) + 1}.`;
      setDuelPresentation({
        kind: "phase",
        eyebrow: `ESCENARIO · TURNO ${String(scenario.turn || 1).padStart(2, "0")}`,
        title: phaseLabel(scenario.phase || "MAIN1"),
        detail: `Modo Prueba activo. Control local 1vs1. Inicia Jugador ${(scenario.startingPlayer || 0) + 1}.`,
        cardCode: null,
      });
      render();
    })
    .catch((error) => {
      if (!isCurrentDuelLoad(app, loadEpoch)) return;
      app.duelLoading = false;
      app.duelError = error;
      app.duel = null;
      app.toast = `No se pudo iniciar el escenario de prueba: ${error.message}`;
      render();
    });
}

export function bindSandboxEvents({
  app,
  render,
  builderDeckById,
  onStartDuel,
  getSandboxDecks = () => [],
}) {
  const selectSandboxCard = (btn) => {
    const cardId = Number(btn.dataset.sandboxSelectCard);
    const picker = app.sandbox.picker;
    const p = app.sandbox.players[picker.targetPlayer];
    if (picker.targetZone === "auditCard") {
      app.sandbox.audit ??= { cardId: null, seed: 2005, description: "", steps: [], assertions: [], lastSnapshot: null };
      app.sandbox.audit.cardId = cardId;
      app.sandbox.audit.steps = [];
      app.sandbox.audit.lastSnapshot = null;
    } else if (picker.targetZone === "hand") {
      p.hand.push(cardId);
    } else if (picker.targetZone === "grave") {
      p.grave.push(cardId);
    } else if (picker.targetZone === "banished") {
      p.banished.push(cardId);
    } else if (picker.targetZone === "deck") {
      if (p.deckMode !== "custom") {
        p.deck = scenarioDeckForPlayer({ ...p, deckMode: "preset", deck: [] }, builderDeckById(p.deckPreset ?? "chaos-turbo")?.main ?? []);
        p.deckMode = "custom";
      }
      if (!Array.isArray(p.deck)) p.deck = [];
      p.deck.push(cardId);
    } else if (picker.targetZone === "monsterZone") {
      p.monsterZone[picker.targetIndex] = { cardId, position: "ATTACK" };
    } else if (picker.targetZone === "spellTrapZone") {
      p.spellTrapZone[picker.targetIndex] = { cardId, position: "SET" };
    }
    picker.open = false;
    render();
  };

  const setSandboxPage = (btn) => {
    const page = Number(btn.dataset.sandboxPage);
    if (!isNaN(page) && page > 0) {
      app.sandbox.picker.page = page;
      render();
    }
  };

  const bindPickerDynamicEvents = () => {
    document.querySelectorAll("[data-sandbox-select-card]").forEach((btn) => btn.addEventListener("click", () => selectSandboxCard(btn)));
    document.querySelectorAll("[data-sandbox-page]").forEach((btn) => btn.addEventListener("click", () => setSandboxPage(btn)));
  };

  const refreshSandboxPicker = () => {
    const pickerResults = renderSandboxPickerResults(app.sandbox, getSandboxDecks(), app.favoriteCardIds, app.cardWorkStatuses);
    const results = document.querySelector("#sandbox-picker-results");
    const count = document.querySelector("#sandbox-picker-count");
    const pagination = document.querySelector("#sandbox-picker-pagination");
    if (!results || !count || !pagination) {
      render();
      return;
    }
    results.innerHTML = pickerResults.cardsMarkup;
    count.textContent = `Total: ${pickerResults.count} cartas encontradas`;
    pagination.innerHTML = pickerResults.paginationMarkup;
    bindPickerDynamicEvents();
  };

  document.querySelectorAll("[data-sandbox-action]").forEach((btn) => btn.addEventListener("click", async () => {
    const action = btn.dataset.sandboxAction;
    if (action === "start-duel") {
      onStartDuel();
      return;
    }
    if (action === "export-audit") {
      try {
        const fixture = await downloadAuditFixture(app.sandbox);
        app.toast = `Fixture DRAFT exportado: ${fixture.id}.`;
      } catch (error) {
        app.toast = `No se pudo exportar la evidencia: ${error.message}`;
      }
      render();
      return;
    }
    if (action === "reset-all") {
      app.sandbox = createDefaultScenarioState(app.savedDecks);
      app.toast = "Escenario restablecido a valores por defecto.";
      render();
      return;
    }
    if (action === "save-scenario") {
      const nameInput = document.querySelector("#sandbox-scenario-name");
      const name = nameInput?.value.trim() || `Escenario ${Date.now()}`;
      app.sandbox.scenarioName = name;
      const snapshot = {
        name,
        savedAt: new Date().toISOString(),
        startingPlayer: app.sandbox.startingPlayer,
        turn: app.sandbox.turn,
        phase: app.sandbox.phase,
        players: structuredClone(app.sandbox.players),
        audit: structuredClone(app.sandbox.audit),
      };
      app.sandbox.savedScenarios = [...app.sandbox.savedScenarios.filter((s) => s.name !== name), snapshot];
      persistSavedScenarios(app.sandbox.savedScenarios);
      app.toast = `Escenario "${name}" guardado localmente.`;
      render();
      return;
    }
    if (action === "load-scenario") {
      const select = document.querySelector("#sandbox-load-select");
      const idx = Number(select?.value);
      const target = app.sandbox.savedScenarios[idx];
      if (target) {
        app.sandbox.scenarioName = target.name;
        app.sandbox.startingPlayer = target.startingPlayer ?? 0;
        app.sandbox.turn = target.turn ?? 1;
        app.sandbox.phase = target.phase ?? "MAIN1";
        app.sandbox.players = structuredClone(target.players);
        app.sandbox.audit = structuredClone(target.audit ?? { cardId: null, seed: 2005, description: "", steps: [], assertions: [], lastSnapshot: null });
        app.sandbox.players.forEach((player) => {
          if (!player.deckMode) player.deckMode = Array.isArray(player.deck) && player.deck.length ? "custom" : "preset";
        });
        app.toast = `Escenario "${target.name}" cargado.`;
        render();
      }
      return;
    }
    if (action === "delete-scenario") {
      const select = document.querySelector("#sandbox-load-select");
      const idx = Number(select?.value);
      if (!isNaN(idx) && app.sandbox.savedScenarios[idx]) {
        const deletedName = app.sandbox.savedScenarios[idx].name;
        app.sandbox.savedScenarios.splice(idx, 1);
        persistSavedScenarios(app.sandbox.savedScenarios);
        app.toast = `Escenario "${deletedName}" eliminado.`;
        render();
      }
      return;
    }
  }));

  document.querySelectorAll("[data-sandbox-open-picker]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.picker.open = true;
    app.sandbox.picker.targetPlayer = Number(btn.dataset.player ?? 0);
    app.sandbox.picker.targetZone = btn.dataset.sandboxOpenPicker;
    app.sandbox.picker.targetIndex = null;
    app.sandbox.picker.search = "";
    app.sandbox.picker.page = 1;
    render();
  }));

  document.querySelectorAll("[data-sandbox-open-slot]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.picker.open = true;
    app.sandbox.picker.targetPlayer = Number(btn.dataset.player);
    app.sandbox.picker.targetZone = btn.dataset.sandboxOpenSlot;
    app.sandbox.picker.targetIndex = Number(btn.dataset.seq);
    app.sandbox.picker.search = "";
    app.sandbox.picker.page = 1;
    render();
  }));

  document.querySelectorAll("[data-sandbox-close-picker]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.picker.open = false;
    render();
  }));

  document.querySelectorAll("[data-sandbox-remove-card]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.players[Number(btn.dataset.player)][btn.dataset.sandboxRemoveCard].splice(Number(btn.dataset.index), 1);
    render();
  }));

  document.querySelectorAll("[data-sandbox-remove-slot]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.players[Number(btn.dataset.player)][btn.dataset.sandboxRemoveSlot][Number(btn.dataset.seq)] = null;
    render();
  }));

  document.querySelectorAll("[data-set-monster-pos]").forEach((btn) => btn.addEventListener("click", () => {
    const slot = app.sandbox.players[Number(btn.dataset.player)].monsterZone[Number(btn.dataset.seq)];
    if (slot) {
      slot.position = btn.dataset.setMonsterPos;
      render();
    }
  }));

  document.querySelectorAll("[data-set-spell-pos]").forEach((btn) => btn.addEventListener("click", () => {
    const slot = app.sandbox.players[Number(btn.dataset.player)].spellTrapZone[Number(btn.dataset.seq)];
    if (slot) {
      slot.position = btn.dataset.setSpellPos;
      render();
    }
  }));

  document.querySelectorAll("[data-sandbox-quick-lp]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.players[Number(btn.dataset.sandboxQuickLp)].lp = Number(btn.dataset.lp);
    render();
  }));

  document.querySelectorAll("[data-sandbox-clear-zone]").forEach((btn) => btn.addEventListener("click", () => {
    const zone = btn.dataset.sandboxClearZone;
    const player = Number(btn.dataset.player);
    if (zone === "monsterZone" || zone === "spellTrapZone") {
      app.sandbox.players[player][zone] = [null, null, null, null, null];
    } else {
      app.sandbox.players[player][zone] = [];
    }
    render();
  }));

  document.querySelectorAll("[data-sandbox-picker-tab]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.picker.sourceTab = btn.dataset.sandboxPickerTab;
    app.sandbox.picker.page = 1;
    render();
  }));

  document.querySelectorAll("[data-sandbox-filter-kind]").forEach((btn) => btn.addEventListener("click", () => {
    app.sandbox.picker.filterKind = btn.dataset.sandboxFilterKind;
    app.sandbox.picker.page = 1;
    render();
  }));

  document.querySelectorAll("[data-sandbox-import-whole-deck]").forEach((btn) => btn.addEventListener("click", () => {
    const player = Number(btn.dataset.sandboxImportWholeDeck);
    const chosenDeckId = app.sandbox.picker.selectedDeckId;
    const chosen = builderDeckById(chosenDeckId);
    if (chosen) {
      app.sandbox.players[player].deck = [...chosen.main];
      app.sandbox.players[player].deckPreset = chosenDeckId;
      app.sandbox.players[player].deckMode = "custom";
      app.sandbox.picker.open = false;
      app.toast = `Mazo "${chosen.name}" (${chosen.main.length} cartas) importado a Jugador ${player + 1}.`;
      render();
    }
  }));

  document.querySelector("#sandbox-starting-player")?.addEventListener("change", (e) => {
    app.sandbox.startingPlayer = Number(e.target.value);
  });
  document.querySelector("#sandbox-turn")?.addEventListener("change", (e) => {
    app.sandbox.turn = Math.max(1, Number(e.target.value) || 1);
  });
  document.querySelector("#sandbox-phase")?.addEventListener("change", (e) => {
    app.sandbox.phase = e.target.value;
  });
  document.querySelectorAll(".lp-input").forEach((input) => input.addEventListener("change", (e) => {
    const player = Number(input.dataset.player);
    app.sandbox.players[player].lp = Math.max(0, Number(e.target.value) || 0);
  }));
  document.querySelector("#sandbox-picker-search")?.addEventListener("input", (e) => {
    app.sandbox.picker.search = e.target.value;
    app.sandbox.picker.page = 1;
    refreshSandboxPicker();
  });
  document.querySelector("#sandbox-picker-work-status")?.addEventListener("change", (e) => {
    app.sandbox.picker.workStatus = e.target.value;
    app.sandbox.picker.page = 1;
    refreshSandboxPicker();
  });
  document.querySelector("#sandbox-picker-audit-status")?.addEventListener("change", (e) => {
    app.sandbox.picker.auditStatus = e.target.value;
    app.sandbox.picker.page = 1;
    refreshSandboxPicker();
  });
  document.querySelector("#sandbox-audit-seed")?.addEventListener("change", (e) => {
    app.sandbox.audit.seed = Math.max(0, Number(e.target.value) || 0);
  });
  document.querySelector("#sandbox-audit-description")?.addEventListener("input", (e) => {
    app.sandbox.audit.description = e.target.value;
  });
  document.querySelectorAll(".sandbox-deck-select").forEach((sel) => sel.addEventListener("change", (e) => {
    const player = Number(sel.dataset.player);
    const nextDeckId = e.target.value;
    if (nextDeckId === "__custom__") {
      app.sandbox.players[player].deckMode = "custom";
      app.sandbox.players[player].deck = Array.isArray(app.sandbox.players[player].deck) ? app.sandbox.players[player].deck : [];
    } else {
      app.sandbox.players[player].deckMode = "preset";
      app.sandbox.players[player].deckPreset = nextDeckId;
    }
    render();
  }));
  document.querySelector("#picker-deck-source-select")?.addEventListener("change", (e) => {
    app.sandbox.picker.selectedDeckId = e.target.value;
    app.sandbox.picker.page = 1;
    render();
  });

  bindPickerDynamicEvents();
}

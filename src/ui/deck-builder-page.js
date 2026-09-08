export function renderDeckBuilderPage({
  app,
  validateDeck,
  CARDS,
  getCard,
  copyLimit,
  listStatus,
  builderCardTileMarkup,
  cardMarkup,
  esc,
  builderZoneLabel,
  DECK_PRESETS,
  statusPill,
  CARD_KIND,
  VALIDATION_STATUS,
}) {
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

export function bindDeckBuilderEvents({
  app,
  render,
  validateDeck,
  copyLimit,
  cardLabel,
  builderZoneLabel,
  persistBuilderDraft,
  builderDeckById,
  on,
  onAll,
}) {
  onAll("[data-deck-id]", "click", (event) => { const button = event.currentTarget; app.builderDeckId = button.dataset.deckId; app.builderDeck = builderDeckById(app.builderDeckId); app.builderZone = "main"; app.builderDeckLibraryOpen = false; render(); });
  onAll("[data-builder-zone]", "click", (event) => { app.builderZone = event.currentTarget.dataset.builderZone; render(); });
  onAll("[data-add-card]", "click", (event) => {
    const button = event.currentTarget;
    const cardId = Number(button.dataset.addCard);
    const zone = app.builderZone;
    const counts = validateDeck(app.builderDeck).counts;
    if (copyLimit(cardId) <= (counts.get(cardId) ?? 0)) { app.toast = "Se ha alcanzado el límite de copias de esa carta."; render(); return; }
    app.builderDeck[zone].push(cardId);
    app.builderMotion = { cardId, zone, index: app.builderDeck[zone].length - 1 };
    persistBuilderDraft();
    app.toast = `${cardLabel(cardId)} añadida al ${builderZoneLabel(zone)} Deck.`;
    render();
  });
  onAll("[data-remove-index]", "click", (event) => {
    const button = event.currentTarget;
    const zone = button.dataset.removeZone ?? app.builderZone;
    app.builderDeck[zone].splice(Number(button.dataset.removeIndex), 1);
    app.builderMotion = null;
    persistBuilderDraft();
    render();
  });
  on(document.querySelector("#card-search"), "input", (event) => { app.builderSearch = event.target.value; app.builderCatalogLimit = 200; render(); const input = document.querySelector("#card-search"); input?.focus(); input?.setSelectionRange(app.builderSearch.length, app.builderSearch.length); });
  on(document.querySelector("#builder-filter"), "change", (event) => { app.builderFilter = event.target.value; app.builderCatalogLimit = 200; render(); });
  on(document.querySelector("#builder-work-filter"), "change", (event) => { app.builderWorkFilter = event.target.value; app.builderCatalogLimit = 200; render(); });
  on(document.querySelector("#builder-sort"), "change", (event) => { app.builderSort = event.target.value; app.builderCatalogLimit = 200; render(); });
  on(document.querySelector("#builder-name"), "change", (event) => { app.builderDeck.name = event.target.value.trim() || "Custom Deck"; persistBuilderDraft(); render(); });
  on(document.querySelector("#builder-notes"), "change", (event) => { app.builderDeck.notes = event.target.value; persistBuilderDraft(); });
  onAll("[data-drag-kind]", "dragstart", (event) => {
    const element = event.currentTarget;
    event.dataTransfer?.setData("text/plain", JSON.stringify({ kind: element.dataset.dragKind, cardId: Number(element.dataset.cardId), zone: element.dataset.dragZone, index: element.dataset.dragIndex }));
  });
  onAll("[data-drop-zone]", "dragover", (event) => event.preventDefault());
  onAll("[data-drop-zone]", "drop", (event) => {
    event.preventDefault();
    try {
      const payload = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}");
      const targetZone = event.currentTarget.dataset.dropZone;
      const counts = validateDeck(app.builderDeck).counts;
      if (payload.kind === "deck") app.builderDeck[payload.zone].splice(Number(payload.index), 1);
      app.builderDeck[targetZone].push(payload.cardId);
      app.builderMotion = { cardId: payload.cardId, zone: targetZone, index: app.builderDeck[targetZone].length - 1 };
      app.builderZone = targetZone;
      persistBuilderDraft();
      render();
    } catch { app.toast = "No se pudo mover la carta."; }
  });
}

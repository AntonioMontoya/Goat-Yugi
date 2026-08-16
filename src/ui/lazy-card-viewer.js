const DEFAULT_PAGE_SIZE = 48;
let implementation = null;
let implementationPromise = null;

export function createDefaultCardViewerState() {
  return { search: "", sort: "name", kind: "all", status: "all", page: 1, pageSize: DEFAULT_PAGE_SIZE, selectedCardId: null, favoriteOnly: false, workStatus: "all", auditStatus: "all" };
}

function loadImplementation(rerender) {
  implementationPromise ??= import("./card-viewer.js").then((module) => {
    implementation = module;
    rerender?.();
    return module;
  });
  return implementationPromise;
}

export function renderCardViewerPage(state, options = {}) {
  if (implementation) return implementation.renderCardViewerPage(state, options);
  void loadImplementation(options.rerender);
  return `<section class="page card-viewer-page"><div class="empty-state"><span class="empty-icon">◌</span><strong>Cargando base de cartas</strong><p>Preparando el catálogo y la evidencia de reglas solo para esta vista…</p></div></section>`;
}

export function bindCardViewerEvents(options) {
  implementation?.bindCardViewerEvents(options);
}

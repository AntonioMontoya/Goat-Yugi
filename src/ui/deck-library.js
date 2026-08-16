export function normalizeDeckQuery(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}

export function deckMatchesQuery(name, query) {
  const normalizedQuery = normalizeDeckQuery(query);
  return !normalizedQuery || normalizeDeckQuery(name).includes(normalizedQuery);
}

export function decorateDeckLibrary({ searchValue = "", open = false, onSearch = () => {}, onToggle = () => {} } = {}) {
  const library = document.querySelector(".deck-library");
  if (!library || library.querySelector("#deck-search")) return;
  const title = library.querySelector(".side-title");
  const note = library.querySelector(".library-note");
  const buttons = [...library.querySelectorAll(".deck-preset")];
  if (!title) return;

  const pageActions = document.querySelector(".page-head .head-actions");
  if (pageActions && !pageActions.querySelector('[data-action="new-builder"]')) {
    const newDeck = document.createElement("button");
    newDeck.type = "button";
    newDeck.className = "ghost-button";
    newDeck.dataset.action = "new-builder";
    newDeck.textContent = "Nuevo deck";
    pageActions.prepend(newDeck);
  }

  const head = document.createElement("div");
  head.className = "deck-library-head";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `deck-library-toggle ${open ? "open" : ""}`;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.innerHTML = `<span><small>SELECCIONAR DECK</small><strong>Buscar otro mazo</strong></span><b aria-hidden="true">${open ? "▲" : "▼"}</b>`;
  const search = document.createElement("label");
  search.className = "deck-library-search";
  const caption = document.createElement("span");
  caption.textContent = "BUSCAR POR NOMBRE";
  const input = document.createElement("input");
  input.id = "deck-search";
  input.type = "search";
  input.value = searchValue;
  input.placeholder = "Buscar mazo...";
  search.append(caption, input);
  title.replaceWith(head);
  head.append(title, toggle);

  const panel = document.createElement("div");
  panel.className = "deck-library-panel";
  panel.hidden = !open;
  panel.append(search);

  const list = document.createElement("div");
  list.className = "deck-library-list";
  buttons.forEach((button) => list.append(button));
  const empty = document.createElement("div");
  empty.className = "deck-library-empty";
  empty.textContent = "No hay mazos con ese nombre.";
  list.append(empty);
  panel.append(list);
  if (note) library.insertBefore(panel, note);
  else library.append(panel);

  const count = title.querySelector(".tiny-label");
  const filter = (value) => {
    const query = normalizeDeckQuery(value);
    let visible = 0;
    buttons.forEach((button) => {
      const name = button.querySelector("strong")?.textContent ?? "";
      const matches = deckMatchesQuery(name, query);
      button.hidden = !matches;
      if (matches) button.style.removeProperty("display");
      else button.style.display = "none";
      if (matches) visible += 1;
    });
    if (count) count.textContent = `${visible}/${buttons.length} VISIBLES`;
    empty.hidden = visible > 0;
  };
  toggle.addEventListener("click", () => onToggle(!open));
  input.addEventListener("input", () => {
    onSearch(input.value);
    filter(input.value);
  });
  filter(searchValue);
}

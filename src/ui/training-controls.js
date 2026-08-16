export function installTrainingControls({ app, decks, rerender }) {
  const total = document.querySelector("#training-total");
  if (!total) return;
  const deckSelect = document.querySelector("#training-deck");
  if (deckSelect && deckSelect.options.length !== decks.length) {
    deckSelect.replaceChildren(...decks.map((deck) => new Option(deck.name, deck.id, false, deck.id === app.training.deckId)));
  }
  if (!document.querySelector("#training-workers")) {
    const label = document.createElement("label");
    label.textContent = "Workers locales";
    const select = document.createElement("select");
    select.id = "training-workers";
    select.disabled = Boolean(app.training.running);
    for (let worker = 1; worker <= 6; worker += 1) select.append(new Option(String(worker), String(worker), false, worker === app.training.workers));
    select.addEventListener("change", () => {
      app.training.workers = Math.max(1, Math.min(6, Number(select.value) || 1));
      rerender();
    });
    label.append(select);
    total.closest("label")?.after(label);
  }
}

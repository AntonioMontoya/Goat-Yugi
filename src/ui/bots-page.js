import { buildDeckKnowledge, describeDeckPlan } from "../bots/deck-strategy.js";

const ROLE_LABELS = Object.freeze({
  draw: "robo y ventaja",
  search: "búsqueda",
  engine: "motor",
  interaction: "interacción",
  defense: "defensa",
  flip: "efectos FLIP",
  combo: "secuencias de combo",
  threat: "presión de mesa",
  lethal: "cierre",
  burn: "daño directo",
  stall: "control del ritmo",
  "grave-setup": "preparación de Cementerio",
});

function roleLabel(role) {
  return ROLE_LABELS[role] ?? String(role).replaceAll("-", " ");
}

export function renderBotsPage({ deck, deckPresets, escapeHtml }) {
  const esc = escapeHtml;
  const knowledge = buildDeckKnowledge(deck.id, deck);
  const plan = describeDeckPlan(knowledge);
  const deckOptions = deckPresets.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === deck.id ? "selected" : ""}>${esc(entry.name)} · ${esc(entry.archetype)}</option>`).join("");
  const priorities = plan.priorities.map((role) => `<span>${esc(roleLabel(role))}</span>`).join("");
  const goals = plan.goals.slice(0, 4).map((goal) => `<li>${esc(goal)}</li>`).join("");
  const keyCards = plan.keyCards.slice(0, 6).map((card) => `<span>${esc(card)}</span>`).join("");
  const weaknesses = plan.weaknesses.slice(0, 3).map((weakness) => `<li>${esc(weakness)}</li>`).join("");
  const strengths = (plan.strengths ?? []).slice(0, 3).map((strength) => `<li>${esc(strength)}</li>`).join("");
  const lossConditions = (plan.lossConditions ?? []).slice(0, 3).map((condition) => `<li>${esc(condition)}</li>`).join("");
  const universalCount = deckPresets.length;
  return `<section class="page bots-page"><div class="page-head"><div><span class="eyebrow">BOT / NEXO</span><h1>Nexo, candidato y Nexo 2</h1><p>Tres versiones del sistema estratégico: la base estable, el parche candidato y Nexo 2, una política pública que puede pilotar y enfrentar los ${universalCount} mazos del catálogo.</p></div><div class="head-actions"><span class="resource-chip">3 BOTS</span><span class="resource-chip">SIN INFORMACIÓN OCULTA</span></div></div><div class="bots-layout"><aside class="side-card bots-deck-picker"><div class="side-title"><span>1 · MAZO RIVAL</span><span class="tiny-label">${deck.main.length} CARTAS</span></div><select id="bots-deck" aria-label="Seleccionar mazo del bot">${deckOptions}</select><div class="bots-deck-summary"><strong>${esc(deck.name)}</strong><span>${esc(deck.archetype)}</span><small>${esc(deck.notes ?? "Lista completa analizada antes de cada duelo.")}</small></div></aside><div class="bots-roster"><div class="side-title"><span>2 · VERSIONES DISPONIBLES</span><span class="tiny-label">MISMA BASE ESTRATÉGICA</span></div><article class="bot-persona-card selected universal-bot-card"><span class="bot-avatar">N</span><span><strong>Nexo</strong><small>IA universal adaptativa · guardas de coherencia activas</small></span><b class="bot-mmr certified">BASE ESTABLE</b><em>Referencia fijada para evaluar cualquier mejora</em></article><article class="bot-persona-card universal-bot-card"><span class="bot-avatar">C</span><span><strong>Nexo candidato</strong><small>Parche entrenado · 28-21-1 en evaluación retenida</small></span><b class="bot-mmr">CANDIDATO</b><em>Jugable para pruebas, pero todavía no sustituye a la base</em></article><article class="bot-persona-card universal-bot-card nexo2-persona-card"><span class="bot-avatar">2</span><span><strong>Nexo 2 · Universal ${universalCount}</strong><small>Creencias públicas + política/valor neuronal</small></span><b class="bot-mmr">CANDIDATO UNIVERSAL</b><em>Puede pilotar y enfrentar cualquier lista del catálogo con su ficha estratégica</em></article><div class="side-card bots-plan-card"><span class="eyebrow">${esc(plan.title)} · ${esc(plan.playstyle)}</span><h2>${esc(plan.objective ?? plan.identity)}</h2><div class="tag-list">${priorities || "<span>valor y tempo</span>"}</div><ol>${goals}</ol><div class="strategy-copy"><strong>Cartas que definen el plan</strong><div class="strategy-key-cards">${keyCards || `<span>Se infieren desde la lista</span>`}</div><strong>Puntos fuertes</strong><ul>${strengths || "<li>Se infieren de la lista y el estado público.</li>"}</ul><strong>Cómo jugar contra él</strong><p>${esc(plan.counterplay)}</p><strong>Puntos flojos y cómo pierde</strong><ul>${weaknesses}${lossConditions}</ul></div><p class="fine-print">Es una intención, no un guion rígido: el bot vuelve a evaluar la posición en cada ventana legal.</p></div></div><aside class="side-card bots-ready"><span class="eyebrow">3 · LISTO PARA JUGAR</span><h2>Prueba las versiones con ${esc(deck.name)}</h2><p>La pantalla Jugar permite elegir la versión Nexo y el mazo rival por separado. Nexo 2 puede usar cualquier mazo del catálogo contra cualquier otro.</p><div class="data-row"><span>Reglas</span><b>OCGCore GOAT</b></div><div class="data-row"><span>Base</span><b>Estable</b></div><div class="data-row"><span>Parche</span><b>No promovido</b></div><button class="primary-button wide" data-action="open-play">Elegir bot en Jugar</button></aside></div></section>`;
}

import { OcgMessageType, SelectBattleCMDAction, SelectIdleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { getCard, getCardByName } from "../engine/cards.js";
import { getDeck } from "../decks/decks.js";
import { hashString } from "../engine/rng.js";
import { NEXO2_DECK_PROFILES } from "./nexo2-deck-profiles.js";
import { GOAT_BASE_KNOWLEDGE_FINGERPRINT, GOAT_BASE_KNOWLEDGE_SCHEMA, GOAT_BASE_RULES, baseKnowledgeFeatures, classifyGoatState } from "./goat-base-knowledge.js";

const NORMALIZE_RE = /\s+/g;

function normalize(value) { return String(value ?? "").trim().toLowerCase().replace(NORMALIZE_RE, " "); }
function cardCode(card) { return Number(card?.authoritative?.runtimeCode ?? card?.runtimeCode ?? card?.code ?? 0); }
function bounded(value, minimum = -4, maximum = 4) { return Math.max(minimum, Math.min(maximum, Number(value) || 0)); }

const PLAN_DEFAULT = Object.freeze({
  id: "generic-value",
  archetype: "Midrange",
  identity: "Genera ventaja, protege recursos y convierte la mesa en daño.",
  objective: "Genera ventaja, protege recursos y convierte la mesa en daño.",
  playstyle: "Midrange adaptable",
  keyCards: [],
  counterplay: "Identifica el motor del mazo, intercambia recursos sólo cuando haya valor y no regales cartas clave.",
  counterplayRoles: ["interaction", "resource-denial"],
  weaknesses: ["La estrategia se debilita si pierde su motor antes de convertir la ventaja."],
  priorityRoles: ["draw", "search", "engine", "interaction", "threat", "boss", "defense"],
  roleWeights: { draw: 1.1, search: 1, engine: 0.8, interaction: 0.9, threat: 0.7, boss: 0.5, defense: 0.5, lethal: 0.8, combo: 0.7 },
  openingRoles: ["draw", "search", "engine"],
  keepRoles: ["interaction", "defense", "boss"],
  spendAfterTurn: {},
  goals: ["card advantage", "field control", "lethal"],
  scenarios: ["opening-engine", "protect-resource", "convert-lethal"],
});

const DECK_PLANS = Object.freeze({
  "chaos-turbo": {
    id: "chaos-turbo-v1", archetype: "Chaos / Midrange", identity: "Llena el Cementerio con LIGHT/DARK, conserva tempo y convierte el umbral en BLS.",
    objective: "Llena el Cementerio con LIGHT/DARK, conserva tempo y convierte el umbral en BLS o Chaos Sorcerer.",
    playstyle: "Midrange explosivo con cierre de Chaos",
    keyCards: ["Black Luster Soldier - Envoy of the Beginning", "Chaos Sorcerer", "Thunder Dragon", "Graceful Charity", "D.D. Warrior Lady", "Pot of Greed"],
    counterplay: "Corta el acceso al Cementerio, fuerza los jefes antes de tiempo y no le entregues intercambios gratuitos para alcanzar el umbral de Chaos.",
    counterplayRoles: ["graveyard-denial", "deny-boss", "monster-removal", "interaction", "backrow-removal"],
    weaknesses: ["Depende de LIGHT/DARK en el Cementerio.", "Pierde explosividad si se le niega el primer motor o se le obliga a gastar el jefe sin ventaja."],
    priorityRoles: ["draw", "grave-setup", "search", "engine", "interaction", "threat", "boss", "lethal"],
    roleWeights: { draw: 1.4, "grave-setup": 1.3, search: 1.1, engine: 1, interaction: 1.1, threat: 1, boss: 1.8, lethal: 1.5, defense: 0.6 },
    openingRoles: ["draw", "grave-setup", "search", "engine"], keepRoles: ["boss", "interaction", "defense"],
    spendAfterTurn: { boss: 0, interaction: 2 }, goals: ["fill graveyard", "establish tempo", "summon chaos boss", "attack for lethal"],
    scenarios: ["chaos-opening", "light-dark-threshold", "protect-boss", "convert-lethal"],
  },
  "goat-control": {
    id: "goat-control-v1", archetype: "Control", identity: "Intercambia recursos, conserva Scapegoat y fuerza el combate favorable.",
    objective: "Intercambia recursos, conserva Scapegoat y fuerza el combate favorable hasta ganar la guerra de recursos.",
    playstyle: "Control reactivo y ventaja incremental",
    keyCards: ["Scapegoat", "Metamorphosis", "Book of Moon", "Magician of Faith", "Tsukuyomi", "Nobleman of Crossout"],
    counterplay: "No ataques a ciegas contra sus volteos, elimina sus cartas continuas antes de que generen valor y obliga a gastar Scapegoat fuera de la ventana ideal.",
    counterplayRoles: ["avoid-blind-attacks", "backrow-removal", "target-face-down-monster", "interaction", "tempo"],
    weaknesses: ["Necesita tiempo para convertir sus intercambios en ventaja.", "Sufre si se le niegan los volteos o se le fuerza a usar Scapegoat defensivamente."],
    priorityRoles: ["draw", "interaction", "defense", "engine", "flip", "threat", "lethal"],
    roleWeights: { draw: 1.1, interaction: 1.4, defense: 1.3, engine: 1, flip: 1.1, threat: 0.8, lethal: 0.8, stall: 1 },
    openingRoles: ["draw", "defense", "engine"], keepRoles: ["interaction", "defense", "stall"],
    spendAfterTurn: { "swing": 3, lethal: 2 }, goals: ["trade one for one", "protect life points", "create favorable flips", "win resource war"],
    scenarios: ["set-interaction", "goat-defense", "flip-recovery", "resource-endgame"],
  },
  "chaos-control": {
    id: "chaos-control-v1", archetype: "Chaos / Control", identity: "Controla la mesa y guarda LIGHT/DARK para el cierre explosivo.",
    objective: "Controla la mesa y guarda LIGHT/DARK para un cierre explosivo cuando el rival ya no pueda responder.",
    playstyle: "Control de recursos con cierre de Chaos",
    keyCards: ["Black Luster Soldier - Envoy of the Beginning", "Chaos Sorcerer", "D.D. Warrior Lady", "Book of Moon", "Graceful Charity"],
    counterplay: "Ataca el equilibrio de LIGHT/DARK, presiona sus recursos de interacción y no permitas que llegue al cierre con mesa estable.",
    counterplayRoles: ["graveyard-denial", "deny-boss", "interaction", "backrow-removal"],
    weaknesses: ["Su cierre depende de conservar recursos hasta el umbral de Chaos."],
    priorityRoles: ["draw", "interaction", "grave-setup", "engine", "threat", "boss", "lethal"],
    roleWeights: { draw: 1.2, interaction: 1.3, "grave-setup": 1.1, engine: 1, threat: 0.9, boss: 1.5, lethal: 1.2, defense: 0.8 },
    openingRoles: ["draw", "interaction", "grave-setup"], keepRoles: ["boss", "interaction"],
    spendAfterTurn: { boss: 0 }, goals: ["deny opposing engine", "reach chaos threshold", "close safely"],
    scenarios: ["control-opening", "chaos-threshold", "deny-engine", "safe-close"],
  },
  warrior: {
    id: "warrior-v1", archetype: "Aggro / Anti-meta", identity: "Busca la herramienta correcta con ROTA y convierte cada turno en presión eficiente.",
    objective: "Busca la herramienta correcta con ROTA y convierte cada turno en presión eficiente.",
    playstyle: "Aggro de tempo y presión constante",
    keyCards: ["Reinforcement of the Army", "D.D. Warrior Lady", "Breaker the Magical Warrior"],
    counterplay: "Sobrevive al primer empuje, corta ROTA o sus amenazas buscadas y gana los intercambios antes de que convierta presión en daño letal.",
    counterplayRoles: ["interaction", "monster-removal", "backrow-removal", "defense"],
    weaknesses: ["Pierde valor si no puede mantener un atacante en mesa."],
    priorityRoles: ["search", "threat", "interaction", "tempo", "draw", "lethal", "defense"],
    roleWeights: { search: 1.7, threat: 1.4, interaction: 1.2, tempo: 1.2, draw: 0.7, lethal: 1.5, defense: 0.6 },
    openingRoles: ["search", "threat", "tempo"], keepRoles: ["interaction", "lethal"],
    spendAfterTurn: {}, goals: ["establish attacker", "force trades", "keep pressure", "finish before control stabilizes"],
    scenarios: ["rota-target", "first-pressure", "trade-up", "attack-lethal"],
  },
  "panda-burn": {
    id: "panda-burn-v1", archetype: "Burn", identity: "Convierte permanentes y daño directo en un reloj; no intercambia recursos sin necesidad.",
    objective: "Convierte permanentes y daño directo en un reloj y protege la última secuencia de burn.",
    playstyle: "Burn defensivo y control del reloj",
    keyCards: ["Stealth Bird", "Wave-Motion Cannon", "Just Desserts", "Scapegoat"],
    counterplay: "Presiona sus cartas continuas, conserva removal para el motor de daño y no le des turnos gratis para montar el reloj.",
    counterplayRoles: ["backrow-removal", "interaction", "life-preservation", "tempo"],
    weaknesses: ["Depende de permanentes y de mantener la partida bajo control de ritmo."],
    priorityRoles: ["draw", "burn", "engine", "defense", "interaction", "stall", "lethal"],
    roleWeights: { draw: 1.3, burn: 1.8, engine: 1.2, defense: 1.2, interaction: 0.8, stall: 1.4, lethal: 1.7 },
    openingRoles: ["draw", "engine", "defense"], keepRoles: ["burn", "defense", "stall"],
    spendAfterTurn: { interaction: 3 }, goals: ["protect life points", "assemble burn", "force a short clock"],
    scenarios: ["burn-engine", "protect-clock", "preserve-final-damage"],
  },
  "reasoning-gate": {
    id: "reasoning-gate-v1", archetype: "Combo", identity: "Monta una secuencia de invocación y evita gastar piezas de combo fuera de ventana.",
    objective: "Monta una secuencia de invocación y conserva las piezas de combo hasta la ventana decisiva.",
    playstyle: "Combo de preparación y explosión",
    keyCards: ["Reasoning", "Monster Gate", "Black Luster Soldier - Envoy of the Beginning"],
    counterplay: "Interrumpe el primer buscador o la pieza que conecta la secuencia; no malgastes removal en cartas que no son el motor.",
    counterplayRoles: ["negate", "interaction", "remove-engine", "graveyard-denial"],
    weaknesses: ["Una interrupción temprana puede dejar cartas muertas y cortar toda la secuencia."],
    priorityRoles: ["combo", "draw", "engine", "grave-setup", "interaction", "boss", "lethal"],
    roleWeights: { combo: 1.8, draw: 1.3, engine: 1.3, "grave-setup": 1.1, interaction: 0.7, boss: 1.2, lethal: 1.6 },
    openingRoles: ["draw", "combo", "engine"], keepRoles: ["combo", "boss", "interaction"],
    spendAfterTurn: { interaction: 2 }, goals: ["assemble combo", "protect key activation", "end with decisive swing"],
    scenarios: ["combo-piece", "gate-resolution", "protect-combo", "combo-lethal"],
  },
  "earth-aggro": {
    id: "earth-aggro-v1", archetype: "Aggro", identity: "Mantiene presión de ATK, usa removal para abrir ataques y no se queda esperando.",
    objective: "Mantiene presión de ATK, abre el campo con removal y cierra antes de que el rival estabilice.",
    playstyle: "Aggro de combate y tempo",
    keyCards: ["Gigantes", "Gemini Elf", "Breaker the Magical Warrior", "D.D. Warrior Lady"],
    counterplay: "Conserva una respuesta para el atacante principal, intercambia removal por amenazas reales y gana tiempo hasta que su presión pierda densidad.",
    counterplayRoles: ["monster-removal", "defense", "interaction", "tempo"],
    weaknesses: ["Sufre cuando el rival estabiliza una defensa que no puede atravesar eficientemente."],
    priorityRoles: ["threat", "search", "interaction", "tempo", "lethal", "defense"],
    roleWeights: { threat: 1.5, search: 1.2, interaction: 1.2, tempo: 1.4, lethal: 1.6, defense: 0.5 },
    openingRoles: ["threat", "search", "tempo"], keepRoles: ["interaction", "lethal"],
    spendAfterTurn: {}, goals: ["attack every safe turn", "trade efficiently", "close before value decks"],
    scenarios: ["aggressive-summon", "open-attack", "remove-blocker", "attack-lethal"],
  },
  "empty-jar": {
    id: "empty-jar-v1", archetype: "Deck-out / Combo", identity: "Protege los resets y administra el tamaño de ambos decks para ganar por agotamiento.",
    objective: "Protege los resets y administra el tamaño de ambos Decks para ganar por agotamiento.",
    playstyle: "Combo de deck-out y resets",
    keyCards: ["Morphing Jar", "Cyber Jar", "Book of Moon", "Tsukuyomi"],
    counterplay: "No llenes su Cementerio ni su mano sin necesidad, conserva una respuesta para el reset y controla el conteo de Decks.",
    counterplayRoles: ["negate", "interaction", "deck-count", "avoid-reset"],
    weaknesses: ["Pierde si se le corta el reset o se le obliga a jugar un duelo normal de combate."],
    priorityRoles: ["combo", "deck-out", "draw", "reset", "flip", "defense", "interaction"],
    roleWeights: { combo: 1.7, "deck-out": 1.8, draw: 1.4, reset: 1.5, flip: 1.1, defense: 1.1, interaction: 0.6 },
    openingRoles: ["draw", "combo", "flip"], keepRoles: ["reset", "combo", "defense"],
    spendAfterTurn: { interaction: 3 }, goals: ["preserve deck-out engine", "reset hands", "avoid normal combat plan"],
    scenarios: ["jar-setup", "reset-timing", "deck-count", "protect-combo"],
  },
  "chaos-recruiter": {
    id: "chaos-recruiter-v1", archetype: "Chaos / Recruiter", identity: "Usa recruiters para convertir combate en acceso a LIGHT/DARK y mantiene el flujo de recursos.",
    objective: "Usa recruiters para convertir combate en acceso a LIGHT/DARK y mantener el flujo hasta el jefe de Chaos.",
    playstyle: "Midrange de recruiters y ventaja por combate",
    keyCards: ["Mystic Tomato", "Shining Angel", "Black Luster Soldier - Envoy of the Beginning", "Chaos Sorcerer"],
    counterplay: "No permitas que sus recruiters conviertan cada combate en búsqueda; elimina el objetivo correcto y controla su Cementerio.",
    counterplayRoles: ["monster-removal", "graveyard-denial", "interaction", "deny-boss"],
    weaknesses: ["Necesita que sus recruiters sobrevivan o intercambien favorablemente para generar acceso."],
    priorityRoles: ["search", "engine", "grave-setup", "threat", "interaction", "boss", "lethal"],
    roleWeights: { search: 1.5, engine: 1.3, "grave-setup": 1.2, threat: 1, interaction: 1, boss: 1.4, lethal: 1.3, defense: 0.7 },
    openingRoles: ["search", "engine", "grave-setup"], keepRoles: ["boss", "interaction"],
    spendAfterTurn: {}, goals: ["trade recruiter for access", "fill grave", "convert advantage into chaos boss"],
    scenarios: ["recruiter-line", "search-chain", "chaos-threshold", "close-with-boss"],
  },
  "flip-control": {
    id: "flip-control-v1", archetype: "Control / Flip", identity: "Prepara volteos, protege cartas de valor y gana por ventaja incremental.",
    objective: "Prepara volteos, protege cartas de valor y gana por ventaja incremental sin exponer el monstruo antes de tiempo.",
    playstyle: "Control de volteos y ventaja incremental",
    keyCards: ["Magician of Faith", "Dekoichi the Battlechanted Locomotive", "Mask of Darkness", "Tsukuyomi", "Book of Moon", "Solemn Judgment"],
    counterplay: "No ataques ni uses removal a ciegas sobre sus monstruos seteados; limpia la retaguardia y niega el momento en que el volteo genera ventaja.",
    counterplayRoles: ["avoid-blind-attacks", "backrow-removal", "target-face-down-monster", "negate", "battle-interaction"],
    weaknesses: ["Necesita que sus monstruos sobrevivan boca abajo hasta la ventana de volteo.", "Sufre ante removal de retaguardia y respuestas que no le dan tiempo."],
    priorityRoles: ["draw", "flip", "interaction", "defense", "engine", "tempo", "lethal"],
    roleWeights: { draw: 1.1, flip: 1.6, interaction: 1.3, defense: 1.2, engine: 1.1, tempo: 0.9, lethal: 0.8 },
    openingRoles: ["draw", "flip", "defense"], keepRoles: ["flip", "interaction", "defense"],
    spendAfterTurn: { lethal: 3 }, goals: ["set value monster", "protect flip resolution", "win incremental advantage"],
    scenarios: ["set-value", "flip-reuse", "protect-flip", "resource-endgame"],
  },
});

export function semanticRolesForCard(card) {
  const roles = new Set();
  const text = normalize(`${card?.visibleText ?? ""} ${card?.text ?? ""}`);
  const kind = String(card?.kind ?? "").toUpperCase();
  const cardClass = normalize(card?.class);
  const family = normalize(card?.effectFamily);
  const attack = Number(card?.atk) || 0;
  const defense = Number(card?.def) || 0;
  const speed = normalize(`${card?.subtype ?? ""} ${card?.spellType ?? ""} ${card?.trapType ?? ""}`);
  const costClause = text.split(";")[0] ?? "";

  if (kind === "MONSTER") roles.add("threat");
  if (kind === "TRAP") roles.add("interaction");
  if (kind === "TRAP" || /quick.?play|counter/.test(speed)) roles.add("reactive");
  if (cardClass.includes("flip") || /^flip\s*:/.test(text)) roles.add("flip");
  if (/\bdraw\b/.test(text) || family === "draw") { roles.add("draw"); roles.add("engine"); roles.add("advantage"); }
  const drawCount = text.match(/draw (\d+) cards?/);
  if (drawCount) roles.add(`draw-count-${drawCount[1]}`);
  const deckConsume = text.match(/(?:reveal|excavate) (?:the )?top (\d+) cards?/);
  if (deckConsume) roles.add(`deck-consume-${deckConsume[1]}`);
  if (/add .* from (?:your )?deck .* (?:your )?hand|add .*deck to (?:your )?hand|search (?:your )?deck/.test(text)) { roles.add("search"); roles.add("engine"); roles.add("advantage"); }
  if (/add up to \d+ more /.test(text)) roles.add("search-copies");
  if (/add .*graveyard .*hand|return .*graveyard .*hand|graveyard.*add .*hand/.test(text)) { roles.add("recovery"); roles.add("engine"); roles.add("advantage"); }
  if (/discard|send .* from .*deck .*graveyard|send the top .*graveyard/.test(text)) roles.add("grave-setup");
  if (/special summon|\bsummon\b/.test(text) || family === "special_summon") { roles.add("combo"); roles.add("engine"); }
  if (/token/.test(text)) { roles.add("token"); roles.add("resource"); roles.add("defense"); }
  if (/change .* (?:battle |defense |attack )?position|face-up .*face-down|face-down defense position/.test(text) || family === "position") { roles.add("position"); roles.add("tempo"); roles.add("interaction"); }
  if (/change .*face-up monster .*face-down defense position|change .*face-up monster to face-down defense position/.test(text)) roles.add("turn-face-down");
  if (/destroy|banish|remove from play|return .*field .*hand|send .*field .*graveyard/.test(text)) { roles.add("interaction"); roles.add("removal"); }
  if (/(?:spell|trap)(?: card)?s?/.test(text) && roles.has("removal")) roles.add("backrow-removal");
  if (/monster(?: card)?s?/.test(text) && roles.has("removal")) roles.add("monster-removal");
  if (/(?:target|destroy|banish|remove from play|select|change) (?:the )?(?:up to )?(?:\d+|one|a)?\s*(?:face-down|set)(?: defense position)? monster/.test(text)) roles.add("target-face-down-monster");
  if (/(?:target|destroy|banish|remove from play|select|change) (?:the )?(?:up to )?(?:\d+|one|a)?\s*face-up(?: attack position| defense position)? monster/.test(text)) roles.add("target-face-up-monster");
  if (/(?:monster|card)s? your opponent controls|your opponent(?:'s|s') (?:face-up |face-down )?(?:monster|card)|on your opponent(?:'s|s') side of the field/.test(text)) roles.add("target-opponent-board");
  if (/\bdestroy\b/.test(text) && roles.has("removal")) roles.add("destroy-removal");
  if (/\bbanish\b|remove from play/.test(text) && roles.has("removal")) roles.add("banish-removal");
  // A card that is already resolving on the chain cannot be stopped merely
  // by destroying it. This semantic distinction lets the common decision
  // layer handle Raigeki Break, Mystical Space Typhoon, Heavy Storm and
  // equivalent effects without naming individual cards.
  const spellTrap = kind === "SPELL" || kind === "TRAP";
  const persistentSubtype = /continuous|equip|field/.test(speed);
  const persistentText = /as long as|while .* remains|each time|during each|once per turn|cannot be activated|cannot be destroyed/.test(text);
  if (spellTrap) roles.add(persistentSubtype || persistentText ? "persistent-effect" : "one-shot-effect");
  if (/\bnegate\s+(?:the\s+)?(?:activation|effect)|\bnegate\b.*\bactivation\b/.test(text)) roles.add("negate-activation");
  if (/negate/.test(text)) { roles.add("interaction"); roles.add("negate"); roles.add("defense"); }
  if (/cannot attack|end the battle phase|battle damage .* 0|not destroyed by battle/.test(text)) { roles.add("defense"); roles.add("stall"); }
  if (/cannot declare an attack|cannot attack|skip (?:their|your|the) .*battle phase|level .* monsters? cannot attack/.test(text)) { roles.add("defense"); roles.add("stall"); }
  if (/inflict .*damage|damage to your opponent/.test(text)) { roles.add("burn"); roles.add("lethal"); }
  if (/all (?:monsters|spell|trap)|each (?:monster|spell|trap)/.test(text) && roles.has("interaction")) roles.add("swing");
  if (/deck.*0 cards|cannot draw|send .*deck/.test(text)) roles.add("deck-out");
  if (/shuffle .*hand|discard .*hand|both players.*draw/.test(text)) roles.add("reset");
  if (/win the duel|after \d+ turns?/.test(text)) { roles.add("alternate-win"); roles.add("delayed-win"); roles.add("lethal"); roles.add("combo"); }
  if (/spell counter/.test(text)) roles.add("counter-resource");
  if (/each time (?:a )?spell card is activated|each time .*spell.*place .*counter|during each .*place .*counter/.test(text)) { roles.add("continuous-engine"); roles.add("spell-engine"); roles.add("combo"); roles.add("engine"); }
  if (/return all spell and trap cards .* (?:hand|hands)/.test(text)) { roles.add("recycle-board"); roles.add("backrow-sweeper"); roles.add("combo"); roles.add("engine"); }
  if (/destroy all spell and trap cards/.test(text)) roles.add("backrow-sweeper");
  if (/equip (?:only )?to|equipped monster|equip card/.test(text) || /equip/i.test(String(card?.subtype ?? ""))) { roles.add("equip"); roles.add("combo"); }
  if (/increase .*atk|gains? \d+ atk|original atk/.test(text)) { roles.add("attack-boost"); roles.add("lethal"); }
  if (/attack .*additional time|attack .*for each equip|multiple attacks/.test(text)) { roles.add("multi-attack"); roles.add("combo"); roles.add("lethal"); }
  if (/skips? .*draw phase/.test(text)) { roles.add("draw-denial"); roles.add("interaction"); roles.add("control"); }
  if (/top of (?:your|the) deck|deck upside down|reveal .*top/.test(text)) roles.add("deck-information");
  if (kind === "SPELL" && /continuous/i.test(String(card?.subtype ?? ""))) roles.add("continuous-engine");
  if (kind === "MONSTER" && defense >= Math.max(1800, attack + 500)) roles.add("defense");
  if (kind === "MONSTER" && (attack >= 2400 || Number(card?.level) >= 7)) roles.add("boss");
  if (kind === "MONSTER" && attack >= 2000) roles.add("lethal");
  if (/pay half (?:your )?lp/.test(costClause)) roles.add("cost-half-lp");
  const lpCost = costClause.match(/pay (\d+) lp/);
  if (lpCost) roles.add(`cost-lp-${lpCost[1]}`);
  const discardCost = costClause.match(/discard (\d+|a) card/);
  if (discardCost) roles.add(`cost-discard-${discardCost[1] === "a" ? 1 : discardCost[1]}`);
  if (/tribute (?:\d+|this|a) (?:monster|card)/.test(costClause)) roles.add("cost-tribute");
  if (/you cannot normal summon or set/.test(text)) roles.add("summon-restriction");
  const attribute = normalize(card?.attribute);
  if (attribute === "light") roles.add("light");
  if (attribute === "dark") roles.add("dark");
  const race = normalize(card?.race);
  if (race) roles.add(race);
  return [...roles];
}

function inferredPlan(deck, cards = []) {
  const archetype = normalize(deck?.archetype);
  const counts = roleCount(cards);
  const count = (role) => Number(counts[role]) || 0;
  const monsterCards = cards.filter((card) => card.kind === "MONSTER");
  const averageAttack = monsterCards.length ? monsterCards.reduce((sum, card) => sum + Number(card.atk) * Number(card.count), 0) / Math.max(1, monsterCards.reduce((sum, card) => sum + Number(card.count), 0)) : 0;
  const candidates = [
    { key: "panda-burn", score: count("burn") * 4 + count("stall") * 1.5 + (archetype.includes("burn") ? 8 : 0) },
    { key: "empty-jar", score: count("deck-out") * 6 + count("reset") * 3 + (archetype.includes("deck-out") ? 8 : 0) },
    { key: "flip-control", score: count("flip") * 2.5 + count("defense") + (archetype.includes("flip") ? 8 : 0) },
    { key: "reasoning-gate", score: count("combo") * 1.2 + count("engine") * 0.7 + (archetype.includes("combo") ? 8 : 0) },
    { key: "chaos-control", score: Math.min(count("light"), count("dark")) * 0.8 + count("boss") * 1.5 + (archetype.includes("chaos") ? 8 : 0) },
    { key: "earth-aggro", score: count("threat") * 0.35 + count("lethal") * 1.2 + Math.max(0, averageAttack - 1300) / 180 + (archetype.includes("aggro") || archetype.includes("beatdown") ? 8 : 0) },
    { key: "goat-control", score: count("interaction") * 0.8 + count("defense") * 0.7 + count("negate") * 1.5 + (archetype.includes("control") ? 8 : 0) },
  ].sort((left, right) => right.score - left.score);
  const selected = candidates[0];
  const base = selected?.score > 0 ? DECK_PLANS[selected.key] : PLAN_DEFAULT;
  const evidence = Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, 6).map(([role, amount]) => ({ role, count: amount }));
  return { ...base, id: `derived-${base.id}`, derived: true, evidence, keyCards: inferredKeyCards(cards) };
}

function roleCount(cards) {
  const counts = {};
  for (const card of cards) for (const role of card.roles) counts[role] = (counts[role] ?? 0) + card.count;
  return counts;
}

function fallbackDeck(deckId = "generic") {
  return { id: deckId || "generic", name: deckId || "Generic", archetype: "Generic", main: [], fusion: [], side: [], unresolved: true };
}

function resolveDeck(deckId = "generic", deck = null) {
  if (deck) return deck;
  if (!deckId || deckId === "generic") return fallbackDeck("generic");
  try {
    return getDeck(deckId);
  } catch {
    return fallbackDeck(deckId);
  }
}

function inferredCounterplayRoles(plan, cards = []) {
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  if (roles.has("flip")) return ["avoid-blind-attacks", "backrow-removal", "target-face-down-monster"];
  if (roles.has("burn") || roles.has("stall")) return ["backrow-removal", "life-preservation", "tempo"];
  if (roles.has("deck-out") || roles.has("reset")) return ["negate", "avoid-reset", "deck-count"];
  if (roles.has("combo")) return ["negate", "remove-engine", "interaction"];
  if (roles.has("grave-setup")) return ["graveyard-denial", "deny-boss", "interaction"];
  if (roles.has("interaction")) return ["interaction", "resource-denial", "tempo"];
  return [...(plan.counterplayRoles ?? PLAN_DEFAULT.counterplayRoles)];
}

function inferredWeaknesses(plan, cards = []) {
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  if (roles.has("flip")) return ["Necesita tiempo y una carta boca abajo que sobreviva hasta su ventana de valor."];
  if (roles.has("combo")) return ["Una interrupción temprana sobre el motor puede cortar la secuencia completa."];
  if (roles.has("burn") || roles.has("stall")) return ["Pierde presión si se le retiran los permanentes que sostienen su reloj."];
  if (roles.has("grave-setup")) return ["Pierde consistencia si no puede llenar o proteger el Cementerio."];
  return [...(plan.weaknesses ?? PLAN_DEFAULT.weaknesses)];
}

function inferredKeyCards(cards = []) {
  return cards
    .filter((card) => card.name)
    .sort((left, right) => {
      const score = (card) => (card.roles ?? []).reduce((sum, role) => sum + (role === "boss" ? 5 : ["engine", "draw", "search", "flip", "interaction", "lethal"].includes(role) ? 2 : 0), 0) + Number(card.count || 0) * 0.05;
      return score(right) - score(left);
    })
    .slice(0, 6)
    .map((card) => card.name);
}

export function strategyPlanForDeck(deckId, deck = null, cards = []) {
  const source = resolveDeck(deckId, deck);
  const explicit = DECK_PLANS[deckId];
  const document = NEXO2_DECK_PROFILES[deckId] ?? {};
  const inferred = explicit ?? inferredPlan(source, cards);
  const plan = {
    ...inferred,
    ...document,
    roleWeights: { ...(inferred.roleWeights ?? {}), ...(document.roleWeights ?? {}) },
  };
  const merged = {
    ...PLAN_DEFAULT,
    ...plan,
    objective: plan.objective ?? plan.identity ?? PLAN_DEFAULT.objective,
    playstyle: plan.playstyle ?? plan.archetype ?? PLAN_DEFAULT.playstyle,
    keyCards: [...(plan.keyCards ?? inferredKeyCards(cards))],
    counterplay: plan.counterplay ?? PLAN_DEFAULT.counterplay,
    counterplayRoles: [...(plan.counterplayRoles ?? inferredCounterplayRoles(plan, cards))],
    weaknesses: [...(plan.weaknesses ?? inferredWeaknesses(plan, cards))],
    strengths: [...(plan.strengths ?? [])],
    lossConditions: [...(plan.lossConditions ?? [])],
    roleWeights: { ...PLAN_DEFAULT.roleWeights, ...(plan.roleWeights ?? {}) },
    openingRoles: [...(plan.openingRoles ?? PLAN_DEFAULT.openingRoles)],
    keepRoles: [...(plan.keepRoles ?? PLAN_DEFAULT.keepRoles)],
    goals: [...(plan.goals ?? PLAN_DEFAULT.goals)],
    scenarios: [...(plan.scenarios ?? PLAN_DEFAULT.scenarios)],
  };
  if (!merged.keyCards.length) merged.keyCards = inferredKeyCards(cards);
  if (!merged.counterplayRoles.length) merged.counterplayRoles = inferredCounterplayRoles(merged, cards);
  if (!merged.weaknesses.length) merged.weaknesses = inferredWeaknesses(merged, cards);
  if (!merged.strengths.length) merged.strengths = inferredStrengths(merged, cards);
  if (!merged.lossConditions.length) merged.lossConditions = inferredLossConditions(merged, cards);
  merged.strategySource = document && Object.keys(document).length ? "explicit" : "derived";
  return merged;
}

function inferredStrengths(plan, cards = []) {
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  const strengths = [];
  if (roles.has("draw") || roles.has("search") || roles.has("advantage")) strengths.push("Genera acceso y ventaja de cartas a partir de sus cartas de motor.");
  if (roles.has("interaction") || roles.has("removal")) strengths.push("Puede intercambiar recursos y adaptar la respuesta a la mesa pública.");
  if (roles.has("boss") || roles.has("lethal")) strengths.push("Tiene una amenaza de cierre capaz de convertir una ventana favorable en daño.");
  if (roles.has("defense") || roles.has("stall")) strengths.push("Puede comprar turnos y proteger sus puntos de vida mientras prepara el plan.");
  return strengths.length ? strengths.slice(0, 3) : ["Su lista mantiene un plan midrange flexible basado en cartas legales y valor público."];
}

function inferredLossConditions(plan, cards = []) {
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  const losses = [];
  if (roles.has("combo") || roles.has("engine")) losses.push("Si se interrumpe el primer motor, las cartas de seguimiento pierden consistencia.");
  if (roles.has("interaction") || roles.has("removal")) losses.push("Si gasta la interacción en objetivos sin valor, el rival conserva la amenaza real.");
  if (roles.has("boss") || roles.has("lethal")) losses.push("Si llega al cierre sin ventaja o sin proteger la amenaza, el intercambio resulta negativo.");
  if (roles.has("defense") || roles.has("stall")) losses.push("Si pierde la defensa antes de estabilizar, queda expuesto a una carrera de daño.");
  return losses.length ? losses.slice(0, 3) : ["Pierde cuando no puede convertir su ventaja de cartas en una posición de mesa estable."];
}

export function buildDeckKnowledge(deckId = "generic", deck = null) {
  const source = resolveDeck(deckId, deck);
  const counts = new Map();
  for (const cardId of source.main ?? []) counts.set(Number(cardId), (counts.get(Number(cardId)) ?? 0) + 1);
  const cards = [...counts.entries()].map(([id, count]) => {
    const card = getCard(id) ?? {};
    return { id, name: card.name ?? String(id), count, kind: card.kind ?? "UNKNOWN", subtype: card.subtype ?? card.spellType ?? card.trapType ?? null, effect: card.effect ?? "UNKNOWN", roles: semanticRolesForCard(card), atk: Number(card.atk) || 0, def: Number(card.def) || 0, level: Number(card.level) || 0, attribute: card.attribute ?? null, runtimeCode: cardCode(card) };
  }).sort((left, right) => left.id - right.id);
  const plan = strategyPlanForDeck(deckId, source, cards);
  const byName = Object.fromEntries(cards.map((card) => [normalize(card.name), card]));
  const byRuntimeCode = Object.fromEntries(cards.filter((card) => card.runtimeCode).map((card) => [String(card.runtimeCode), card]));
  const roles = roleCount(cards);
  return {
    schema: 1,
    baseKnowledgeSchema: GOAT_BASE_KNOWLEDGE_SCHEMA,
    baseKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
    baseRules: GOAT_BASE_RULES,
    deckId,
    deckHash: source.hash ?? hashString(JSON.stringify({ main: source.main ?? [], fusion: source.fusion ?? [], side: source.side ?? [] })),
    resolved: source.unresolved !== true,
    name: source.name ?? deckId,
    archetype: source.archetype ?? plan.archetype,
    plan,
    mainSize: source.main?.length ?? 0,
    main: [...(source.main ?? [])],
    fusion: [...(source.fusion ?? [])],
    side: [...(source.side ?? [])],
    cards,
    cardCountById: Object.fromEntries([...counts].map(([id, count]) => [String(id), count])),
    roles,
    byName,
    byRuntimeCode,
  };
}

export function deckSnapshot(knowledge) {
  return {
    id: knowledge.deckId,
    name: knowledge.name,
    archetype: knowledge.archetype,
    main: [...(knowledge.main ?? knowledge.cards.flatMap((card) => Array.from({ length: card.count }, () => card.id)))],
    fusion: [...(knowledge.fusion ?? [])],
    side: [...(knowledge.side ?? [])],
    hash: knowledge.deckHash,
    unresolved: knowledge.resolved === false,
  };
}

export function deckKnowledgeCompatibility(knowledge, expected = {}) {
  const actual = {
    deckId: knowledge?.deckId ?? null,
    deckHash: knowledge?.deckHash ?? null,
    mainSize: Number(knowledge?.mainSize) || 0,
    resolved: knowledge?.resolved !== false,
  };
  const errors = [];
  if (expected.deckId && actual.deckId !== expected.deckId) errors.push(`deckId: ${actual.deckId ?? "missing"} != ${expected.deckId}`);
  if (expected.deckHash && actual.deckHash !== expected.deckHash) errors.push(`deckHash: ${actual.deckHash ?? "missing"} != ${expected.deckHash}`);
  if (expected.mainSize !== undefined && Number(expected.mainSize) !== actual.mainSize) errors.push(`mainSize: ${actual.mainSize} != ${Number(expected.mainSize)}`);
  if (expected.resolved === true && !actual.resolved) errors.push("deck: unresolved");
  return { checked: Object.keys(expected).length > 0, compatible: errors.length === 0, errors, expected: { ...expected }, actual };
}

export function actionCardEntries(knowledge, message, response) {
  const indexes = response?.indicies ?? (response?.index === null || response?.index === undefined ? [] : [response.index]);
  let source = message?.selects ?? message?.select_cards ?? [];
  if (message?.type === OcgMessageType.SELECT_IDLECMD) source = response.action === SelectIdleCMDAction.SELECT_ACTIVATE ? message.activates
    : response.action === SelectIdleCMDAction.SELECT_SUMMON ? message.summons
      : response.action === SelectIdleCMDAction.SELECT_SPECIAL_SUMMON ? message.special_summons
        : response.action === SelectIdleCMDAction.SELECT_MONSTER_SET ? message.monster_sets
          : response.action === SelectIdleCMDAction.SELECT_SPELL_SET ? message.spell_sets
            : response.action === SelectIdleCMDAction.SELECT_POS_CHANGE ? message.pos_changes : [];
  if (message?.type === OcgMessageType.SELECT_BATTLECMD) source = response.action === SelectBattleCMDAction.SELECT_CHAIN ? message.chains ?? [] : message.attacks ?? [];
  if (message?.type === OcgMessageType.SELECT_CHAIN) source = message.selects ?? [];
  if (message?.type === OcgMessageType.SELECT_OPTION) source = message.options ?? [];
  const entries = indexes.map((index) => source?.[Number(index)]).filter(Boolean);
  const sourceCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  if (!entries.length && sourceCode) entries.push({ code: sourceCode });
  return entries.map((entry) => knowledge.byRuntimeCode[String(Number(entry.code ?? entry.card ?? 0))] ?? knowledge.byName[normalize(entry.name)] ?? null).filter(Boolean);
}

function roleSet(knowledge, message, response) {
  const roles = new Set();
  for (const card of actionCardEntries(knowledge, message, response)) for (const role of card.roles) roles.add(role);
  return roles;
}

export function strategyActionRole(message, response) {
  if (message?.type === OcgMessageType.SELECT_IDLECMD) {
    return response?.action === SelectIdleCMDAction.SELECT_ACTIVATE ? "activate"
      : response?.action === SelectIdleCMDAction.SELECT_SUMMON ? "summon"
        : response?.action === SelectIdleCMDAction.SELECT_SPECIAL_SUMMON ? "special-summon"
          : response?.action === SelectIdleCMDAction.SELECT_MONSTER_SET ? "monster-set"
              : response?.action === SelectIdleCMDAction.SELECT_SPELL_SET ? "spell-set"
              : response?.action === SelectIdleCMDAction.SELECT_POS_CHANGE ? "position-change"
              : response?.action === SelectIdleCMDAction.SHUFFLE ? "shuffle"
              : response?.action === SelectIdleCMDAction.TO_BP ? "battle-phase" : "end-phase";
  }
  if (message?.type === OcgMessageType.SELECT_BATTLECMD) return response?.action === SelectBattleCMDAction.SELECT_CHAIN ? "chain" : response?.action === SelectBattleCMDAction.SELECT_BATTLE ? "attack" : response?.action === SelectBattleCMDAction.TO_M2 ? "main-two" : "end-phase";
  if (message?.type === OcgMessageType.SELECT_CHAIN) return response?.index === null ? "pass-chain" : "chain";
  if (message?.type === OcgMessageType.SELECT_EFFECTYN || message?.type === OcgMessageType.SELECT_YESNO) return response?.yes ? "yes" : "no";
  return "decision";
}

export function strategyObservationFeatures(knowledge, observation = {}) {
  const normalizedObservation = { ...observation, goatState: observation.goatState ?? classifyGoatState(observation) };
  const features = [`deck:plan:${knowledge.plan.id}`, `deck:archetype:${normalize(knowledge.archetype)}`, `deck:size:${knowledge.mainSize}`,
    ...baseKnowledgeFeatures(knowledge, normalizedObservation)];
  for (const role of knowledge.plan.priorityRoles ?? []) features.push(`plan:priority:${role}`);
  for (const role of knowledge.plan.openingRoles ?? []) features.push(`plan:opening-role:${role}`);
  for (const role of knowledge.plan.keepRoles ?? []) features.push(`plan:keep-role:${role}`);
  for (const role of knowledge.plan.counterplayRoles ?? []) features.push(`plan:counterplay:${role}`);
  for (const strength of knowledge.plan.strengths ?? []) features.push(`plan:strength:${normalize(strength)}`);
  for (const lossCondition of knowledge.plan.lossConditions ?? []) features.push(`plan:loss-condition:${normalize(lossCondition)}`);
  for (const goal of knowledge.plan.goals ?? []) features.push(`plan:goal:${normalize(goal)}`);
  for (const scenario of knowledge.plan.scenarios ?? []) features.push(`plan:scenario:${normalize(scenario)}`);
  for (const cardName of knowledge.plan.keyCards ?? []) features.push(`plan:key-card:${normalize(cardName)}`);
  for (const role of knowledge.plan.openingRoles ?? []) features.push(`plan:opening-role:${role}`);
  const handRoles = new Set((observation.ownHand ?? observation.hand)?.flatMap((card) => knowledge.byRuntimeCode[String(card.runtimeCode)]?.roles ?? []) ?? []);
  const graveRoles = new Set(observation.graveyard?.flatMap((card) => knowledge.byRuntimeCode[String(card.runtimeCode)]?.roles ?? []) ?? []);
  const boardRoles = new Set((observation.ownMonsters ?? []).flatMap((card) => knowledge.byRuntimeCode[String(card.runtimeCode)]?.roles ?? []));
  const seen = new Map();
  for (const card of [
    ...(observation.ownHand ?? observation.hand ?? []),
    ...(observation.ownMonsters ?? []),
    ...(observation.ownBackrow ?? []),
    ...(observation.graveyard ?? []),
    ...(observation.banished ?? []),
  ]) {
    const runtimeCode = Number(card.runtimeCode) || 0;
    if (runtimeCode) seen.set(String(runtimeCode), (seen.get(String(runtimeCode)) ?? 0) + 1);
  }
  for (const card of knowledge.cards) {
    const seenCount = seen.get(String(card.runtimeCode)) ?? 0;
    const remaining = Math.max(0, card.count - seenCount);
    features.push(`deck:card:${card.id}:remaining:${Math.min(card.count, remaining)}`);
    features.push(`deck:card:${card.id}:seen:${Math.min(card.count, seenCount)}`);
    for (const role of card.roles) features.push(`deck:${remaining ? "available" : "exhausted"}-role:${role}`);
  }
  const roleRemaining = {};
  const roleSeen = {};
  for (const card of knowledge.cards) for (const role of card.roles) {
    roleRemaining[role] = (roleRemaining[role] ?? 0) + Math.max(0, card.count - (seen.get(String(card.runtimeCode)) ?? 0));
    roleSeen[role] = (roleSeen[role] ?? 0) + Math.min(card.count, seen.get(String(card.runtimeCode)) ?? 0);
  }
  for (const role of new Set([...Object.keys(roleRemaining), ...Object.keys(roleSeen)])) {
    features.push(`deck:role:${role}:remaining:${Math.min(12, roleRemaining[role] ?? 0)}`);
    features.push(`deck:role:${role}:seen:${Math.min(12, roleSeen[role] ?? 0)}`);
  }
  for (const role of handRoles) features.push(`hand:role:${role}`);
  for (const role of graveRoles) features.push(`grave:role:${role}`);
  for (const role of boardRoles) features.push(`board:role:${role}`);
  const turn = Math.max(0, Number(observation.turn) || 0);
  const ownLp = Math.max(0, Number(observation.ownLp) || 0);
  const opponentLp = Math.max(0, Number(observation.opponentLp) || 0);
  const handSize = Math.max(0, Number(observation.handSize) || 0);
  features.push(`state:turn:${Math.min(12, Math.floor(turn / 2))}`);
  features.push(`state:own-lp:${Math.min(8, Math.floor(ownLp / 1000))}`);
  features.push(`state:opponent-lp:${Math.min(8, Math.floor(opponentLp / 1000))}`);
  features.push(`state:hand-size:${Math.min(10, handSize)}`);
  features.push(`state:deck-size:${Math.min(40, Math.max(0, Number(observation.ownDeckSize) || 0))}`);
  features.push(`state:board-power:${Math.min(12, Math.floor(Math.max(0, Number(observation.ownBoardPower) || 0) / 500))}`);
  features.push(`state:opponent-threat:${Math.min(12, Math.floor(Math.max(0, Number(observation.opponentThreat) || 0) / 500))}`);
  if (observation.phase !== undefined && observation.phase !== null) features.push(`state:phase:${String(observation.phase).toLowerCase()}`);
  if (turn <= 2) features.push("state:opening");
  if (Number(observation.opponentThreat) > 0) features.push("state:opponent-threat");
  if (Number(observation.ownLp) <= 3000) features.push("state:low-life");
  if (Number(observation.opponentLp) <= 3000) features.push("state:opponent-low-life");
  if (graveRoles.has("light") && graveRoles.has("dark")) features.push("state:chaos-threshold");
  return [...new Set(features)];
}

export function scoreDeckStrategy(knowledge, message, response, { actionRole = "unknown", observation = {}, baseline = false } = {}) {
  const roles = roleSet(knowledge, message, response);
  const plan = knowledge.plan;
  const goatState = observation.goatState ?? classifyGoatState(observation);
  let score = baseline ? 0.25 : 0;
  for (const role of roles) score += Number(plan.roleWeights?.[role] ?? 0) * 0.35;
  const turn = Number(observation.turn) || 1;
  const opening = turn <= 2;
  const threat = Number(observation.opponentThreat) || 0;
  const ownLp = Number(observation.ownLp) || 8000;
  if (opening && roles.size && [...roles].some((role) => plan.openingRoles?.includes(role))) score += 0.8;
  if (roles.has("interaction")) score += threat > 0 ? 0.9 : 0.15;
  if (roles.has("defense") || roles.has("stall")) score += ownLp <= 3000 || threat > ownLp / 2 ? 0.75 : 0;
  if (roles.has("boss")) score += observation.chaosReady ? 1.8 : -0.7;
  if (roles.has("lethal")) score += Number(observation.opponentLp) <= 3000 ? 1.5 : 0;
  if (roles.has("draw") || roles.has("search")) score += Number(observation.handSize) <= 4 ? 0.65 : 0.15;
  if (actionRole === "attack") score += Number(observation.ownBoardPower) > Number(observation.opponentThreat) ? 0.8 : -0.25;
  if (actionRole === "battle-phase" && Number(observation.ownBoardPower) > 0) score += 0.25;
  if (actionRole === "yes") score += roles.has("engine") || roles.has("combo") || roles.has("interaction") ? 0.45 : 0;
  if (actionRole === "no") score -= roles.has("engine") || roles.has("combo") || roles.has("interaction") ? 0.4 : 0;
  if (actionRole === "pass-chain" && threat > 0) score -= 0.35;
  if (actionRole === "end-phase") score -= message?.forced ? 0 : 0.3;
  // The manuals' state machine is a bounded prior, never an unconditional
  // command.  OCGCore still supplies the legal action mask and the detailed
  // card evaluator decides between the remaining options.
  if (goatState === "LETHAL") {
    if (["attack", "battle-phase", "summon", "special-summon"].includes(actionRole)) score += 0.45;
    if (["end-phase", "pass-chain"].includes(actionRole)) score -= 0.25;
  } else if (goatState === "AHEAD") {
    if (["end-phase", "pass-chain", "spell-set", "monster-set"].includes(actionRole)) score += 0.2;
    if (["activate", "attack"].includes(actionRole) && !roles.has("interaction") && !roles.has("lethal")) score -= 0.12;
  } else if (goatState === "BEHIND" || goatState === "SURVIVAL") {
    if (["activate", "summon", "special-summon", "attack", "battle-phase"].includes(actionRole)) score += 0.16;
    if (["end-phase", "pass-chain"].includes(actionRole)) score -= 0.28;
    if (roles.has("defense") || roles.has("interaction") || roles.has("removal")) score += 0.18;
  }
  for (const card of actionCardEntries(knowledge, message, response)) {
    if (["summon", "special-summon", "attack"].includes(actionRole)) score += bounded((Number(card.atk) - 1200) / 1800, -0.45, 0.65);
    if (actionRole === "monster-set") score += card.roles.includes("defense") || card.roles.includes("flip") || Number(card.def) > Number(card.atk) ? 0.55 : (Number(card.atk) >= 1500 ? -0.75 : -0.15);
    if (actionRole === "spell-set") score += roles.has("defense") || roles.has("interaction") || roles.has("stall") ? 0.45 : 0.05;
    if (["summon", "special-summon"].includes(actionRole) && card.roles.includes("flip") && turn <= 2 && !roles.has("threat")) score -= 0.2;
  }
  for (const role of plan.keepRoles ?? []) {
    const conserveUntil = Number(plan.spendAfterTurn?.[role] ?? 2);
    const spendsResource = ["activate", "summon", "special-summon", "attack"].includes(actionRole);
    const safeToSpend = role === "interaction" ? threat > 0 : role === "defense" || role === "stall" ? ownLp <= 3000 || threat > ownLp / 2 : true;
    if (roles.has(role) && spendsResource && turn <= conserveUntil && !safeToSpend) score -= 0.3;
  }
  if (roles.has("resource") && actionRole === "activate" && turn <= 2 && threat <= 0) score -= 0.5;
  return bounded(score, -6, 6);
}

export function describeDeckKnowledge(knowledge) {
  return {
    schema: knowledge.schema,
    baseKnowledgeSchema: knowledge.baseKnowledgeSchema,
    baseKnowledgeFingerprint: knowledge.baseKnowledgeFingerprint,
    deckId: knowledge.deckId,
    deckHash: knowledge.deckHash,
    resolved: knowledge.resolved !== false,
    name: knowledge.name,
    archetype: knowledge.archetype,
    mainSize: knowledge.mainSize,
    roleCounts: { ...knowledge.roles },
    objective: knowledge.plan.objective,
    playstyle: knowledge.plan.playstyle,
    keyCards: [...knowledge.plan.keyCards],
    counterplay: knowledge.plan.counterplay,
    strategySource: knowledge.plan.strategySource ?? "derived",
    counterplayRoles: [...knowledge.plan.counterplayRoles],
    weaknesses: [...knowledge.plan.weaknesses],
    strengths: [...(knowledge.plan.strengths ?? [])],
    lossConditions: [...(knowledge.plan.lossConditions ?? [])],
    goals: [...knowledge.plan.goals],
    scenarios: [...knowledge.plan.scenarios],
  };
}

export function describeDeckPlan(knowledge) {
  const priorityRoles = (knowledge?.plan?.priorityRoles ?? []).filter((role) => Number(knowledge?.roles?.[role]) > 0).slice(0, 5);
  return {
    id: knowledge?.plan?.id ?? "generic-value",
    title: knowledge?.plan?.archetype ?? knowledge?.archetype ?? "Adaptativo",
    identity: knowledge?.plan?.identity ?? PLAN_DEFAULT.identity,
    objective: knowledge?.plan?.objective ?? knowledge?.plan?.identity ?? PLAN_DEFAULT.objective,
    playstyle: knowledge?.plan?.playstyle ?? knowledge?.plan?.archetype ?? PLAN_DEFAULT.playstyle,
    keyCards: [...(knowledge?.plan?.keyCards ?? [])],
    counterplay: knowledge?.plan?.counterplay ?? PLAN_DEFAULT.counterplay,
    counterplayRoles: [...(knowledge?.plan?.counterplayRoles ?? PLAN_DEFAULT.counterplayRoles)],
    weaknesses: [...(knowledge?.plan?.weaknesses ?? PLAN_DEFAULT.weaknesses)],
    strengths: [...(knowledge?.plan?.strengths ?? [])],
    lossConditions: [...(knowledge?.plan?.lossConditions ?? [])],
    strategySource: knowledge?.plan?.strategySource ?? "derived",
    priorities: priorityRoles,
    goals: [...(knowledge?.plan?.goals ?? PLAN_DEFAULT.goals)],
    derived: knowledge?.plan?.derived === true,
    evidence: [...(knowledge?.plan?.evidence ?? [])],
  };
}

export { normalize, cardCode, getCardByName };

const PHASE_ORDER = ["DRAW", "STANDBY", "MAIN_1", "BATTLE", "MAIN_2", "END"];

export const DUEL_PHASES = Object.freeze([
  ["DRAW", "Draw"],
  ["STANDBY", "Standby"],
  ["MAIN_1", "Main 1"],
  ["BATTLE", "Battle"],
  ["MAIN_2", "Main 2"],
  ["END", "End"],
]);

export function phaseStepId(phase) {
  return ({ BATTLE_START: "BATTLE" })[phase] ?? phase;
}

export function phaseLabel(phase) {
  return ({
    DRAW: "DRAW PHASE",
    STANDBY: "STANDBY PHASE",
    MAIN_1: "MAIN PHASE 1",
    BATTLE: "BATTLE PHASE",
    MAIN_2: "MAIN PHASE 2",
    END: "END PHASE",
  })[phaseStepId(phase)] ?? String(phase ?? "");
}

export function phaseIndex(phase) {
  return PHASE_ORDER.indexOf(phaseStepId(phase));
}

export function isPhaseAction(action) {
  return action?.actionKind === "phase" || /robar|pasar a|ir a (?:battle|main|end)|terminar (?:battle|main|end|turno)/i.test(action?.label ?? "");
}

export function chainResponseModel(actions, revealed = false) {
  const responses = (actions ?? []).filter((action) => action && !isPhaseAction(action));
  const decline = responses.find((action) => action?.actionKind === "decline" || action?.coreResponse?.index === null || /^No encadenar$/i.test(action?.label ?? "")) ?? null;
  return {
    stage: revealed ? "options" : "question",
    forced: decline === null,
    decline,
    options: responses.filter((action) => action !== decline),
  };
}

export function isTurnPlayerFreePriority(view) {
  return view?.pendingType === "SELECT_CHAIN"
    && view?.timingWindow?.kind !== "chain"
    && Number.isFinite(Number(view?.turnPlayer))
    && Number(view?.priorityPlayer) === Number(view?.turnPlayer);
}

export function freePriorityPhaseIntents(view) {
  if (!isTurnPlayerFreePriority(view)) return [];
  const phase = phaseStepId(view?.phase);
  if (phase === "DRAW") return [{ target: "STANDBY", label: "Standby" }];
  if (phase === "STANDBY") return [{ target: "MAIN_1", label: "Main 1" }];
  if (phase === "MAIN_1") return [Number(view?.turn) > 1
    ? { target: "BATTLE", label: "Battle" }
    : { target: "END", label: "End" }];
  if (phase === "BATTLE") return [{ target: "MAIN_2", label: "Main 2" }];
  if (phase === "MAIN_2") return [{ target: "END", label: "End" }];
  if (phase === "END") return [{ target: "NEXT_TURN", label: "Terminar turno" }];
  return [];
}

export function pausedPhaseIntent(view) {
  if (!view?.phasePaused) return [];
  const phase = phaseStepId(view?.phase);
  if (phase === "DRAW") return [{ target: "STANDBY", label: "Standby" }];
  if (phase === "STANDBY") return [{ target: "MAIN_1", label: "Main 1" }];
  if (phase === "END") return [{ target: "NEXT_TURN", label: "Terminar turno" }];
  return [];
}

export function chainWindowContext(view, { manual = false } = {}) {
  const log = view?.recentLog ?? [];
  const lastEnd = log.reduce((index, event, current) => event?.type === "CHAIN_END" ? current : index, -1);
  const windowEvents = log.slice(lastEnd + 1);
  const sourceTypes = new Set(["CHAINING", "FLIP", "SUMMONING", "SPSUMMONING", "FLIPSUMMONING", "ATTACK", "DRAW", "NEW_PHASE"]);
  let sourceIndex = -1;
  for (let index = windowEvents.length - 1; index >= 0; index -= 1) {
    if (sourceTypes.has(windowEvents[index]?.type)) { sourceIndex = index; break; }
  }
  let source = sourceIndex >= 0 ? windowEvents[sourceIndex] : null;
  const recentFlip = [...windowEvents].reverse().find((event) => event?.type === "FLIP");
  if (source?.type === "CHAINING" && recentFlip && (!source.cardName || source.cardName === recentFlip.cardName)) source = recentFlip;
  if (source?.type === "FLIP") {
    const flipPlayer = Number(source?.player);
    const flipActor = manual && Number.isFinite(flipPlayer) ? `Jugador ${flipPlayer + 1}` : flipPlayer === 0 ? "Tu" : flipPlayer === 1 ? "Astra" : "El duelo";
    return { kind: "flip", eyebrow: `FLIP · ${flipActor}`, title: `${flipActor} voltea ${source.cardName ?? "un monstruo"}.`, question: "Su efecto FLIP se activa ahora. ¿Quieres responder?" };
  }
  let targetEvent = null;
  for (let index = windowEvents.length - 1; index > sourceIndex; index -= 1) {
    if (windowEvents[index]?.type === "BECOME_TARGET") { targetEvent = windowEvents[index]; break; }
  }
  const actorId = Number(source?.player);
  const actor = manual && Number.isFinite(actorId) ? `Jugador ${actorId + 1}` : actorId === 0 ? "Tú" : actorId === 1 ? "Astra" : "El duelo";
  const priorityId = Number(view?.priorityPlayer);
  const priorityActor = manual && Number.isFinite(priorityId) ? `Jugador ${priorityId + 1}` : priorityId === 0 ? "Tú" : priorityId === 1 ? "Astra" : "El jugador con prioridad";
  const targets = targetEvent?.targetNames?.filter(Boolean) ?? [];
  const targetCopy = targets.length ? targets.join(" y ") : "";
  if (source?.type === "CHAINING") {
    let purpose = "";
    if (targetCopy && /destroy/i.test(source.cardText ?? "")) purpose = ` para destruir ${targetCopy}`;
    else if (targetCopy && /face-down Defense Position/i.test(source.cardText ?? "")) purpose = ` para poner ${targetCopy} boca abajo`;
    else if (targetCopy && /banish|remove from play/i.test(source.cardText ?? "")) purpose = ` para desterrar ${targetCopy}`;
    else if (targetCopy) purpose = ` con objetivo en ${targetCopy}`;
    return { eyebrow: `CADENA · ${actor}`, title: `${actor} activó ${source.cardName ?? "un efecto"}${purpose}.`, question: "¿Quieres responder?" };
  }
  if (["SUMMONING", "SPSUMMONING", "FLIPSUMMONING"].includes(source?.type)) return { eyebrow: `INVOCACIÓN · ${actor}`, title: `${actor} está Invocando ${source.cardName ?? "un monstruo"}.`, question: "¿Quieres responder?" };
  if (source?.type === "ATTACK") return { eyebrow: `ATAQUE · ${actor}`, title: source.message ?? `${actor} ha declarado un ataque.`, question: "¿Quieres responder?" };
  if (view?.timingWindow?.kind === "post-draw" || source?.type === "DRAW") return {
    kind: "priority",
    eyebrow: `DRAW PHASE · PRIORIDAD DE ${priorityActor}`,
    title: manual ? `${actor} ha robado una carta.` : source?.message ?? `${actor} ha robado una carta.`,
    question: `${priorityActor}: ¿quieres activar un efecto rápido después del robo?`,
  };
  if (view?.timingWindow?.kind === "phase-priority" || source?.type === "NEW_PHASE") return {
    kind: "priority",
    eyebrow: `${phaseLabel(view?.phase)} · PRIORIDAD DE ${priorityActor}`,
    title: `No hay una cadena abierta. ${priorityActor} puede actuar.`,
    question: "¿Quieres activar un efecto rápido?",
  };
  return { eyebrow: `INTERRUPCIÓN · ${actor}`, title: "Se abrió una nueva ventana de respuesta.", question: "¿Quieres hacer algo?" };
}

function instances(view) {
  return (view?.players ?? []).flatMap((player) => [
    ...(player.hand ?? []),
    ...(player.monsterZone ?? []),
    ...(player.spellTrapZone ?? []),
    ...(player.fieldZone ?? []),
    ...(player.graveyard ?? player.grave ?? []),
    ...(player.banished ?? []),
  ]).filter(Boolean);
}

export function visibleInstanceUids(view) {
  return instances(view).map((instance) => String(instance.uid));
}

function monsterCount(view) {
  return (view?.players ?? []).reduce((total, player) => total
    + (player.monsterZone ?? []).filter(Boolean).length, 0);
}

function graveCount(view) {
  return (view?.players ?? []).reduce((total, player) => total + (player.graveyard ?? player.grave ?? []).filter(Boolean).length, 0);
}

function freshEvents(before, after) {
  const previous = before?.recentLog ?? [];
  const next = after?.recentLog ?? [];
  const previousIndices = previous.map((event) => event.index).filter(Number.isFinite);
  if (previousIndices.length) {
    const lastIndex = Math.max(...previousIndices);
    return next.filter((event) => Number(event.index) > lastIndex);
  }
  return next.slice(previous.length);
}

export function pendingPrompt(view, { manual = false } = {}) {
  const player = Number(view?.priorityPlayer ?? 0);
  const playerName = manual ? `Jugador ${player + 1}` : player === 0 ? "Tú" : "Astra";
  const pending = String(view?.pendingType ?? "");
  const priorityWindow = view?.timingWindow?.kind === "post-draw" || view?.timingWindow?.kind === "phase-priority";
  const prompts = {
    ROCK_PAPER_SCISSORS: ["Decide quién empieza", "Elige piedra, papel o tijera."],
    SELECT_CHAIN: priorityWindow
      ? ["Prioridad para actuar", `${playerName}: activa un efecto rápido legal o pasa la prioridad.`]
      : ["Ventana de respuesta", `${playerName}: encadena una carta o confirma que la cadena puede continuar.`],
    SELECT_PLACE: ["Elige una zona iluminada", `${playerName}: pulsa directamente uno de los huecos numerados del Campo. La colocación rápida es opcional.`],
    SELECT_POSITION: ["Elige posición", `${playerName}: decide cómo entra el monstruo al Campo.`],
    SELECT_CARD: ["Selecciona carta", `${playerName}: completa la selección requerida por el efecto.`],
    SELECT_TRIBUTE: ["Selecciona Sacrificios", `${playerName}: elige las cartas necesarias para la Invocación.`],
    SELECT_OPTION: ["Elige una opción", `${playerName}: selecciona cómo debe continuar el efecto.`],
    SELECT_EFFECTYN: ["¿Activar efecto?", `${playerName}: confirma o rechaza esta activación.`],
    SELECT_YESNO: ["Confirmación", `${playerName}: elige cómo continúa el duelo.`],
    ANNOUNCE_RACE: ["Declara un Tipo de monstruo", `${playerName}: solo aparecen los Tipos válidos para este efecto y este Campo.`],
    ANNOUNCE_ATTRIB: ["Declara un Atributo", `${playerName}: elige uno de los Atributos permitidos por el efecto.`],
    ANNOUNCE_CARD: ["Declara una carta", `${playerName}: elige una carta que cumpla las condiciones del efecto.`],
    ANNOUNCE_NUMBER: ["Declara un número", `${playerName}: elige uno de los valores permitidos por el efecto.`],
  };
  const [title, detail] = prompts[pending] ?? ["Decisión del duelo", `${playerName}: elige una respuesta legal.`];
  const selection = pending === "SELECT_CARD" ? view?.selection : null;
  const selectionTitle = selection
    ? selection.minimum === selection.maximum
      ? `Elige ${selection.minimum} carta${selection.minimum === 1 ? "" : "s"}`
      : `Elige hasta ${selection.maximum} carta${selection.maximum === 1 ? "" : "s"}`
    : null;
  const selectionSource = selection?.sources?.length ? ` de ${selection.sources.join(" / ")}` : "";
  const selectionDetail = selection
    ? `${playerName}: ${selection.candidateCount} carta${selection.candidateCount === 1 ? " legal" : "s legales"}${selectionSource}. Cada opción muestra carta, zona y propietario.`
    : null;
  return { title: selectionTitle ?? title, detail: selectionDetail ?? detail, pending, playerName };
}

function deriveLegacyDuelPresentation({ action, before, after }) {
  if (!after) return null;
  const events = freshEvents(before, after);
  const spawned = Math.max(0, monsterCount(after) - monsterCount(before));
  const sentToGrave = Math.max(0, graveCount(after) - graveCount(before));
  const cardEvent = [...events].reverse().find((event) => Number.isFinite(Number(event.cardCode)));
  const cardCode = Number(action?.cardCode ?? cardEvent?.cardCode) || null;
  const addedToHand = events.filter((event) => event.type === "MOVE" && Number(event.fromLocationCode) === 1 && Number(event.toLocationCode) === 2);
  const summonEvent = [...events].reverse().find((event) => ["SUMMONING", "SPSUMMONING", "FLIPSUMMONING"].includes(event.type));
  const attackEvent = [...events].reverse().find((event) => event.type === "ATTACK");

  if (addedToHand.length) {
    const counts = new Map();
    for (const event of addedToHand) {
      const name = event.cardName ?? "Carta";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const title = [...counts].map(([name, count]) => `${name}${count > 1 ? ` x${count}` : ""}`).join(" + ");
    const destination = addedToHand[0]?.toPlayer;
    return {
      kind: "add",
      eyebrow: "AÑADIDA A LA MANO",
      title,
      detail: `${Number.isFinite(Number(destination)) ? `Jugador ${Number(destination) + 1}` : "El jugador"} completa la búsqueda y baraja el Deck.`,
      cardCode: Number(addedToHand.at(-1)?.cardCode) || cardCode,
    };
  }

  if (spawned > 1) {
    return {
      kind: "resolve",
      eyebrow: "EFECTO RESUELTO",
      title: `${spawned} cartas aparecen en el Campo`,
      detail: sentToGrave ? "El efecto termina y la carta activada va al Cementerio." : "El Campo se ha actualizado.",
      cardCode,
    };
  }

  if (summonEvent) {
    const special = summonEvent.type === "SPSUMMONING";
    const flip = summonEvent.type === "FLIPSUMMONING";
    return {
      kind: "summon",
      eyebrow: flip ? "INVOCACIÓN POR VOLTEO" : special ? "INVOCACIÓN ESPECIAL" : "INVOCACIÓN NORMAL",
      title: summonEvent.cardName ?? cardEvent?.cardName ?? "Monstruo invocado",
      detail: "OCGCore ha confirmado la invocación y abre la siguiente ventana legal.",
      cardCode: Number(summonEvent.cardCode) || cardCode,
    };
  }

  if (before?.phase && after.phase && phaseStepId(before.phase) !== phaseStepId(after.phase)) {
    return {
      kind: "phase",
      eyebrow: `TURNO ${String(after.turn ?? "").padStart(2, "0")}`,
      title: phaseLabel(after.phase),
      detail: "La prioridad se abre en esta fase.",
      cardCode: null,
    };
  }

  const flipEvent = [...events].reverse().find((event) => event.type === "FLIP");
  if (flipEvent) {
    return {
      kind: "flip",
      eyebrow: "MONSTRUO FLIP",
      title: `${flipEvent.cardName ?? "El monstruo"} se ha volteado`,
      detail: "Su efecto FLIP se activa ahora y el duelo espera su resolucion.",
      cardCode: Number(flipEvent.cardCode) || cardCode,
    };
  }

  if (attackEvent) {
    return {
      kind: "attack",
      eyebrow: "ATAQUE DECLARADO",
      title: attackEvent.cardName ?? attackEvent.message ?? "Ataque declarado",
      detail: "OCGCore abre la ventana de respuesta antes del cálculo de daño.",
      cardCode: Number(attackEvent.cardCode) || cardCode,
    };
  }

  if (events.some((event) => event.type === "CHAINING")) {
    return {
      kind: "chain",
      eyebrow: "CADENA ABIERTA",
      title: cardEvent?.cardName ?? action?.label ?? "Efecto activado",
      detail: "El rival puede responder antes de que el efecto se resuelva.",
      cardCode,
    };
  }

  return null;
}

const FEEDBACK_DEFAULTS = Object.freeze({
  turn:     { duration: 600, soundId: "turn",     blocking: false, tier: "subtle" },
  phase:    { duration: 400, soundId: "phase",    blocking: false, tier: "subtle" },
  activate: { duration: 500, soundId: "activate", blocking: false, tier: "notable" },
  chain:    { duration: 750, soundId: "chain",    blocking: true,  tier: "epic" },
  flip:     { duration: 550, soundId: "flip",     blocking: false, tier: "notable" },
  summon:   { duration: 550, soundId: "summon",   blocking: false, tier: "notable" },
  attack:   { duration: 500, soundId: "attack",   blocking: false, tier: "notable" },
  damage:   { duration: 500, soundId: "damage",   blocking: false, tier: "notable" },
  resolve:  { duration: 500, soundId: "resolve",  blocking: false, tier: "notable" },
  move:     { duration: 400, soundId: "move",     blocking: false, tier: "subtle" },
});

function actorLabel(player) {
  const id = Number(player);
  return Number.isFinite(id) ? `Jugador ${id + 1}` : "El duelo";
}

function feedbackEvent(kind, seed, details = {}) {
  const defaults = FEEDBACK_DEFAULTS[kind] ?? FEEDBACK_DEFAULTS.resolve;
  const eventIndex = Number.isFinite(Number(seed?.index)) ? Number(seed.index) : null;
  const cardCode = Number(details.cardCode ?? seed?.cardCode) || null;
  const identity = details.identity ?? eventIndex ?? `${details.turn ?? ""}-${details.phase ?? ""}-${cardCode ?? "none"}-${details.title ?? ""}`;
  return {
    id: `${kind}:${identity}`,
    kind,
    actor: Number.isFinite(Number(seed?.player ?? details.actor)) ? Number(seed?.player ?? details.actor) : null,
    cardCode,
    title: details.title ?? seed?.cardName ?? "El duelo avanza",
    detail: details.detail ?? seed?.message ?? "OCGCore ha confirmado el resultado.",
    eyebrow: details.eyebrow ?? kind.toUpperCase(),
    duration: details.duration ?? defaults.duration,
    soundId: details.soundId ?? defaults.soundId,
    blocking: details.blocking ?? defaults.blocking,
    tier: details.tier ?? defaults.tier,
    eventIndex,
    chainLink: Number(details.chainLink ?? seed?.chainLink ?? seed?.chain ?? 0) || 0,
    affectedUids: details.affectedUids ?? [],
    cards: (details.cards ?? []).filter(Boolean).map((card) => ({
      cardCode: Number(card.cardCode) || null,
      cardName: card.cardName ?? "Carta",
      label: card.label ?? "AFECTADA",
    })),
    compact: details.compact === true,
  };
}

function deduplicateFeedback(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

function chainWindowAt(log, eventIndex = Number.POSITIVE_INFINITY) {
  const chain = [];
  for (const event of log ?? []) {
    if (Number.isFinite(Number(eventIndex)) && Number(event.index) > Number(eventIndex)) break;
    if (event.type === "CHAIN_END") {
      if (Number(event.index) === Number(eventIndex)) break;
      chain.length = 0;
    } else if (event.type === "CHAINING") chain.push(event);
  }
  return chain;
}

const LOCATION = Object.freeze({ DECK: 1, HAND: 2, MONSTER: 4, SPELL_TRAP: 8, GRAVE: 16, BANISHED: 32, EXTRA: 64 });

function spanishList(values = []) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length < 2) return unique[0] ?? "una carta";
  return `${unique.slice(0, -1).join(", ")} y ${unique.at(-1)}`;
}

function cardsFromEvents(events, label) {
  return events.filter((event) => event?.cardName || event?.cardCode).map((event) => ({
    cardCode: event.cardCode,
    cardName: event.cardName ?? "Carta",
    label,
  }));
}

function chainSegmentEndingAt(log, endEvent) {
  const endIndex = (log ?? []).findIndex((event) => Number(event?.index) === Number(endEvent?.index));
  if (endIndex < 0) return [];
  let startIndex = 0;
  for (let index = endIndex - 1; index >= 0; index -= 1) {
    if (log[index]?.type === "CHAIN_END") { startIndex = index + 1; break; }
  }
  return log.slice(startIndex, endIndex + 1);
}

function resolvedEffectWindows(segment) {
  const sources = segment.filter((event) => event?.type === "CHAINING");
  const sourceFor = (link) => sources.find((source) => Number(source.chainLink) === Number(link))
    ?? sources[Math.max(0, Math.min(sources.length - 1, Number(link) - 1))]
    ?? sources.at(-1)
    ?? null;
  const windows = [];
  let active = null;
  for (const event of segment) {
    if (event?.type === "CHAIN_SOLVING") {
      if (active) windows.push(active);
      const link = Number(event.chainLink) || Math.max(1, sources.length);
      active = { link, source: sourceFor(link), events: [] };
      continue;
    }
    if (!active) continue;
    if (event?.type === "CHAIN_SOLVED") {
      windows.push(active);
      active = null;
      continue;
    }
    if (event?.type !== "CHAIN_END") active.events.push(event);
  }
  if (active) windows.push(active);
  if (!windows.length && sources.length) {
    const firstSource = segment.findIndex((event) => event === sources[0]);
    windows.push({ link: Number(sources.at(-1)?.chainLink) || sources.length, source: sources.at(-1), events: segment.slice(firstSource + 1, -1) });
  }
  return windows;
}

function effectResolutionCue(window, endEvent) {
  const source = window?.source;
  if (!source) return null;
  const events = window.events ?? [];
  const moves = events.filter((event) => event?.type === "MOVE");
  const summon = events.find((event) => event?.type === "SPSUMMONING");
  const fusionMove = moves.find((event) => Number(event.fromLocationCode) === LOCATION.EXTRA && Number(event.toLocationCode) === LOCATION.MONSTER);
  if (summon && fusionMove) {
    const materials = moves.filter((event) => event !== fusionMove
      && [LOCATION.HAND, LOCATION.MONSTER].includes(Number(event.fromLocationCode))
      && Number(event.toLocationCode) === LOCATION.GRAVE);
    return feedbackEvent("summon", summon, {
      identity: `fusion-${endEvent?.index ?? summon.index}`,
      compact: true,
      duration: 1750,
      tier: "notable",
      eyebrow: "INVOCACIÓN POR FUSIÓN",
      title: `${summon.cardName ?? fusionMove.cardName ?? "El monstruo"} ha sido Invocado`,
      detail: materials.length
        ? `${source.cardName ?? "El efecto"} ha usado como materiales a ${spanishList(materials.map((event) => event.cardName))}.`
        : `${source.cardName ?? "El efecto"} completa la Invocación por Fusión.`,
      cards: cardsFromEvents(materials, "MATERIAL"),
    });
  }

  const drawCount = events.filter((event) => event?.type === "DRAW")
    .reduce((total, event) => total + (Number(event.drawCount ?? event.count) || 0), 0);
  if (drawCount > 0) {
    return feedbackEvent("resolve", endEvent, {
      identity: `draw-${endEvent?.index ?? source.index}-${source.cardCode ?? "effect"}`,
      cardCode: source.cardCode,
      compact: true,
      duration: 1550,
      eyebrow: "EFECTO RESUELTO · CARTAS AÑADIDAS",
      title: `${source.cardName ?? "El efecto"} ha añadido ${drawCount} carta${drawCount === 1 ? "" : "s"} a la mano`,
      detail: `${actorLabel(source.player)} recibe ${drawCount} carta${drawCount === 1 ? "" : "s"} del Deck.`,
    });
  }

  const added = moves.filter((event) => Number(event.toLocationCode) === LOCATION.HAND
    && Number(event.fromLocationCode) !== LOCATION.HAND);
  if (added.length) {
    const names = added.map((event) => event.cardName ?? "una carta");
    return feedbackEvent("resolve", added.at(-1), {
      identity: `add-${endEvent?.index ?? added.at(-1)?.index}-${source.cardCode ?? "effect"}`,
      cardCode: source.cardCode,
      compact: true,
      duration: 1650,
      eyebrow: "EFECTO RESUELTO · AÑADIDA A LA MANO",
      title: `${source.cardName ?? "El efecto"} ha añadido ${spanishList(names)}`,
      detail: `${actorLabel(added.at(-1)?.toPlayer ?? source.player)} recibe ${added.length === 1 ? "la carta" : `${added.length} cartas`}.`,
      cards: cardsFromEvents(added, "AÑADIDA"),
    });
  }

  const banished = moves.filter((event) => Number(event.toLocationCode) === LOCATION.BANISHED);
  if (banished.length) {
    return feedbackEvent("resolve", banished.at(-1), {
      identity: `banish-${endEvent?.index ?? banished.at(-1)?.index}-${source.cardCode ?? "effect"}`,
      cardCode: source.cardCode,
      compact: true,
      duration: 1700,
      eyebrow: "EFECTO RESUELTO · DESTIERRO",
      title: `${source.cardName ?? "El efecto"} ha desterrado a ${spanishList(banished.map((event) => event.cardName))}`,
      detail: `${banished.length === 1 ? "La carta afectada queda" : "Las cartas afectadas quedan"} en la zona de Destierro.`,
      cards: cardsFromEvents(banished, "DESTERRADA"),
    });
  }

  const destroys = /\bdestroy(?:ed|s|ing)?\b/i.test(source.cardText ?? "");
  const destroyed = destroys ? moves.filter((event) => [LOCATION.MONSTER, LOCATION.SPELL_TRAP].includes(Number(event.fromLocationCode))
    && Number(event.toLocationCode) === LOCATION.GRAVE) : [];
  if (destroyed.length) {
    return feedbackEvent("resolve", destroyed.at(-1), {
      identity: `destroy-${endEvent?.index ?? destroyed.at(-1)?.index}-${source.cardCode ?? "effect"}`,
      cardCode: source.cardCode,
      compact: true,
      duration: 1700,
      eyebrow: "EFECTO RESUELTO · DESTRUCCIÓN",
      title: `${source.cardName ?? "El efecto"} ha destruido a ${spanishList(destroyed.map((event) => event.cardName))}`,
      detail: `${destroyed.length === 1 ? "La carta afectada va" : "Las cartas afectadas van"} al Cementerio.`,
      cards: cardsFromEvents(destroyed, "DESTRUIDA"),
    });
  }

  if (summon) {
    return feedbackEvent("summon", summon, {
      identity: `special-${endEvent?.index ?? summon.index}`,
      compact: true,
      duration: 1550,
      eyebrow: "INVOCACIÓN ESPECIAL",
      title: `${summon.cardName ?? "El monstruo"} ha sido Invocado`,
      detail: `${source.cardName ?? "El efecto"} ha completado la Invocación Especial.`,
    });
  }
  return null;
}

function tributeMaterials(logEvents, summonEvent) {
  const summonIndex = logEvents.indexOf(summonEvent);
  if (summonIndex < 0) return [];
  const materials = [];
  for (let index = summonIndex - 1; index >= 0; index -= 1) {
    const event = logEvents[index];
    if (event?.type !== "MOVE") {
      if (materials.length) break;
      continue;
    }
    if (Number(event.cardCode) === Number(summonEvent.cardCode)
      && Number(event.toLocationCode) === LOCATION.MONSTER) continue;
    if (Number(event.fromPlayer) === Number(summonEvent.player)
      && Number(event.fromLocationCode) === LOCATION.MONSTER
      && Number(event.toLocationCode) !== LOCATION.MONSTER) materials.unshift(event);
    else if (materials.length) break;
  }
  return materials;
}

function battleResolutionCue(logEvents, after) {
  if (phaseStepId(after?.phase) !== "BATTLE") return null;
  const destroyed = logEvents.filter((event) => event?.type === "MOVE"
    && Number(event.fromLocationCode) === LOCATION.MONSTER
    && [LOCATION.GRAVE, LOCATION.BANISHED].includes(Number(event.toLocationCode))
    && chainWindowAt(after?.recentLog, event.index).length === 0);
  if (!destroyed.length) return null;
  const lastIndex = Number(destroyed.at(-1)?.index) || Number.POSITIVE_INFINITY;
  const attack = [...(after?.recentLog ?? [])].reverse().find((event) => event?.type === "ATTACK" && Number(event.index) <= lastIndex);
  if (!attack) return null;
  const opposing = destroyed.filter((event) => Number(event.fromPlayer) !== Number(attack.player));
  const names = destroyed.map((event) => event.cardName ?? "un monstruo");
  const title = destroyed.length === 1 && opposing.length === 1
    ? `${attack.cardName ?? "El atacante"} ha destruido a ${names[0]} en batalla`
    : `El combate ha destruido a ${spanishList(names)}`;
  return feedbackEvent("resolve", destroyed.at(-1), {
    identity: `battle-${destroyed.map((event) => event.index).join("-")}`,
    cardCode: attack.cardCode,
    compact: true,
    duration: 1650,
    eyebrow: "RESULTADO DE BATALLA",
    title,
    detail: destroyed.some((event) => Number(event.toLocationCode) === LOCATION.BANISHED)
      ? "El resultado confirmado por OCGCore incluye una carta desterrada."
      : `${destroyed.length === 1 ? "El monstruo destruido va" : "Los monstruos destruidos van"} al Cementerio.`,
    cards: cardsFromEvents(destroyed, "DESTRUIDO"),
  });
}

/** Convert an authoritative OCGCore transition into ordered UI feedback. */
export function deriveDuelFeedbackEvents({ action, before, after }) {
  if (!after) return [];
  const logEvents = freshEvents(before, after);
  const result = [];
  const turnChanged = Number(after.turn) !== Number(before?.turn) && Number(after.turn) > 0;
  const phaseChanged = before?.phase && after.phase && phaseStepId(before.phase) !== phaseStepId(after.phase);

  if (turnChanged) {
    result.push(feedbackEvent("turn", null, {
      turn: after.turn,
      actor: after.turnPlayer,
      eyebrow: `TURNO ${String(after.turn).padStart(2, "0")} · ${actorLabel(after.turnPlayer).toUpperCase()}`,
      title: phaseLabel(after.phase),
      detail: `Comienza el turno de ${actorLabel(after.turnPlayer)}.`,
    }));
  }
  if (phaseChanged && !turnChanged) {
    result.push(feedbackEvent("phase", null, {
      turn: after.turn,
      phase: phaseStepId(after.phase),
      actor: after.turnPlayer,
      eyebrow: `TURNO ${String(after.turn ?? "").padStart(2, "0")}`,
      title: phaseLabel(after.phase),
      detail: `${phaseLabel(before.phase)} → ${phaseLabel(after.phase)} · ${actorLabel(after.turnPlayer)} recibe la prioridad.`,
    }));
  }

  const chaining = logEvents.filter((event) => event?.type === "CHAINING");
  const flipEvents = logEvents.filter((event) => event?.type === "FLIP");
  const summons = logEvents.filter((event) => ["SUMMONING", "SPSUMMONING", "FLIPSUMMONING"].includes(event?.type));
  const attacks = logEvents.filter((event) => event?.type === "ATTACK");
  const damages = logEvents.filter((event) => ["DAMAGE", "PAY_LPCOST", "RECOVER"].includes(event?.type));
  const resolutions = logEvents.filter((event) => event?.type === "CHAIN_END");
  const moves = logEvents.filter((event) => event?.type === "MOVE");
  const belongsToEffect = (event) => chainWindowAt(after?.recentLog, event?.index).length > 0;
  const resolvedEffects = [];
  for (const endEvent of resolutions) {
    const segment = chainSegmentEndingAt(after?.recentLog, endEvent);
    for (const window of resolvedEffectWindows(segment)) {
      const cue = effectResolutionCue(window, endEvent);
      if (cue) resolvedEffects.push({ cue, sourceCode: Number(window.source?.cardCode) || 0 });
    }
  }
  const resolvedSourceCodes = new Set(resolvedEffects.map((entry) => entry.sourceCode).filter(Boolean));

  for (const event of flipEvents) {
    result.push(feedbackEvent("flip", event, {
      eyebrow: `FLIP · ${actorLabel(event.player)}`,
      title: `${event.cardName ?? "El monstruo"} se voltea`,
      detail: "El efecto FLIP queda visible antes de abrir cualquier respuesta legal.",
    }));
  }
  for (const event of summons.filter((candidate) => !belongsToEffect(candidate))) {
    const special = event.type === "SPSUMMONING";
    const flip = event.type === "FLIPSUMMONING";
    const materials = event.type === "SUMMONING" ? tributeMaterials(logEvents, event) : [];
    const tribute = materials.length > 0;
    result.push(feedbackEvent("summon", event, {
      tier: special ? "epic" : undefined,
      compact: flip || tribute,
      duration: flip || tribute ? 1650 : undefined,
      eyebrow: flip ? "INVOCACIÓN POR VOLTEO" : tribute ? "INVOCACIÓN POR TRIBUTO" : special ? "INVOCACIÓN ESPECIAL" : "INVOCACIÓN NORMAL",
      title: flip
        ? `${event.cardName ?? "El monstruo"} se ha volteado boca arriba`
        : `${event.cardName ?? "El monstruo"} ha sido Invocado`,
      detail: tribute
        ? `${actorLabel(event.player)} ha tributado a ${spanishList(materials.map((material) => material.cardName))}.`
        : flip
          ? `${actorLabel(event.player)} completa la Invocación por Volteo.`
          : `${actorLabel(event.player)} completa la invocación.`,
      cards: cardsFromEvents(materials, "TRIBUTO"),
    }));
  }
  for (const event of attacks) {
    result.push(feedbackEvent("attack", event, {
      eyebrow: `ATAQUE · ${actorLabel(event.player)}`,
      title: event.cardName ?? event.message ?? "Ataque declarado",
      detail: "Se abre la ventana de respuesta antes del cálculo de daño.",
    }));
  }
  const flipCodes = new Set(flipEvents.map((event) => Number(event.cardCode)).filter(Boolean));
  chaining.filter((event) => !flipCodes.has(Number(event.cardCode)) && !resolvedSourceCodes.has(Number(event.cardCode))).forEach((event, index) => {
    const chainLink = Number(event.chainLink ?? event.chain ?? chainWindowAt(after?.recentLog, event.index).length ?? index + 1) || index + 1;
    result.push(feedbackEvent(chainLink > 1 ? "chain" : "activate", event, {
      chainLink,
      eyebrow: chainLink > 1 ? `CADENA · ESLABÓN ${chainLink}` : `ACTIVACIÓN · ${actorLabel(event.player)}`,
      title: event.cardName ?? action?.label ?? "Efecto activado",
      detail: chainLink > 1
        ? `El eslabón ${chainLink} queda sobre la cadena y permite una nueva respuesta legal.`
        : "La carta y su contexto permanecen visibles mientras se decide si responder.",
    }));
  });
  for (const event of damages.filter((candidate) => !belongsToEffect(candidate))) {
    const amount = Math.abs(Number(event.amount ?? event.value ?? event.damage ?? 0));
    result.push(feedbackEvent("damage", event, {
      eyebrow: event.type === "RECOVER" ? "RECUPERACIÓN DE LP" : "CAMBIO DE LP",
      title: amount ? `${event.type === "RECOVER" ? "+" : "−"}${amount} LP` : event.message ?? "Los LP cambian",
      detail: event.message ?? `${actorLabel(event.player)} actualiza sus Life Points.`,
    }));
  }
  if (!damages.length) {
    (after?.players ?? []).forEach((player, playerId) => {
      const beforeLp = Number(before?.players?.[playerId]?.lp);
      const afterLp = Number(player?.lp);
      if (!Number.isFinite(beforeLp) || !Number.isFinite(afterLp) || beforeLp === afterLp) return;
      const delta = afterLp - beforeLp;
      result.push(feedbackEvent("damage", null, {
        actor: playerId,
        turn: after.turn,
        title: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} LP`,
        eyebrow: delta > 0 ? "RECUPERACIÓN DE LP" : "DAÑO / COSTE",
        detail: `${actorLabel(playerId)} queda en ${afterLp} LP.`,
      }));
    });
  }
  for (const { cue } of resolvedEffects) result.push(cue);
  for (const event of resolutions) {
    const chainWindow = chainWindowAt(after?.recentLog, event.index);
    const linkCount = Math.max(chainWindow.length, ...chainWindow.map((candidate) => Number(candidate.chainLink ?? candidate.chain ?? 0)));
    const source = chainWindow[0] ?? null;
    const hasResponse = linkCount > 1;
    const segment = chainSegmentEndingAt(after?.recentLog, event);
    const segmentHasOutcome = resolvedEffects.some(({ cue }) => segment.some((candidate) => Number(candidate.index) === Number(cue.eventIndex)));
    if (!hasResponse || segmentHasOutcome) continue;
    result.push(feedbackEvent("resolve", event, {
      cardCode: Number(source?.cardCode) || null,
      eyebrow: hasResponse ? `CADENA RESUELTA · ${linkCount} ESLABONES` : "EFECTO RESUELTO",
      title: hasResponse
        ? `La cadena de ${linkCount} eslabones ha terminado`
        : `${source?.cardName ?? event.cardName ?? "El efecto"} se ha resuelto`,
      detail: "Las zonas afectadas muestran ahora el resultado confirmado por OCGCore.",
    }));
  }

  const independentMoves = moves.filter((event) => !belongsToEffect(event));
  const battleCue = battleResolutionCue(logEvents, after);
  if (battleCue) result.push(battleCue);
  const addedToHand = independentMoves.filter((event) => Number(event.fromLocationCode) === 1 && Number(event.toLocationCode) === 2);
  if (addedToHand.length && !result.some((event) => event.kind === "resolve")) {
    const counts = new Map();
    for (const event of addedToHand) counts.set(event.cardName ?? "Carta", (counts.get(event.cardName ?? "Carta") ?? 0) + 1);
    const title = [...counts].map(([name, count]) => `${name}${count > 1 ? ` ×${count}` : ""}`).join(" + ");
    const last = addedToHand.at(-1);
    result.push(feedbackEvent("move", last, {
      eyebrow: "AÑADIDA A LA MANO",
      title,
      detail: `${actorLabel(last?.toPlayer)} recibe ${addedToHand.length === 1 ? "la carta" : "las cartas"}.`,
    }));
  } else if (independentMoves.length && !result.some((event) => !["phase", "turn"].includes(event.kind))) {
    const last = independentMoves.at(-1);
    result.push(feedbackEvent("move", last, {
      eyebrow: "CAMPO ACTUALIZADO",
      title: last.cardName ?? "Una carta cambia de zona",
      detail: last.message ?? "El movimiento ya está reflejado en el tablero.",
    }));
  }

  const spawned = Math.max(0, monsterCount(after) - monsterCount(before));
  const sentToGrave = Math.max(0, graveCount(after) - graveCount(before));
  const resolvedEffectChain = resolutions.some((event) => chainWindowAt(after?.recentLog, event.index).length > 0);
  if (spawned > 1 && !resolvedEffectChain && !result.some((event) => event.kind === "resolve")) {
    const seed = [...logEvents].reverse().find((event) => Number.isFinite(Number(event.cardCode)));
    result.push(feedbackEvent("resolve", seed, {
      cardCode: action?.cardCode,
      eyebrow: "EFECTO RESUELTO",
      title: `${spawned} cartas aparecen en el Campo`,
      detail: sentToGrave ? "El efecto termina y la carta activada va al Cementerio." : "El Campo se ha actualizado.",
    }));
  }

  return deduplicateFeedback(result);
}

// Compatibility for the sandbox and any callers that still expect one cue.
export function deriveDuelPresentation(transition) {
  return deriveLegacyDuelPresentation(transition) ?? deriveDuelFeedbackEvents(transition)[0] ?? null;
}

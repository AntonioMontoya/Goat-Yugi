import { getCardByName } from "./cards.js";
import { createOcgcoreSession } from "./ocgcore-session.js";

const FILLER = "Blue-Eyes White Dragon";

function emptyBackRow() {
  return [null, null, null, null, null];
}

function requireAction(view, predicate, description) {
  const action = view.actions.find(predicate);
  if (!action) throw new Error(`No se encontró la acción requerida: ${description} (${view.pendingType}).`);
  return action;
}

async function battleDestroyedGrowthRegression({ id, growthCard, victimCard, expectedAttack = 1500 }) {
  const growth = getCardByName(growthCard);
  const victim = getCardByName(victimCard);
  if (!growth || !victim) throw new Error(`Fixture ${id}: carta ausente del catálogo.`);

  const deck = Array.from({ length: 40 }, () => FILLER);
  const session = await createOcgcoreSession({
    deckA: deck,
    deckB: deck,
    seed: 20260808,
    manual: true,
    scenario: {
      startingPlayer: 0,
      players: [
        {
          lp: 8000,
          hand: [],
          monsterZone: [
            { cardId: growth.id, position: "ATTACK" },
            { cardId: victim.id, position: "ATTACK" },
            null,
            null,
            null,
          ],
          spellTrapZone: emptyBackRow(),
          grave: [],
          banished: [],
          deck,
          fusion: [],
        },
        {
          lp: 8000,
          hand: [],
          monsterZone: [{ card: FILLER, position: "ATTACK" }, null, null, null, null],
          spellTrapZone: emptyBackRow(),
          grave: [],
          banished: [],
          deck,
          fusion: [],
        },
      ],
    },
  });

  try {
    let view = session.view();
    session.respond(requireAction(view, (action) => /End Phase/.test(action.label), "ceder el primer turno"));
    view = session.view();
    session.respond(requireAction(view, (action) => /Battle Phase/.test(action.label), "entrar en Battle Phase"));
    view = session.view();
    session.respond(requireAction(view, (action) => action.actionKind === "attack", `atacar con ${FILLER}`));
    view = session.view();
    session.respond(requireAction(
      view,
      (action) => action.selectionCards?.some((card) => card.cardId === victim.id),
      `seleccionar ${victim.name} como objetivo`,
    ));
    view = session.view();

    const growthInstance = view.players[0].monsterZone.find((card) => card?.cardId === growth.id);
    const victimDestroyed = view.players[0].graveyard.some((card) => card?.cardId === victim.id);
    const passed = view.errors.length === 0 && victimDestroyed && growthInstance?.attack === expectedAttack;
    return {
      id,
      cards: [growth.name, victim.name],
      passed,
      expectedAttack,
      actualAttack: growthInstance?.attack ?? null,
      victimDestroyed,
      errors: view.errors,
    };
  } catch (error) {
    return {
      id,
      cards: [growth.name, victim.name],
      passed: false,
      expectedAttack,
      actualAttack: null,
      victimDestroyed: false,
      errors: [{ type: "REGRESSION_EXCEPTION", text: String(error?.message ?? error) }],
    };
  } finally {
    session.destroy();
  }
}

async function flipDestroyRegression() {
  const flipCard = getCardByName("Man-Eater Bug");
  const attacker = getCardByName(FILLER);
  const deck = Array.from({ length: 40 }, () => FILLER);
  const session = await createOcgcoreSession({
    deckA: deck,
    deckB: deck,
    seed: 20260809,
    manual: true,
    scenario: {
      startingPlayer: 0,
      players: [
        { lp: 8000, hand: [], monsterZone: [{ cardId: attacker.id, position: "ATTACK" }, null, null, null, null], spellTrapZone: emptyBackRow(), grave: [], banished: [], deck, fusion: [] },
        { lp: 8000, hand: [], monsterZone: [{ cardId: flipCard.id, position: "SET" }, null, null, null, null], spellTrapZone: emptyBackRow(), grave: [], banished: [], deck, fusion: [] },
      ],
    },
  });
  try {
    let view = session.view();
    session.respond(requireAction(view, (action) => /End Phase/.test(action.label), "ceder el primer turno"));
    view = session.view();
    session.respond(requireAction(view, (action) => /End Phase/.test(action.label), "ceder el turno del oponente"));
    view = session.view();
    session.respond(requireAction(view, (action) => /Battle Phase/.test(action.label), "entrar en Battle Phase"));
    view = session.view();
    session.respond(requireAction(view, (action) => action.actionKind === "attack", `atacar con ${attacker.name}`));
    view = session.view();
    session.respond(requireAction(view, (action) => action.selectionCards?.some((card) => card.cardId === flipCard.id), `atacar a ${flipCard.name}`));
    view = session.view();
    const flipped = view.recentLog.some((event) => event.type === "FLIP" && event.cardName === flipCard.name);
    session.respond(requireAction(view, (action) => action.selectionCards?.some((card) => card.cardId === attacker.id), `seleccionar ${attacker.name}`));
    view = session.view();
    const targetDestroyed = view.players[0].graveyard.some((card) => card?.cardId === attacker.id);
    return { id: "flip-trigger-man-eater-bug", cards: [flipCard.name, attacker.name], passed: view.errors.length === 0 && flipped && targetDestroyed, flipped, targetDestroyed, errors: view.errors };
  } catch (error) {
    return { id: "flip-trigger-man-eater-bug", cards: [flipCard.name, attacker.name], passed: false, flipped: false, targetDestroyed: false, errors: [{ type: "REGRESSION_EXCEPTION", text: String(error?.message ?? error) }] };
  } finally { session.destroy(); }
}

async function standbyTriggerRegression() {
  const serpent = getCardByName("Sinister Serpent");
  const deck = Array.from({ length: 40 }, () => FILLER);
  const session = await createOcgcoreSession({
    deckA: deck,
    deckB: deck,
    seed: 20260810,
    manual: true,
    scenario: {
      startingPlayer: 0,
      players: [
        { lp: 8000, hand: [], monsterZone: [null, null, null, null, null], spellTrapZone: emptyBackRow(), grave: [serpent.id], banished: [], deck, fusion: [] },
        { lp: 8000, hand: [], monsterZone: [null, null, null, null, null], spellTrapZone: emptyBackRow(), grave: [], banished: [], deck, fusion: [] },
      ],
    },
  });
  try {
    let view = session.view();
    session.respond(requireAction(view, (action) => /^Sí, activar Sinister Serpent/.test(action.label), "activar Sinister Serpent en Standby"));
    view = session.view();
    const returned = view.players[0].hand.some((card) => card?.cardId === serpent.id);
    return { id: "standby-trigger-sinister-serpent", cards: [serpent.name], passed: view.errors.length === 0 && returned, returned, errors: view.errors };
  } catch (error) {
    return { id: "standby-trigger-sinister-serpent", cards: [serpent.name], passed: false, returned: false, errors: [{ type: "REGRESSION_EXCEPTION", text: String(error?.message ?? error) }] };
  } finally { session.destroy(); }
}

async function attackDeclarationTrapRegression() {
  const trap = getCardByName("Mirror Force");
  const attacker = getCardByName(FILLER);
  const defender = getCardByName("Silver Fang");
  const deck = Array.from({ length: 40 }, () => FILLER);
  const session = await createOcgcoreSession({
    deckA: deck,
    deckB: deck,
    seed: 20260811,
    manual: true,
    scenario: {
      startingPlayer: 0,
      players: [
        { lp: 8000, hand: [], monsterZone: [{ cardId: defender.id, position: "ATTACK" }, null, null, null, null], spellTrapZone: [{ cardId: trap.id, position: "SET" }, null, null, null, null], grave: [], banished: [], deck, fusion: [] },
        { lp: 8000, hand: [], monsterZone: [{ cardId: attacker.id, position: "ATTACK" }, null, null, null, null], spellTrapZone: emptyBackRow(), grave: [], banished: [], deck, fusion: [] },
      ],
    },
  });
  try {
    let view = session.view();
    session.respond(requireAction(view, (action) => /End Phase/.test(action.label), "ceder el primer turno"));
    view = session.view();
    session.respond(requireAction(view, (action) => /Battle Phase/.test(action.label), "entrar en Battle Phase"));
    view = session.view();
    session.respond(requireAction(view, (action) => action.actionKind === "attack", `atacar con ${attacker.name}`));
    view = session.view();
    session.respond(requireAction(view, (action) => action.selectionCards?.some((card) => card.cardId === defender.id), `seleccionar ${defender.name}`));
    view = session.view();
    session.respond(requireAction(view, (action) => /Mirror Force/.test(action.label), "activar Mirror Force"));
    view = session.view();
    const attackerDestroyed = view.players[1].graveyard.some((card) => card?.cardId === attacker.id);
    return { id: "attack-declaration-mirror-force", cards: [trap.name, attacker.name], passed: view.errors.length === 0 && attackerDestroyed, attackerDestroyed, errors: view.errors };
  } catch (error) {
    return { id: "attack-declaration-mirror-force", cards: [trap.name, attacker.name], passed: false, attackerDestroyed: false, errors: [{ type: "REGRESSION_EXCEPTION", text: String(error?.message ?? error) }] };
  } finally { session.destroy(); }
}

async function announceNumberRegression() {
  const wall = getCardByName("Wall of Revealing Light");
  const deck = Array.from({ length: 40 }, () => FILLER);
  const session = await createOcgcoreSession({
    deckA: deck,
    deckB: deck,
    seed: 20260812,
    manual: true,
    scenario: {
      startingPlayer: 0,
      players: [
        { lp: 8000, hand: [], monsterZone: [null, null, null, null, null], spellTrapZone: [{ cardId: wall.id, position: "SET" }, null, null, null, null], grave: [], banished: [], deck, fusion: [] },
        { lp: 8000, hand: [], monsterZone: [{ card: FILLER, position: "ATTACK" }, null, null, null, null], spellTrapZone: emptyBackRow(), grave: [], banished: [], deck, fusion: [] },
      ],
    },
  });
  try {
    let view = session.view();
    session.respond(requireAction(view, (action) => /Wall of Revealing Light/.test(action.label), "activar Wall of Revealing Light"));
    view = session.view();
    const pay3000 = requireAction(view, (action) => /3000/.test(action.label), "elegir pago de 3000 LP");
    session.respond(pay3000);
    view = session.view();
    const active = view.players[0].spellTrapZone.some((card) => card?.cardId === wall.id && card.faceUp);
    const lp = view.players[0].lp;
    session.respond(requireAction(view, (action) => /End Phase/.test(action.label), "ceder el turno tras activar Wall"));
    view = session.view();
    session.respond(requireAction(view, (action) => /Battle Phase/.test(action.label), "entrar en Battle Phase bajo Wall"));
    view = session.view();
    const attackBlocked = !view.actions.some((action) => action.actionKind === "attack");
    return { id: "announce-number-wall-of-revealing-light", cards: [wall.name, FILLER], passed: view.errors.length === 0 && lp === 5000 && active && attackBlocked, lp, active, attackBlocked, errors: view.errors };
  } catch (error) {
    return { id: "announce-number-wall-of-revealing-light", cards: [wall.name, FILLER], passed: false, lp: null, active: false, attackBlocked: false, errors: [{ type: "REGRESSION_EXCEPTION", text: String(error?.message ?? error) }] };
  } finally { session.destroy(); }
}

export async function runHighRiskCardRegressions() {
  const cases = await Promise.all([
    battleDestroyedGrowthRegression({
      id: "firebird-battle-destroyed-winged-beast",
      growthCard: "Firebird",
      victimCard: "Harpie Lady",
    }),
    battleDestroyedGrowthRegression({
      id: "maji-gire-panda-battle-destroyed-beast",
      growthCard: "Maji-Gire Panda",
      victimCard: "Silver Fang",
    }),
    flipDestroyRegression(),
    standbyTriggerRegression(),
    attackDeclarationTrapRegression(),
    announceNumberRegression(),
  ]);
  return {
    command: "cards:regressions",
    cases: cases.length,
    passed: cases.every((entry) => entry.passed),
    failures: cases.filter((entry) => !entry.passed),
    results: cases,
  };
}

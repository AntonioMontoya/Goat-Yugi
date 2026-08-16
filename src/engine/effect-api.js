/**
 * Controlled effect boundary.
 *
 * Card scripts receive this capability object instead of the mutable duel
 * state. The engine owns the command implementations and can therefore
 * validate, log, replay and eventually queue each operation consistently.
 */
export const CONTROLLED_EFFECT_OPERATIONS = Object.freeze([
  "select",
  "reveal",
  "draw",
  "recover",
  "damage",
  "discard",
  "shuffle",
  "destroy",
  "sendToGrave",
  "banish",
  "returnToHand",
  "summon",
  "changeControl",
  "changePosition",
  "modifyStats",
  "negate",
  "restrict",
  "registerContinuous",
  "registerTemporary",
  "scheduleExpiry"
]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function requireCommand(commands, name) {
  if (typeof commands[name] !== "function") throw new Error(`La operación de efecto ${name} no está disponible.`);
  return commands[name];
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} debe ser un entero no negativo.`);
  return number;
}

/**
 * Creates the only object exposed to a card effect script.
 * `commands` is intentionally supplied by the engine and is never returned.
 */
export function createEffectApi({ actorId, sourceUid = null, commands = {} } = {}) {
  const invoke = (name, ...args) => requireCommand(commands, name)(...args);
  const api = {
    actorId,
    opponentId: actorId === 0 ? 1 : 0,
    sourceUid,
    select(criteria = {}) { return clone(invoke("select", clone(criteria))); },
    reveal(targets, visibility = "public") { return invoke("reveal", clone(targets), visibility); },
    draw(amount = 1, playerId = actorId) { return invoke("draw", nonNegativeInteger(amount, "La cantidad a robar"), playerId); },
    recover(amount = 0, playerId = actorId) { return invoke("recover", nonNegativeInteger(amount, "La cantidad a recuperar"), playerId); },
    damage(amount = 0, playerId = actorId) { return invoke("damage", nonNegativeInteger(amount, "La cantidad de daño"), playerId); },
    discard(amount = 1, playerId = actorId, options = {}) { return invoke("discard", nonNegativeInteger(amount, "La cantidad a descartar"), playerId, clone(options)); },
    shuffle(zone, playerId = actorId) { return invoke("shuffle", zone, playerId); },
    destroy(targetUid, reason = "effect") { return invoke("destroy", targetUid, reason); },
    sendToGrave(targetUid, reason = "effect") { return invoke("sendToGrave", targetUid, reason); },
    banish(targetUid, reason = "effect") { return invoke("banish", targetUid, reason); },
    returnToHand(targetUid, reason = "effect") { return invoke("returnToHand", targetUid, reason); },
    summon(spec = {}) { return invoke("summon", clone(spec)); },
    changeControl(targetUid, newController) { return invoke("changeControl", targetUid, newController); },
    changePosition(targetUid, position, faceUp = true) { return invoke("changePosition", targetUid, position, faceUp); },
    modifyStats(targetUid, modifier = {}) { return invoke("modifyStats", targetUid, clone(modifier)); },
    negate(target, options = {}) { return invoke("negate", clone(target), clone(options)); },
    restrict(restriction = {}) { return invoke("restrict", clone(restriction)); },
    registerContinuous(effect = {}) { return invoke("registerContinuous", clone(effect)); },
    registerTemporary(effect = {}) { return invoke("registerTemporary", clone(effect)); },
    scheduleExpiry(expiry = {}) { return invoke("scheduleExpiry", clone(expiry)); }
  };
  return Object.freeze(api);
}

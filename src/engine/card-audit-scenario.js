import { getCard } from "./cards.js";
import { createOcgcoreSession } from "./ocgcore-session.js";
import { cardAuditRecord, CARD_AUDIT_SCENARIO_SCHEMA } from "./card-audit.js";
import { auditViewSnapshot, recordedAuditStep } from "./card-audit-recording.js";
export { auditViewSnapshot, recordedAuditStep } from "./card-audit-recording.js";

function slug(value) {
  return String(value ?? "card-audit").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sanitizePlayer(player) {
  return {
    lp: Number(player?.lp ?? 8000),
    hand: structuredClone(player?.hand ?? []),
    monsterZone: structuredClone(player?.monsterZone ?? [null, null, null, null, null]),
    spellTrapZone: structuredClone(player?.spellTrapZone ?? [null, null, null, null, null]),
    grave: structuredClone(player?.grave ?? []),
    banished: structuredClone(player?.banished ?? []),
    deck: structuredClone(player?.deck ?? []),
    fusion: structuredClone(player?.fusion ?? []),
  };
}

export function sandboxAuditFixture(sandbox) {
  const card = getCard(sandbox?.audit?.cardId);
  if (!card) throw new Error("Selecciona una carta para la evidencia antes de exportar.");
  const audit = cardAuditRecord(card.id);
  return {
    schema: CARD_AUDIT_SCENARIO_SCHEMA,
    id: `${slug(card.name)}-${String(sandbox?.scenarioName ?? "sandbox").length ? slug(sandbox.scenarioName) : "sandbox"}`,
    cardId: card.id,
    cardName: card.name,
    runtimeCode: audit?.runtimeCode ?? null,
    fingerprint: audit?.fingerprint ?? null,
    status: "DRAFT",
    description: String(sandbox?.audit?.description ?? "").trim(),
    sourceRefs: audit?.contract?.sourceRefs ?? [],
    seed: Number(sandbox?.audit?.seed ?? 2005),
    scenario: {
      startingPlayer: Number(sandbox?.startingPlayer ?? 0),
      players: (sandbox?.players ?? []).map(sanitizePlayer),
    },
    steps: structuredClone(sandbox?.audit?.steps ?? []),
    assertions: structuredClone(sandbox?.audit?.assertions ?? []),
    lastSnapshot: structuredClone(sandbox?.audit?.lastSnapshot ?? null),
  };
}

export function auditFixtureFileName(fixture) {
  return `${slug(fixture?.id ?? fixture?.cardName ?? "card-audit")}.json`;
}

export function validateCardAuditScenario(fixture) {
  const errors = [];
  if (Number(fixture?.schema) !== CARD_AUDIT_SCENARIO_SCHEMA) errors.push("SCHEMA_MISMATCH");
  if (!fixture?.id) errors.push("MISSING_ID");
  if (!getCard(fixture?.cardId)) errors.push("UNKNOWN_CARD");
  if (!Number.isFinite(Number(fixture?.seed))) errors.push("INVALID_SEED");
  if (!Array.isArray(fixture?.scenario?.players) || fixture.scenario.players.length !== 2) errors.push("INVALID_PLAYERS");
  if (!Array.isArray(fixture?.steps)) errors.push("INVALID_STEPS");
  if (!Array.isArray(fixture?.assertions)) errors.push("INVALID_ASSERTIONS");
  return { valid: errors.length === 0, errors };
}

function selectAction(actions, selector = {}) {
  return actions.find((action) => {
    if (selector.label != null && action.label !== selector.label) return false;
    if (selector.labelIncludes != null && !String(action.label).includes(selector.labelIncludes)) return false;
    if (selector.labelPattern != null && !new RegExp(selector.labelPattern, "i").test(String(action.label))) return false;
    if (selector.actionKind != null && action.actionKind !== selector.actionKind) return false;
    if (selector.selectionCards?.length) {
      const names = new Set((action.selectionCards ?? []).map((card) => card.cardName ?? getCard(card.cardId)?.name));
      if (!selector.selectionCards.every((name) => names.has(name))) return false;
    }
    if (selector.placement) {
      if (Number(action.placement?.player) !== Number(selector.placement.player)) return false;
      if (Number(action.placement?.location) !== Number(selector.placement.location)) return false;
      if (Number(action.placement?.sequence) !== Number(selector.placement.sequence)) return false;
    }
    return true;
  }) ?? null;
}

function valueAtPath(value, path) {
  return String(path ?? "").split(".").filter(Boolean).reduce((current, part) => current?.[Number.isInteger(Number(part)) ? Number(part) : part], value);
}

function evaluateAssertion(view, assertion) {
  const actual = valueAtPath(view, assertion.path);
  if (Object.hasOwn(assertion, "equals")) return { ...assertion, actual, passed: JSON.stringify(actual) === JSON.stringify(assertion.equals) };
  if (Object.hasOwn(assertion, "length")) return { ...assertion, actual: actual?.length, passed: actual?.length === assertion.length };
  if (assertion.includesCard) {
    const names = (actual ?? []).map((card) => getCard(card?.cardId)?.name ?? card?.cardName ?? card);
    return { ...assertion, actual: names, passed: names.includes(assertion.includesCard) };
  }
  if (assertion.excludesCard) {
    const names = (actual ?? []).map((card) => getCard(card?.cardId)?.name ?? card?.cardName ?? card);
    return { ...assertion, actual: names, passed: !names.includes(assertion.excludesCard) };
  }
  if (assertion.actionAvailable) return { ...assertion, actual: view.actions.map((action) => action.label), passed: view.actions.some((action) => new RegExp(assertion.actionAvailable, "i").test(action.label)) };
  if (assertion.actionUnavailable) return { ...assertion, actual: view.actions.map((action) => action.label), passed: !view.actions.some((action) => new RegExp(assertion.actionUnavailable, "i").test(action.label)) };
  if (assertion.noErrors === true) return { ...assertion, actual: view.errors, passed: (view.errors ?? []).length === 0 };
  return { ...assertion, actual, passed: false, error: "UNKNOWN_ASSERTION" };
}

export async function runCardAuditScenario(fixture) {
  const validation = validateCardAuditScenario(fixture);
  if (!validation.valid) return { passed: false, validation, trace: [], assertions: [] };
  const players = fixture.scenario.players;
  const session = await createOcgcoreSession({
    deckA: players[0].deck ?? [],
    deckB: players[1].deck ?? [],
    fusionA: players[0].fusion ?? [],
    fusionB: players[1].fusion ?? [],
    seed: Number(fixture.seed),
    manual: true,
    scenario: fixture.scenario,
  });
  const trace = [];
  const errors = [];
  try {
    for (const [index, step] of fixture.steps.entries()) {
      const before = session.view();
      if (step.pendingType && before.pendingType !== step.pendingType) {
        errors.push({ step: index, error: "PENDING_TYPE_MISMATCH", expected: step.pendingType, actual: before.pendingType });
        break;
      }
      const action = selectAction(before.actions, step.select);
      if (!action) {
        errors.push({ step: index, error: "LEGAL_ACTION_NOT_FOUND", selector: step.select, available: before.actions.map((candidate) => candidate.label) });
        break;
      }
      const after = session.respond(action);
      trace.push({ step: index, pendingType: before.pendingType, action: recordedAuditStep(action, before), before: auditViewSnapshot(before), after: auditViewSnapshot(after) });
    }
    const finalView = session.view();
    const assertions = fixture.assertions.map((assertion) => evaluateAssertion(finalView, assertion));
    return {
      passed: errors.length === 0 && assertions.every((assertion) => assertion.passed) && (finalView.errors ?? []).length === 0,
      validation,
      errors,
      assertions,
      trace,
      finalSnapshot: auditViewSnapshot(finalView),
    };
  } finally {
    session.destroy();
  }
}

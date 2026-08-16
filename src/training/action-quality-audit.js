const CRITICAL_REASONS = new Set([
  "FACEUP_SUMMON_DOES_NOT_ENABLE_FLIP_VALUE",
  "INTERACTION_HAS_NO_VISIBLE_OPPOSING_VALUE",
  "POSITION_EFFECT_DOES_NOT_ADVANCE_CURRENT_STATE",
  "SETTING_A_NON_REACTIVE_CARD_HIDES_A_FUTURE_ACTION",
  "SPENDING_A_CARD_TO_REPAIR_THE_PREVIOUS_ACTION",
  "CHAIN_NEEDS_IMMEDIATE_PUBLIC_JUSTIFICATION",
  "ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET",
]);

const COMPONENT_LABELS = Object.freeze({
  material: "material", board: "mesa", tempo: "tempo", future: "valor futuro",
  safety: "seguridad", coherence: "coherencia", sequence: "secuencia",
  prediction: "predicción rival", style: "plan del mazo", persona: "perfil",
});

function increment(target, key, amount = 1) {
  const normalized = String(key ?? "unknown");
  target[normalized] = (Number(target[normalized]) || 0) + amount;
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function strongestComponents(selected = {}) {
  const values = { ...(selected.evaluationComponents ?? {}), ...(selected.components ?? {}) };
  return Object.entries(values)
    .filter(([, value]) => Math.abs(finite(value)) >= 0.25)
    .sort((left, right) => Math.abs(finite(right[1])) - Math.abs(finite(left[1])))
    .slice(0, 3)
    .map(([name, value]) => `${COMPONENT_LABELS[name] ?? name} ${finite(value) >= 0 ? "+" : ""}${finite(value).toFixed(2)}`);
}

function explain(record) {
  if (record.quality === "forced") return "OCGCore sólo ofrecía esta respuesta; no existía una alternativa que comparar.";
  const selected = record.selected;
  const subject = selected.cards?.length ? `${selected.role} con ${selected.cards.join(", ")}` : selected.role;
  const details = [`Eligió ${subject}`, `plan ${record.playstyle}`];
  if (Number.isFinite(selected.projectedValue)) details.push(`valor público ${selected.projectedValue.toFixed(2)}`);
  const components = strongestComponents(selected);
  if (components.length) details.push(`factores: ${components.join(", ")}`);
  if (record.guardrailsAvoided.length) details.push(`descartó ${record.guardrailsAvoided.length} alternativa(s) incoherente(s)`);
  if (record.negativeReasons.length) details.push(`requiere revisión por ${record.negativeReasons.join(", ")}`);
  else if (record.scoreMargin !== null) details.push(`margen sobre la siguiente opción ${record.scoreMargin.toFixed(2)}`);
  return `${details.join("; ")}.`;
}

function classify(reasoning) {
  if (!reasoning?.selected || reasoning.forced === true) return { quality: "forced", negativeReasons: [], scoreMargin: null, plannedRegret: 0 };
  const selected = reasoning.selected;
  const alternatives = reasoning.alternatives ?? [];
  const bestScore = alternatives.length ? Math.max(...alternatives.map((entry) => finite(entry.score, -Infinity))) : -Infinity;
  const bestPlanned = alternatives.length ? Math.max(...alternatives.map((entry) => finite(entry.plannedScore, -Infinity))) : -Infinity;
  const scoreMargin = Number.isFinite(bestScore) && Number.isFinite(Number(selected.score)) ? Number(selected.score) - bestScore : null;
  const plannedRegret = Number.isFinite(bestPlanned) && Number.isFinite(Number(selected.plannedScore)) ? Math.max(0, bestPlanned - Number(selected.plannedScore)) : 0;
  const negativeReasons = (selected.reasons ?? []).filter((reason) => CRITICAL_REASONS.has(reason));
  const sameCards = (entry) => JSON.stringify(entry.cards ?? []) === JSON.stringify(selected.cards ?? []);
  const forcedEquivalent = reasoning.promptForced === true && alternatives.every((entry) => entry.role === selected.role && sameCards(entry) && Math.abs(finite(entry.score) - finite(selected.score)) < 0.001);
  if (forcedEquivalent) return { quality: "forced", negativeReasons: [], scoreMargin, plannedRegret: 0 };
  const avoidableCritical = negativeReasons.length > 0 && alternatives.some((entry) => !(entry.reasons ?? []).some((reason) => CRITICAL_REASONS.has(reason)) && finite(entry.score, -Infinity) >= finite(selected.score) - 0.25);
  const suspicious = avoidableCritical || (scoreMargin !== null && scoreMargin < -0.25);
  const betterPublicAlternative = alternatives.some((entry) => finite(entry.projectedValue, -Infinity) >= finite(selected.projectedValue) + 1 && finite(entry.score, -Infinity) >= finite(selected.score) - 0.5);
  const review = !suspicious && (plannedRegret > 0.75 || (finite(selected.projectedValue) < 0 && betterPublicAlternative) || negativeReasons.length > 0);
  return { quality: suspicious ? "suspicious" : review ? "review" : "sound", negativeReasons, scoreMargin, plannedRegret };
}

function emptyAudit() {
  return {
    schema: 1,
    decisions: 0,
    reasoned: 0,
    quality: { forced: 0, sound: 0, review: 0, suspicious: 0 },
    byRole: {},
    byPlaystyle: {},
    byRequestType: {},
    selectedReasons: {},
    guardrailsAvoided: {},
    scoreMarginSum: 0,
    scoreMarginSamples: 0,
    plannedRegretSum: 0,
    projectedValueSum: 0,
    projectedValueSamples: 0,
    examples: { suspicious: [], review: [], guardrail: [], sound: [] },
  };
}

function retain(list, value, limit) {
  if (list.length < limit) list.push(value);
}

export function createActionQualityCollector({ metadata = {}, sampleLimit = 24, targetPlayer = 0, onRecord = null } = {}) {
  const audit = emptyAudit();
  return {
    capture(trace, context = {}) {
      if (Number(trace?.player) !== Number(targetPlayer)) return;
      const reasoning = context.bot?.lastReasoning ?? null;
      const classification = classify(reasoning);
      const selected = reasoning?.selected ?? { role: "unknown", cards: [], semanticRoles: [], reasons: [] };
      const guardrailsAvoided = (reasoning?.rejected ?? []).map((entry) => entry.guardrail).filter(Boolean);
      const record = {
        ...metadata,
        decision: Number(context.decisions) || audit.decisions + 1,
        turn: Number(context.observation?.turn) || 0,
        phase: Number(context.observation?.phase) || 0,
        requestType: Number(reasoning?.requestType ?? trace?.messageType) || 0,
        playstyle: reasoning?.playstyle ?? context.bot?.style ?? "unknown",
        promptForced: reasoning?.promptForced === true || context.message?.forced === true,
        publicState: {
          ownLp: Number(context.observation?.ownLp) || 0,
          opponentLp: Number(context.observation?.opponentLp) || 0,
          ownMonsters: Number(context.observation?.ownMonsterCount ?? context.observation?.ownMonsters?.length) || 0,
          opponentMonsters: Number(context.observation?.opponentMonsterCount ?? context.observation?.opponentMonsters?.length) || 0,
          ownBackrow: Number(context.observation?.ownBackrowCount ?? context.observation?.ownBackrow?.length) || 0,
          opponentBackrow: Number(context.observation?.opponentBackrowCount ?? context.observation?.opponentBackrow?.length) || 0,
          publicChainLinks: Number(context.observation?.publicChain?.length) || 0,
        },
        selected: structuredClone(selected),
        alternatives: structuredClone((reasoning?.alternatives ?? []).slice(0, 3)),
        guardrailsAvoided,
        ...classification,
      };
      record.explanation = explain(record);
      onRecord?.(structuredClone(record));
      audit.decisions += 1;
      increment(audit.quality, record.quality);
      increment(audit.byRole, selected.role);
      increment(audit.byPlaystyle, record.playstyle);
      increment(audit.byRequestType, record.requestType);
      for (const reason of selected.reasons ?? []) increment(audit.selectedReasons, reason);
      for (const reason of guardrailsAvoided) increment(audit.guardrailsAvoided, reason);
      if (record.quality !== "forced") audit.reasoned += 1;
      if (record.scoreMargin !== null) { audit.scoreMarginSum += record.scoreMargin; audit.scoreMarginSamples += 1; }
      audit.plannedRegretSum += record.plannedRegret;
      if (Number.isFinite(Number(selected.projectedValue))) { audit.projectedValueSum += Number(selected.projectedValue); audit.projectedValueSamples += 1; }
      if (record.quality === "suspicious") retain(audit.examples.suspicious, record, sampleLimit);
      else if (record.quality === "review") retain(audit.examples.review, record, sampleLimit);
      else if (record.quality === "sound") retain(audit.examples.sound, record, Math.min(8, sampleLimit));
      if (guardrailsAvoided.length) retain(audit.examples.guardrail, record, sampleLimit);
    },
    result() { return finalizeActionQualityAudit(audit); },
  };
}

function mergeMap(target, source = {}) {
  for (const [key, value] of Object.entries(source)) increment(target, key, Number(value) || 0);
}

export function mergeActionQualityAudits(values = [], { sampleLimit = 24 } = {}) {
  const merged = emptyAudit();
  for (const value of values) {
    merged.decisions += Number(value.decisions) || 0;
    merged.reasoned += Number(value.reasoned) || 0;
    for (const key of Object.keys(merged.quality)) merged.quality[key] += Number(value.quality?.[key]) || 0;
    for (const key of ["byRole", "byPlaystyle", "byRequestType", "selectedReasons", "guardrailsAvoided"]) mergeMap(merged[key], value[key]);
    for (const key of ["scoreMarginSum", "scoreMarginSamples", "plannedRegretSum", "projectedValueSum", "projectedValueSamples"]) merged[key] += Number(value.metrics?.[key] ?? value[key]) || 0;
    for (const key of Object.keys(merged.examples)) for (const record of value.examples?.[key] ?? []) retain(merged.examples[key], record, key === "sound" ? Math.min(8, sampleLimit) : sampleLimit);
  }
  return finalizeActionQualityAudit(merged);
}

export function finalizeActionQualityAudit(audit) {
  const reasoned = Math.max(1, Number(audit.reasoned) || 0);
  return {
    schema: 1,
    decisions: audit.decisions,
    reasoned: audit.reasoned,
    quality: { ...audit.quality },
    rates: {
      sound: audit.quality.sound / reasoned,
      review: audit.quality.review / reasoned,
      suspicious: audit.quality.suspicious / reasoned,
    },
    averages: {
      scoreMargin: audit.scoreMarginSum / Math.max(1, audit.scoreMarginSamples),
      plannedRegret: audit.plannedRegretSum / reasoned,
      projectedValue: audit.projectedValueSum / Math.max(1, audit.projectedValueSamples),
    },
    byRole: { ...audit.byRole },
    byPlaystyle: { ...audit.byPlaystyle },
    byRequestType: { ...audit.byRequestType },
    selectedReasons: { ...audit.selectedReasons },
    guardrailsAvoided: { ...audit.guardrailsAvoided },
    metrics: {
      scoreMarginSum: audit.scoreMarginSum,
      scoreMarginSamples: audit.scoreMarginSamples,
      plannedRegretSum: audit.plannedRegretSum,
      projectedValueSum: audit.projectedValueSum,
      projectedValueSamples: audit.projectedValueSamples,
    },
    examples: structuredClone(audit.examples),
    interpretation: "La auditoría detecta incoherencias, arrepentimiento frente a alternativas y decisiones dudosas; no demuestra juego óptimo ni sustituye una revisión humana de rulings.",
  };
}

import {
  OCGCORE_CARD_DATA,
  OCGCORE_CARD_ENTRIES,
  OCGCORE_MISSING_SCRIPTS,
} from "../data/ocgcore-assets.js";
import { OCGCORE_SCRIPT_SOURCES } from "../data/ocgcore-script-sources.js";
import { HISTORICAL_SCRIPT_OVERRIDES } from "../data/historical-script-overrides.js";
import { CARD_AUDIT_EVIDENCE, CARD_AUDIT_EVIDENCE_SCHEMA } from "../data/card-audit-evidence.js";
import { getCardByName } from "./cards.js";

export const CARD_AUDIT_SCHEMA = 2;
export const CARD_AUDIT_SCENARIO_SCHEMA = 1;

export const CARD_AUDIT_STATUS = Object.freeze({
  PASS_DATA: "PASS_DATA",
  PASS_EXACT: "PASS_EXACT",
  FAIL_DOCUMENTED: "FAIL_DOCUMENTED",
  BLOCKED_HARNESS: "BLOCKED_HARNESS",
  NEEDS_RULING: "NEEDS_RULING",
  UNVERIFIED: "UNVERIFIED",
  FIXED_PENDING_REGRESSION: "FIXED_PENDING_REGRESSION",
});

export const CARD_AUDIT_STATUS_LABELS = Object.freeze({
  [CARD_AUDIT_STATUS.PASS_DATA]: "Datos certificados",
  [CARD_AUDIT_STATUS.PASS_EXACT]: "Efecto certificado",
  [CARD_AUDIT_STATUS.FAIL_DOCUMENTED]: "Fallo documentado",
  [CARD_AUDIT_STATUS.BLOCKED_HARNESS]: "Bloqueado por el arnes",
  [CARD_AUDIT_STATUS.NEEDS_RULING]: "Ruling pendiente",
  [CARD_AUDIT_STATUS.UNVERIFIED]: "Sin verificar",
  [CARD_AUDIT_STATUS.FIXED_PENDING_REGRESSION]: "Arreglo pendiente de regresion",
});

const FINAL_AUDIT_STATUSES = new Set([
  CARD_AUDIT_STATUS.PASS_DATA,
  CARD_AUDIT_STATUS.PASS_EXACT,
  CARD_AUDIT_STATUS.FAIL_DOCUMENTED,
]);

const ATTRIBUTE_CODES = Object.freeze({
  EARTH: 1,
  WATER: 2,
  FIRE: 4,
  WIND: 8,
  LIGHT: 16,
  DARK: 32,
  DIVINE: 64,
});

const RACE_CODES = Object.freeze({
  WARRIOR: 1,
  SPELLCASTER: 2,
  FAIRY: 4,
  FIEND: 8,
  ZOMBIE: 16,
  MACHINE: 32,
  AQUA: 64,
  PYRO: 128,
  ROCK: 256,
  "WINGED BEAST": 512,
  PLANT: 1024,
  INSECT: 2048,
  THUNDER: 4096,
  DRAGON: 8192,
  BEAST: 16384,
  "BEAST-WARRIOR": 32768,
  DINOSAUR: 65536,
  FISH: 131072,
  "SEA SERPENT": 262144,
  REPTILE: 524288,
});

const DETECTORS = Object.freeze({
  conditions: [
    ["flip", /\bFLIP\s*:/i],
    ["summon-trigger", /when this card is (?:Normal|Flip|Special) Summoned/i],
    ["battle-trigger", /when .*?(?:attacks|declares an attack|battle damage|destroyed .* battle)/i],
    ["phase-condition", /during .*?(?:Draw|Standby|Main|Battle|End) Phase/i],
    ["state-condition", /\b(?:if|while|as long as|when there (?:is|are))\b/i],
    ["trigger-condition", /\bwhen\b/i],
  ],
  costs: [
    ["lp-cost", /\bpay \d+ life points?\b/i],
    ["discard-cost", /\bdiscard \d+ cards?\b/i],
    ["tribute-cost", /\btribute \d+|tribute this card/i],
    ["send-cost", /\bsend .*? to the graveyard\b/i],
  ],
  targets: [
    ["explicit-target", /\btarget \d+|\bselect \d+/i],
    ["implicit-target", /\b(?:choose|return|destroy|remove from play|change|equip)\s+(?:up to\s+)?\d+/i],
    ["multi-target", /\ball (?:cards?|monsters?|spell|trap)/i],
  ],
  timings: [
    ["damage-step", /damage step|damage calculation/i],
    ["battle-phase", /battle phase|declares an attack|attacks/i],
    ["standby-phase", /standby phase/i],
    ["end-phase", /end phase/i],
    ["chain-response", /activate|negate|in response/i],
  ],
  limits: [
    ["once-per-turn", /once per turn/i],
    ["duration-turn", /until the end|during this turn|for the rest of this turn/i],
    ["continuous", /as long as|while this card remains/i],
  ],
  zones: [
    ["hand", /\bhand\b/i],
    ["field", /\bfield\b/i],
    ["graveyard", /graveyard/i],
    ["banished", /remove .*? from play|removed from play|banish/i],
    ["deck", /\bdeck\b/i],
    ["fusion-deck", /fusion deck|extra deck/i],
  ],
});

function normalizeName(value) {
  return String(value ?? "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/_/g, " ");
}

function effectiveScript(entry) {
  return HISTORICAL_SCRIPT_OVERRIDES[entry.script] ?? OCGCORE_SCRIPT_SOURCES[entry.script] ?? "";
}

function sourceKind(card, entry) {
  if (HISTORICAL_SCRIPT_OVERRIDES[entry.script]) return "local-goat-override";
  if (OCGCORE_MISSING_SCRIPTS.includes(entry.script)) return "ocgcore-cdb-normal";
  if (card?.custom) return "custom-lua";
  return "ocgcore-lua";
}

function detectedTags(text, detector) {
  return detector.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

function independentEffects(text) {
  const sentences = String(text ?? "")
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z"])/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const effects = [];
  for (const sentence of sentences) {
    if (/^(?:then|after that|and then)\b/i.test(sentence) && effects.length) {
      effects[effects.length - 1] = `${effects.at(-1)} ${sentence}`;
      continue;
    }
    const branches = sentence.split(/\s+OR\s+(?=[A-Z])/).map((part) => part.trim()).filter(Boolean);
    effects.push(...branches);
  }
  return effects;
}

export function extractCardAuditContract(card, entry) {
  const text = String(card?.text ?? "");
  const runtime = sourceKind(card, entry);
  const dataOnly = runtime === "ocgcore-cdb-normal";
  const printedNormal = card?.kind === "MONSTER" && card?.subtype === "Normal";
  const effectlessFusion = card?.kind === "MONSTER" && card?.subtype === "Fusion" && card?.class === "Normal";
  const dimensions = Object.fromEntries(Object.entries(DETECTORS).map(([key, detector]) => [key, detectedTags(text, detector)]));
  const effects = dataOnly || printedNormal || effectlessFusion ? [] : independentEffects(text);
  const obligations = dataOnly
    ? [
        { id: "identity-and-cdb", kind: "data", description: "Identity, type and printed statistics match the pinned CDB." },
        { id: "shared-normal-rules", kind: "shared-rule", description: "Generic summon, set, tribute, battle and zone movement rules apply." },
      ]
    : printedNormal
      ? [
          { id: "scripted-normal:no-effect", kind: "data", description: "The custom scripted Normal Monster exposes no card effect." },
          { id: "shared-normal-rules", kind: "shared-rule", description: "Generic summon, set, tribute, battle and zone movement rules apply." },
        ]
      : effectlessFusion
        ? [
            { id: "fusion-materials:exact", kind: "summon", description: "The printed named materials legally Fusion Summon this monster." },
            { id: "fusion-materials:wrong-rejected", kind: "summon", description: "An unrelated material does not satisfy the printed Fusion recipe." },
            { id: "fusion-materials:single-substitute", kind: "summon", description: "Exactly one legal Fusion substitute may replace one named material." },
            { id: "zone:fusion-deck", kind: "zones", description: "The monster starts in the Fusion Deck and reaches the Monster Zone only through a legal summon." },
          ]
      : [
        ...effects.map((effect, index) => ({ id: `effect:${index + 1}:resolution`, kind: "behavior", description: effect })),
        ...dimensions.conditions.map((tag) => ({ id: `condition:${tag}:true-false`, kind: "conditions", description: `Availability with ${tag} true and false.` })),
        ...dimensions.costs.flatMap((tag) => [
          { id: `cost:${tag}:paid`, kind: "costs", description: `The ${tag} is paid exactly once.` },
          { id: `cost:${tag}:insufficient`, kind: "costs", description: `The effect is unavailable when ${tag} cannot be paid.` },
        ]),
        ...dimensions.targets.flatMap((tag) => [
          { id: `target:${tag}:legal`, kind: "targets", description: `Only legal ${tag} candidates can be chosen.` },
          { id: `target:${tag}:disappeared`, kind: "targets", description: `Resolution is correct when the chosen target disappears.` },
        ]),
        ...dimensions.timings.flatMap((tag) => [
          { id: `timing:${tag}:correct`, kind: "timings", description: `The effect is available in the declared ${tag} window.` },
          { id: `timing:${tag}:incorrect`, kind: "timings", description: `The effect is unavailable outside the declared ${tag} window.` },
        ]),
        ...dimensions.limits.flatMap((tag) => [
          { id: `limit:${tag}:enforced`, kind: "limits", description: `The declared ${tag} limit is enforced.` },
          { id: `limit:${tag}:reset`, kind: "limits", description: `The declared ${tag} limit resets at the correct boundary.` },
        ]),
        ...dimensions.zones.map((tag) => ({ id: `zone:${tag}`, kind: "zones", description: `Movement and visibility in ${tag} are correct.` })),
        ];
  return Object.freeze({
    version: CARD_AUDIT_SCHEMA,
    historicalText: text,
    sourceRefs: [card?.source?.sourceFile ?? "Goat Format Card Pool - Card Texts.csv", "docs/rulings-sources.md"],
    runtime,
    script: entry.script,
    dimensions,
    independentEffects: Object.freeze(effects),
    obligations: Object.freeze(obligations),
  });
}

function assertion(id, expected, actual) {
  return Object.freeze({ id, expected, actual, passed: String(expected) === String(actual) });
}

function normalDataAssertions(card, entry) {
  const data = OCGCORE_CARD_DATA[entry.runtimeCode] ?? null;
  const attribute = ATTRIBUTE_CODES[normalizedCode(card?.attribute)];
  const race = RACE_CODES[normalizedCode(card?.race)];
  return Object.freeze([
    assertion("runtime-entry", true, Boolean(entry)),
    assertion("cdb-entry", true, Boolean(data)),
    assertion("kind", "MONSTER", card?.kind),
    assertion("subtype", "Normal", card?.subtype),
    assertion("level", Number(card?.level), Number(data?.level) & 0xff),
    assertion("attack", Number(card?.atk), Number(data?.attack)),
    assertion("defense", Number(card?.def), Number(data?.defense)),
    assertion("attribute", Number(attribute), Number(data?.attribute)),
    assertion("race", Number(race), Number(data?.race)),
  ]);
}

export function cardAuditFingerprint(card, entry, contract = extractCardAuditContract(card, entry)) {
  return stableHash(JSON.stringify({
    schema: CARD_AUDIT_SCHEMA,
    scenarioSchema: CARD_AUDIT_SCENARIO_SCHEMA,
    evidenceSchema: CARD_AUDIT_EVIDENCE_SCHEMA,
    cardId: card?.id,
    runtimeCode: entry.runtimeCode,
    text: card?.text ?? "",
    script: effectiveScript(entry),
    sourceRefs: contract.sourceRefs,
    obligations: contract.obligations,
  }));
}

function validFailureEvidence(evidence) {
  const reproduction = evidence?.reproduction;
  const hasLegalSequence = reproduction?.kind === "data"
    ? Array.isArray(reproduction.legalActions)
    : Array.isArray(reproduction?.legalActions) && reproduction.legalActions.length > 0;
  return Boolean(
    reproduction?.scenarioId
      && Number.isFinite(Number(reproduction.seed))
      && hasLegalSequence
      && reproduction.expected
      && reproduction.actual
      && reproduction.coreErrorOrDifference
      && reproduction.probableSource?.component
      && reproduction.historicalBasis
      && reproduction.regression,
  );
}

function validPassEvidence(evidence, contract) {
  const covered = new Set(evidence?.coveredObligations ?? []);
  return evidence?.contractComplete === true
    && Array.isArray(evidence?.scenarios)
    && evidence.scenarios.length > 0
    && evidence.scenarios.every((scenario) => scenario?.id
      && Number.isFinite(Number(scenario.seed))
      && scenario.engine === "OCGCore WASM MODE_GOAT"
      && Array.isArray(scenario.assertions)
      && scenario.assertions.length > 0
      && scenario.assertions.every((assertion) => assertion.passed === true))
    && contract.obligations.every((obligation) => covered.has(obligation.id));
}

function resolvedEvidenceStatus(evidence, fingerprint, contract) {
  if (!evidence || evidence.fingerprint !== fingerprint) return CARD_AUDIT_STATUS.UNVERIFIED;
  if (evidence.status === CARD_AUDIT_STATUS.PASS_EXACT) {
    return validPassEvidence(evidence, contract)
      ? CARD_AUDIT_STATUS.PASS_EXACT
      : CARD_AUDIT_STATUS.UNVERIFIED;
  }
  if (evidence.status === CARD_AUDIT_STATUS.FAIL_DOCUMENTED) {
    return validFailureEvidence(evidence) ? CARD_AUDIT_STATUS.FAIL_DOCUMENTED : CARD_AUDIT_STATUS.UNVERIFIED;
  }
  if ([CARD_AUDIT_STATUS.BLOCKED_HARNESS, CARD_AUDIT_STATUS.NEEDS_RULING].includes(evidence.status)) return evidence.status;
  if (evidence.status === CARD_AUDIT_STATUS.FIXED_PENDING_REGRESSION) return evidence.status;
  return CARD_AUDIT_STATUS.UNVERIFIED;
}

export function buildCardAuditRecord(entry, evidence = null) {
  const card = getCardByName(entry.name);
  if (!card) throw new Error(`Missing local card for OCGCore entry: ${entry.name}`);
  const contract = extractCardAuditContract(card, entry);
  const fingerprint = cardAuditFingerprint(card, entry, contract);
  const dataAssertions = contract.runtime === "ocgcore-cdb-normal" ? normalDataAssertions(card, entry) : Object.freeze([]);
  const dataPass = dataAssertions.length > 0 && dataAssertions.every((item) => item.passed);
  const failedDataAssertions = dataAssertions.filter((item) => !item.passed);
  const dataFailure = failedDataAssertions.length ? Object.freeze({
    kind: "data",
    scenarioId: `normal-data-${entry.runtimeCode}`,
    seed: 0,
    legalActions: [],
    expected: Object.fromEntries(failedDataAssertions.map((item) => [item.id, item.expected])),
    actual: Object.fromEntries(failedDataAssertions.map((item) => [item.id, item.actual])),
    coreErrorOrDifference: failedDataAssertions.map((item) => `${item.id}: expected ${item.expected}, obtained ${item.actual}`).join("; "),
    probableSource: Object.freeze({
      component: "pinned OCGCore CDB card data",
      script: null,
      function: null,
    }),
    historicalBasis: `${card.source?.sourceFile ?? "catalog"} vs pinned OCGCore CDB; docs/rulings-sources.md`,
    regression: "tests/card-audit.test.js#all normal-monster data contracts are explicit",
  }) : null;
  const status = contract.runtime === "ocgcore-cdb-normal"
    ? (dataPass ? CARD_AUDIT_STATUS.PASS_DATA : CARD_AUDIT_STATUS.FAIL_DOCUMENTED)
    : resolvedEvidenceStatus(evidence, fingerprint, contract);
  return Object.freeze({
    cardId: card.id,
    name: card.name,
    custom: card.custom === true,
    kind: card.kind,
    subtype: card.subtype ?? null,
    effectFamily: card.effectFamily ?? "UNKNOWN",
    runtimeCode: entry.runtimeCode,
    script: entry.script,
    fingerprint,
    status,
    contract,
    evidence: evidence?.fingerprint === fingerprint ? evidence : null,
    failure: dataFailure ?? evidence?.reproduction ?? null,
    dataAssertions,
    sharedScenarioIds: contract.runtime === "ocgcore-cdb-normal"
      ? ["normal-data-contract", "normal-summon-set-placement", "generic-battle-and-zone-movement"]
      : [],
  });
}

function summarize(records) {
  const byStatus = Object.fromEntries(Object.values(CARD_AUDIT_STATUS).map((status) => [status, 0]));
  const byRuntime = {};
  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
    byRuntime[record.contract.runtime] = (byRuntime[record.contract.runtime] ?? 0) + 1;
  }
  const documentationComplete = records.length === OCGCORE_CARD_ENTRIES.length && records.every((record) => FINAL_AUDIT_STATUSES.has(record.status));
  const failures = byStatus[CARD_AUDIT_STATUS.FAIL_DOCUMENTED] ?? 0;
  return Object.freeze({
    cards: records.length,
    officialCards: records.filter((record) => !record.custom).length,
    customCards: records.filter((record) => record.custom).length,
    byStatus: Object.freeze(byStatus),
    byRuntime: Object.freeze(byRuntime),
    documentationComplete,
    repairsAllowed: documentationComplete && failures > 0,
    repairComplete: documentationComplete && failures === 0 && (byStatus[CARD_AUDIT_STATUS.PASS_EXACT] ?? 0) === 1341,
  });
}

export function buildCardAuditManifest({ evidence = CARD_AUDIT_EVIDENCE } = {}) {
  const evidenceByCard = new Map((evidence ?? []).map((item) => [Number(item.cardId), item]));
  const records = Object.freeze(OCGCORE_CARD_ENTRIES.map((entry) => {
    const card = getCardByName(entry.name);
    return buildCardAuditRecord(entry, evidenceByCard.get(Number(card?.id)) ?? null);
  }));
  return Object.freeze({
    schema: CARD_AUDIT_SCHEMA,
    scenarioSchema: CARD_AUDIT_SCENARIO_SCHEMA,
    evidenceSchema: CARD_AUDIT_EVIDENCE_SCHEMA,
    format: "TCG April 2005 / The Lost Millennium",
    engine: "OCGCore WASM MODE_GOAT",
    records,
    summary: summarize(records),
  });
}

export function selectCardAuditRecords(manifest, { card = "", family = "", changedAgainst = null } = {}) {
  const query = normalizeName(card);
  const familyQuery = normalizeName(family);
  const prior = new Map((changedAgainst?.records ?? []).map((record) => [Number(record.cardId), record.fingerprint]));
  return manifest.records.filter((record) => {
    if (query && !normalizeName(record.name).includes(query) && String(record.cardId) !== String(card).trim()) return false;
    if (familyQuery && normalizeName(record.effectFamily) !== familyQuery) return false;
    if (changedAgainst && prior.get(Number(record.cardId)) === record.fingerprint) return false;
    return true;
  });
}

export function buildCardAuditReport(manifest, { selectedRecords = manifest.records } = {}) {
  const escapeCell = (value) => String(value ?? "-").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const summaryRows = Object.values(CARD_AUDIT_STATUS).map((status) => `| ${status} | ${manifest.summary.byStatus[status] ?? 0} |`).join("\n");
  const familySummary = new Map();
  for (const record of selectedRecords) {
    const family = record.effectFamily ?? "UNKNOWN";
    const row = familySummary.get(family) ?? Object.fromEntries(["TOTAL", ...Object.values(CARD_AUDIT_STATUS)].map((key) => [key, 0]));
    row.TOTAL += 1;
    row[record.status] = (row[record.status] ?? 0) + 1;
    familySummary.set(family, row);
  }
  const familyRows = [...familySummary.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, row]) => `| ${escapeCell(family)} | ${row.TOTAL} | ${row.PASS_DATA} | ${row.PASS_EXACT} | ${row.FAIL_DOCUMENTED} | ${row.BLOCKED_HARNESS} | ${row.NEEDS_RULING} | ${row.UNVERIFIED} |`)
    .join("\n");
  const registerRows = selectedRecords.map((record) => {
    const scenarioCount = record.evidence?.scenarios?.length ?? (record.sharedScenarioIds?.length ?? 0);
    return `| ${record.cardId} | ${escapeCell(record.name)} | ${escapeCell(`${record.kind}${record.subtype ? ` / ${record.subtype}` : ""}`)} | ${escapeCell(record.effectFamily)} | ${record.status} | ${record.contract.obligations.length} | ${scenarioCount} |`;
  }).join("\n");
  const pending = selectedRecords.filter((record) => ![CARD_AUDIT_STATUS.PASS_DATA, CARD_AUDIT_STATUS.PASS_EXACT].includes(record.status));
  const pendingRows = pending.length
    ? pending.map((record) => `| ${record.cardId} | ${escapeCell(record.name)} | ${escapeCell(record.effectFamily)} | ${record.status} | ${record.contract.obligations.length} |`).join("\n")
    : "| - | No pending cards in this selection | - | - | - |";
  const failures = selectedRecords.filter((record) => record.status === CARD_AUDIT_STATUS.FAIL_DOCUMENTED);
  const failureRows = failures.length
    ? failures.map((record) => `| ${record.cardId} | ${escapeCell(record.name)} | ${escapeCell(record.failure?.coreErrorOrDifference)} | ${escapeCell(record.failure?.regression)} |`).join("\n")
    : "| - | No documented failures in this selection | - | - |";
  const rulings = selectedRecords.filter((record) => record.status === CARD_AUDIT_STATUS.NEEDS_RULING);
  const rulingRows = rulings.length
    ? rulings.map((record) => `| ${record.cardId} | ${escapeCell(record.name)} | ${escapeCell(record.evidence?.question)} |`).join("\n")
    : "| - | No historical ruling questions in this selection | - |";
  return `# Card-by-card GOAT audit\n\n`+
    `- Schema: ${manifest.schema}\n- Format: ${manifest.format}\n- Authority: ${manifest.engine}\n- Playable cards: ${manifest.summary.cards}\n- Documentation complete: ${manifest.summary.documentationComplete ? "YES" : "NO"}\n- Repairs allowed: ${manifest.summary.repairsAllowed ? "YES" : "NO"}\n- Repair complete: ${manifest.summary.repairComplete ? "YES" : "NO"}\n\n`+
    `## Status totals\n\n| Status | Cards |\n|---|---:|\n${summaryRows}\n\n`+
    `## Audit strategy\n\nCards are audited batch-first by shared behavior. A parameterized or multi-card scenario may cover several cards, but every card keeps its own fingerprint, obligations, assertions, evidence and final status. Cards with unique text or additional branches are removed from the batch and tested individually.\n\n`+
    `## Progress by family\n\n| Family | Total | PASS_DATA | PASS_EXACT | FAIL_DOCUMENTED | BLOCKED_HARNESS | NEEDS_RULING | UNVERIFIED |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${familyRows}\n\n`+
    `## Documented failures\n\n| ID | Card | Difference | Required regression |\n|---:|---|---|---|\n${failureRows}\n\n`+
    `## Historical rulings pending\n\n| ID | Card | Question |\n|---:|---|---|\n${rulingRows}\n\n`+
    `## Complete card register\n\n| ID | Card | Type | Family | Status | Obligations | Scenarios |\n|---:|---|---|---|---|---:|---:|\n${registerRows}\n\n`+
    `## Selected pending cards\n\n| ID | Card | Family | Status | Obligations |\n|---:|---|---|---|---:|\n${pendingRows}\n`;
}

export const CARD_AUDIT_MANIFEST = buildCardAuditManifest();
const auditByCardId = new Map(CARD_AUDIT_MANIFEST.records.map((record) => [Number(record.cardId), record]));

export function cardAuditRecord(cardId) {
  return auditByCardId.get(Number(cardId)) ?? null;
}

export function cardAuditStatusLabel(status) {
  return CARD_AUDIT_STATUS_LABELS[status] ?? String(status ?? CARD_AUDIT_STATUS.UNVERIFIED);
}

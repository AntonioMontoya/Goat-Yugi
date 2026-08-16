import { DECK_PRESETS } from "../decks/decks.js";
import { buildDeckKnowledge } from "./deck-strategy.js";

const MINIMUM_DISTINCT_CARDS = 3;
let cachedLibrary = null;

function codeOf(card) {
  return Number(card?.runtimeCode ?? card?.code ?? 0);
}

function visibleOpponentCards(observation = {}) {
  return [
    ...(observation.opponentMonsters ?? []),
    ...(observation.opponentBackrow ?? []),
    ...(observation.opponentGrave ?? []),
    ...(observation.opponentBanished ?? []),
    ...(observation.publicChain ?? []).filter((card) => Number(card.controller) !== Number(observation.player)),
  ].filter((card) => card?.known !== false && codeOf(card) > 0);
}

function publicCounts(observation = {}) {
  const counts = new Map();
  for (const card of visibleOpponentCards(observation)) {
    const code = codeOf(card);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  for (const card of observation.opponentSeenCards ?? []) {
    const code = codeOf(card);
    if (code) counts.set(code, Math.max(counts.get(code) ?? 0, Math.max(1, Number(card.count) || 1)));
  }
  return counts;
}

/** Retains only cards that have genuinely become public, never hidden zones. */
export function updateOpponentEvidence(previous = {}, observation = {}) {
  const next = { ...previous };
  for (const [code, count] of publicCounts({ ...observation, opponentSeenCards: [] })) next[String(code)] = Math.max(Number(next[String(code)]) || 0, count);
  return next;
}

export function opponentEvidenceCards(evidence = {}) {
  return Object.entries(evidence).map(([runtimeCode, count]) => ({ runtimeCode: Number(runtimeCode), count: Number(count) || 1, known: true }));
}

function library() {
  if (cachedLibrary) return cachedLibrary;
  const rows = DECK_PRESETS.map((deck) => {
    const knowledge = buildDeckKnowledge(deck.id, deck);
    return {
      deckId: deck.id,
      name: deck.name,
      archetype: deck.archetype,
      mainSize: deck.main.length,
      counts: new Map(knowledge.cards.map((card) => [card.runtimeCode, card.count])),
      rolesByCode: new Map(knowledge.cards.map((card) => [card.runtimeCode, card.roles])),
      roleCounts: { ...knowledge.roles },
    };
  });
  const documentFrequency = new Map();
  for (const row of rows) for (const code of row.counts.keys()) documentFrequency.set(code, (documentFrequency.get(code) ?? 0) + 1);
  cachedLibrary = { rows, documentFrequency };
  return cachedLibrary;
}

function softmax(entries) {
  if (!entries.length) return [];
  const maximum = Math.max(...entries.map((entry) => entry.score));
  const weighted = entries.map((entry) => ({ ...entry, weight: Math.exp(Math.max(-40, entry.score - maximum)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  return weighted.map((entry) => ({ ...entry, probability: entry.weight / total })).sort((left, right) => right.probability - left.probability);
}

/**
 * Infers an opposing archetype only from public cards. Shared staples carry
 * little information; rare cards carry more. Until three distinct cards have
 * been exposed the result stays explicitly provisional.
 */
export function inferOpponentDeck(observation = {}) {
  const seen = publicCounts(observation);
  const distinctSeen = seen.size;
  const { rows, documentFrequency } = library();
  if (!distinctSeen) return { schema: 1, distinctSeen: 0, totalSeen: 0, ready: false, confidence: 0, top: null, candidates: [], risks: {} };

  const candidates = rows.map((row) => {
    let score = 0;
    let matched = 0;
    for (const [code, count] of seen) {
      const copies = row.counts.get(code) ?? 0;
      const rarity = Math.log((rows.length + 1) / ((documentFrequency.get(code) ?? rows.length) + 1)) + 0.15;
      if (!copies) score -= 4.5 * rarity * count;
      else {
        matched += 1;
        score += rarity * (2.2 + Math.min(copies, count) * 0.65);
        if (count > copies) score -= (count - copies) * 1.5;
      }
    }
    return { deckId: row.deckId, name: row.name, archetype: row.archetype, score, matched, row };
  });
  const posterior = softmax(candidates);
  const top = posterior[0] ?? null;
  const runnerUp = posterior[1] ?? null;
  const evidenceCoverage = distinctSeen ? (top?.matched ?? 0) / distinctSeen : 0;
  const separation = Math.max(0, Number(top?.probability ?? 0) - Number(runnerUp?.probability ?? 0));
  const ready = distinctSeen >= MINIMUM_DISTINCT_CARDS && evidenceCoverage >= 0.67;
  const confidence = ready ? Math.min(0.99, (top?.probability ?? 0) * 0.65 + separation * 0.35) : Math.min(0.35, (top?.probability ?? 0) * 0.35);

  const risks = {};
  for (const candidate of posterior.slice(0, 8)) {
    for (const [role, count] of Object.entries(candidate.row.roleCounts)) {
      const density = Math.min(1, Number(count) / Math.max(1, candidate.row.mainSize));
      risks[role] = (risks[role] ?? 0) + candidate.probability * density;
    }
  }
  return {
    schema: 1,
    distinctSeen,
    totalSeen: [...seen.values()].reduce((sum, count) => sum + count, 0),
    ready,
    confidence,
    top: top ? { deckId: top.deckId, name: top.name, archetype: top.archetype, probability: top.probability, matched: top.matched } : null,
    candidates: posterior.slice(0, 5).map(({ deckId, name, archetype, probability, matched }) => ({ deckId, name, archetype, probability, matched })),
    risks,
  };
}

export function resetOpponentModelCache() {
  cachedLibrary = null;
}

export { MINIMUM_DISTINCT_CARDS };

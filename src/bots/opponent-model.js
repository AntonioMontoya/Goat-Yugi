import { DECK_PRESETS } from "../decks/decks.js";
import { buildDeckKnowledge } from "./deck-strategy.js";
import { CARDS } from "../engine/cards.js";

const MINIMUM_DISTINCT_CARDS = 3;
let cachedLibrary = null;
let cachedCardNames = null;

export const SIGNATURE_CARDS = Object.freeze({
  // Burn / Lockdown
  "wave-motion cannon": { archetype: "Burn", deckPattern: /burn|lockdown/i, boost: 18 },
  "stealth bird": { archetype: "Burn", deckPattern: /burn/i, boost: 18 },
  "just desserts": { archetype: "Burn", deckPattern: /burn/i, boost: 18 },
  "secret barrel": { archetype: "Burn", deckPattern: /burn/i, boost: 18 },
  "solar flare dragon": { archetype: "Burn", deckPattern: /burn/i, boost: 18 },
  "lava golem": { archetype: "Burn", deckPattern: /burn/i, boost: 18 },
  "ojama trio": { archetype: "Burn", deckPattern: /burn/i, boost: 18 },

  // Chaos
  "thunder dragon": { archetype: "Chaos / Midrange", deckPattern: /chaos-turbo|chaos/i, boost: 16 },
  "chaos sorcerer": { archetype: "Chaos / Midrange", deckPattern: /chaos/i, boost: 16 },

  // Warrior / Aggro
  "reinforcement of the army": { archetype: "Aggro / Anti-meta", deckPattern: /warrior|aggro/i, boost: 15 },
  "blade knight": { archetype: "Aggro / Anti-meta", deckPattern: /warrior/i, boost: 16 },
  "marauding captain": { archetype: "Aggro / Anti-meta", deckPattern: /warrior/i, boost: 16 },
  "don zaloog": { archetype: "Aggro / Anti-meta", deckPattern: /warrior/i, boost: 15 },
  "command knight": { archetype: "Aggro / Anti-meta", deckPattern: /warrior/i, boost: 15 },
  "exiled force": { archetype: "Aggro / Anti-meta", deckPattern: /warrior/i, boost: 13 },

  // Flip Control / Gravekeeper
  "gravekeeper's spy": { archetype: "Control / Flip", deckPattern: /flip-control|gravekeeper/i, boost: 14 },
  "gravekeeper's guard": { archetype: "Control / Flip", deckPattern: /flip-control|gravekeeper/i, boost: 16 },
  "a cat of ill omen": { archetype: "Control / Flip", deckPattern: /flip-control/i, boost: 16 },
  "morphing jar": { archetype: "Control / Flip", deckPattern: /flip-control|empty-jar/i, boost: 14 },

  // Combo / OTK
  "cyber-stein": { archetype: "Combo / OTK", deckPattern: /cyber-stein|combo/i, boost: 20 },
  "megamorph": { archetype: "Combo / OTK", deckPattern: /cyber-stein|combo/i, boost: 16 },
  "reasoning": { archetype: "Combo / OTK", deckPattern: /reasoning/i, boost: 18 },
  "monster gate": { archetype: "Combo / OTK", deckPattern: /reasoning/i, boost: 18 },
  "dimension fusion": { archetype: "Combo / OTK", deckPattern: /reasoning|dimension|combo/i, boost: 18 },

  // Specific control engines
  "jam breeding machine": { archetype: "Control", deckPattern: /jam-control/i, boost: 20 },
  "relinquished": { archetype: "Control", deckPattern: /relinquished/i, boost: 20 },
  "black illusion ritual": { archetype: "Control", deckPattern: /relinquished/i, boost: 20 },
});

function cardNameLookup() {
  if (cachedCardNames) return cachedCardNames;
  cachedCardNames = new Map();
  for (const card of CARDS) {
    const name = String(card.name ?? "").toLowerCase();
    if (card.authoritative?.runtimeCode) cachedCardNames.set(Number(card.authoritative.runtimeCode), name);
    if (card.id) cachedCardNames.set(Number(card.id), name);
  }
  return cachedCardNames;
}

function codeOf(card) {
  return Number(card?.runtimeCode ?? card?.code ?? 0);
}

// OCGCore uses LOCATION_MZONE=4 and LOCATION_SZONE=8.  A field slot is
// stable while a public card is turned face-down, so it is enough to retain
// the identity by controller, location and sequence.  This memory is only
// updated from cards that were actually public; an initially set monster
// remains unknown.
const PUBLIC_FIELD_LOCATIONS = new Set([4, 8]);

function opponentFieldSlotKey(card) {
  const location = Number(card?.location);
  const controller = Number(card?.controller);
  if (!PUBLIC_FIELD_LOCATIONS.has(location) || !Number.isFinite(controller)) return null;
  const sequence = Number(card?.sequence);
  return `${controller}:${location}:${Number.isFinite(sequence) ? sequence : 0}`;
}

function opponentFieldCards(observation = {}) {
  return [...(observation.opponentMonsters ?? []), ...(observation.opponentBackrow ?? [])].filter(Boolean);
}

/** Retains public opponent identities across a later face-down transition. */
export function updateOpponentFieldMemory(previous = {}, observation = {}) {
  const next = { ...previous };
  const occupied = new Set();
  for (const card of opponentFieldCards(observation)) {
    const key = opponentFieldSlotKey(card);
    if (!key) continue;
    occupied.add(key);
    const code = codeOf(card);
    const publicNow = card.known !== false && (card.faceUp !== false || card.public === true);
    if (publicNow && code > 0) next[key] = { runtimeCode: code, name: card.name ?? null };
  }
  for (const key of Object.keys(next)) if (key.includes(":") && !occupied.has(key)) delete next[key];
  return next;
}

/** Re-attaches only identities already exposed in public information. */
export function restoreRememberedOpponentFieldCards(observation = {}, memory = {}) {
  const restore = (cards = []) => cards.map((card) => {
    const key = opponentFieldSlotKey(card);
    const remembered = key ? memory[key] : null;
    const code = codeOf(remembered);
    if (!remembered || code <= 0 || card?.known !== false) return card;
    return {
      ...card,
      runtimeCode: code,
      name: remembered.name ?? card.name ?? cardNameLookup().get(code) ?? null,
      known: true,
      remembered: true,
      // The identity is known from history, but the card is still face-down
      // and must not be treated as currently face-up/public on the table.
      public: false,
    };
  });
  return {
    ...observation,
    opponentMonsters: restore(observation.opponentMonsters),
    opponentBackrow: restore(observation.opponentBackrow),
  };
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
  if (!distinctSeen) return { schema: 1, distinctSeen: 0, totalSeen: 0, ready: false, confidence: 0, top: null, candidates: [], risks: {}, detectedSignatures: [] };

  const names = cardNameLookup();
  const detectedSignatures = [];
  for (const [code] of seen) {
    const cardName = names.get(code);
    const signature = cardName ? SIGNATURE_CARDS[cardName] : null;
    if (signature) detectedSignatures.push({ cardName, ...signature });
  }

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
    for (const sig of detectedSignatures) {
      if (sig.deckPattern.test(row.deckId) || sig.deckPattern.test(row.name) || sig.deckPattern.test(row.archetype)) {
        score += sig.boost;
      } else {
        score -= sig.boost * 0.75;
      }
    }
    return { deckId: row.deckId, name: row.name, archetype: row.archetype, score, matched, row };
  });
  const posterior = softmax(candidates);
  const top = posterior[0] ?? null;
  const runnerUp = posterior[1] ?? null;
  const evidenceCoverage = distinctSeen ? (top?.matched ?? 0) / distinctSeen : 0;
  const separation = Math.max(0, Number(top?.probability ?? 0) - Number(runnerUp?.probability ?? 0));
  const hasSignature = detectedSignatures.length > 0 && top && detectedSignatures.some((sig) => sig.deckPattern.test(top.deckId) || sig.deckPattern.test(top.name) || sig.deckPattern.test(top.archetype));
  const ready = (distinctSeen >= MINIMUM_DISTINCT_CARDS && evidenceCoverage >= 0.67) || Boolean(hasSignature);
  const confidence = ready
    ? Math.max(hasSignature ? 0.90 : 0.4, Math.min(0.99, (top?.probability ?? 0) * 0.65 + separation * 0.35))
    : Math.min(0.35, (top?.probability ?? 0) * 0.35);

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
    detectedSignatures: detectedSignatures.map((s) => s.cardName),
  };
}

export function resetOpponentModelCache() {
  cachedLibrary = null;
  cachedCardNames = null;
}

export { MINIMUM_DISTINCT_CARDS };

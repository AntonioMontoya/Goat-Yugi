import { DECK_PRESETS } from "../decks/decks.js";
import { SPECIALIST_CERTIFICATIONS } from "./specialist-certifications.js";
import { SPECIALIST_BENCHMARK_ID } from "./specialist-contract.js";
import { SPECIALIST_BASE_MODEL_ID, SPECIALIST_POLICY_SCHEMA } from "./specialist-contract.js";
import { SPECIALIST_MODELS } from "./specialist-models.js";

export const SPECIALIST_PERSONAS = Object.freeze([
  Object.freeze({ id: "oracle", name: "Oracle", label: "Adaptativo", defaultStyle: "balanced", roleWeights: Object.freeze({ search: 0.25, draw: 0.2, interaction: 0.2, "battle-phase": 0.1 }) }),
  Object.freeze({ id: "aegis", name: "Aegis", label: "Control y predicción", defaultStyle: "control", roleWeights: Object.freeze({ interaction: 0.4, defense: 0.35, negate: 0.4, "spell-set": 0.2, "end-phase": -0.15 }) }),
  Object.freeze({ id: "vanguard", name: "Vanguard", label: "Presión calculada", defaultStyle: "pressure", roleWeights: Object.freeze({ summon: 0.3, "special-summon": 0.35, attack: 0.4, lethal: 0.5, "battle-phase": 0.35 }) }),
]);

const deckIds = new Set(DECK_PRESETS.map((deck) => deck.id));
const personaById = new Map(SPECIALIST_PERSONAS.map((persona) => [persona.id, persona]));

export function specialistBotId(deckId, personaId) {
  return `specialist:${encodeURIComponent(deckId)}:${encodeURIComponent(personaId)}`;
}

export function parseSpecialistBotId(value) {
  const match = /^specialist:([^:]+):([^:]+)$/.exec(String(value ?? ""));
  if (!match) return null;
  const deckId = decodeURIComponent(match[1]);
  const personaId = decodeURIComponent(match[2]);
  if (!deckIds.has(deckId) || !personaById.has(personaId)) return null;
  return { deckId, personaId };
}

export function specialistCertification(deckId, personaId) {
  const certification = SPECIALIST_CERTIFICATIONS[`${deckId}:${personaId}`] ?? null;
  const stored = SPECIALIST_MODELS[`${deckId}:${personaId}`] ?? null;
  const model = stored?.schema === SPECIALIST_POLICY_SCHEMA ? stored : null;
  const modelId = model?.modelId ?? SPECIALIST_BASE_MODEL_ID;
  return certification?.benchmark === SPECIALIST_BENCHMARK_ID && certification?.modelId === modelId ? certification : null;
}

export function specialistSpec(deckId, personaId) {
  const deck = DECK_PRESETS.find((entry) => entry.id === deckId);
  const persona = personaById.get(personaId);
  if (!deck || !persona) return null;
  const certification = specialistCertification(deckId, personaId);
  const stored = SPECIALIST_MODELS[`${deckId}:${personaId}`] ?? null;
  const model = stored?.schema === SPECIALIST_POLICY_SCHEMA ? stored : null;
  return {
    id: specialistBotId(deckId, personaId),
    botId: specialistBotId(deckId, personaId),
    name: persona.name,
    algorithm: "ocgcore-public-strategic-v3",
    deckId,
    profile: deckId,
    style: `${persona.label} · ${deck.archetype}`,
    persona,
    policyWeights: { ...(model?.policyWeights ?? {}) },
    decisionConfig: { ...(model?.decisionConfig ?? {}) },
    modelId: model?.modelId ?? SPECIALIST_BASE_MODEL_ID,
    state: certification?.passed ? "Validado" : "Sin certificar",
    intelligence: certification?.passed ? 100 + Number(certification.mmr ?? 0) : 100,
    skillMmr: certification?.passed ? Number(certification.mmr) : 0,
    certification,
    rating: 1200 + Number(certification?.mmr ?? 0),
    difficulty: certification?.mmr >= 400 ? "expert" : certification?.mmr >= 300 ? "hard" : "normal",
  };
}

export function specialistsForDeck(deckId, { certifiedOnly = false } = {}) {
  return SPECIALIST_PERSONAS.map((persona) => specialistSpec(deckId, persona.id)).filter((spec) => spec && (!certifiedOnly || spec.certification?.passed));
}

export function allSpecialistSpecs({ certifiedOnly = false } = {}) {
  return DECK_PRESETS.flatMap((deck) => specialistsForDeck(deck.id, { certifiedOnly }));
}

export function experiencedSpecialistSpecs() {
  return allSpecialistSpecs({ certifiedOnly: true })
    .filter((entry) => Number(entry.skillMmr) >= 200)
    .sort((left, right) => Number(right.skillMmr) - Number(left.skillMmr) || Number(right.certification.winRate) - Number(left.certification.winRate) || left.deckId.localeCompare(right.deckId))
    .slice(0, 5);
}

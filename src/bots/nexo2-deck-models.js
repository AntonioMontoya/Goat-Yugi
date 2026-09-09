/**
 * Nexo 2 Per-Deck Model Registry and Preloaded Catalog.
 * Bundles the 14 specialized deck models trained across 16,800 duels,
 * ensuring they are embedded directly into web, iPad, and desktop builds.
 */

import { hashString } from "../engine/rng.js";
import CHAOS_CONTROL from "../../artifacts/nexo2-decks/chaos-control/candidate.json" with { type: "json" };
import CHAOS_TURBO from "../../artifacts/nexo2-decks/chaos-turbo/candidate.json" with { type: "json" };
import EARTH_AGGRO from "../../artifacts/nexo2-decks/earth-aggro/candidate.json" with { type: "json" };
import EMPTY_JAR from "../../artifacts/nexo2-decks/empty-jar/candidate.json" with { type: "json" };
import FLIP_CONTROL from "../../artifacts/nexo2-decks/flip-control/candidate.json" with { type: "json" };
import GOAT_CONTROL from "../../artifacts/nexo2-decks/goat-control/candidate.json" with { type: "json" };
import GOATFORMAT_DECKOUT from "../../artifacts/nexo2-decks/goatformat-deckout/candidate.json" with { type: "json" };
import GOATFORMAT_LOCKDOWN_BURN from "../../artifacts/nexo2-decks/goatformat-lockdown-burn/candidate.json" with { type: "json" };
import GOATFORMAT_MONARCH from "../../artifacts/nexo2-decks/goatformat-monarch/candidate.json" with { type: "json" };
import GOATFORMAT_STRIKE_NINJA from "../../artifacts/nexo2-decks/goatformat-strike-ninja/candidate.json" with { type: "json" };
import GOATFORMAT_ZOMBIE from "../../artifacts/nexo2-decks/goatformat-zombie/candidate.json" with { type: "json" };
import PANDA_BURN from "../../artifacts/nexo2-decks/panda-burn/candidate.json" with { type: "json" };
import REASONING_GATE from "../../artifacts/nexo2-decks/reasoning-gate/candidate.json" with { type: "json" };
import WARRIOR from "../../artifacts/nexo2-decks/warrior/candidate.json" with { type: "json" };

export const PRELOADED_DECK_MODELS = Object.freeze({
  "chaos-control": CHAOS_CONTROL,
  "chaos-turbo": CHAOS_TURBO,
  "earth-aggro": EARTH_AGGRO,
  "empty-jar": EMPTY_JAR,
  "flip-control": FLIP_CONTROL,
  "goat-control": GOAT_CONTROL,
  "goatformat-deckout": GOATFORMAT_DECKOUT,
  "goatformat-lockdown-burn": GOATFORMAT_LOCKDOWN_BURN,
  "goatformat-monarch": GOATFORMAT_MONARCH,
  "goatformat-strike-ninja": GOATFORMAT_STRIKE_NINJA,
  "goatformat-zombie": GOATFORMAT_ZOMBIE,
  "panda-burn": PANDA_BURN,
  "reasoning-gate": REASONING_GATE,
  "warrior": WARRIOR,
});

export const NEXO2_DECK_MODELS = new Map();
let activeCandidateMetadata = null;

export function validateModelIntegrity(model) {
  if (!model || typeof model !== "object") {
    return { valid: false, reason: "El modelo no es un objeto válido" };
  }

  // Comprobar red neuronal si está presente
  if (model.neuralModel) {
    const net = model.neuralModel;
    const arrayFields = ["w1", "b1", "wp", "wv", "weights"].filter((f) => net[f] != null);
    if (arrayFields.length === 0) {
      return { valid: false, reason: "La red neuronal no contiene capas de pesos (w1, b1, wp, wv o weights)" };
    }
    for (const field of arrayFields) {
      const arr = net[field];
      if (!Array.isArray(arr) && !(arr instanceof Float32Array || arr instanceof Float64Array)) {
        return { valid: false, reason: `El campo ${field} de la red no es un array numérico` };
      }
      for (let i = 0; i < arr.length; i += 1) {
        if (!Number.isFinite(arr[i])) {
          return { valid: false, reason: `Peso no finito o NaN detectado en ${field}[${i}]` };
        }
      }
    }
    if (net.bp != null && !Number.isFinite(net.bp)) {
      return { valid: false, reason: "Sesgo bp no finito o NaN" };
    }
    if (net.bv != null && !Number.isFinite(net.bv)) {
      return { valid: false, reason: "Sesgo bv no finito o NaN" };
    }
  }

  // Comprobar pesos de política si están presentes
  if (model.policyWeights) {
    if (typeof model.policyWeights !== "object") {
      return { valid: false, reason: "policyWeights no es un objeto" };
    }
    for (const [key, val] of Object.entries(model.policyWeights)) {
      if (!Number.isFinite(val)) {
        return { valid: false, reason: `Peso de política '${key}' no es un número finito: ${val}` };
      }
    }
  }

  return { valid: true };
}

export function registerNexo2DeckModel(deckId, model) {
  if (!deckId || !model) return false;
  const integrity = validateModelIntegrity(model);
  if (!integrity.valid) {
    console.warn(`[Nexo2 Registry] Modelo para '${deckId}' descartado por integridad: ${integrity.reason}`);
    return false;
  }
  NEXO2_DECK_MODELS.set(deckId, model);
  return true;
}

export function clearNexo2DeckModels() {
  NEXO2_DECK_MODELS.clear();
  activeCandidateMetadata = null;
}

export function resetToProductionModels() {
  clearNexo2DeckModels();
}

export function registerCandidateManifest(manifest = {}, metadata = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("registerCandidateManifest requiere un manifiesto por mazo.");
  }
  clearNexo2DeckModels();
  let registeredCount = 0;
  for (const [deckId, model] of Object.entries(manifest)) {
    if (registerNexo2DeckModel(deckId, model)) {
      registeredCount += 1;
    }
  }
  activeCandidateMetadata = {
    ...metadata,
    registeredAt: new Date().toISOString(),
    registeredDecks: registeredCount,
    candidateHash: metadata.candidateHash ?? hashString(JSON.stringify(manifest)),
  };
  return activeCandidateMetadata;
}

export function getActiveCandidateMetadata() {
  return activeCandidateMetadata ? { ...activeCandidateMetadata } : null;
}

export function getNexo2DeckModel(deckId) {
  if (!deckId) return null;
  if (NEXO2_DECK_MODELS.has(deckId)) {
    const candidateModel = NEXO2_DECK_MODELS.get(deckId);
    if (validateModelIntegrity(candidateModel).valid) {
      return candidateModel;
    }
  }

  if (PRELOADED_DECK_MODELS[deckId]) {
    const preloaded = PRELOADED_DECK_MODELS[deckId];
    if (validateModelIntegrity(preloaded).valid) {
      return preloaded;
    }
  }

  // Dynamic discovery for other custom deck IDs in Node.js environments
  if (typeof process !== "undefined" && process?.versions?.node) {
    try {
      const fs = globalThis.process?.getBuiltinModule?.("fs");
      const path = globalThis.process?.getBuiltinModule?.("path");
      if (fs && path) {
        const candidatePath = path.resolve(process.cwd(), "artifacts", "nexo2-decks", deckId, "candidate.json");
        if (fs.existsSync(candidatePath)) {
          const raw = fs.readFileSync(candidatePath, "utf8");
          const parsed = JSON.parse(raw);
          if (validateModelIntegrity(parsed).valid) {
            NEXO2_DECK_MODELS.set(deckId, parsed);
            return parsed;
          }
        }
      }
    } catch {
      // Graceful fallback if filesystem access fails
    }
  }

  return null;
}


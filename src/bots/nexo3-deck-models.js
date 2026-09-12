/**
 * Nexo 3 Per-Deck Model Registry and Preloaded Catalog.
 * Handles specialized neural policies and belief-value weights for all 113 decks in Goat Format.
 */

import { hashString } from "../engine/rng.js";
import {
  PRELOADED_DECK_MODELS as PRELOADED_NEXO2,
  validateModelIntegrity,
  NEXO2_DECK_MODELS,
} from "./nexo2-deck-models.js";

export { validateModelIntegrity };

export const PRELOADED_DECK_MODELS = PRELOADED_NEXO2;
export const NEXO3_DECK_MODELS = new Map();
let activeCandidateMetadata = null;

export function registerNexo3DeckModel(deckId, model) {
  if (!deckId || !model) return false;
  const integrity = validateModelIntegrity(model);
  if (!integrity.valid) {
    console.warn(`[Nexo 3 Registry] Modelo para '${deckId}' descartado por integridad: ${integrity.reason}`);
    return false;
  }
  NEXO3_DECK_MODELS.set(deckId, model);
  return true;
}

export const registerNexo2DeckModel = registerNexo3DeckModel;

export function clearNexo3DeckModels() {
  NEXO3_DECK_MODELS.clear();
  activeCandidateMetadata = null;
}

export const clearNexo2DeckModels = clearNexo3DeckModels;

export function resetToProductionModels() {
  clearNexo3DeckModels();
}

export function registerCandidateManifest(manifest = {}, metadata = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("registerCandidateManifest requiere un manifiesto por mazo.");
  }
  clearNexo3DeckModels();
  let registeredCount = 0;
  for (const [deckId, model] of Object.entries(manifest)) {
    if (registerNexo3DeckModel(deckId, model)) {
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

export function getNexo3DeckModel(deckId) {
  if (!deckId) return null;

  // 1. Check in-memory registered models
  if (NEXO3_DECK_MODELS.has(deckId)) {
    const candidateModel = NEXO3_DECK_MODELS.get(deckId);
    if (validateModelIntegrity(candidateModel).valid) {
      return candidateModel;
    }
  }

  // 2. Check legacy in-memory registered models
  if (NEXO2_DECK_MODELS.has(deckId)) {
    const candidateModel = NEXO2_DECK_MODELS.get(deckId);
    if (validateModelIntegrity(candidateModel).valid) {
      return candidateModel;
    }
  }

  // 3. Preloaded bundle catalog (14 baseline decks)
  if (PRELOADED_DECK_MODELS[deckId]) {
    const preloaded = PRELOADED_DECK_MODELS[deckId];
    if (validateModelIntegrity(preloaded).valid) {
      return preloaded;
    }
  }

  // 4. Dynamic discovery for all 113 decks in Node.js environments
  if (typeof process !== "undefined" && process?.versions?.node) {
    try {
      const fsModule = globalThis.process?.getBuiltinModule?.("fs");
      const pathModule = globalThis.process?.getBuiltinModule?.("path");
      if (fsModule && pathModule) {
        const pathsToTry = [
          pathModule.resolve(process.cwd(), "artifacts", "nexo3-decks", deckId, "candidate.json"),
          pathModule.resolve(process.cwd(), "artifacts", "nexo2-decks", deckId, "candidate.json"),
        ];
        for (const candidatePath of pathsToTry) {
          if (fsModule.existsSync(candidatePath)) {
            const raw = fsModule.readFileSync(candidatePath, "utf8");
            const parsed = JSON.parse(raw);
            if (validateModelIntegrity(parsed).valid) {
              NEXO3_DECK_MODELS.set(deckId, parsed);
              return parsed;
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  return null;
}

export const getNexo2DeckModel = getNexo3DeckModel;

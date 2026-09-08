/**
 * Nexo 2 Per-Deck Model Registry and Preloaded Catalog.
 * Bundles the 14 specialized deck models trained across 16,800 duels,
 * ensuring they are embedded directly into web, iPad, and desktop builds.
 */

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

export function registerNexo2DeckModel(deckId, model) {
  if (!deckId || !model) return;
  NEXO2_DECK_MODELS.set(deckId, model);
}

export function clearNexo2DeckModels() {
  NEXO2_DECK_MODELS.clear();
}

export function getNexo2DeckModel(deckId) {
  if (!deckId) return null;
  if (NEXO2_DECK_MODELS.has(deckId)) {
    return NEXO2_DECK_MODELS.get(deckId);
  }

  if (PRELOADED_DECK_MODELS[deckId]) {
    return PRELOADED_DECK_MODELS[deckId];
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
          NEXO2_DECK_MODELS.set(deckId, parsed);
          return parsed;
        }
      }
    } catch {
      // Graceful fallback if filesystem access fails
    }
  }

  return null;
}

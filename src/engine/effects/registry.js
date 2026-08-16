import { DRAW_EFFECTS } from "./draw.js";
import { LIFE_POINT_EFFECTS } from "./life-points.js";
import { POSITION_EFFECTS } from "./position.js";
import { REMOVAL_EFFECTS } from "./removal.js";
import { SUMMON_EFFECTS } from "./summon.js";

const EFFECT_GROUPS = Object.freeze([
  DRAW_EFFECTS,
  LIFE_POINT_EFFECTS,
  POSITION_EFFECTS,
  REMOVAL_EFFECTS,
  SUMMON_EFFECTS,
]);

function buildRegistry(groups) {
  const registry = Object.create(null);
  for (const group of groups) {
    for (const [key, handler] of Object.entries(group)) {
      if (registry[key]) throw new Error(`Efecto duplicado en el registro: ${key}`);
      if (typeof handler !== "function") throw new TypeError(`El efecto ${key} no es una función.`);
      registry[key] = handler;
    }
  }
  return Object.freeze(registry);
}

/**
 * Punto de entrada único del fallback TypeScript. Los nombres de las cartas
 * viven en el catálogo importado; aquí solo se registran funciones reusables.
 */
export const EFFECT_SCRIPTS = buildRegistry(EFFECT_GROUPS);
export const EFFECT_SCRIPT_KEYS = Object.freeze(Object.keys(EFFECT_SCRIPTS).sort());

export function getEffectScript(effectKey) {
  return EFFECT_SCRIPTS[effectKey] ?? null;
}

export function validateEffectRegistry(effectKeys) {
  const requested = new Set(effectKeys);
  return Object.freeze({
    missing: Object.freeze([...requested].filter((key) => !EFFECT_SCRIPTS[key]).sort()),
    registered: EFFECT_SCRIPT_KEYS,
  });
}

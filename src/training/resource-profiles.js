export const RESOURCE_PROFILES = Object.freeze({
  light: Object.freeze({ id: "light", label: "Ligero", workers: 1, maxSteps: 1500 }),
  balanced: Object.freeze({ id: "balanced", label: "Equilibrado", workers: 2, maxSteps: 3000 }),
  intensive: Object.freeze({ id: "intensive", label: "Intensivo", workers: 6, maxSteps: 5000 }),
});

export function resolveResourceProfile(value = "balanced") {
  const key = String(value ?? "balanced").toLowerCase();
  return RESOURCE_PROFILES[key] ?? RESOURCE_PROFILES.balanced;
}

export function mergeResourceBudget(profile, overrides = {}) {
  const base = resolveResourceProfile(profile);
  return {
    profile: base.id,
    workers: Math.max(1, Math.min(6, Math.floor(Number(overrides.workers ?? base.workers) || base.workers))),
    maxSteps: Math.max(100, Math.floor(Number(overrides.maxSteps ?? base.maxSteps) || base.maxSteps)),
  };
}

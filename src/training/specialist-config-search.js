const DEFAULT_CONFIG = Object.freeze({ deckWeight: 1, stateWeight: 1.8, tacticalWeight: 0.5, planningScale: 0.3, policyScale: 1.75, viabilityMargin: 1.5 });

function rng(seed) {
  let state = Number(seed) >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function between(random, minimum, maximum) { return minimum + random() * (maximum - minimum); }
function rounded(value) { return Number(value.toFixed(3)); }

export function normalizeDecisionConfig(source = {}) {
  const number = (key, fallback, minimum, maximum) => {
    const value = Number(source[key]);
    return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : fallback));
  };
  return {
    deckWeight: number("deckWeight", DEFAULT_CONFIG.deckWeight, 0, 3),
    stateWeight: number("stateWeight", DEFAULT_CONFIG.stateWeight, 0, 4),
    tacticalWeight: number("tacticalWeight", DEFAULT_CONFIG.tacticalWeight, 0, 3),
    planningScale: number("planningScale", DEFAULT_CONFIG.planningScale, 0, 1.5),
    policyScale: number("policyScale", DEFAULT_CONFIG.policyScale, 0, 5),
    viabilityMargin: number("viabilityMargin", DEFAULT_CONFIG.viabilityMargin, 0.5, 8),
  };
}

export function decisionConfigCandidates({ seed = 1, count = 12, incumbent = null } = {}) {
  const random = rng(seed);
  const center = incumbent ? normalizeDecisionConfig(incumbent) : null;
  const configs = [normalizeDecisionConfig(), ...(center ? [center] : [])];
  while (configs.length < Math.max(2, count)) {
    const local = center && configs.length % 2 === 0;
    const scale = () => between(random, 0.7, 1.3);
    configs.push(normalizeDecisionConfig(local ? {
      deckWeight: rounded(center.deckWeight * scale()),
      stateWeight: rounded(center.stateWeight * scale()),
      tacticalWeight: rounded(center.tacticalWeight * scale()),
      planningScale: rounded(center.planningScale * scale()),
      policyScale: rounded(center.policyScale * scale()),
      viabilityMargin: rounded(center.viabilityMargin * scale()),
    } : {
      deckWeight: rounded(between(random, 0.45, 1.8)),
      stateWeight: rounded(between(random, 0.8, 3.2)),
      tacticalWeight: rounded(between(random, 0.15, 2.2)),
      planningScale: rounded(between(random, 0.1, 0.95)),
      policyScale: rounded(between(random, 1.2, 3.5)),
      viabilityMargin: rounded(between(random, 1, 4.5)),
    }));
  }
  return [...new Map(configs.map((config) => [JSON.stringify(config), config])).values()];
}

export { DEFAULT_CONFIG };

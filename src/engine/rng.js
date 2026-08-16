/** Small deterministic PRNG. It is deliberately serialisable for replays. */
export class SeededRng {
  constructor(seed = 1) {
    this.seed = Number(seed) >>> 0;
    this.state = this.seed || 0x6d2b79f5;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  integer(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick(values) {
    return values[this.integer(values.length)];
  }

  shuffle(values) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = this.integer(i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
}

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

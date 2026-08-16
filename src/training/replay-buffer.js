import { SeededRng, hashString } from "../engine/rng.js";

/**
 * Bounded replay buffer for local experiments. It stores compact decision
 * summaries, never a live engine state, and supports deterministic sampling.
 */
export class ReplayBuffer {
  constructor({ capacity = 10000, seed = 1 } = {}) {
    this.capacity = Math.max(1, Math.floor(Number(capacity) || 1));
    this.seed = Number(seed) >>> 0 || 1;
    this.rng = new SeededRng(this.seed);
    this.entries = [];
    this.seen = 0;
  }

  add(entry, { priority = 1 } = {}) {
    if (!entry || typeof entry !== "object") throw new Error("ReplayBuffer solo acepta experiencias objeto.");
    const normalized = {
      id: entry.id ?? hashString(JSON.stringify(entry)),
      observation: entry.observation ?? null,
      action: entry.action ?? null,
      reward: Number(entry.reward) || 0,
      done: Boolean(entry.done),
      priority: Math.max(0.0001, Number(priority) || 1),
      metadata: entry.metadata ? structuredClone(entry.metadata) : null,
    };
    this.seen += 1;
    if (this.entries.length < this.capacity) this.entries.push(normalized);
    else {
      const replacement = this.rng.integer(this.seen);
      if (replacement < this.capacity) this.entries[replacement] = normalized;
    }
    return normalized.id;
  }

  addMany(entries, options = {}) {
    for (const entry of entries ?? []) this.add(entry, options);
    return this.size;
  }

  sample(count = 1, { prioritized = true } = {}) {
    const amount = Math.max(0, Math.min(this.size, Math.floor(Number(count) || 0)));
    const pool = this.entries.map((entry, index) => ({ entry, index }));
    const selected = [];
    while (selected.length < amount && pool.length) {
      let picked = 0;
      if (prioritized) {
        const total = pool.reduce((sum, item) => sum + item.entry.priority, 0);
        let cursor = this.rng.next() * total;
        for (let index = 0; index < pool.length; index += 1) {
          cursor -= pool[index].entry.priority;
          if (cursor <= 0) { picked = index; break; }
        }
      } else picked = this.rng.integer(pool.length);
      selected.push(structuredClone(pool[picked].entry));
      pool.splice(picked, 1);
    }
    return selected;
  }

  clear() {
    this.entries = [];
    this.seen = 0;
  }

  get size() { return this.entries.length; }

  stats() {
    const rewards = this.entries.map((entry) => entry.reward);
    return {
      capacity: this.capacity,
      size: this.size,
      seen: this.seen,
      positives: rewards.filter((reward) => reward > 0).length,
      negatives: rewards.filter((reward) => reward < 0).length,
      terminal: this.entries.filter((entry) => entry.done).length,
      rewardMean: rewards.length ? rewards.reduce((sum, reward) => sum + reward, 0) / rewards.length : 0,
    };
  }

  toJSON() {
    return { schema: 1, capacity: this.capacity, seed: this.seed, seen: this.seen, entries: structuredClone(this.entries) };
  }

  static fromJSON(value) {
    if (!value || value.schema !== 1 || !Array.isArray(value.entries)) throw new Error("ReplayBuffer incompatible o corrupto.");
    const buffer = new ReplayBuffer({ capacity: value.capacity, seed: value.seed });
    buffer.entries = structuredClone(value.entries).slice(0, buffer.capacity);
    buffer.seen = Math.max(buffer.entries.length, Number(value.seen) || buffer.entries.length);
    return buffer;
  }
}

export function createReplayBuffer(options) {
  return new ReplayBuffer(options);
}

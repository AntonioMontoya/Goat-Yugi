const RECIPES = Object.freeze({
  turn: [{ frequency: 392, duration: 0.1 }, { frequency: 523.25, delay: 0.08, duration: 0.2 }],
  phase: [{ frequency: 659.25, duration: 0.08 }, { frequency: 987.77, delay: 0.07, duration: 0.16 }],
  activate: [{ frequency: 150, type: "triangle", duration: 0.07 }, { frequency: 420, delay: 0.025, duration: 0.11 }, { frequency: 210, delay: 0.06, duration: 0.09, gain: 0.2 }],
  summon: [{ frequency: 196, type: "sawtooth", duration: 0.08 }, { frequency: 392, delay: 0.06, duration: 0.18 }, { frequency: 294, delay: 0.04, duration: 0.15, gain: 0.25 }],
  attack: [{ frequency: 110, type: "sawtooth", duration: 0.13 }, { frequency: 82.41, delay: 0.08, duration: 0.16 }, { frequency: 55, type: "sawtooth", delay: 0.12, duration: 0.1, gain: 0.3 }],
  flip: [{ frequency: 280, type: "triangle", duration: 0.06 }, { frequency: 620, delay: 0.045, duration: 0.1 }],
  resolve: [{ frequency: 440, duration: 0.08 }, { frequency: 659.25, delay: 0.07, duration: 0.14 }],
  move: [{ frequency: 520, type: "sine", duration: 0.07 }],
  damage: [{ frequency: 92.5, type: "square", duration: 0.15 }, { frequency: 61.74, delay: 0.06, duration: 0.2 }, { frequency: 46.25, type: "square", delay: 0.1, duration: 0.15, gain: 0.25 }],
});

export function soundRecipeFor(soundId, chainLink = 1) {
  if (soundId === "chain") {
    const base = Math.min(880, 330 + Math.max(0, Number(chainLink) - 1) * 85);
    return [{ frequency: base, duration: 0.08 }, { frequency: base * 1.5, delay: 0.07, duration: 0.16 }];
  }
  return (RECIPES[soundId] ?? RECIPES.resolve).map((tone) => ({ ...tone }));
}

export function createDuelAudioController({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  let context = null;
  let unlocked = false;

  function ensureContext() {
    if (context) return context;
    const AudioContext = windowRef?.AudioContext ?? windowRef?.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    return context;
  }

  async function unlock() {
    const audio = ensureContext();
    if (!audio) return false;
    try {
      if (audio.state === "suspended") await audio.resume();
      unlocked = audio.state === "running";
    } catch {
      unlocked = false;
    }
    return unlocked;
  }

  function play(soundId, { chainLink = 1, enabled = true, volume = 0.35, volumeScale = 1.0 } = {}) {
    if (!enabled || !unlocked || documentRef?.hidden) return false;
    const audio = ensureContext();
    if (!audio || audio.state !== "running") return false;
    const level = Math.max(0, Math.min(1, Number(volume) || 0)) * 0.18;
    const start = audio.currentTime + 0.008;
    for (const tone of soundRecipeFor(soundId, chainLink)) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const toneStart = start + (tone.delay ?? 0);
      oscillator.type = tone.type ?? "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * volumeScale * (tone.gain ?? 1.0)), toneStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + tone.duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + tone.duration + 0.02);
    }
    return true;
  }

  function dispose() {
    const pending = context;
    context = null;
    unlocked = false;
    pending?.close?.();
  }

  return { unlock, play, dispose, get unlocked() { return unlocked; } };
}

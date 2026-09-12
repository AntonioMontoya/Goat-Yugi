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

export const MENU_TRACK_FILES = Object.freeze(["Intro1.wav", "Intro2.wav"]);
export const DUEL_TRACK_FILES = Object.freeze(["In-Game.wav", "In-Game2.wav"]);
export const AUDIO_EFFECT_FILES = Object.freeze({
  matchmaking: "Matchmaking.wav",
  victory: "Victoria.wav",
  defeat: "Derrota.wav",
});

export const DEFAULT_MENU_PLAYS_BEFORE_SWAP = 3;

const MUSIC_VOLUME_SCALE = 0.58;
const EFFECT_VOLUME_SCALE = 0.9;

function clamp(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function randomIndex(random, length) {
  if (!length) return -1;
  const value = Number(random?.());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : Math.random();
  return Math.floor(normalized * length);
}

function randomFile(files, random, previous = null) {
  const pool = files.length > 1 && previous ? files.filter((file) => file !== previous) : files;
  return pool[randomIndex(random, pool.length)] ?? files[0] ?? null;
}

function fileForAsset(soundId) { return AUDIO_EFFECT_FILES[soundId] ?? null; }

export function audioAssetUrl(fileName, baseUrl = "") {
  const encodedName = String(fileName ?? "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const relative = `./Sonidos/${encodedName}`;
  if (!baseUrl || String(baseUrl).startsWith("about:")) return relative;
  try {
    return new URL(relative, baseUrl).href;
  } catch {
    return relative;
  }
}

export function resultSoundFor(result) {
  return result === "win" ? "victory" : result === "loss" ? "defeat" : null;
}

export function soundRecipeFor(soundId, chainLink = 1) {
  if (soundId === "chain") {
    const base = Math.min(880, 330 + Math.max(0, Number(chainLink) - 1) * 85);
    return [{ frequency: base, duration: 0.08 }, { frequency: base * 1.5, delay: 0.07, duration: 0.16 }];
  }
  return (RECIPES[soundId] ?? RECIPES.resolve).map((tone) => ({ ...tone }));
}

export function createDuelAudioController({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  audioFactory = null,
  random = Math.random,
  menuPlaysBeforeSwap = DEFAULT_MENU_PLAYS_BEFORE_SWAP,
} = {}) {
  let context = null;
  let unlocked = false;
  let activeMusic = null;
  let pendingMusic = null;
  let hidden = Boolean(documentRef?.hidden);
  let preferences = { enabled: true, volume: 0.35 };
  let lastMenuTrack = null;
  const activeEffects = new Set();

  function ensureContext() {
    if (context) return context;
    const AudioContext = windowRef?.AudioContext ?? windowRef?.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    return context;
  }

  function baseUrl() {
    return documentRef?.baseURI ?? windowRef?.location?.href ?? "";
  }

  function createAudio(fileName) {
    const url = audioAssetUrl(fileName, baseUrl());
    let audio = null;
    try {
      if (typeof audioFactory === "function") audio = audioFactory(url, fileName);
      else {
        const AudioCtor = windowRef?.Audio ?? globalThis.Audio;
        if (typeof AudioCtor === "function") audio = new AudioCtor(url);
        else audio = documentRef?.createElement?.("audio") ?? null;
      }
    } catch {
      audio = null;
    }
    if (!audio) return null;
    if (!audio.src) {
      try { audio.src = url; } catch { /* Some test doubles expose a read-only src. */ }
    }
    try {
      audio.preload = "auto";
      audio.autoplay = false;
      audio.controls = false;
      audio.loop = false;
    } catch { /* Audio attributes are optional in locked-down WebViews. */ }
    return audio;
  }

  function playElement(audio) {
    if (!audio || typeof audio.play !== "function") return false;
    try {
      const result = audio.play();
      result?.catch?.(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function stopElement(audio) {
    if (!audio) return;
    try { audio.pause?.(); } catch { /* Best effort. */ }
    try { audio.currentTime = 0; } catch { /* Best effort. */ }
    try { audio.removeAttribute?.("src"); } catch { /* Best effort. */ }
    try { audio.load?.(); } catch { /* Best effort. */ }
  }

  function setElementVolume(audio, value) {
    try { audio.volume = clamp(value); } catch { /* Some test doubles do not expose volume. */ }
  }

  function stopMusicElement(entry) {
    if (!entry?.audio) return;
    entry.audio.removeEventListener?.("ended", entry.onEnded);
    if (entry.audio.onended === entry.onEnded) entry.audio.onended = null;
    stopElement(entry.audio);
  }

  function activateMusic(request) {
    if (!request || !preferences.enabled || hidden || !unlocked) return false;

    const sameTrack = activeMusic
      && activeMusic.kind === request.kind
      && activeMusic.sessionKey === request.sessionKey
      && (!request.file || activeMusic.file === request.file);
    if (sameTrack) {
      setElementVolume(activeMusic.audio, preferences.volume * MUSIC_VOLUME_SCALE);
      if (activeMusic.audio.paused !== false) playElement(activeMusic.audio);
      return true;
    }

    stopMusicElement(activeMusic);
    activeMusic = null;

    const files = request.kind === "menu" ? MENU_TRACK_FILES : DUEL_TRACK_FILES;
    const file = request.file ?? randomFile(files, random, request.kind === "menu" ? lastMenuTrack : null);
    const audio = createAudio(file);
    if (!audio) return false;

    const entry = {
      audio,
      file,
      kind: request.kind,
      sessionKey: request.sessionKey,
      plays: 0,
      onEnded: null,
    };
    const onEnded = () => {
      if (activeMusic !== entry || !preferences.enabled || hidden || !unlocked) return;
      if (entry.kind === "menu") {
        entry.plays += 1;
        if (entry.plays >= Math.max(1, Number(menuPlaysBeforeSwap) || DEFAULT_MENU_PLAYS_BEFORE_SWAP)) {
          lastMenuTrack = entry.file;
          activateMusic({
            kind: "menu",
            sessionKey: "menu",
            file: randomFile(MENU_TRACK_FILES, random, entry.file),
          });
          return;
        }
      }
      try { entry.audio.currentTime = 0; } catch { /* Best effort. */ }
      playElement(entry.audio);
    };
    entry.onEnded = onEnded;
    if (typeof audio.addEventListener === "function") audio.addEventListener("ended", onEnded);
    else audio.onended = onEnded;
    setElementVolume(audio, preferences.volume * MUSIC_VOLUME_SCALE);
    activeMusic = entry;
    return playElement(audio);
  }

  function requestMusic(kind, sessionKey, file = null) {
    const request = { kind, sessionKey, file };
    pendingMusic = request;
    if (!unlocked || !preferences.enabled || hidden) return false;
    pendingMusic = null;
    return activateMusic(request);
  }

  function flushMusic() {
    if (!preferences.enabled || hidden || !unlocked) return false;
    if (pendingMusic) {
      const request = pendingMusic;
      pendingMusic = null;
      return activateMusic(request);
    }
    if (activeMusic) {
      setElementVolume(activeMusic.audio, preferences.volume * MUSIC_VOLUME_SCALE);
      return playElement(activeMusic.audio);
    }
    return false;
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
    if (unlocked) flushMusic();
    return unlocked;
  }

  function playAssetFile(fileName, { enabled = preferences.enabled, volume = preferences.volume, volumeScale = EFFECT_VOLUME_SCALE } = {}) {
    if (!enabled || !unlocked || hidden) return false;
    const audio = createAudio(fileName);
    if (!audio) return false;
    setElementVolume(audio, clamp(volume) * clamp(volumeScale));
    const cleanup = () => {
      activeEffects.delete(audio);
      audio.removeEventListener?.("ended", cleanup);
      if (audio.onended === cleanup) audio.onended = null;
    };
    activeEffects.add(audio);
    if (typeof audio.addEventListener === "function") audio.addEventListener("ended", cleanup);
    else audio.onended = cleanup;
    const played = playElement(audio);
    if (!played) cleanup();
    return played;
  }

  function playAsset(soundId, options = {}) {
    const fileName = options.fileName ?? fileForAsset(soundId);
    return fileName ? playAssetFile(fileName, options) : false;
  }

  function play(soundId, { chainLink = 1, enabled = preferences.enabled, volume = preferences.volume, volumeScale = 1.0 } = {}) {
    if (fileForAsset(soundId)) return playAsset(soundId, { enabled, volume, volumeScale });
    if (!enabled || !unlocked || hidden) return false;
    const audio = ensureContext();
    if (!audio || audio.state !== "running") return false;
    const level = clamp(volume) * 0.18;
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

  function setPreferences({ enabled = preferences.enabled, volume = preferences.volume } = {}) {
    const wasEnabled = preferences.enabled;
    preferences = { enabled: enabled !== false, volume: clamp(volume, preferences.volume) };
    if (!preferences.enabled) {
      for (const effect of activeEffects) {
        try { effect.pause?.(); effect.currentTime = 0; } catch { /* Best effort. */ }
      }
      activeEffects.clear();
      activeMusic?.audio?.pause?.();
      return;
    }
    if (activeMusic) setElementVolume(activeMusic.audio, preferences.volume * MUSIC_VOLUME_SCALE);
    if (!wasEnabled && preferences.enabled) flushMusic();
  }

  function setHidden(nextHidden) {
    hidden = Boolean(nextHidden);
    if (hidden) {
      activeMusic?.audio?.pause?.();
      return;
    }
    flushMusic();
  }

  function startMenuMusic() {
    return requestMusic("menu", "menu");
  }

  function startDuelMusic(sessionKey = "duel") {
    return requestMusic("duel", String(sessionKey));
  }

  function stopMusic() {
    pendingMusic = null;
    stopMusicElement(activeMusic);
    activeMusic = null;
  }

  function dispose() {
    stopMusic();
    for (const effect of activeEffects) stopElement(effect);
    activeEffects.clear();
    const pending = context;
    context = null;
    unlocked = false;
    pending?.close?.();
  }

  return {
    unlock,
    play,
    playAsset,
    setPreferences,
    setHidden,
    startMenuMusic,
    startDuelMusic,
    stopMusic,
    dispose,
    get unlocked() { return unlocked; },
    get activeMusicFile() { return activeMusic?.file ?? null; },
    get activeMusicKind() { return activeMusic?.kind ?? null; },
  };
}

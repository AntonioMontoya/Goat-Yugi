import { resultSoundFor } from "./duel-audio.js";

function settingsOf(getSettings) {
  const settings = getSettings?.() ?? {};
  return { enabled: settings.sfxEnabled, volume: Number(settings.sfxVolume) / 100 };
}

export function syncAppAudio({ app, audio }) {
  audio.setPreferences(settingsOf(() => app.settings));
  const duelIsActive = app.mode === "duel"
    && !app.duelError
    && (!app.duel || app.duel.winner === null || app.duel.winner === undefined);
  if (duelIsActive) return audio.startDuelMusic(app.duelAudioSessionKey ?? app.duel?.seed ?? "duel");
  if (app.mode !== "duel") return audio.startMenuMusic();
  audio.stopMusic();
  return false;
}

export function playDuelResultAudio({ app, audio, result }) {
  const soundId = resultSoundFor(result);
  const cueKey = `${app.duelAudioSessionKey ?? app.duel?.seed}:${result}`;
  if (app.lastDuelResultCueKey === cueKey) return;
  app.lastDuelResultCueKey = cueKey;
  if (soundId) audio.playAsset(soundId, settingsOf(() => app.settings));
}

export function playMatchmakingAudio({ app, audio }) {
  audio.playAsset("matchmaking", settingsOf(() => app.settings));
}

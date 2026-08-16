export function beginDuelLoad(app) {
  const epoch = Math.max(0, Number(app.duelLoadEpoch) || 0) + 1;
  app.duelLoadEpoch = epoch;
  return epoch;
}

export function isCurrentDuelLoad(app, epoch) {
  return Number(app.duelLoadEpoch) === Number(epoch);
}

export function acceptDuelLoad(app, epoch, session) {
  if (isCurrentDuelLoad(app, epoch)) return true;
  session?.destroy?.();
  return false;
}

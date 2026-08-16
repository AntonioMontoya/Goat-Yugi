function textAmount(card, pattern) {
  const match = String(card.text ?? "").replace(/\s+/g, " ").match(pattern);
  return match ? Number(match[1]) : 0;
}

export const LIFE_POINT_EFFECTS = Object.freeze({
  DAMAGE_OPPONENT_FIXED(api, { card }) {
    const amount = textAmount(card, /(?:inflict|inflicts)\s+(\d+)(?: points of)?(?: direct)? damage to your opponent(?:'s)?(?: life points)?/i);
    if (amount) api.damage(amount, api.opponentId);
  },

  RECOVER_SELF_FIXED(api, { card }) {
    const amount = textAmount(card, /increase(?:s)? your life points by (\d+) points?/i);
    if (amount) api.recover(amount, api.actorId);
  },

  RECOVER_BOTH_FIXED(api) {
    api.recover(1000, api.actorId);
    api.recover(1000, api.opponentId);
  },

  DAMAGE_AND_RECOVER_SELF(api) {
    api.damage(500, api.opponentId);
    api.recover(500, api.actorId);
  },

  DAMAGE_BOTH_FIXED(api) {
    api.damage(1000, api.opponentId);
    api.damage(500, api.actorId);
  },

  DAMAGE_PER_OPPONENT_MONSTER(api) {
    api.damage(api.select({ zone: "MONSTER", scope: "OPPONENT" }).length * 500, api.opponentId);
  },

  DAMAGE_PER_OPPONENT_HAND(api) {
    api.damage(api.select({ zone: "HAND", scope: "OPPONENT" }).length * 200, api.opponentId);
  },

  DAMAGE_PER_OPPONENT_GRAVE(api) {
    api.damage(api.select({ zone: "GRAVE", scope: "OPPONENT" }).length * 100, api.opponentId);
  },

  DAMAGE_PER_OPPONENT_BANISHED(api) {
    api.damage(api.select({ zone: "BANISHED", scope: "OPPONENT" }).length * 300, api.opponentId);
  },

  DAMAGE_PER_SELF_FACEUP_LIGHT(api) {
    api.damage(api.select({ zone: "MONSTER", scope: "SELF", faceUp: true, attribute: "Light" }).length * 600, api.opponentId);
  },

  DESTROY_SELF_MONSTERS_DAMAGE_COUNT(api) {
    const targets = api.select({ zone: "MONSTER", scope: "SELF" });
    for (const uid of targets) api.destroy(uid, "destroy-self-monsters");
    api.damage(targets.length * 300, api.opponentId);
  },

  DESTROY_TOKENS_RECOVER(api) {
    const targets = api.select({ zone: "FIELD", scope: "FIELD", kind: "TOKEN" });
    for (const uid of targets) api.destroy(uid, "destroy-tokens");
    api.recover(targets.length * 800, api.actorId);
  },
});

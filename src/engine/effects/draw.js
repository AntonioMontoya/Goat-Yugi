export const DRAW_EFFECTS = Object.freeze({
  DRAW_1(api) {
    api.draw(1);
  },

  DRAW_2(api) {
    api.draw(2);
  },

  DRAW_1_THEN_OPPONENT_RECOVERS(api) {
    api.draw(1);
    api.recover(1000, api.opponentId);
  },

  DRAW_3_DISCARD_2(api) {
    api.draw(3);
    api.discard(2, api.actorId, { strategy: "lowest-value" });
  },
});

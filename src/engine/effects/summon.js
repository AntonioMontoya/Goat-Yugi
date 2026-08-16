import { MONSTER_POSITION } from "../constants.js";

export const SUMMON_EFFECTS = Object.freeze({
  SCAPEGOAT(api) {
    api.summon({
      cardId: 17,
      playerId: api.actorId,
      count: 4,
      position: MONSTER_POSITION.DEFENSE,
      faceUp: true,
      token: true,
    });
    api.restrict({ playerId: api.actorId, key: "normalSummon", value: false, until: "END_PHASE" });
  },
});

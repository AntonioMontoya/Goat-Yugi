import { MONSTER_POSITION } from "../constants.js";

export const POSITION_EFFECTS = Object.freeze({
  BOOK_OF_MOON(api, { action }) {
    if (action.targetUid) api.changePosition(action.targetUid, MONSTER_POSITION.DEFENSE, false);
  },

  POSITION_ALL_OPPONENT(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "OPPONENT", faceUp: true })) api.changePosition(uid, "TOGGLE", true);
  },

  POSITION_ALL_FIELD(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "FIELD", faceUp: true })) api.changePosition(uid, "TOGGLE", true);
  },

  POSITION_ALL_FACEUP_DEFENSE(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "FIELD", faceUp: true })) api.changePosition(uid, MONSTER_POSITION.DEFENSE, true);
  },

  POSITION_ALL_SELF_FACEUP_DEFENSE(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "SELF", faceUp: true })) api.changePosition(uid, MONSTER_POSITION.DEFENSE, true);
  },

  BLOCK_ATTACK(api, { action }) {
    if (action.targetUid) api.changePosition(action.targetUid, MONSTER_POSITION.DEFENSE, true);
  },

  BOOK_OF_TAIYOU(api, { action }) {
    if (action.targetUid) api.changePosition(action.targetUid, MONSTER_POSITION.ATTACK, true);
  },

  READY_FOR_INTERCEPTING(api, { action }) {
    if (action.targetUid) api.changePosition(action.targetUid, MONSTER_POSITION.DEFENSE, false);
  },
});

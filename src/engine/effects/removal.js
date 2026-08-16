export const REMOVAL_EFFECTS = Object.freeze({
  MST(api, { action }) {
    if (action.targetUid) api.destroy(action.targetUid, "MST");
  },

  HEAVY_STORM(api) {
    for (const uid of api.select({ zone: "SPELL_TRAP", scope: "FIELD" })) api.destroy(uid, "heavy-storm");
  },

  LIGHTNING_VORTEX(api) {
    if (!api.discard(1, api.actorId, { strategy: "lowest-value", required: true })) return;
    for (const uid of api.select({ zone: "MONSTER", scope: "OPPONENT", faceUp: true })) api.destroy(uid, "lightning-vortex");
  },

  DESTROY_ALL_MACHINE(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "FIELD", faceUp: true, race: "Machine" })) api.destroy(uid, "destroy-all-machine");
  },

  DESTROY_ALL_FIEND(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "FIELD", faceUp: true, race: "Fiend" })) api.destroy(uid, "destroy-all-fiend");
  },

  DESTROY_FACEUP_MONSTER(api, { action }) {
    if (action.targetUid) api.destroy(action.targetUid, "destroy-faceup-monster");
  },

  DESTROY_FACEUP_TRAP(api, { action }) {
    if (action.targetUid) api.destroy(action.targetUid, "destroy-faceup-trap");
  },

  RETURN_ALL_SPELL_TRAP(api) {
    for (const uid of api.select({ zone: "SPELL_TRAP", scope: "FIELD" })) api.returnToHand(uid, "return-all-spell-trap");
  },

  DESTROY_ALL_EQUIP(api) {
    for (const uid of api.select({ zone: "SPELL_TRAP", scope: "FIELD", spellType: "EQUIP" })) api.destroy(uid, "destroy-all-equip");
  },

  DESTROY_ALL_EQUIPPED_MONSTERS(api) {
    for (const uid of api.select({ zone: "MONSTER", scope: "FIELD", equipped: true })) api.destroy(uid, "destroy-all-equipped-monsters");
  },

  OFFERINGS_TO_THE_DOOMED(api, { action }) {
    if (!action.targetUid) return;
    api.destroy(action.targetUid, "offerings-to-the-doomed");
    api.restrict({ playerId: api.actorId, key: "skipDraw", value: true });
  },

  FISSURE(api, { action }) {
    if (action.targetUid) api.destroy(action.targetUid, "fissure");
  },

  HAMMER_SHOT(api, { action }) {
    if (action.targetUid) api.destroy(action.targetUid, "hammer-shot");
  },

  DARK_CORE(api, { action }) {
    if (!api.discard(1, api.actorId, { strategy: "lowest-value", required: true })) return;
    if (action.targetUid) api.banish(action.targetUid, "dark-core");
  },

  RAIGEKI_BREAK(api, { action }) {
    if (!api.discard(1, api.actorId, { strategy: "lowest-value", required: true })) return;
    if (action.targetUid) api.destroy(action.targetUid, "raigeki-break");
  },
});

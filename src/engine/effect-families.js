import { CARD_KIND, VALIDATION_STATUS } from "./constants.js";

function normalizedText(text) {
  return String(text ?? "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const exact = (value) => ({ text }) => normalizedText(text) === normalizedText(value);

/**
 * Declarative effect templates. A card is only promoted to SUPPORTED when its
 * historical text matches a complete, already-tested engine primitive. The
 * remaining cards still get a family for search/training features, but stay
 * UNSUPPORTED instead of receiving an unsafe best-effort script.
 */
export const EFFECT_TEMPLATES = Object.freeze([
  { key: "NORMAL_MONSTER", family: "NORMAL", effect: "NORMAL", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype }) => kind === CARD_KIND.MONSTER && /^normal$/i.test(String(subtype ?? "")) },
  { key: "DRAW_1", family: "DRAW", effect: "DRAW_1", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Draw 1 card from your Deck.")({ text }) },
  { key: "DRAW_1_THEN_OPPONENT_RECOVERS", family: "DRAW", effect: "DRAW_1_THEN_OPPONENT_RECOVERS", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Draw 1 card, then your opponent gains 1000 Life Points.")({ text }) },
  { key: "DRAW_2", family: "DRAW", effect: "DRAW_2", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^(normal|quick-play)$/i.test(String(subtype ?? "")) && exact("Draw 2 cards.")({ text }) },
  { key: "DRAW_3_DISCARD_2", family: "DRAW_DISCARD", effect: "DRAW_3_DISCARD_2", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Draw 3 cards, then discard 2 cards.")({ text }) },
  { key: "BOOK_OF_MOON", family: "POSITION", effect: "BOOK_OF_MOON", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^quick-play$/i.test(String(subtype ?? "")) && exact("Change 1 face-up monster to face-down Defense Position.")({ text }) },
  { key: "MST", family: "REMOVAL", effect: "MST", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^quick-play$/i.test(String(subtype ?? "")) && exact("Destroy 1 Spell or Trap Card on the field.")({ text }) },
  { key: "HEAVY_STORM", family: "REMOVAL", effect: "HEAVY_STORM", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all Spell and Trap Cards on the field.")({ text }) },
  { key: "LIGHTNING_VORTEX", family: "REMOVAL", effect: "LIGHTNING_VORTEX", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Discard 1 card; destroy all face-up monsters your opponent controls.")({ text }) },
  { key: "SCAPEGOAT", family: "SPECIAL_SUMMON", effect: "SCAPEGOAT", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^quick-play$/i.test(String(subtype ?? "")) && exact("Special Summon 4 Sheep Tokens. You cannot Normal Summon or Set during this turn.")({ text }) },
  { key: "POSITION_ALL_OPPONENT", family: "POSITION", effect: "POSITION_ALL_OPPONENT", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Change the battle positions of all face-up monsters your opponent controls.")({ text }) },
  { key: "POSITION_ALL_FIELD", family: "POSITION", effect: "POSITION_ALL_FIELD", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Change the battle positions of all face-up monsters on the field.")({ text }) },
  { key: "DESTROY_ALL_MACHINE", family: "REMOVAL", effect: "DESTROY_ALL_MACHINE", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all face-up Machine-Type monsters on the field.")({ text }) },
  { key: "DESTROY_ALL_FIEND", family: "REMOVAL", effect: "DESTROY_ALL_FIEND", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all face-up Fiend-Type monsters on the field.")({ text }) },
  { key: "DESTROY_FACEUP_MONSTER", family: "REMOVAL", effect: "DESTROY_FACEUP_MONSTER", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^(normal|quick-play)$/i.test(String(subtype ?? "")) && exact("Destroy 1 face-up monster.")({ text }) },
  { key: "DESTROY_FACEUP_TRAP", family: "REMOVAL", effect: "DESTROY_FACEUP_TRAP", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroys 1 face-up Trap Card on the field.")({ text }) },
  { key: "RETURN_ALL_SPELL_TRAP", family: "REMOVAL", effect: "RETURN_ALL_SPELL_TRAP", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Return all Spell and Trap Cards on the field to the hand.")({ text }) },
  { key: "DESTROY_ALL_EQUIP", family: "REMOVAL", effect: "DESTROY_ALL_EQUIP", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all Equip Cards on the field.")({ text }) },
  { key: "DESTROY_ALL_EQUIPPED_MONSTERS", family: "REMOVAL", effect: "DESTROY_ALL_EQUIPPED_MONSTERS", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all monsters equipped with Equip Cards.")({ text }) },
  { key: "DESTROY_ALL_EQUIPPED_MONSTERS_TRAP", family: "REMOVAL", effect: "DESTROY_ALL_EQUIPPED_MONSTERS", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all monsters equipped with an Equip Card(s).")({ text }) },
  { key: "POSITION_ALL_FACEUP_DEFENSE", family: "POSITION", effect: "POSITION_ALL_FACEUP_DEFENSE", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Change all face-up monsters to Defense Position.")({ text }) },
  { key: "POSITION_ALL_SELF_FACEUP_DEFENSE", family: "POSITION", effect: "POSITION_ALL_SELF_FACEUP_DEFENSE", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("All monsters on your side of the field are changed to face-up Defense Position.")({ text }) },
  { key: "DAMAGE_OPPONENT_FIXED", family: "DAMAGE_OR_LP", effect: "DAMAGE_OPPONENT_FIXED", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => [CARD_KIND.SPELL, CARD_KIND.TRAP].includes(kind) && /^(normal|quick-play)$/i.test(String(subtype ?? "")) && /^(inflict|inflicts) \d+(?: points of)?(?: direct)? damage to your opponent(?:'s)?(?: life points)?\.?$/i.test(normalizedText(text)) },
  { key: "RECOVER_SELF_FIXED", family: "DAMAGE_OR_LP", effect: "RECOVER_SELF_FIXED", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && /^increase(s)? your life points by \d+ points?\.?$/i.test(normalizedText(text)) },
  { key: "RECOVER_BOTH_FIXED", family: "DAMAGE_OR_LP", effect: "RECOVER_BOTH_FIXED", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Increase the Life Points of both players by 1000 points.")({ text }) },
  { key: "DAMAGE_AND_RECOVER_SELF", family: "DAMAGE_OR_LP", effect: "DAMAGE_AND_RECOVER_SELF", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 500 points of damage to your opponent's Life Points and increase your Life Points by 500 points.")({ text }) },
  { key: "DAMAGE_BOTH_FIXED", family: "DAMAGE_OR_LP", effect: "DAMAGE_BOTH_FIXED", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 1000 points of damage to your opponent's Life Points and 500 points of damage to your Life Points.")({ text }) },
  { key: "DAMAGE_PER_OPPONENT_MONSTER", family: "DAMAGE_OR_LP", effect: "DAMAGE_PER_OPPONENT_MONSTER", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 500 points of damage to your opponent's Life Points for each monster on your opponent's side of the field.")({ text }) },
  { key: "DAMAGE_PER_OPPONENT_HAND", family: "DAMAGE_OR_LP", effect: "DAMAGE_PER_OPPONENT_HAND", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 200 points of damage to your opponent's Life Points for each card in your opponent's hand.")({ text }) },
  { key: "DAMAGE_PER_OPPONENT_GRAVE", family: "DAMAGE_OR_LP", effect: "DAMAGE_PER_OPPONENT_GRAVE", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 100 points of damage to your opponent's Life Points for each card in their Graveyard.")({ text }) },
  { key: "DAMAGE_PER_OPPONENT_BANISHED", family: "DAMAGE_OR_LP", effect: "DAMAGE_PER_OPPONENT_BANISHED", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 300 damage to your opponent for each of their removed from play cards.")({ text }) },
  { key: "DAMAGE_PER_SELF_FACEUP_LIGHT", family: "DAMAGE_OR_LP", effect: "DAMAGE_PER_SELF_FACEUP_LIGHT", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Inflict 600 points of damage to your opponent's Life Points for each face-up LIGHT monster on your side of the field.")({ text }) },
  { key: "DESTROY_SELF_MONSTERS_DAMAGE_COUNT", family: "REMOVAL", effect: "DESTROY_SELF_MONSTERS_DAMAGE_COUNT", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all monsters on your side of the field. Inflict damage to your opponent's Life Points equal to the number of monsters destroyed x 300 points.")({ text }) },
  { key: "DESTROY_TOKENS_RECOVER", family: "REMOVAL", effect: "DESTROY_TOKENS_RECOVER", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy all tokens on the field. Increase your Life Points by the number of tokens destroyed x 800 points.")({ text }) },
  { key: "OFFERINGS_TO_THE_DOOMED", family: "REMOVAL", effect: "OFFERINGS_TO_THE_DOOMED", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^quick-play$/i.test(String(subtype ?? "")) && exact("Destroy 1 face-up monster. Skip your next Draw Phase.")({ text }) },
  { key: "FISSURE", family: "REMOVAL", effect: "FISSURE", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy the 1 face-up monster your opponent controls that has the lowest ATK. (If it's a tie, you get to choose.)")({ text }) },
  { key: "HAMMER_SHOT", family: "REMOVAL", effect: "HAMMER_SHOT", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Destroy the 1 face-up Attack Position monster that has the highest ATK. (If it's a tie, you get to choose.)")({ text }) },
  { key: "BLOCK_ATTACK", family: "POSITION", effect: "BLOCK_ATTACK", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Select 1 face-up Attack Position monster on your opponent's side of the field and change it to Defense Position.")({ text }) },
  { key: "BOOK_OF_TAIYOU", family: "POSITION", effect: "BOOK_OF_TAIYOU", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Flip 1 face-down monster on the field into face-up Attack Position.")({ text }) },
  { key: "READY_FOR_INTERCEPTING", family: "POSITION", effect: "READY_FOR_INTERCEPTING", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Target 1 face-up Warrior or Spellcaster-Type monster on the field; change that target to face-down Defense Position.")({ text }) },
  { key: "DARK_CORE", family: "REMOVAL", effect: "DARK_CORE", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Discard 1 card. Remove from play 1 face-up monster.")({ text }) },
  { key: "RAIGEKI_BREAK", family: "REMOVAL", effect: "RAIGEKI_BREAK", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.TRAP && /^normal$/i.test(String(subtype ?? "")) && exact("Discard 1 card to target 1 card on the field; destroy it.")({ text }) },
  { key: "GIANT_TRUNADE", family: "REMOVAL", effect: "RETURN_ALL_SPELL_TRAP", status: VALIDATION_STATUS.SUPPORTED, matches: ({ kind, subtype, text }) => kind === CARD_KIND.SPELL && /^normal$/i.test(String(subtype ?? "")) && exact("Return all Spell and Trap Cards on the field to the hand.")({ text }) }
]);

function fallbackFamily(card) {
  const text = normalizedText(card.text);
  if (/draw \d|draw cards|draw .*card/.test(text)) return "DRAW";
  if (/discard/.test(text)) return "DISCARD";
  if (/destroy|send .*graveyard|return .*hand/.test(text)) return "REMOVAL";
  if (/special summon/.test(text)) return "SPECIAL_SUMMON";
  if (/change .*position|face-down|face down/.test(text)) return "POSITION";
  if (/damage|life points/.test(text)) return "DAMAGE_OR_LP";
  if (/negate/.test(text)) return "NEGATE";
  if (/equip|increase .*attack|increase .*defense/.test(text)) return "MODIFIER";
  return card.kind === CARD_KIND.MONSTER ? "MONSTER_EFFECT" : "CONTINUOUS_OR_OTHER";
}

export function effectTemplateFor(card) {
  const template = EFFECT_TEMPLATES.find((candidate) => candidate.matches(card));
  if (template) return template;
  const family = fallbackFamily(card);
  return { key: "UNSUPPORTED_CARD", family, effect: "UNSUPPORTED_CARD", status: VALIDATION_STATUS.UNSUPPORTED };
}

export function effectFamilyFor(card) {
  return effectTemplateFor(card).family;
}

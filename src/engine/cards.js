import { CARD_DATABASE_VERSION, CARD_KIND, VALIDATION_STATUS } from "./constants.js";
import { hashString } from "./rng.js";
import { effectTemplateFor } from "./effect-families.js";
import { GOAT_CARD_POOL, GOAT_CARD_POOL_SOURCE } from "../data/goat-card-pool.js";
import { GOAT_FORBIDDEN_CARDS, GOAT_FORBIDDEN_CARDS_SOURCE } from "../data/goat-forbidden-cards.js";
import { GOAT_BANLIST } from "../format/banlist-data.js";
import { OCGCORE_ASSET_SOURCE, OCGCORE_CARD_ENTRIES, OCGCORE_MISSING_SCRIPTS } from "../data/ocgcore-assets.js";
import { HISTORICAL_SCRIPT_OVERRIDES } from "../data/historical-script-overrides.js";
import { LUCELUNARE_CARD_POOL_SOURCE, LUCELUNARE_CARDS } from "../data/lucelunare-cards.js";

const supported = VALIDATION_STATUS.SUPPORTED;
const partial = VALIDATION_STATUS.PARTIAL;

/**
 * The first cut intentionally contains a small, hand-audited subset. The
 * stable numeric IDs are the public data contract; names are never IDs.
 */
const CURATED_CARDS = [
  { id: 1, name: "Gemini Elf", kind: CARD_KIND.MONSTER, attribute: "EARTH", race: "Spellcaster", level: 4, atk: 1900, def: 900, text: "Elf twins that alternate their attacks. Their combination attacks are so fast that they baffle their opponents.", status: supported, effect: "NORMAL" },
  { id: 2, name: "Mechanicalchaser", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Machine", level: 4, atk: 1850, def: 800, text: "A hunter that relentlessly pursues its target by flying at high speed, then crushes it with its powerful claws.", status: supported, effect: "NORMAL" },
  { id: 3, name: "Summoned Skull", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Fiend", level: 6, atk: 2500, def: 1200, text: "A fiend with dark powers for confusing the enemy. Among the Fiend-Type monsters, this monster boasts considerable strength. (This card is always treated as an \"Archfiend\" card.)", status: supported, effect: "NORMAL" },
  { id: 4, name: "Breaker the Magical Warrior", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Spellcaster", level: 4, atk: 1600, def: 1000, text: "When this card is Normal Summoned: Place 1 Spell Counter on it (max. 1). Gains 300 ATK for each Spell Counter on it. You can remove 1 Spell Counter from this card, then target 1 Spell/Trap Card on the field; destroy that target.", status: supported, effect: "BREAKER" },
  { id: 5, name: "D.D. Warrior Lady", kind: CARD_KIND.MONSTER, attribute: "LIGHT", race: "Warrior", level: 4, atk: 1500, def: 1600, text: "After damage calculation, when this card battles an opponent's monster: You can banish that monster, also banish this card.", status: partial, effect: "DD_WARRIOR_LADY" },
  { id: 6, name: "Magician of Faith", kind: CARD_KIND.MONSTER, attribute: "LIGHT", race: "Spellcaster", level: 1, atk: 300, def: 400, text: "FLIP: Add 1 Spell Card from your Graveyard to your hand.", status: supported, effect: "MAGICIAN_OF_FAITH" },
  { id: 7, name: "Gravekeeper's Spy", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Spellcaster", level: 2, atk: 200, def: 2000, text: "FLIP: Special Summon 1 \"Gravekeeper's\" monster with 1500 or less DEF from your Deck.", status: supported, effect: "GRAVEKEEPER_SPY" },
  { id: 8, name: "Sangan", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Fiend", level: 3, atk: 1000, def: 600, text: "When this card is sent from the field to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.", status: supported, effect: "SANGAN" },
  { id: 9, name: "Sinister Serpent", kind: CARD_KIND.MONSTER, attribute: "WATER", race: "Reptile", level: 1, atk: 300, def: 250, text: "During your Standby Phase, if this card is in your Graveyard: You can add it to your hand.", status: supported, effect: "SINISTER_SERPENT" },
  { id: 10, name: "Tribe-Infecting Virus", kind: CARD_KIND.MONSTER, attribute: "WATER", race: "Aqua", level: 4, atk: 1600, def: 1000, text: "Discard 1 card from your hand and declare 1 monster Type. Destroy all face-up monsters of the declared Type on the field.", status: partial, effect: "TRIBE_INFECTING_VIRUS" },
  { id: 11, name: "Tsukuyomi", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Spellcaster", level: 4, atk: 1100, def: 1400, text: "Cannot be Special Summoned. During the End Phase of the turn this card is Normal Summoned or flipped face-up: Return it to the hand. When this card is Normal Summoned or flipped face-up: Target 1 face-up monster on the field; change that target to face-down Defense Position.", status: partial, effect: "TSUKUYOMI" },
  { id: 12, name: "Mystic Tomato", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Plant", level: 4, atk: 1400, def: 1100, text: "When this card is destroyed by battle and sent to the Graveyard: You can Special Summon 1 DARK monster with 1500 or less ATK from your Deck, in face-up Attack Position.", status: partial, effect: "MYSTIC_TOMATO" },
  { id: 13, name: "Spirit Reaper", kind: CARD_KIND.MONSTER, attribute: "DARK", race: "Zombie", level: 3, atk: 300, def: 200, text: "Cannot be destroyed by battle. After resolving a card effect that targets this face-up card, destroy this card. When this card inflicts Battle Damage to your opponent by a direct attack: Discard 1 random card from their hand.", status: partial, effect: "SPIRIT_REAPER" },
  { id: 14, name: "Black Luster Soldier - Envoy of the Beginning", kind: CARD_KIND.MONSTER, attribute: "LIGHT", race: "Warrior", level: 8, atk: 3000, def: 2500, text: "Cannot be Normal Summoned/Set. Must first be Special Summoned (from your hand) by banishing 1 LIGHT and 1 DARK monster from your Graveyard. Once per turn, you can activate 1 of these effects.\nTarget 1 monster on the field: banish that target face-up. This card cannot attack the turn you activate this effect.\nDuring the Damage Step, if this attacking card destroys an opponent's monster by battle: It can make a second attack in a row.", status: partial, effect: "BLS" },
  { id: 15, name: "Thunder Dragon", kind: CARD_KIND.MONSTER, attribute: "LIGHT", race: "Thunder", level: 5, atk: 1600, def: 1500, text: "During your Main Phase, by discarding this card, add up to 2 \"Thunder Dragons\" from your Deck to your hand.", status: supported, effectFamily: "SEARCH", effectTemplate: "THUNDER_DRAGON", effect: "THUNDER_DRAGON" },
  { id: 16, name: "Airknight Parshath", kind: CARD_KIND.MONSTER, attribute: "LIGHT", race: "Fairy", level: 5, atk: 1900, def: 1400, text: "If this card attacks a Defense Position monster, inflict piercing battle damage to your opponent. When this card inflicts battle damage to your opponent: Draw 1 card.", status: partial, effect: "AIRKNIGHT" },
  { id: 17, name: "Scapegoat Token", kind: CARD_KIND.TOKEN, attribute: "EARTH", race: "Beast", level: 1, atk: 0, def: 0, text: "Token created by Scapegoat.", status: supported, effect: "TOKEN" },

  { id: 30, name: "Pot of Greed", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Draw 2 cards.", status: supported, effect: "DRAW_2" },
  { id: 31, name: "Graceful Charity", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Draw 3 cards, then discard 2 cards.", status: supported, effect: "DRAW_3_DISCARD_2" },
  { id: 32, name: "Book of Moon", kind: CARD_KIND.SPELL, spellType: "QUICK_PLAY", text: "Target 1 face-up monster on the field; change that target to face-down Defense Position.", status: supported, effect: "BOOK_OF_MOON" },
  { id: 33, name: "Mystical Space Typhoon", kind: CARD_KIND.SPELL, spellType: "QUICK_PLAY", text: "Target 1 Spell/Trap Card on the field; destroy that target.", status: supported, effect: "MST" },
  { id: 34, name: "Heavy Storm", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Destroy all Spell and Trap Cards on the field.", status: supported, effect: "HEAVY_STORM" },
  { id: 35, name: "Nobleman of Crossout", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Destroy 1 face-down monster and remove it from play. If the monster is a Flip Effect Monster, both players must remove from play all monsters from their Decks with the same name as the destroyed monster.", status: supported, effect: "NOBLEMAN" },
  { id: 36, name: "Scapegoat", kind: CARD_KIND.SPELL, spellType: "QUICK_PLAY", text: "Special Summon 4 \"Sheep Tokens\" (Beast-Type/EARTH/Level 1/ATK 0/DEF 0) in Defense Position. These Tokens cannot be Tributed for a Tribute Summon. You cannot Summon other monsters the turn you activate this card (but you can Set).", status: supported, effect: "SCAPEGOAT" },
  { id: 37, name: "Snatch Steal", kind: CARD_KIND.SPELL, spellType: "EQUIP", text: "Equip only to a monster your opponent controls. Take control of the equipped monster. During each of your opponent's Standby Phases: They gain 1000 Life Points.", status: partial, effect: "SNATCH_STEAL" },
  { id: 38, name: "Premature Burial", kind: CARD_KIND.SPELL, spellType: "EQUIP", text: "Activate this card by paying 800 Life Points, then target 1 monster in your Graveyard; Special Summon that target in face-up Attack Position and equip it with this card. When this card is destroyed, destroy the equipped monster.", status: partial, effect: "PREMATURE_BURIAL" },
  { id: 39, name: "Creature Swap", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Each player chooses 1 monster they control and switches control of those monsters with each other. Those monsters cannot change their battle positions for the rest of this turn.", status: partial, effect: "CREATURE_SWAP" },
  { id: 40, name: "Reinforcement of the Army", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Add 1 Level 4 or lower Warrior-Type monster from your Deck to your hand.", status: supported, effect: "ROTA" },
  { id: 41, name: "Delinquent Duo", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Pay 1000 Life Points. Your opponent randomly selects and discards 1 card from his/her hand and then selects and discards another card from his/her hand.", status: partial, effect: "DUO" },
  { id: 42, name: "Lightning Vortex", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Discard 1 card. Destroy all face-up monsters your opponent controls.", status: supported, effect: "LIGHTNING_VORTEX" },
  { id: 43, name: "Metamorphosis", kind: CARD_KIND.SPELL, spellType: "NORMAL", text: "Tribute 1 monster. Special Summon 1 Fusion Monster from your Fusion Deck with the same Level as the Tributed monster.", status: VALIDATION_STATUS.UNSUPPORTED, effect: "METAMORPHOSIS" },

  { id: 60, name: "Mirror Force", kind: CARD_KIND.TRAP, trapType: "NORMAL", text: "When an opponent's monster declares an attack: Destroy all Attack Position monsters your opponent controls.", status: supported, effect: "MIRROR_FORCE" },
  { id: 61, name: "Torrential Tribute", kind: CARD_KIND.TRAP, trapType: "NORMAL", text: "When a monster(s) is Summoned: Destroy all monsters on the field.", status: supported, effect: "TORRENTIAL" },
  { id: 62, name: "Ring of Destruction", kind: CARD_KIND.TRAP, trapType: "NORMAL", text: "Target 1 face-up monster on the field; destroy that target, and if you do, inflict damage to both players equal to that target's ATK.", status: supported, effect: "RING" },
  { id: 63, name: "Sakuretsu Armor", kind: CARD_KIND.TRAP, trapType: "NORMAL", text: "Activate only when an opponent's monster declares an attack. Destroy the attacking monster.", status: supported, effect: "SAKURETSU" },
  { id: 64, name: "Call of the Haunted", kind: CARD_KIND.TRAP, trapType: "CONTINUOUS", text: "Activate this card by targeting 1 monster in your Graveyard; Special Summon that target in face-up Attack Position. When this card leaves the field, destroy that target. When that target is destroyed, destroy this card.", status: partial, effect: "CALL" },
  { id: 65, name: "Dust Tornado", kind: CARD_KIND.TRAP, trapType: "NORMAL", text: "Target 1 Spell/Trap Card your opponent controls; destroy that target, then you can Set 1 Spell/Trap Card from your hand.", status: supported, effect: "DUST_TORNADO" },
  { id: 66, name: "Bottomless Trap Hole", kind: CARD_KIND.TRAP, trapType: "NORMAL", text: "When your opponent Summons a monster(s) with 1500 or more ATK: Destroy that monster(s) with 1500 or more ATK, and if you do, banish it instead of sending it to the Graveyard.", status: supported, effect: "BOTTOMLESS" },
  { id: 67, name: "Solemn Judgment", kind: CARD_KIND.TRAP, trapType: "COUNTER", text: "Pay half of your Life Points. Negate an activation of a Spell / Trap Card / Normal Summon / Flip Summon / Special Summon and destroy the Spell Card, Trap Card or Summoned monster.", status: partial, effect: "SOLEMN" },
  { id: 68, name: "Royal Decree", kind: CARD_KIND.TRAP, trapType: "CONTINUOUS", text: "Negate all other Trap Card effects on the field.", status: partial, effect: "ROYAL_DECREE" }
];

function normalizeName(name) {
  return String(name ?? "").replace(/[’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

const authoritativeByName = new Map(OCGCORE_CARD_ENTRIES.map((entry) => [normalizeName(entry.name), entry]));
const limitByName = new Map([
  ...GOAT_BANLIST.forbidden.map((name) => [normalizeName(name), 0]),
  ...GOAT_BANLIST.limited.map((name) => [normalizeName(name), 1]),
  ...GOAT_BANLIST.semiLimited.map((name) => [normalizeName(name), 2]),
]);

function limitForName(name) {
  return limitByName.get(normalizeName(name)) ?? 3;
}

function authoritativeMetadata(name) {
  const entry = authoritativeByName.get(normalizeName(name));
  if (!entry) {
    return {
      authoritativeStatus: VALIDATION_STATUS.BLOCKED_BY_MISSING_SOURCE,
      authoritative: null,
      effectSource: "unmapped"
    };
  }
  const historicalOverride = Boolean(entry.historicalOverride || HISTORICAL_SCRIPT_OVERRIDES[entry.script]);
  const scriptLoaded = historicalOverride || !OCGCORE_MISSING_SCRIPTS.includes(entry.script);
  return {
    authoritativeStatus: VALIDATION_STATUS.SUPPORTED,
    authoritative: {
      engine: "ocgcore",
      runtimeCode: entry.runtimeCode,
      passcode: entry.passcode,
      script: entry.script,
      scriptLoaded,
      historicalOverride,
      source: {
        cardDatabase: OCGCORE_ASSET_SOURCE.cardDatabase,
        cardDatabaseRevision: OCGCORE_ASSET_SOURCE.cardDatabaseRevision,
        scriptRepository: OCGCORE_ASSET_SOURCE.scriptRepository,
        scriptRepositoryRevision: OCGCORE_ASSET_SOURCE.scriptRepositoryRevision
      }
    },
    effectSource: scriptLoaded ? (historicalOverride ? "ocgcore-lua-goat-override" : "ocgcore-lua") : "ocgcore-cdb-normal"
  };
}

function importedCard(row) {
  const descriptor = effectTemplateFor(row);
  const core = authoritativeMetadata(row.name);
  return {
    ...row,
    spellType: row.kind === CARD_KIND.SPELL ? String(row.subtype ?? "").toUpperCase() : undefined,
    trapType: row.kind === CARD_KIND.TRAP ? String(row.subtype ?? "").toUpperCase() : undefined,
    localizedNames: { en: row.name },
    visibleText: row.text,
    rulings: [],
    tests: [],
    legalities: { goatFormat: "LEGAL" },
    metadataComplete: true,
    limit: limitForName(row.name),
    effectFamily: descriptor.family,
    effectTemplate: descriptor.key,
    effect: descriptor.effect,
    status: descriptor.status,
    ...core,
    source: row.source,
    poolSource: GOAT_CARD_POOL_SOURCE
  };
}

const curatedByName = new Map(CURATED_CARDS.map((card) => [normalizeName(card.name), card]));
const sourceByName = new Map(GOAT_CARD_POOL.map((card) => [normalizeName(card.name), card]));
const enrichedCurated = CURATED_CARDS.map((card) => {
  const sourceRow = sourceByName.get(normalizeName(card.name));
  const descriptor = effectTemplateFor({ ...sourceRow, ...card });
  const core = authoritativeMetadata(card.name);
  return {
    ...(sourceRow ?? {}),
    ...card,
    text: sourceRow?.text ?? card.text,
    visibleText: sourceRow?.text ?? card.visibleText ?? card.text,
    localizedNames: card.localizedNames ?? { en: card.name },
    rulings: card.rulings ?? [],
    tests: card.tests ?? [],
    legalities: card.legalities ?? { goatFormat: "LEGAL" },
    metadataComplete: card.metadataComplete ?? Boolean(sourceRow),
    limit: card.limit ?? limitForName(card.name),
    effectTemplate: card.effectTemplate ?? card.effect,
    source: sourceRow?.source ?? { provider: "curated-vertical-slice" },
    poolSource: GOAT_CARD_POOL_SOURCE,
    effectFamily: card.effectFamily ?? descriptor.family ?? "CURATED",
    ...core
  };
});
const importedPoolCards = GOAT_CARD_POOL
  .filter((card) => !curatedByName.has(normalizeName(card.name)))
  .map(importedCard);
const importedForbiddenCards = GOAT_FORBIDDEN_CARDS
  .filter((card) => !sourceByName.has(normalizeName(card.name)) && !curatedByName.has(normalizeName(card.name)))
  .map((card) => ({ ...card, ...authoritativeMetadata(card.name), limit: 0, source: GOAT_FORBIDDEN_CARDS_SOURCE, poolSource: GOAT_FORBIDDEN_CARDS_SOURCE }));
const customEffects = new Map([
  ["Lunalight Lunar Priestess", { family: "NORMAL", key: "NORMAL_MONSTER", effect: "NORMAL" }],
  ["Lunalight White Trickster", { family: "REMOVAL", key: "LUCELUNARE_WHITE_TRICKSTER", effect: "LUCELUNARE_WHITE_TRICKSTER" }],
  ["Lunalight Shadow Sheep", { family: "TO_HAND", key: "LUCELUNARE_SHADOW_SHEEP", effect: "LUCELUNARE_SHADOW_SHEEP" }],
  ["Lunalight Essence", { family: "SPECIAL_SUMMON", key: "LUCELUNARE_ESSENCE", effect: "LUCELUNARE_ESSENCE" }],
  ["Lunalight Assault", { family: "MODIFIER", key: "LUCELUNARE_ASSAULT", effect: "LUCELUNARE_ASSAULT" }],
  ["Lunalight Crescent Dancer", { family: "FUSION", key: "LUCELUNARE_CRESCENT_DANCER", effect: "LUCELUNARE_CRESCENT_DANCER" }],
  ["Lunalight Panther Queen", { family: "FUSION", key: "LUCELUNARE_PANTHER_QUEEN", effect: "LUCELUNARE_PANTHER_QUEEN" }],
]);
const importedCustomCards = LUCELUNARE_CARDS.map((card) => {
  const metadata = authoritativeMetadata(card.name);
  const effect = customEffects.get(card.name) ?? { family: "CUSTOM", key: "CUSTOM", effect: "CUSTOM" };
  return {
    ...card,
    spellType: card.kind === CARD_KIND.SPELL ? String(card.subtype ?? "").toUpperCase() : undefined,
    trapType: card.kind === CARD_KIND.TRAP ? String(card.subtype ?? "").toUpperCase() : undefined,
    localizedNames: { en: card.name },
    visibleText: card.text,
    rulings: [],
    tests: [],
    legalities: { goatFormat: "CUSTOM" },
    metadataComplete: true,
    limit: 3,
    effectFamily: effect.family,
    effectTemplate: effect.key,
    effect: effect.effect,
    status: supported,
    ...metadata,
    source: card.source ?? LUCELUNARE_CARD_POOL_SOURCE,
    poolSource: LUCELUNARE_CARD_POOL_SOURCE,
  };
});

/**
 * Full GoatFormat pool data plus legacy descriptors used by the fallback
 * engine. Authoritative runtime readiness comes from OCGCore metadata below;
 * descriptor status is retained for compatibility and must not be confused
 * with Lua/CDB execution coverage.
 */
export const CARDS = Object.freeze([...enrichedCurated, ...importedPoolCards, ...importedForbiddenCards, ...importedCustomCards]);

const byId = new Map(CARDS.map((card) => [card.id, card]));
const byName = new Map(CARDS.map((card) => [normalizeName(card.name), card]));

export function getCard(cardId) {
  return byId.get(Number(cardId));
}

export function getCardByName(name) {
  return byName.get(normalizeName(name));
}

export function cardHash(card) {
  return hashString(JSON.stringify({ id: card.id, name: card.name, kind: card.kind, effect: card.effect, text: card.text }));
}

export function cardDatabaseHash() {
  return hashString(JSON.stringify(CARDS));
}

export function isSupportedCard(cardId) {
  return getCard(cardId)?.status === supported;
}

export function cardsByKind(kind) {
  return CARDS.filter((card) => card.kind === kind);
}

export { CARD_DATABASE_VERSION, GOAT_CARD_POOL_SOURCE, GOAT_FORBIDDEN_CARDS_SOURCE };

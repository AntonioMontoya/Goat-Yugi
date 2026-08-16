import { VALIDATION_STATUS } from "../engine/constants.js";
import { getCardByName } from "../engine/cards.js";
import { copyLimit } from "../format/banlist.js";
import { hashString } from "../engine/rng.js";
import { GOATFORMAT_PRIMARY_LISTS } from "./goatformat-primary-lists.js";

const SOURCE = "https://www.goatformat.com/decks.html";

const GUIDE_DEFINITIONS = Object.freeze([
  ["lockdown", ["Clown Control", "Destiny Board", "Direct Attack", "Final Countdown", "Last Warrior", "Lockdown Burn", "Deckout", "P.A.C.M.A.N.", "Spatial Collapse", "Wall Stall"]],
  ["control", ["Cat Control", "Chaos Control", "Chaos Turbo", "Earth Control", "Ectoplasmer Control", "Flip Control", "Goat Control", "Guardian Control", "Jam Control", "Monarch", "Pixie Control", "Relinquished Control", "Spell Counter Control"]],
  ["aggro", ["Aitsu Koitsu", "Aggro Bomb", "Amazon", "Archfiend", "Armed Dragon", "Bazoo Return", "Beastdown", "Beatdown", "Blue-Eyes White Dragon", "Buster Blader", "Chaos Aggro", "Chaos Recruiter", "Chaos Return", "Coin Toss", "Creator", "Dark Aggro", "Dark Magician", "Dice Re-Roll", "Dragon Aggro", "Drain Aggro", "Earth Aggro", "Element Aggro", "Elemental HERO", "Emissary Aggro", "Fairy Aggro", "Fiend Aggro", "Fire Aggro", "Flute Dragon", "Gravekeeper", "Hand Assault", "Harpie", "Horus", "Insect", "Light Aggro", "Machine Aggro", "Magnet Warrior", "Manticore Aggro", "Master Monk", "Ninja Aggro", "Paladin of White Dragon", "Plant Aggro", "Red-Eyes Black Dragon", "Sacred Phoenix", "Sealmaster", "Silent Swordsman", "Spell Canceller Aggro", "Spirit", "Strike Ninja", "Toon", "Ultimate Insect", "Vanilla Aggro", "Warrior", "Water Aggro", "Wind Aggro", "Zombie"]],
  ["combo", ["Asura OTK", "Banish Turbo", "Ben Kei OTK", "Blasting the Ruins", "Bugroth OTK", "Burn", "Cyber-Stein OTK", "Dimension Fusion Turbo", "Doriado", "Empty Jar", "Exodia", "Fusion Gate Turbo", "Heavy Slump", "Hino-Kagu-Tsuchi", "Huge Revolution", "Last Turn", "Library FTK", "Machine OTK", "Maha Vailo", "Mazera DeVille", "Mokey Mokey Smackdown", "Necromancer OTK", "Neo-Daedalus", "Ojama", "Pyramid of Light", "Reasoning Gate OTK", "Rescue Cat", "Reversal Quiz OTK", "Shield and Sword OTK", "Shinato", "Spell Economics FTK", "Zorc"]],
]);

const BASE = ["Gemini Elf", "Mechanicalchaser", "Breaker the Magical Warrior", "D.D. Warrior Lady", "Magician of Faith", "Gravekeeper's Spy", "Sangan", "Sinister Serpent", "Spirit Reaper", "Thunder Dragon", "Pot of Greed", "Graceful Charity", "Book of Moon", "Mystical Space Typhoon", "Heavy Storm", "Nobleman of Crossout", "Scapegoat", "Snatch Steal", "Mirror Force", "Torrential Tribute", "Ring of Destruction", "Sakuretsu Armor", "Call of the Haunted", "Dust Tornado", "Bottomless Trap Hole"];
const HINTS = Object.freeze({
  lockdown: ["Gravity Bind", "Messenger of Peace", "Wave-Motion Cannon", "Level Limit - Area B", "Swords of Revealing Light"],
  control: ["Chaos Sorcerer", "Tsukuyomi", "Metamorphosis", "Scapegoat", "Creature Swap", "Airknight Parshath"],
  aggro: ["Axe Raider", "Kycoo the Ghost Destroyer", "Marauding Captain", "Reinforcement of the Army", "Exiled Force", "Don Zaloog"],
  combo: ["Thunder Dragon", "Magical Scientist", "Reasoning", "Monster Gate", "Metamorphosis", "Premature Burial"],
});

// Primary lists transcribed from the deck-list section of the official
// GoatFormat pages.  A page can contain several variants, so these are kept
// separate from the category fallback below and are selected by deck name.
const GOATFORMAT_DECK_LISTS = Object.freeze({
  ...GOATFORMAT_PRIMARY_LISTS,
  "chaos-control": [
    ...Array(1).fill("Asura Priest"),
    ...Array(1).fill("Black Luster Soldier - Envoy of the Beginning"),
    ...Array(1).fill("Breaker the Magical Warrior"),
    ...Array(2).fill("Chaos Sorcerer"),
    ...Array(1).fill("D.D. Warrior Lady"),
    ...Array(1).fill("Dark Mimic LV1"),
    ...Array(2).fill("Magical Merchant"),
    ...Array(2).fill("Magician of Faith"),
    ...Array(1).fill("Sangan"),
    ...Array(1).fill("Sinister Serpent"),
    ...Array(2).fill("Skilled White Magician"),
    ...Array(2).fill("Tsukuyomi"),
    ...Array(3).fill("Book of Moon"),
    ...Array(1).fill("Delinquent Duo"),
    ...Array(1).fill("Graceful Charity"),
    ...Array(1).fill("Heavy Storm"),
    ...Array(3).fill("Metamorphosis"),
    ...Array(1).fill("Mystical Space Typhoon"),
    ...Array(2).fill("Nobleman of Crossout"),
    ...Array(1).fill("Pot of Greed"),
    ...Array(3).fill("Scapegoat"),
    ...Array(1).fill("Snatch Steal"),
    ...Array(2).fill("Dust Tornado"),
    ...Array(1).fill("Mirror Force"),
    ...Array(1).fill("Ring of Destruction"),
    ...Array(1).fill("Sakuretsu Armor"),
    ...Array(1).fill("Torrential Tribute"),
  ],
  "chaos-turbo": [
    ...Array(1).fill("Black Luster Soldier - Envoy of the Beginning"),
    ...Array(1).fill("Breaker the Magical Warrior"),
    ...Array(2).fill("Chaos Sorcerer"),
    ...Array(3).fill("Dekoichi the Battlechanted Locomotive"),
    ...Array(3).fill("Gravekeeper's Spy"),
    ...Array(1).fill("Kycoo the Ghost Destroyer"),
    ...Array(2).fill("Magician of Faith"),
    ...Array(2).fill("Mystic Tomato"),
    ...Array(2).fill("Night Assailant"),
    ...Array(1).fill("Sangan"),
    ...Array(1).fill("Sinister Serpent"),
    ...Array(3).fill("Thunder Dragon"),
    ...Array(3).fill("Book of Moon"),
    ...Array(1).fill("Card Destruction"),
    ...Array(1).fill("Delinquent Duo"),
    ...Array(1).fill("Graceful Charity"),
    ...Array(1).fill("Heavy Storm"),
    ...Array(2).fill("Nobleman of Crossout"),
    ...Array(1).fill("Pot of Greed"),
    ...Array(1).fill("Snatch Steal"),
    ...Array(3).fill("Raigeki Break"),
    ...Array(1).fill("Ring of Destruction"),
    ...Array(1).fill("Torrential Tribute"),
    ...Array(2).fill("Trap Dustshoot"),
  ],
  "elemental-hero": [
    ...Array(1).fill("Breaker the Magical Warrior"),
    ...Array(1).fill("D.D. Warrior Lady"),
    ...Array(1).fill("Exiled Force"),
    ...Array(3).fill("King of the Swamp"),
    ...Array(3).fill("Mother Grizzly"),
    ...Array(1).fill("Sangan"),
    ...Array(1).fill("Sinister Serpent"),
    ...Array(1).fill("Elemental HERO Burstinatrix"),
    ...Array(3).fill("Elemental HERO Clayman"),
    ...Array(3).fill("Elemental HERO Sparkman"),
    ...Array(1).fill("Creature Swap"),
    ...Array(1).fill("Delinquent Duo"),
    ...Array(1).fill("Graceful Charity"),
    ...Array(1).fill("Heavy Storm"),
    ...Array(1).fill("Mystical Space Typhoon"),
    ...Array(2).fill("Nobleman of Crossout"),
    ...Array(3).fill("Polymerization"),
    ...Array(1).fill("Pot of Greed"),
    ...Array(1).fill("Premature Burial"),
    ...Array(2).fill("Reinforcement of the Army"),
    ...Array(1).fill("Snatch Steal"),
    ...Array(1).fill("Call of the Haunted"),
    ...Array(3).fill("Hero Signal"),
    ...Array(1).fill("Mirror Force"),
    ...Array(1).fill("Ring of Destruction"),
    ...Array(1).fill("Torrential Tribute"),
  ],
  "goat-control": [
    ...Array(1).fill("Airknight Parshath"),
    ...Array(3).fill("Asura Priest"),
    ...Array(1).fill("Black Luster Soldier - Envoy of the Beginning"),
    ...Array(1).fill("Breaker the Magical Warrior"),
    ...Array(1).fill("Chaos Sorcerer"),
    ...Array(1).fill("D.D. Warrior Lady"),
    ...Array(1).fill("Dark Mimic LV1"),
    ...Array(2).fill("Dekoichi the Battlechanted Locomotive"),
    ...Array(2).fill("Magician of Faith"),
    ...Array(1).fill("Sangan"),
    ...Array(1).fill("Sinister Serpent"),
    ...Array(2).fill("Tsukuyomi"),
    ...Array(3).fill("Book of Moon"),
    ...Array(1).fill("Delinquent Duo"),
    ...Array(1).fill("Graceful Charity"),
    ...Array(1).fill("Heavy Storm"),
    ...Array(3).fill("Metamorphosis"),
    ...Array(1).fill("Mystical Space Typhoon"),
    ...Array(2).fill("Nobleman of Crossout"),
    ...Array(1).fill("Pot of Greed"),
    ...Array(2).fill("Scapegoat"),
    ...Array(1).fill("Snatch Steal"),
    ...Array(1).fill("Mirror Force"),
    ...Array(1).fill("Ring of Destruction"),
    ...Array(2).fill("Sakuretsu Armor"),
    ...Array(1).fill("Torrential Tribute"),
    ...Array(2).fill("Trap Dustshoot"),
  ],
});

// Source: GoatFormat's historical fusion guide. Extra Decks are selected per
// deck profile below; this is only the conservative fallback for strategies
// with no recognisable Fusion profile.
const EXTRA_DECK_NAMES = Object.freeze([
  "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
  "Dark Balter the Terrible", "Dark Balter the Terrible",
  "Ryu Senshi", "Ryu Senshi", "Fiend Skull Dragon", "Reaper on the Nightmare",
  "Dark Blade the Dragon Knight", "Ojama King", "Dark Flare Knight",
  "Dragoness the Wicked Knight", "Darkfire Dragon", "Gatling Dragon",
]);

const EXTRA_DECK_PROFILES = Object.freeze({
  control: [
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
    "Dark Balter the Terrible", "Dark Balter the Terrible", "Ryu Senshi", "Ryu Senshi",
    "Fiend Skull Dragon", "Reaper on the Nightmare", "Dark Blade the Dragon Knight",
    "Dark Flare Knight", "Gatling Dragon", "Darkfire Dragon", "Dragoness the Wicked Knight",
    "Thousand Dragon",
  ],
  chaos: [
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
    "Dark Balter the Terrible", "Dark Balter the Terrible", "Ryu Senshi", "Ryu Senshi",
    "Fiend Skull Dragon", "Reaper on the Nightmare", "Dark Flare Knight", "Dark Paladin",
    "Gatling Dragon", "Twin-Headed Thunder Dragon", "Thousand Dragon", "B. Skull Dragon",
  ],
  warrior: [
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Dark Balter the Terrible",
    "Ryu Senshi", "Ryu Senshi", "Dark Blade the Dragon Knight", "Dark Blade the Dragon Knight",
    "Dark Flare Knight", "Flame Swordsman", "Giltia the D. Knight", "Warrior of Tradition",
    "Fiend Skull Dragon", "Reaper on the Nightmare", "Thousand Dragon",
  ],
  dragon: [
    "B. Skull Dragon", "B. Skull Dragon", "Dark Paladin", "Dark Paladin", "King Dragun", "King Dragun",
    "Twin-Headed Thunder Dragon", "Twin-Headed Thunder Dragon", "Thousand Dragon", "Gatling Dragon",
    "Metal Dragon", "Dark Blade the Dragon Knight", "Dark Flare Knight", "Thousand-Eyes Restrict",
    "The Last Warrior from Another Planet",
  ],
  machine: [
    "Gatling Dragon", "Gatling Dragon", "Gatling Dragon", "Cyber Saurus", "Cyber Saurus",
    "Labyrinth Tank", "Labyrinth Tank", "XY-Dragon Cannon", "XYZ-Dragon Cannon", "XZ-Tank Cannon",
    "YZ-Tank Dragon", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Ryu Senshi", "Metal Dragon",
  ],
  hero: [
    "Elemental HERO Flame Wingman", "Elemental HERO Flame Wingman", "Elemental HERO Flame Wingman",
    "Elemental HERO Thunder Giant", "Elemental HERO Thunder Giant", "Elemental HERO Thunder Giant",
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Dark Balter the Terrible",
    "Ryu Senshi", "Ryu Senshi", "Dark Flare Knight", "Flame Swordsman", "Dark Paladin",
  ],
  darkMagician: [
    "Dark Paladin", "Dark Paladin", "Dark Flare Knight", "Dark Flare Knight", "Flame Swordsman",
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Dark Balter the Terrible",
    "Fiend Skull Dragon", "Ryu Senshi", "Ryu Senshi", "Giltia the D. Knight", "Reaper on the Nightmare", "Thousand Dragon",
  ],
  ojama: [
    "Ojama King", "Ojama King", "Ojama King", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
    "Dark Balter the Terrible", "Dark Balter the Terrible", "Ryu Senshi", "Ryu Senshi", "Fiend Skull Dragon",
    "Reaper on the Nightmare", "Gatling Dragon", "Darkfire Dragon", "Dragoness the Wicked Knight",
  ],
  zombie: [
    "Reaper on the Nightmare", "Reaper on the Nightmare", "Reaper on the Nightmare", "Flame Ghost", "Flame Ghost",
    "The Last Warrior from Another Planet", "The Last Warrior from Another Planet", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
    "Dark Balter the Terrible", "Dark Balter the Terrible", "Fiend Skull Dragon", "Ryu Senshi", "Dark Flare Knight", "Giltia the D. Knight",
  ],
  water: [
    "Roaring Ocean Snake", "Roaring Ocean Snake", "Roaring Ocean Snake", "Deepsea Shark", "Deepsea Shark",
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Ryu Senshi", "Ryu Senshi",
    "Fiend Skull Dragon", "Reaper on the Nightmare", "Darkfire Dragon", "Dragoness the Wicked Knight", "Twin-Headed Thunder Dragon",
  ],
  insect: [
    "Kwagar Hercules", "Kwagar Hercules", "Kwagar Hercules", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
    "Dark Balter the Terrible", "Dark Balter the Terrible", "Ryu Senshi", "Ryu Senshi", "Fiend Skull Dragon",
    "Reaper on the Nightmare", "Darkfire Dragon", "Dragoness the Wicked Knight", "Gatling Dragon",
  ],
  beast: [
    "Master of Oz", "Master of Oz", "Master of Oz", "Flower Wolf", "Flower Wolf", "Bickuribox",
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Dark Balter the Terrible",
    "Ryu Senshi", "Reaper on the Nightmare", "Gatling Dragon", "Darkfire Dragon", "Dragoness the Wicked Knight",
  ],
  wind: [
    "Punished Eagle", "Punished Eagle", "Punished Eagle", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict",
    "Dark Balter the Terrible", "Dark Balter the Terrible", "Ryu Senshi", "Ryu Senshi", "Fiend Skull Dragon",
    "Reaper on the Nightmare", "Darkfire Dragon", "Dragoness the Wicked Knight", "Gatling Dragon", "Thousand Dragon",
  ],
  lastWarrior: [
    "The Last Warrior from Another Planet", "The Last Warrior from Another Planet", "The Last Warrior from Another Planet",
    "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Dark Balter the Terrible",
    "Ryu Senshi", "Ryu Senshi", "Fiend Skull Dragon", "Reaper on the Nightmare", "Dark Flare Knight", "Gatling Dragon", "Darkfire Dragon",
  ],
  fusionCombo: [
    "Thousand-Eyes Restrict", "Dark Balter the Terrible", "Ryu Senshi", "Fiend Skull Dragon", "Reaper on the Nightmare",
    "Dark Flare Knight", "Dark Paladin", "King Dragun", "Gatling Dragon", "Master of Oz", "B. Skull Dragon",
    "Twin-Headed Thunder Dragon", "The Last Warrior from Another Planet", "Elemental HERO Flame Wingman", "Ojama King",
  ],
});

const EXTRA_DECK_RULES = Object.freeze([
  { pattern: /last warrior/i, profile: "lastWarrior" },
  { pattern: /elemental hero|hero/i, profile: "hero" },
  { pattern: /dark magician|buster blader|flame swordsman/i, profile: "darkMagician" },
  { pattern: /ojama/i, profile: "ojama" },
  { pattern: /cyber-stein|fusion gate|machine|bugroth|xyz|barrel dragon/i, profile: "machine" },
  { pattern: /blue-eyes|red-eyes|dragon|flute dragon|paladin of white/i, profile: "dragon" },
  { pattern: /warrior|ben kei|ninja|silent swordsman|master monk/i, profile: "warrior" },
  { pattern: /water|neo-daedalus/i, profile: "water" },
  { pattern: /insect|ultimate insect/i, profile: "insect" },
  { pattern: /rescue cat|beast|panda/i, profile: "beast" },
  { pattern: /zombie|necromancer/i, profile: "zombie" },
  { pattern: /harpie|wind/i, profile: "wind" },
  { pattern: /chaos/i, profile: "chaos" },
  { pattern: /fusion|cyber|otk|ftk|exodia|reasoning|library/i, profile: "fusionCombo" },
  { pattern: /control|flip|goat|gravekeeper|relinquished|monarch|spell/i, profile: "control" },
]);

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function resolveNames(names) {
  const aliases = new Map([
    ["Amazoness Archer", "Amazoness Archer (F.K.A. Amazon Archer)"],
    ["My body as a Sheild", "My Body as a Shield"],
    ["Red-Eyes Black Dragon", "Red-Eyes B. Dragon"],
    ["Snatch Stea", "Snatch Steal"],
    ["Solemn Judgement", "Solemn Judgment"],
  ]);
  const ids = [];
  const counts = new Map();
  for (const name of names) {
    const card = getCardByName(aliases.get(name) ?? name);
    if (!card || (counts.get(card.id) ?? 0) >= copyLimit(card.id)) continue;
    ids.push(card.id);
    counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
  }
  return { ids, counts };
}

function resolveExtraDeck(names) {
  const resolved = resolveNames([...names, ...EXTRA_DECK_NAMES]).ids;
  return Object.freeze(resolved.slice(0, 15));
}

/**
 * Returns the Extra Deck profile for one deck. The profile is selected from
 * the deck identity, not shared by reference, so every preset owns its list
 * and can be edited independently in the builder.
 */
export function extraDeckForStrategy({ name = "", archetype = "" } = {}) {
  const identity = `${name} ${archetype}`;
  const rule = EXTRA_DECK_RULES.find(({ pattern }) => pattern.test(identity));
  return resolveExtraDeck(rule ? EXTRA_DECK_PROFILES[rule.profile] : EXTRA_DECK_NAMES);
}

// Kept as a public fallback for callers creating a deck without a strategy.
export const GOATFORMAT_EXTRA_DECK = extraDeckForStrategy({ name: "Goat Control", archetype: "Control" });

function playableMain(category, index) {
  const seed = [...(HINTS[category] ?? []), ...BASE];
  const { ids, counts } = resolveNames(seed);
  let cursor = index % Math.max(1, seed.length);
  let guard = 0;
  while (ids.length < 40 && guard < seed.length * 8) {
    const name = seed[cursor % seed.length];
    const card = getCardByName(name);
    if (card && (counts.get(card.id) ?? 0) < copyLimit(card.id)) {
      ids.push(card.id);
      counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
    }
    cursor += 1;
    guard += 1;
  }
  return ids.slice(0, 40);
}

function padPublishedMain(ids, category, index) {
  if (ids.length >= 40) return ids;
  const completed = [...ids];
  const counts = new Map();
  for (const cardId of completed) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  for (const cardId of playableMain(category, index)) {
    const count = counts.get(cardId) ?? 0;
    if (count >= copyLimit(cardId)) continue;
    completed.push(cardId);
    counts.set(cardId, count + 1);
    if (completed.length === 40) break;
  }
  return completed;
}

export function officialMainDeckForName(name) {
  const list = GOATFORMAT_DECK_LISTS[slug(name)];
  if (!list) return null;
  return Object.freeze(resolveNames(list).ids);
}

function guideDeck(category, name, index) {
  const officialList = GOATFORMAT_DECK_LISTS[slug(name)];
  const resolvedOfficial = officialMainDeckForName(name);
  const main = resolvedOfficial ? padPublishedMain(resolvedOfficial, category, index) : playableMain(category, index);
  const fusion = extraDeckForStrategy({ name, archetype: `${category[0].toUpperCase()}${category.slice(1)} / GoatFormat` });
  return Object.freeze({
    id: `goatformat-${slug(name)}`,
    name,
    archetype: `${category[0].toUpperCase()}${category.slice(1)} / GoatFormat`,
    readiness: officialList && main.length === officialList.length ? VALIDATION_STATUS.SUPPORTED : VALIDATION_STATUS.PARTIAL,
    provenance: officialList ? "goatformat-deck-list" : "goatformat-guide",
    source: SOURCE,
    notes: "Preset jugable generado desde la guía pública GoatFormat; la página contiene variantes y listas de ejemplo.",
    sourceListKind: officialList ? (main.length === officialList.length ? "primary-deck-list" : "primary-deck-list-padded") : "category-fallback",
    sourceListSize: officialList?.length ?? null,
    tags: ["GoatFormat", category, name],
    main,
    fusion: [...fusion],
    side: [],
    hash: hashString(JSON.stringify({ id: `goatformat-${slug(name)}`, main, fusion, side: [] })),
  });
}

export const GOATFORMAT_GUIDE_DECKS = Object.freeze(GUIDE_DEFINITIONS.flatMap(([category, names]) => names.map((name, index) => guideDeck(category, name, index))));
export const GOATFORMAT_GUIDE_SOURCE = Object.freeze({ provider: "GoatFormat.com", url: SOURCE, categories: GUIDE_DEFINITIONS.length, guides: GOATFORMAT_GUIDE_DECKS.length, exactPrimaryLists: Object.keys(GOATFORMAT_DECK_LISTS).length });

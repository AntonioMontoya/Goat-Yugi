import { getDeckTierNumber, getDeckTierLabel } from "./deck-tiers.js";

/**
 * Mapeo de cartas insignia y representativas por ID de mazo.
 * Garantiza que los mazos principales y arquetipos tengan una carta icónica de presentación.
 */
const SIGNATURE_CARDS_BY_DECK_ID = {
  "chaos-turbo": "Chaos Sorcerer",
  "goat-control": "Scapegoat",
  "chaos-control": "Chaos Sorcerer",
  "warrior": "Blade Knight",
  "monarch": "Zaborg the Thunder Monarch",
  "panda-burn": "Gyaku-Gire Panda",
  "reasoning-gate": "Sacred Phoenix of Nephthys",
  "earth-aggro": "Berserk Gorilla",
  "empty-jar": "Morphing Jar",
  "chaos-recruiter": "Chaos Sorcerer",
  "flip-control": "Night Assailant",
  "goatformat-clown-control": "Dream Clown",
  "goatformat-destiny-board": "Destiny Board",
  "goatformat-direct-attack": "Mirage Dragon",
  "goatformat-final-countdown": "Final Countdown",
  "goatformat-last-warrior": "The Last Warrior from Another Planet",
  "goatformat-lockdown-burn": "Stealth Bird",
  "goatformat-deckout": "Needle Worm",
  "goatformat-p-a-c-m-a-n": "Swarm of Scarabs",
  "goatformat-spatial-collapse": "Ground Collapse",
  "goatformat-wall-stall": "Mirror Wall",
  "goatformat-cat-control": "Rescue Cat",
  "goatformat-earth-control": "Guardian Sphinx",
  "goatformat-ectoplasmer-control": "Ectoplasmer",
  "goatformat-guardian-control": "Guardian Sphinx",
  "goatformat-jam-control": "Revival Jam",
  "goatformat-monarch": "Mobius the Frost Monarch",
  "goatformat-pixie-control": "Pixie Knight",
  "goatformat-relinquished-control": "Relinquished",
  "goatformat-spell-counter-control": "Skilled Dark Magician",
  "goatformat-aitsu-koitsu": "Koitsu",
  "goatformat-aggro-bomb": "Dark Cat with White Tail",
  "goatformat-amazon": "Amazoness Archer (F.K.A. Amazon Archer)",
  "goatformat-archfiend": "Terrorking Archfiend",
  "goatformat-armed-dragon": "Armed Dragon LV7",
  "goatformat-bazoo-return": "Bazoo the Soul-Eater",
  "goatformat-beastdown": "Berserk Gorilla",
  "goatformat-beatdown": "Berserk Gorilla",
  "goatformat-blue-eyes-white-dragon": "Blue-Eyes White Dragon",
  "goatformat-buster-blader": "Buster Blader",
  "goatformat-chaos-aggro": "Chaos Sorcerer",
  "goatformat-chaos-return": "Chaos Sorcerer",
  "goatformat-coin-toss": "Second Coin Toss",
  "goatformat-creator": "The Creator",
  "goatformat-dark-aggro": "Skilled Dark Magician",
  "goatformat-dark-magician": "Dark Magician",
  "goatformat-dice-re-roll": "Graceful Dice",
  "goatformat-dragon-aggro": "Element Dragon",
  "goatformat-drain-aggro": "Skill Drain",
  "goatformat-element-aggro": "Element Dragon",
  "goatformat-elemental-hero": "Elemental HERO Flame Wingman",
  "goatformat-emissary-aggro": "Emissary of the Afterlife",
  "goatformat-fairy-aggro": "Soul of Purity and Light",
  "goatformat-fiend-aggro": "Archfiend Soldier",
  "goatformat-fire-aggro": "Solar Flare Dragon",
  "goatformat-flute-dragon": "Horus the Black Flame Dragon LV6",
  "goatformat-gravekeeper": "Gravekeeper's Spy",
  "goatformat-hand-assault": "Don Zaloog",
  "goatformat-harpie": "Harpie Lady 1",
  "goatformat-horus": "Horus the Black Flame Dragon LV8",
  "goatformat-insect": "Howling Insect",
  "goatformat-light-aggro": "Soul of Purity and Light",
  "goatformat-machine-aggro": "Blowback Dragon",
  "goatformat-magnet-warrior": "Valkyrion the Magna Warrior",
  "goatformat-manticore-aggro": "Manticore of Darkness",
  "goatformat-master-monk": "Master Monk",
  "goatformat-ninja-aggro": "Ninja Grandmaster Sasuke",
  "goatformat-paladin-of-white-dragon": "Paladin of White Dragon",
  "goatformat-plant-aggro": "Lord Poison",
  "goatformat-red-eyes-black-dragon": "Red-Eyes B. Dragon",
  "goatformat-sacred-phoenix": "Sacred Phoenix of Nephthys",
  "goatformat-sealmaster": "Sealmaster Meisei",
  "goatformat-silent-swordsman": "Silent Swordsman LV5",
  "goatformat-spell-canceller-aggro": "Spell Canceller",
  "goatformat-spirit": "Asura Priest",
  "goatformat-strike-ninja": "Strike Ninja",
  "goatformat-toon": "Blue-Eyes Toon Dragon",
  "goatformat-ultimate-insect": "Ultimate Insect LV7",
  "goatformat-vanilla-aggro": "Archfiend Soldier",
  "goatformat-warrior": "Blade Knight",
  "goatformat-water-aggro": "Abyss Soldier",
  "goatformat-wind-aggro": "Garuda the Wind Spirit",
  "goatformat-zombie": "Vampire Lord",
  "goatformat-asura-otk": "Asura Priest",
  "goatformat-banish-turbo": "Banisher of the Light",
  "goatformat-ben-kei-otk": "Armed Samurai - Ben Kei",
  "goatformat-blasting-the-ruins": "Blasting the Ruins",
  "goatformat-bugroth-otk": "Amphibious Bugroth MK-3",
  "goatformat-burn": "Des Koala",
  "goatformat-cyber-stein-otk": "Cyber-Stein",
  "goatformat-dimension-fusion-turbo": "Dimension Fusion",
  "goatformat-doriado": "Elemental Mistress Doriado",
  "goatformat-exodia": "Exodia the Forbidden One",
  "goatformat-fusion-gate-turbo": "Fusion Gate",
  "goatformat-heavy-slump": "Heavy Slump",
  "goatformat-hino-kagu-tsuchi": "Hino-Kagu-Tsuchi",
  "goatformat-huge-revolution": "Huge Revolution",
  "goatformat-last-turn": "Last Turn",
  "goatformat-library-ftk": "Royal Magical Library",
  "goatformat-machine-otk": "Limiter Removal",
  "goatformat-maha-vailo": "Maha Vailo",
  "goatformat-mazera-deville": "Mazera DeVille",
  "goatformat-mokey-mokey-smackdown": "Mokey Mokey",
  "goatformat-necromancer-otk": "Chaos Necromancer",
  "goatformat-neo-daedalus": "Ocean Dragon Lord - Neo-Daedalus",
  "goatformat-ojama": "Ojama King",
  "goatformat-pyramid-of-light": "Andro Sphinx",
  "goatformat-reasoning-gate-otk": "Monster Gate",
  "goatformat-rescue-cat": "Rescue Cat",
  "goatformat-reversal-quiz-otk": "Reversal Quiz",
  "goatformat-shield-and-sword-otk": "Shield & Sword",
  "goatformat-shinato": "Shinato, King of a Higher Plane",
  "goatformat-spell-economics-ftk": "Spell Economics",
  "goatformat-zorc": "Dark Master - Zorc"
};

const STAPLE_NAMES = new Set([
  "Sinister Serpent",
  "Magician of Faith",
  "Sangan",
  "Breaker the Magical Warrior",
  "D.D. Warrior Lady",
  "Tribe-Infecting Virus",
  "Morphing Jar",
  "Pot of Greed",
  "Graceful Charity",
  "Delinquent Duo",
  "Snatch Steal",
  "Heavy Storm",
  "Mystical Space Typhoon",
  "Premature Burial",
  "Call of the Haunted",
  "Mirror Force",
  "Ring of Destruction",
  "Torrential Tribute"
]);

/**
 * Resuelve la mejor carta representativa para un mazo dado.
 * @param {object} deck - Objeto del mazo
 * @param {function} getCard - Función para resolver cartas por ID o código
 * @returns {object|null} Carta representativa con metadatos
 */
export function getRepresentativeCardForDeck(deck, getCard) {
  if (!deck) return null;

  const mainCards = (deck.main ?? []).map((id) => (typeof getCard === "function" ? getCard(id) : null)).filter(Boolean);
  const fusionCards = (deck.fusion ?? []).map((id) => (typeof getCard === "function" ? getCard(id) : null)).filter(Boolean);
  const allCards = [...mainCards, ...fusionCards];

  // 1. Mapeo específico por ID
  const signatureName = SIGNATURE_CARDS_BY_DECK_ID[deck.id];
  if (signatureName) {
    const directMatch = allCards.find((c) => c.name.toLowerCase() === signatureName.toLowerCase());
    if (directMatch) return directMatch;
  }

  // 2. Coincidencia por palabras clave del arquetipo en el nombre
  const keywords = (deck.name || deck.id || "")
    .toLowerCase()
    .replace(/^goatformat-/, "")
    .split(/[\s-]+/)
    .filter((w) => w.length > 3 && !["aggro", "control", "turbo", "format"].includes(w));

  if (keywords.length) {
    const keywordMatch = mainCards.find((c) => {
      const cName = c.name.toLowerCase();
      return keywords.some((kw) => cName.includes(kw));
    });
    if (keywordMatch) return keywordMatch;
  }

  // 3. Monstruo no-staple de mayor ATK / Nivel en Main
  const monsters = mainCards.filter((c) => c.kind === "MONSTER" && !STAPLE_NAMES.has(c.name));
  if (monsters.length) {
    monsters.sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0) || (b.level ?? 0) - (a.level ?? 0));
    return monsters[0];
  }

  // 4. Primera carta no-staple en Main
  const nonStaple = mainCards.find((c) => !STAPLE_NAMES.has(c.name));
  if (nonStaple) return nonStaple;

  // 5. Fallback a la primera carta del mazo
  return allCards[0] ?? null;
}

/**
 * Resuelve el path de imagen de la carta representativa.
 */
export function getDeckCardImagePath(card) {
  if (!card) return "./goat-card-images/back.png";
  const name = card.imageFile ?? card.name;
  return `./goat-card-images/${encodeURIComponent(name.endsWith(".webp") || name.endsWith(".png") ? name : `${name}.webp`)}`;
}

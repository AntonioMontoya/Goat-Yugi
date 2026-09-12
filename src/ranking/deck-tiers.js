import { NEXO2_BOT_ID } from "../bots/bot-system.js";
import { NEXO3_BOT_ID } from "../bots/nexo3-contract.js";
import { UNIVERSAL_BOT_ID } from "../bots/bot-system.js";

export const RANK_TIERS = Object.freeze([
  { id: "bronce", name: "Bronce", minRating: 0, color: "#cd7f32", border: "#a0522d", bgGlow: "rgba(205, 127, 50, 0.25)" },
  { id: "oro", name: "Oro", minRating: 1200, color: "#ffd700", border: "#d4af37", bgGlow: "rgba(255, 215, 0, 0.25)" },
  { id: "esmeralda", name: "Esmeralda", minRating: 1500, color: "#50c878", border: "#2e8b57", bgGlow: "rgba(80, 200, 120, 0.25)" },
  { id: "diamante", name: "Diamante", minRating: 1800, color: "#00e5ff", border: "#00bfff", bgGlow: "rgba(0, 229, 255, 0.3)" }
]);

export const DIVISIONS = Object.freeze([5, 4, 3, 2, 1]);
export const DIVISION_ROMAN = Object.freeze({ 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I" });

/**
 * 113 Mazos categorizados por rendimiento real (WinRate en >33.900 partidas).
 */
export const TIER_1_DECKS = Object.freeze([
  "chaos-turbo",
  "goat-control",
  "goatformat-beatdown",
  "goatformat-lockdown-burn",
  "goatformat-burn",
  "goatformat-zombie",
  "earth-aggro",
  "goatformat-drain-aggro",
  "goatformat-dimension-fusion-turbo",
  "goatformat-ultimate-insect",
  "goatformat-dragon-aggro",
  "goatformat-element-aggro",
  "goatformat-vanilla-aggro",
  "goatformat-pixie-control"
]);

export const TIER_2_DECKS = Object.freeze([
  "warrior",
  "goatformat-warrior",
  "chaos-control",
  "goatformat-monarch",
  "chaos-recruiter",
  "panda-burn",
  "reasoning-gate",
  "goatformat-last-warrior",
  "goatformat-horus",
  "goatformat-armed-dragon",
  "goatformat-guardian-control",
  "goatformat-beastdown",
  "goatformat-chaos-aggro",
  "goatformat-coin-toss",
  "goatformat-dark-aggro",
  "goatformat-emissary-aggro",
  "goatformat-fairy-aggro",
  "goatformat-fiend-aggro",
  "goatformat-fire-aggro",
  "goatformat-hand-assault",
  "goatformat-light-aggro",
  "goatformat-manticore-aggro",
  "goatformat-red-eyes-black-dragon",
  "goatformat-sealmaster",
  "goatformat-silent-swordsman",
  "goatformat-spell-canceller-aggro",
  "goatformat-reasoning-gate-otk",
  "goatformat-zorc"
]);

export const TIER_3_DECKS = Object.freeze([
  "goatformat-chaos-return",
  "goatformat-strike-ninja",
  "goatformat-gravekeeper",
  "goatformat-bazoo-return",
  "goatformat-flute-dragon",
  "goatformat-harpie",
  "goatformat-elemental-hero",
  "goatformat-buster-blader",
  "goatformat-blue-eyes-white-dragon",
  "goatformat-creator",
  "goatformat-dark-magician",
  "goatformat-archfiend",
  "goatformat-spell-counter-control",
  "goatformat-machine-otk",
  "goatformat-aggro-bomb",
  "goatformat-amazon",
  "goatformat-banish-turbo",
  "goatformat-deckout",
  "goatformat-final-countdown",
  "goatformat-relinquished-control",
  "goatformat-spatial-collapse",
  "goatformat-earth-control",
  "goatformat-jam-control",
  "goatformat-dice-re-roll",
  "goatformat-machine-aggro",
  "goatformat-master-monk",
  "goatformat-ninja-aggro",
  "goatformat-paladin-of-white-dragon",
  "goatformat-plant-aggro",
  "goatformat-sacred-phoenix",
  "goatformat-spirit",
  "goatformat-water-aggro",
  "goatformat-wind-aggro",
  "goatformat-asura-otk",
  "goatformat-doriado",
  "goatformat-heavy-slump",
  "goatformat-huge-revolution",
  "goatformat-neo-daedalus",
  "goatformat-shield-and-sword-otk"
]);

export const TIER_4_DECKS = Object.freeze([
  "flip-control",
  "goatformat-insect",
  "goatformat-cyber-stein-otk",
  "goatformat-rescue-cat",
  "goatformat-wall-stall",
  "goatformat-cat-control",
  "goatformat-direct-attack",
  "goatformat-destiny-board",
  "goatformat-clown-control",
  "goatformat-p-a-c-m-a-n",
  "empty-jar",
  "goatformat-ectoplasmer-control",
  "goatformat-aitsu-koitsu",
  "goatformat-magnet-warrior",
  "goatformat-toon",
  "goatformat-ben-kei-otk",
  "goatformat-blasting-the-ruins",
  "goatformat-bugroth-otk",
  "goatformat-exodia",
  "goatformat-fusion-gate-turbo",
  "goatformat-hino-kagu-tsuchi",
  "goatformat-last-turn",
  "goatformat-library-ftk",
  "goatformat-maha-vailo",
  "goatformat-mazera-deville",
  "goatformat-mokey-mokey-smackdown",
  "goatformat-necromancer-otk",
  "goatformat-ojama",
  "goatformat-pyramid-of-light",
  "goatformat-reversal-quiz-otk",
  "goatformat-shinato",
  "goatformat-spell-economics-ftk"
]);

export const FAKE_ONLINE_NAMES = Object.freeze([
  "Manolito", "KaibaBoy99", "YugiFan_05", "Joey_Luck", "GX_Chazz", "DuelistKing",
  "ShadowRealm", "KuribohFan", "CyberEndDragon", "DarkMagicianGirl", "ExodiaObliterate",
  "SliferTheRed", "ObeliskBlue_01", "Ra_Yellow_Aces", "PegasusToonLord", "Mai_Valentine_05",
  "Marik_Ishtar_99", "Bakura_Necro", "Pedro_ElDuelista", "Alex_TCG", "Diego_Monarch",
  "Marta_Chaos", "Javi_Goat", "Carlos_Dark", "Lucia_Spell", "Raul_Warrior", "Sergio_Control",
  "Pablo_BLS", "Dani_Morphing", "Alvaro_Jinzo", "GoatVeteran", "ProPlayer_ES", "NoScopeYugi",
  "MirrorForceKing", "PotOfGreed2005", "TsukuLover", "RingOfDestruction", "TorrentialSurprise",
  "ChaosEmperor", "HeavyStormWin", "DimensionFusionMaster", "MetamorphosisGod", "TengoMiedoDeTER",
  "SoloJuegoBurn", "OjamaPowa", "RoboYRobo", "TopdeckLuck", "NoMeTiresDuo", "CuidadoConBLS",
  "ElPandaPegador", "DesLacoodaFan", "MorphingParty", "SolemnOP", "SkillDrainEnjoyer",
  "BreakerBreaker", "SanganSearches", "FaithfulMagician", "AsuraClean", "BazooBanish",
  "ZaborgTheThunder", "MobiusCold", "ThestalosFlame", "JinzoNegates", "LilyPay2000",
  "BladeKnight", "DonZaloogDiscards", "SpiritReaperWall", "SinisterSerpentFree",
  "BookOfMoonPro", "SnatchStealGG", "NobleCrossout", "ScapegoatArmy", "CreatureSwapped",
  "CallOfTheHaunted", "PrematureRevival", "SakuretsuArmor", "BottomlessPit", "RoyalDecreeActive",
  "MysticalSpaceTyphoon", "HeavyStormClutch", "PotOfGreedBanned", "GracefulDiscards", "DelinquentHand",
  "ConfiscationReveal", "TheForceForce", "NightAssailantLoops", "AirknightPiercing", "ParshathCardDraw",
  "DekoichiTrain", "ApprenticeMagician", "OldVindictive", "D.D.WarriorLady", "D.D.Assailant",
  "AbyssSoldierBounce", "LekungaTokens", "StrikeNinjaDodger", "ReturnWinCon", "LastTurnCheater",
  "CyberStein5000", "MegamorphOTK", "ReasoningGuessRight", "MonsterGateRoll", "SacredPhoenixRises",
  "GravekeeperSpyDefense", "NecrovalleyDenial", "ArmedDragonLV7", "HorusLV8Lock", "SilentSwordsmanLV5",
  "RelinquishedAbsorb", "ExodiaPieceFound", "DestinyBoardFinal", "WaveMotionCannon8", "StealthBirdBurn"
]);

export const FAKE_ONLINE_TITLES = Object.freeze([
  "Especialista en Control", "Invocador del Caos", "As de Torneos", "Veterano de Goat",
  "Estratega de Retaguardia", "Aspirante de Diamante", "Maestro de Invocaciones", "Cazador de Dragones",
  "Pescador de Flip-Flop", "Rey del OTK", "Duelista Agresivo", "Guardián de Trampas",
  "Alquimista de Recursos", "Señor de las Sombras", "Pionero del Formato", "Coleccionista de Victorias",
  "Artífice de Combos", "Estratega Implacable", "Duelista Nato", "Campeón de Tienda"
]);

/**
 * Retorna el tier (1..4) de un deckId dado.
 */
export function getDeckTierNumber(deckId) {
  if (TIER_1_DECKS.includes(deckId)) return 1;
  if (TIER_2_DECKS.includes(deckId)) return 2;
  if (TIER_3_DECKS.includes(deckId)) return 3;
  if (TIER_4_DECKS.includes(deckId)) return 4;
  return 3;
}

export function getDeckTierLabel(tierNum) {
  if (tierNum === 1) return "Tier 1 · Élite";
  if (tierNum === 2) return "Tier 2 · Sólido";
  if (tierNum === 3) return "Tier 3 · Viable";
  return "Tier 4 · Temático";
}

/**
 * Selecciona un elemento aleatorio ponderado de un array de candidatos con pesos.
 */
function weightedPick(items, weights) {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= Math.max(0, weights[i]);
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Selecciona un mazo de un pool evitando repeticiones recientes.
 */
function pickDeckFromPool(pool, recentDeckIds = []) {
  if (!pool.length) return TIER_1_DECKS[0];
  const weights = pool.map((deckId) => {
    const recentIndex = recentDeckIds.indexOf(deckId);
    if (recentIndex === -1) return 100;
    if (recentIndex === 0) return 2;
    if (recentIndex === 1) return 8;
    return 25;
  });
  return weightedPick(pool, weights);
}

export const BOT_ARCHETYPES = ["Guerrero", "Arquero", "Monje", "Sacerdotisa"];

export function getRankedOpponentSprite({ tier = "Bronce", division = 5, isPromotion = false, archetype = "Guerrero" } = {}) {
  if (isPromotion) return "EnemyLord.webp";
  const normTier = String(tier).trim().toLowerCase();
  const divNum = Number(division) || 5;
  const valid = BOT_ARCHETYPES.includes(archetype) ? archetype : "Guerrero";
  if (normTier === "diamante" && (divNum === 1 || divNum === 2 || divNum === 3)) {
    return `${valid}_Diamante.webp`;
  }
  return `${valid}.webp`;
}

/**
 * Genera un rival simulado (Fake Online) según el rango y división del jugador.
 */
export function generateRankedOpponent({
  tier = "Bronce",
  division = 5,
  isPromotion = false,
  recentDeckIds = [],
  recentOpponents = []
} = {}) {
  const normTier = String(tier).trim().toLowerCase();
  const divNumber = Math.max(1, Math.min(5, Number(division) || 5));
  const divClimb = (5 - divNumber) / 4; 

  let botId = NEXO3_BOT_ID;
  let deckTier = 4;
  let pool = TIER_4_DECKS;

  if (isPromotion) {
    botId = NEXO3_BOT_ID;
    if (normTier === "bronce") {
      deckTier = Math.random() < 0.6 ? 2 : 1;
      pool = deckTier === 1 ? TIER_1_DECKS : TIER_2_DECKS;
    } else {
      deckTier = 1;
      pool = TIER_1_DECKS;
    }
  } else if (normTier === "diamante") {
    botId = NEXO3_BOT_ID;
    const roll = Math.random();
    if (roll < 0.85) {
      deckTier = 1;
      pool = TIER_1_DECKS;
    } else if (roll < 0.99) {
      deckTier = 2;
      pool = TIER_2_DECKS;
    } else {
      deckTier = 3;
      pool = TIER_3_DECKS;
    }
  } else if (normTier === "esmeralda") {
    const isNexo3 = Math.random() < 0.75;
    if (isNexo3) {
      botId = NEXO3_BOT_ID;
      const tier1Chance = 0.30 + (divClimb * 0.20);
      if (Math.random() < tier1Chance) {
        deckTier = 1;
        pool = TIER_1_DECKS;
      } else {
        deckTier = 2;
        pool = TIER_2_DECKS;
      }
    } else {
      botId = UNIVERSAL_BOT_ID;
      deckTier = 1;
      pool = TIER_1_DECKS;
    }
  } else if (normTier === "oro") {
    const isNexo3 = Math.random() < 0.50;
    botId = isNexo3 ? NEXO3_BOT_ID : UNIVERSAL_BOT_ID;

    const surpriseRoll = Math.random();
    if (surpriseRoll < 0.03) {
      deckTier = 1;
      pool = TIER_1_DECKS;
    } else {
      const tier2Chance = 0.15 + (divClimb * 0.25);
      if (Math.random() < tier2Chance) {
        deckTier = 2;
        pool = TIER_2_DECKS;
      } else {
        deckTier = 3;
        pool = TIER_3_DECKS;
      }
    }
  } else {
    // Bronce
    const easterEggRoll = Math.random();
    if (easterEggRoll < 0.01) {
      botId = NEXO3_BOT_ID;
      deckTier = 1;
      pool = TIER_1_DECKS;
    } else {
      const isNexo3 = Math.random() < 0.25;
      botId = isNexo3 ? NEXO3_BOT_ID : UNIVERSAL_BOT_ID;

      const tier3Chance = 0.10 + (divClimb * 0.20);
      if (Math.random() < tier3Chance) {
        deckTier = 3;
        pool = TIER_3_DECKS;
      } else {
        deckTier = 4;
        pool = TIER_4_DECKS;
      }
    }
  }

  const selectedDeckId = pickDeckFromPool(pool, recentDeckIds);

  const availableNames = FAKE_ONLINE_NAMES.filter((name) => !recentOpponents.includes(name));
  const opponentName = isPromotion ? "Enemy Lord" : (availableNames.length ? availableNames : FAKE_ONLINE_NAMES)[
    Math.floor(Math.random() * (availableNames.length || FAKE_ONLINE_NAMES.length))
  ];

  const opponentTitle = isPromotion ? "Guardián de Ascenso" : FAKE_ONLINE_TITLES[Math.floor(Math.random() * FAKE_ONLINE_TITLES.length)];
  const avatarId = isPromotion ? 0 : (Math.abs(hashString(opponentName)) % 12) + 1;

  let rivalDivision = isPromotion ? 5 : divNumber;
  if (!isPromotion) {
    const divDeltaRoll = Math.random();
    if (divDeltaRoll < 0.25 && divNumber > 1) rivalDivision -= 1;
    else if (divDeltaRoll > 0.75 && divNumber < 5) rivalDivision += 1;
  }

  const romanDiv = DIVISION_ROMAN[rivalDivision] ?? "V";
  const archetype = isPromotion ? "EnemyLord" : BOT_ARCHETYPES[Math.abs(hashString(opponentName)) % BOT_ARCHETYPES.length];
  const sprite = getRankedOpponentSprite({ tier, division: rivalDivision, isPromotion, archetype });

  return {
    botId,
    deckId: selectedDeckId,
    deckTier,
    opponentName,
    opponentTitle,
    avatarId,
    archetype,
    sprite,
    isPromotion: Boolean(isPromotion),
    opponentTier: tier,
    opponentDivision: rivalDivision,
    opponentDivisionRoman: romanDiv,
    opponentRating: calculateBaseRating(tier, rivalDivision)
  };
}

export function calculateBaseRating(tier, division) {
  const norm = String(tier).trim().toLowerCase();
  let base = 900;
  if (norm === "oro") base = 1200;
  else if (norm === "esmeralda") base = 1500;
  else if (norm === "diamante") base = 1800;

  const div = Math.max(1, Math.min(5, Number(division) || 5));
  return base + ((5 - div) * 60) + Math.floor(Math.random() * 30);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

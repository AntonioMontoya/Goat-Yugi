import { getDeckProfile } from "../../decks/deck-profiles.js";
import { createDeckGuardrail, primaryCode, codeOf } from "./base-deck-guardrail.js";

// Import specific deck guardrails
import emptyJarGuardrail from "./empty-jar.guardrails.js";
import clownControlGuardrail from "./goatformat-clown-control.guardrails.js";
import spatialCollapseGuardrail from "./goatformat-spatial-collapse.guardrails.js";
import bazooReturnGuardrail from "./goatformat-bazoo-return.guardrails.js";
import monarchGuardrail from "./goatformat-monarch.guardrails.js";
import strikeNinjaGuardrail from "./goatformat-strike-ninja.guardrails.js";
import beatdownGuardrail from "./goatformat-beatdown.guardrails.js";
import earthAggroGuardrail from "./earth-aggro.guardrails.js";
import drainAggroGuardrail from "./goatformat-drain-aggro.guardrails.js";
import relinquishedControlGuardrail from "./goatformat-relinquished-control.guardrails.js";
import burnGuardrail from "./goatformat-burn.guardrails.js";
import goatControlGuardrail from "./goat-control.guardrails.js";
import chaosTurboGuardrail from "./chaos-turbo.guardrails.js";
import chaosControlGuardrail from "./chaos-control.guardrails.js";
import zombieGuardrail from "./goatformat-zombie.guardrails.js";
import warriorGuardrail from "./warrior.guardrails.js";
import flipControlGuardrail from "./flip-control.guardrails.js";
import chaosReturnGuardrail from "./goatformat-chaos-return.guardrails.js";
import deckoutGuardrail from "./goatformat-deckout.guardrails.js";
import cyberSteinGuardrail from "./goatformat-cyber-stein-otk.guardrails.js";
import destinyBoardGuardrail from "./goatformat-destiny-board.guardrails.js";
import pacmanGuardrail from "./goatformat-p-a-c-m-a-n.guardrails.js";
import chaosRecruiterGuardrail from "./chaos-recruiter.guardrails.js";
import gravekeeperGuardrail from "./goatformat-gravekeeper.guardrails.js";
import pandaBurnGuardrail from "./panda-burn.guardrails.js";
import reasoningGateGuardrail from "./reasoning-gate.guardrails.js";
import lastWarriorGuardrail from "./goatformat-last-warrior.guardrails.js";
import fluteDragonGuardrail from "./goatformat-flute-dragon.guardrails.js";
import harpieGuardrail from "./goatformat-harpie.guardrails.js";
import horusGuardrail from "./goatformat-horus.guardrails.js";
import armedDragonGuardrail from "./goatformat-armed-dragon.guardrails.js";
import insectGuardrail from "./goatformat-insect.guardrails.js";
import elementalHeroGuardrail from "./goatformat-elemental-hero.guardrails.js";
import busterBladerGuardrail from "./goatformat-buster-blader.guardrails.js";
import blueEyesGuardrail from "./goatformat-blue-eyes-white-dragon.guardrails.js";
import creatorGuardrail from "./goatformat-creator.guardrails.js";
import darkMagicianGuardrail from "./goatformat-dark-magician.guardrails.js";
import guardianControlGuardrail from "./goatformat-guardian-control.guardrails.js";
import archfiendGuardrail from "./goatformat-archfiend.guardrails.js";
import spellCounterControlGuardrail from "./goatformat-spell-counter-control.guardrails.js";
import machineOtkGuardrail from "./goatformat-machine-otk.guardrails.js";
import aggroBombGuardrail from "./goatformat-aggro-bomb.guardrails.js";
import amazonGuardrail from "./goatformat-amazon.guardrails.js";
import rescueCatGuardrail from "./goatformat-rescue-cat.guardrails.js";
import banishTurboGuardrail from "./goatformat-banish-turbo.guardrails.js";
import wallStallGuardrail from "./goatformat-wall-stall.guardrails.js";
import finalCountdownGuardrail from "./goatformat-final-countdown.guardrails.js";
import catControlGuardrail from "./goatformat-cat-control.guardrails.js";
import directAttackGuardrail from "./goatformat-direct-attack.guardrails.js";




// Extended 62 Decks Guardrails
import earthControlGuardrail from "./goatformat-earth-control.guardrails.js";
import ectoplasmerControlGuardrail from "./goatformat-ectoplasmer-control.guardrails.js";
import jamControlGuardrail from "./goatformat-jam-control.guardrails.js";
import pixieControlGuardrail from "./goatformat-pixie-control.guardrails.js";
import aitsuKoitsuGuardrail from "./goatformat-aitsu-koitsu.guardrails.js";
import beastdownGuardrail from "./goatformat-beastdown.guardrails.js";
import chaosAggroGuardrail from "./goatformat-chaos-aggro.guardrails.js";
import coinTossGuardrail from "./goatformat-coin-toss.guardrails.js";
import darkAggroGuardrail from "./goatformat-dark-aggro.guardrails.js";
import diceReRollGuardrail from "./goatformat-dice-re-roll.guardrails.js";
import dragonAggroGuardrail from "./goatformat-dragon-aggro.guardrails.js";
import elementAggroGuardrail from "./goatformat-element-aggro.guardrails.js";
import emissaryAggroGuardrail from "./goatformat-emissary-aggro.guardrails.js";
import fairyAggroGuardrail from "./goatformat-fairy-aggro.guardrails.js";
import fiendAggroGuardrail from "./goatformat-fiend-aggro.guardrails.js";
import fireAggroGuardrail from "./goatformat-fire-aggro.guardrails.js";
import handAssaultGuardrail from "./goatformat-hand-assault.guardrails.js";
import lightAggroGuardrail from "./goatformat-light-aggro.guardrails.js";
import machineAggroGuardrail from "./goatformat-machine-aggro.guardrails.js";
import magnetWarriorGuardrail from "./goatformat-magnet-warrior.guardrails.js";
import manticoreAggroGuardrail from "./goatformat-manticore-aggro.guardrails.js";
import masterMonkGuardrail from "./goatformat-master-monk.guardrails.js";
import ninjaAggroGuardrail from "./goatformat-ninja-aggro.guardrails.js";
import paladinOfWhiteDragonGuardrail from "./goatformat-paladin-of-white-dragon.guardrails.js";
import plantAggroGuardrail from "./goatformat-plant-aggro.guardrails.js";
import redEyesBlackDragonGuardrail from "./goatformat-red-eyes-black-dragon.guardrails.js";
import sacredPhoenixGuardrail from "./goatformat-sacred-phoenix.guardrails.js";
import sealmasterGuardrail from "./goatformat-sealmaster.guardrails.js";
import silentSwordsmanGuardrail from "./goatformat-silent-swordsman.guardrails.js";
import spellCancellerAggroGuardrail from "./goatformat-spell-canceller-aggro.guardrails.js";
import spiritGuardrail from "./goatformat-spirit.guardrails.js";
import toonGuardrail from "./goatformat-toon.guardrails.js";
import ultimateInsectGuardrail from "./goatformat-ultimate-insect.guardrails.js";
import vanillaAggroGuardrail from "./goatformat-vanilla-aggro.guardrails.js";
import waterAggroGuardrail from "./goatformat-water-aggro.guardrails.js";
import windAggroGuardrail from "./goatformat-wind-aggro.guardrails.js";
import asuraOtkGuardrail from "./goatformat-asura-otk.guardrails.js";
import benKeiOtkGuardrail from "./goatformat-ben-kei-otk.guardrails.js";
import blastingTheRuinsGuardrail from "./goatformat-blasting-the-ruins.guardrails.js";
import bugrothOtkGuardrail from "./goatformat-bugroth-otk.guardrails.js";
import dimensionFusionTurboGuardrail from "./goatformat-dimension-fusion-turbo.guardrails.js";
import doriadoGuardrail from "./goatformat-doriado.guardrails.js";
import exodiaGuardrail from "./goatformat-exodia.guardrails.js";
import fusionGateTurboGuardrail from "./goatformat-fusion-gate-turbo.guardrails.js";
import heavySlumpGuardrail from "./goatformat-heavy-slump.guardrails.js";
import hinoKaguTsuchiGuardrail from "./goatformat-hino-kagu-tsuchi.guardrails.js";
import hugeRevolutionGuardrail from "./goatformat-huge-revolution.guardrails.js";
import lastTurnGuardrail from "./goatformat-last-turn.guardrails.js";
import libraryFtkGuardrail from "./goatformat-library-ftk.guardrails.js";
import mahaVailoGuardrail from "./goatformat-maha-vailo.guardrails.js";
import mazeraDevilleGuardrail from "./goatformat-mazera-deville.guardrails.js";
import mokeyMokeySmackdownGuardrail from "./goatformat-mokey-mokey-smackdown.guardrails.js";
import necromancerOtkGuardrail from "./goatformat-necromancer-otk.guardrails.js";
import neoDaedalusGuardrail from "./goatformat-neo-daedalus.guardrails.js";
import ojamaGuardrail from "./goatformat-ojama.guardrails.js";
import pyramidOfLightGuardrail from "./goatformat-pyramid-of-light.guardrails.js";
import reasoningGateOtkGuardrail from "./goatformat-reasoning-gate-otk.guardrails.js";
import reversalQuizOtkGuardrail from "./goatformat-reversal-quiz-otk.guardrails.js";
import shieldAndSwordOtkGuardrail from "./goatformat-shield-and-sword-otk.guardrails.js";
import shinatoGuardrail from "./goatformat-shinato.guardrails.js";
import spellEconomicsFtkGuardrail from "./goatformat-spell-economics-ftk.guardrails.js";
import zorcGuardrail from "./goatformat-zorc.guardrails.js";

const DECK_GUARDRAILS_REGISTRY = new Map([
  ["goatformat-earth-control", earthControlGuardrail],
  ["earth-control", earthControlGuardrail],
  ["goatformat-ectoplasmer-control", ectoplasmerControlGuardrail],
  ["ectoplasmer-control", ectoplasmerControlGuardrail],
  ["goatformat-jam-control", jamControlGuardrail],
  ["jam-control", jamControlGuardrail],
  ["goatformat-pixie-control", pixieControlGuardrail],
  ["pixie-control", pixieControlGuardrail],
  ["goatformat-aitsu-koitsu", aitsuKoitsuGuardrail],
  ["aitsu-koitsu", aitsuKoitsuGuardrail],
  ["goatformat-beastdown", beastdownGuardrail],
  ["beastdown", beastdownGuardrail],
  ["goatformat-chaos-aggro", chaosAggroGuardrail],
  ["chaos-aggro", chaosAggroGuardrail],
  ["goatformat-coin-toss", coinTossGuardrail],
  ["coin-toss", coinTossGuardrail],
  ["goatformat-dark-aggro", darkAggroGuardrail],
  ["dark-aggro", darkAggroGuardrail],
  ["goatformat-dice-re-roll", diceReRollGuardrail],
  ["dice-re-roll", diceReRollGuardrail],
  ["goatformat-dragon-aggro", dragonAggroGuardrail],
  ["dragon-aggro", dragonAggroGuardrail],
  ["goatformat-element-aggro", elementAggroGuardrail],
  ["element-aggro", elementAggroGuardrail],
  ["goatformat-emissary-aggro", emissaryAggroGuardrail],
  ["emissary-aggro", emissaryAggroGuardrail],
  ["goatformat-fairy-aggro", fairyAggroGuardrail],
  ["fairy-aggro", fairyAggroGuardrail],
  ["goatformat-fiend-aggro", fiendAggroGuardrail],
  ["fiend-aggro", fiendAggroGuardrail],
  ["goatformat-fire-aggro", fireAggroGuardrail],
  ["fire-aggro", fireAggroGuardrail],
  ["goatformat-hand-assault", handAssaultGuardrail],
  ["hand-assault", handAssaultGuardrail],
  ["goatformat-light-aggro", lightAggroGuardrail],
  ["light-aggro", lightAggroGuardrail],
  ["goatformat-machine-aggro", machineAggroGuardrail],
  ["machine-aggro", machineAggroGuardrail],
  ["goatformat-magnet-warrior", magnetWarriorGuardrail],
  ["magnet-warrior", magnetWarriorGuardrail],
  ["goatformat-manticore-aggro", manticoreAggroGuardrail],
  ["manticore-aggro", manticoreAggroGuardrail],
  ["goatformat-master-monk", masterMonkGuardrail],
  ["master-monk", masterMonkGuardrail],
  ["goatformat-ninja-aggro", ninjaAggroGuardrail],
  ["ninja-aggro", ninjaAggroGuardrail],
  ["goatformat-paladin-of-white-dragon", paladinOfWhiteDragonGuardrail],
  ["paladin-of-white-dragon", paladinOfWhiteDragonGuardrail],
  ["goatformat-plant-aggro", plantAggroGuardrail],
  ["plant-aggro", plantAggroGuardrail],
  ["goatformat-red-eyes-black-dragon", redEyesBlackDragonGuardrail],
  ["red-eyes-black-dragon", redEyesBlackDragonGuardrail],
  ["goatformat-sacred-phoenix", sacredPhoenixGuardrail],
  ["sacred-phoenix", sacredPhoenixGuardrail],
  ["goatformat-sealmaster", sealmasterGuardrail],
  ["sealmaster", sealmasterGuardrail],
  ["goatformat-silent-swordsman", silentSwordsmanGuardrail],
  ["silent-swordsman", silentSwordsmanGuardrail],
  ["goatformat-spell-canceller-aggro", spellCancellerAggroGuardrail],
  ["spell-canceller-aggro", spellCancellerAggroGuardrail],
  ["goatformat-spirit", spiritGuardrail],
  ["spirit", spiritGuardrail],
  ["goatformat-toon", toonGuardrail],
  ["toon", toonGuardrail],
  ["goatformat-ultimate-insect", ultimateInsectGuardrail],
  ["ultimate-insect", ultimateInsectGuardrail],
  ["goatformat-vanilla-aggro", vanillaAggroGuardrail],
  ["vanilla-aggro", vanillaAggroGuardrail],
  ["goatformat-water-aggro", waterAggroGuardrail],
  ["water-aggro", waterAggroGuardrail],
  ["goatformat-wind-aggro", windAggroGuardrail],
  ["wind-aggro", windAggroGuardrail],
  ["goatformat-asura-otk", asuraOtkGuardrail],
  ["asura-otk", asuraOtkGuardrail],
  ["goatformat-ben-kei-otk", benKeiOtkGuardrail],
  ["ben-kei-otk", benKeiOtkGuardrail],
  ["goatformat-blasting-the-ruins", blastingTheRuinsGuardrail],
  ["blasting-the-ruins", blastingTheRuinsGuardrail],
  ["goatformat-bugroth-otk", bugrothOtkGuardrail],
  ["bugroth-otk", bugrothOtkGuardrail],
  ["goatformat-dimension-fusion-turbo", dimensionFusionTurboGuardrail],
  ["dimension-fusion-turbo", dimensionFusionTurboGuardrail],
  ["goatformat-doriado", doriadoGuardrail],
  ["doriado", doriadoGuardrail],
  ["goatformat-exodia", exodiaGuardrail],
  ["exodia", exodiaGuardrail],
  ["goatformat-fusion-gate-turbo", fusionGateTurboGuardrail],
  ["fusion-gate-turbo", fusionGateTurboGuardrail],
  ["goatformat-heavy-slump", heavySlumpGuardrail],
  ["heavy-slump", heavySlumpGuardrail],
  ["goatformat-hino-kagu-tsuchi", hinoKaguTsuchiGuardrail],
  ["hino-kagu-tsuchi", hinoKaguTsuchiGuardrail],
  ["goatformat-huge-revolution", hugeRevolutionGuardrail],
  ["huge-revolution", hugeRevolutionGuardrail],
  ["goatformat-last-turn", lastTurnGuardrail],
  ["last-turn", lastTurnGuardrail],
  ["goatformat-library-ftk", libraryFtkGuardrail],
  ["library-ftk", libraryFtkGuardrail],
  ["goatformat-maha-vailo", mahaVailoGuardrail],
  ["maha-vailo", mahaVailoGuardrail],
  ["goatformat-mazera-deville", mazeraDevilleGuardrail],
  ["mazera-deville", mazeraDevilleGuardrail],
  ["goatformat-mokey-mokey-smackdown", mokeyMokeySmackdownGuardrail],
  ["mokey-mokey-smackdown", mokeyMokeySmackdownGuardrail],
  ["goatformat-necromancer-otk", necromancerOtkGuardrail],
  ["necromancer-otk", necromancerOtkGuardrail],
  ["goatformat-neo-daedalus", neoDaedalusGuardrail],
  ["neo-daedalus", neoDaedalusGuardrail],
  ["goatformat-ojama", ojamaGuardrail],
  ["ojama", ojamaGuardrail],
  ["goatformat-pyramid-of-light", pyramidOfLightGuardrail],
  ["pyramid-of-light", pyramidOfLightGuardrail],
  ["goatformat-reasoning-gate-otk", reasoningGateOtkGuardrail],
  ["reasoning-gate-otk", reasoningGateOtkGuardrail],
  ["goatformat-reversal-quiz-otk", reversalQuizOtkGuardrail],
  ["reversal-quiz-otk", reversalQuizOtkGuardrail],
  ["goatformat-shield-and-sword-otk", shieldAndSwordOtkGuardrail],
  ["shield-and-sword-otk", shieldAndSwordOtkGuardrail],
  ["goatformat-shinato", shinatoGuardrail],
  ["shinato", shinatoGuardrail],
  ["goatformat-spell-economics-ftk", spellEconomicsFtkGuardrail],
  ["spell-economics-ftk", spellEconomicsFtkGuardrail],
  ["goatformat-zorc", zorcGuardrail],
  ["zorc", zorcGuardrail],

  ["goatformat-insect", insectGuardrail],
  ["insect", insectGuardrail],
  ["goatformat-elemental-hero", elementalHeroGuardrail],
  ["elemental-hero", elementalHeroGuardrail],
  ["goatformat-buster-blader", busterBladerGuardrail],
  ["buster-blader", busterBladerGuardrail],
  ["goatformat-blue-eyes-white-dragon", blueEyesGuardrail],
  ["blue-eyes-white-dragon", blueEyesGuardrail],
  ["goatformat-creator", creatorGuardrail],
  ["creator", creatorGuardrail],
  ["goatformat-dark-magician", darkMagicianGuardrail],
  ["dark-magician", darkMagicianGuardrail],
  ["goatformat-guardian-control", guardianControlGuardrail],
  ["guardian-control", guardianControlGuardrail],
  ["goatformat-archfiend", archfiendGuardrail],
  ["archfiend", archfiendGuardrail],
  ["goatformat-spell-counter-control", spellCounterControlGuardrail],
  ["spell-counter-control", spellCounterControlGuardrail],
  ["goatformat-machine-otk", machineOtkGuardrail],
  ["machine-otk", machineOtkGuardrail],
  ["goatformat-aggro-bomb", aggroBombGuardrail],
  ["aggro-bomb", aggroBombGuardrail],
  ["goatformat-amazon", amazonGuardrail],
  ["amazon", amazonGuardrail],
  ["goatformat-rescue-cat", rescueCatGuardrail],
  ["rescue-cat", rescueCatGuardrail],
  ["goatformat-banish-turbo", banishTurboGuardrail],
  ["banish-turbo", banishTurboGuardrail],
  ["goatformat-wall-stall", wallStallGuardrail],
  ["wall-stall", wallStallGuardrail],
  ["goatformat-final-countdown", finalCountdownGuardrail],
  ["final-countdown", finalCountdownGuardrail],
  ["goatformat-cat-control", catControlGuardrail],
  ["cat-control", catControlGuardrail],
  ["goatformat-direct-attack", directAttackGuardrail],
  ["direct-attack", directAttackGuardrail],

  ["goatformat-harpie", harpieGuardrail],
  ["harpie", harpieGuardrail],
  ["goatformat-horus", horusGuardrail],
  ["horus", horusGuardrail],
  ["goatformat-armed-dragon", armedDragonGuardrail],
  ["armed-dragon", armedDragonGuardrail],

  ["reasoning-gate", reasoningGateGuardrail],
  ["goatformat-reasoning-gate", reasoningGateGuardrail],
  ["goatformat-last-warrior", lastWarriorGuardrail],
  ["last-warrior", lastWarriorGuardrail],
  ["goatformat-flute-dragon", fluteDragonGuardrail],
  ["flute-dragon", fluteDragonGuardrail],
  ["goatformat-gravekeeper", gravekeeperGuardrail],
  ["gravekeeper", gravekeeperGuardrail],
  ["chaos-recruiter", chaosRecruiterGuardrail],
  ["goatformat-chaos-recruiter", chaosRecruiterGuardrail],
  ["chaos-control", chaosControlGuardrail],
  ["goatformat-chaos-control", chaosControlGuardrail],
  ["goatformat-zombie", zombieGuardrail],
  ["zombie", zombieGuardrail],
  ["chaos-turbo", chaosTurboGuardrail],
  ["goatformat-chaos-turbo", chaosTurboGuardrail],
  ["empty-jar", emptyJarGuardrail],
  ["goatformat-clown-control", clownControlGuardrail],
  ["clown-control", clownControlGuardrail],
  ["goatformat-spatial-collapse", spatialCollapseGuardrail],
  ["spatial-collapse", spatialCollapseGuardrail],
  ["goatformat-bazoo-return", bazooReturnGuardrail],
  ["bazoo-return", bazooReturnGuardrail],
  ["goatformat-monarch", monarchGuardrail],
  ["monarch", monarchGuardrail],
  ["goatformat-strike-ninja", strikeNinjaGuardrail],
  ["strike-ninja", strikeNinjaGuardrail],
  ["goatformat-beatdown", beatdownGuardrail],
  ["beatdown", beatdownGuardrail],
  ["earth-aggro", earthAggroGuardrail],
  ["goatformat-earth-aggro", earthAggroGuardrail],
  ["goatformat-drain-aggro", drainAggroGuardrail],
  ["drain-aggro", drainAggroGuardrail],
  ["goatformat-relinquished-control", relinquishedControlGuardrail],
  ["relinquished-control", relinquishedControlGuardrail],
  ["goatformat-burn", burnGuardrail],
  ["burn", burnGuardrail],
  ["panda-burn", pandaBurnGuardrail],
  ["goatformat-lockdown-burn", burnGuardrail],
  ["lockdown-burn", burnGuardrail],
  ["goat-control", goatControlGuardrail],
  ["warrior", warriorGuardrail],
  ["goatformat-warrior", warriorGuardrail],
  ["flip-control", flipControlGuardrail],
  ["goatformat-chaos-return", chaosReturnGuardrail],
  ["chaos-return", chaosReturnGuardrail],
  ["goatformat-deckout", deckoutGuardrail],
  ["deckout", deckoutGuardrail],
  ["goatformat-cyber-stein-otk", cyberSteinGuardrail],
  ["cyber-stein-otk", cyberSteinGuardrail],
  ["goatformat-destiny-board", destinyBoardGuardrail],
  ["destiny-board", destinyBoardGuardrail],
  ["goatformat-p-a-c-m-a-n", pacmanGuardrail],
  ["p-a-c-m-a-n", pacmanGuardrail],
]);

const defaultGuardrailsCache = new Map();

/**
 * Resolves deck guardrail by deckId, or falls back to card signature
 * if deckId is unspecified (e.g. during isolated unit tests).
 */
export function getDeckGuardrail(deckId = "", entry = null, message = null, context = {}, knowledge = null, evaluated = []) {
  const normalized = String(deckId ?? "").trim().toLowerCase();
  if (normalized && normalized !== "generic") {
    if (DECK_GUARDRAILS_REGISTRY.has(normalized)) return DECK_GUARDRAILS_REGISTRY.get(normalized);
    const withPrefix = normalized.startsWith("goatformat-") ? normalized : `goatformat-${normalized}`;
    if (DECK_GUARDRAILS_REGISTRY.has(withPrefix)) return DECK_GUARDRAILS_REGISTRY.get(withPrefix);
    const withoutPrefix = normalized.replace(/^goatformat-/, "");
    if (DECK_GUARDRAILS_REGISTRY.has(withoutPrefix)) return DECK_GUARDRAILS_REGISTRY.get(withoutPrefix);
  }

  // Fallback: Signature resolution by card code or name for isolated test contexts
  const msgCode = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  const entryCode = primaryCode(entry) || codeOf(entry?.analysis?.cards?.[0]);
  const code = entryCode || msgCode;
  const entryName = String(entry?.analysis?.cards?.[0]?.name ?? "").toLowerCase();
  const msgName = String(knowledge?.byRuntimeCode?.[String(msgCode)]?.name ?? "").toLowerCase();
  const name = entryName || msgName;

  const evalCards = (evaluated ?? []).flatMap((e) => e?.analysis?.cards ?? []);
  const evalNames = evalCards.map((c) => String(c?.name ?? "").toLowerCase());
  const evalRoles = new Set(evalCards.flatMap((c) => c?.roles ?? []));

  const obsMonsters = (context?.observation?.ownMonsters ?? []).map((m) =>
    String(m?.name ?? knowledge?.byRuntimeCode?.[String(codeOf(m))]?.name ?? "").toLowerCase()
  );

  if (code === 51945556 || code === 4929256 || name.includes("zaborg") || name.includes("mobius")) {
    return monarchGuardrail;
  }
  if (code === 39168895 || name.includes("berserk gorilla") || evalNames.some((n) => n.includes("berserk gorilla"))) {
    return beatdownGuardrail;
  }
  if (code === 41006930 || name.includes("strike ninja") || evalNames.some((n) => n.includes("strike ninja"))) {
    return strikeNinjaGuardrail;
  }
  if ([13215230, 58268433, 93889755].includes(code) || name.includes("dream clown") || name.includes("blade rabbit")) {
    return clownControlGuardrail;
  }
  if ([33508719, 1409198982].includes(code) || name.includes("morphing jar")) {
    return emptyJarGuardrail;
  }
  if (code === 20644748 || name.includes("spatial collapse")) {
    return spatialCollapseGuardrail;
  }
  if (code === 40133511 || name.includes("bazoo")) {
    return bazooReturnGuardrail;
  }
  if ([1101417, 69015963].includes(code) || name.includes("cyber-stein")) {
    return cyberSteinGuardrail;
  }
  if (code === 82732705 || name.includes("skill drain")) {
    return drainAggroGuardrail;
  }
  if (code === 23557835 || name.includes("dimension fusion")) {
    return chaosReturnGuardrail;
  }
  if (code === 36468556 || name.includes("ceasefire")) {
    return flipControlGuardrail;
  }
  if (code === 74131780 || name.includes("exiled force")) {
    return warriorGuardrail;
  }
  if ([38992735, 102380].includes(code) || name.includes("wave-motion") || name.includes("lava golem")) {
    return burnGuardrail;
  }
  if (code === 46411259 || name.includes("metamorphosis") || name.includes("scapegoat") || evalNames.some((n) => n.includes("scapegoat"))) {
    return goatControlGuardrail;
  }
  const roles = new Set(entry?.analysis?.cards?.[0]?.roles ?? []);
  if (roles.has("absorb") || name.includes("relinquished") || name.includes("thousand-eyes")
      || evalRoles.has("absorb") || evalNames.some((n) => n.includes("relinquished") || n.includes("thousand-eyes"))
      || obsMonsters.some((n) => n.includes("relinquished") || n.includes("thousand-eyes"))) {
    return relinquishedControlGuardrail;
  }
  if (roles.has("cost-discard-5") || roles.has("deck-consume-5") || [81843628, 79106360].includes(code)) {
    return deckoutGuardrail;
  }

  // Default guardrail for generic deck
  const profileKey = normalized || "generic";
  if (!defaultGuardrailsCache.has(profileKey)) {
    const profile = getDeckProfile(profileKey);
    defaultGuardrailsCache.set(profileKey, createDeckGuardrail({
      id: profileKey,
      tier: profile.tier,
      playstyle: profile.playstyle,
      riskTolerance: profile.riskTolerance,
      evaluate: () => null,
    }));
  }

  return defaultGuardrailsCache.get(profileKey);
}

export const getDeckGuardrails = getDeckGuardrail;

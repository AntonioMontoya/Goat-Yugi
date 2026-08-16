import { CARD_KIND, VALIDATION_STATUS } from "../engine/constants.js";

/**
 * GoatFormat publishes the forbidden names beside the downloadable card-pool
 * sheet. They are part of the historical database, but are intentionally not
 * playable in a Goat Format deck. Keep these records separate so a missing
 * effect source can never be mistaken for an implemented card effect.
 */
export const GOAT_FORBIDDEN_CARDS_SOURCE = Object.freeze({
  provider: "GoatFormat.com",
  url: "https://www.goatformat.com/home/category/card-pool",
  section: "Forbidden Cards",
  format: "TCG April 2005"
});

const blocked = VALIDATION_STATUS.BLOCKED_BY_MISSING_SOURCE;

export const GOAT_FORBIDDEN_CARDS = Object.freeze([
  ["Chaos Emperor Dragon - Envoy of the End", CARD_KIND.MONSTER],
  ["Fiber Jar", CARD_KIND.MONSTER],
  ["Magical Scientist", CARD_KIND.MONSTER],
  ["Makyura the Destructor", CARD_KIND.MONSTER],
  ["Witch of the Black Forest", CARD_KIND.MONSTER],
  ["Yata-Garasu", CARD_KIND.MONSTER],
  ["Butterfly Dagger - Elma", CARD_KIND.SPELL],
  ["Change of Heart", CARD_KIND.SPELL],
  ["Confiscation", CARD_KIND.SPELL],
  ["Dark Hole", CARD_KIND.SPELL],
  ["Harpie's Feather Duster", CARD_KIND.SPELL],
  ["Mirage of Nightmare", CARD_KIND.SPELL],
  ["Monster Reborn", CARD_KIND.SPELL],
  ["Painful Choice", CARD_KIND.SPELL],
  ["Raigeki", CARD_KIND.SPELL],
  ["The Forceful Sentry", CARD_KIND.SPELL],
  ["Imperial Order", CARD_KIND.TRAP]
].map(([name, kind], index) => Object.freeze({
  id: 2147000000 + index,
  name,
  kind,
  text: "Effect text not included in the public GoatFormat card-pool export.",
  status: blocked,
  effect: "BLOCKED_SOURCE",
  effectTemplate: "BLOCKED_SOURCE",
  effectFamily: "BLOCKED_SOURCE",
  metadataComplete: false,
  localizedNames: { en: name },
  visibleText: "Effect text not included in the public GoatFormat card-pool export.",
  rulings: [],
  tests: [],
  legalities: { goatFormat: "FORBIDDEN" },
  source: GOAT_FORBIDDEN_CARDS_SOURCE,
  poolSource: GOAT_FORBIDDEN_CARDS_SOURCE
})));

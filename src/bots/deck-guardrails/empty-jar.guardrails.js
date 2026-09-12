import { codeOf, primaryCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";

const MORPHING_JAR_CODES = new Set([33508719, 1409198982]);
const BOOK_OF_TAIYOU_CODES = new Set([38699854, 333400014]);

const MILL_ENGINE_CODES = new Set([
  81843628,  // Needle Worm
  33508719,  // Morphing Jar
  79106360,  // Morphing Jar #2
  504700188, // Cyber Jar
  15383415,  // Swarm of Scarabs
  41872150,  // Swarm of Locusts
  2694423,   // Medusa Worm
]);

export default createDeckGuardrail({
  id: "empty-jar",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.90,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};

    // 1. Do not set Morphing Jar on turn 1 to an empty board without protection or Book of Taiyou
    if (role === "monster-set") {
      const isMorphingJar = MORPHING_JAR_CODES.has(primaryCode(entry))
        || String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("morphing jar");
      if (isMorphingJar) {
        const oppMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0);
        const ownBackrow = Number(observation.ownBackrowCount ?? observation.ownBackrow?.length ?? 0);
        const hand = observation.ownHand ?? [];
        const hasTaiyou = hand.some((c) => BOOK_OF_TAIYOU_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("book of taiyou"));
        const canDoOther = evaluated.some((other) => other !== entry && ["summon", "monster-set", "spell-set", "activate", "battle-phase", "end-phase"].includes(other.analysis?.role));
        if (oppMonsters > 0 && ownBackrow === 0 && !hasTaiyou && canDoOther) {
          return "EMPTY_JAR_PRESERVE_MORPHING_JAR";
        }
      }
    }

    // 2. Mill engine monsters never attack suicidally
    if (role === "attack") {
      const card = entry.analysis?.cards?.[0];
      const cardId = codeOf(card) || primaryCode(entry);
      const attack = Number(message?.attacks?.[Number(entry.candidate?.index)]?.attack ?? card?.attack ?? card?.atk) || 0;
      const roles = new Set(card?.roles ?? []);
      const isMillEngine = MILL_ENGINE_CODES.has(cardId) || roles.has("cost-discard-5") || roles.has("deck-consume-5");
      const canEndOrM2 = evaluated.some((other) => other !== entry && ["main-two", "end-phase"].includes(other.analysis?.role));

      if (isMillEngine && !isImmediateLethal(entry, observation)) {
        const isCardFaceUp = (m) => m?.faceUp === true || (Number(m?.position) & 5) !== 0 || (Number(m?.position) & 1) !== 0;
        const oppMonsters = observation.opponentMonsters ?? [];
        const oppFaceUp = oppMonsters.filter(isCardFaceUp);
        const isSuicidal = oppFaceUp.length > 0 && oppFaceUp.every((m) => {
          const pos = Number(m.position) || 0;
          const stat = (pos & 1) !== 0 ? (Number(m.attack ?? m.atk) || 0) : (Number(m.defense ?? m.def) || 0);
          return attack <= stat;
        });
        if (canEndOrM2 && (isSuicidal || (oppMonsters.length > 0 && oppFaceUp.length === 0))) {
          return "MILL_ENGINE_NEVER_ATTACKS";
        }
      }
    }

    return null;
  },
});

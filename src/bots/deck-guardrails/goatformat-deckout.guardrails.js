import { codeOf, primaryCode, isImmediateLethal, createDeckGuardrail } from "./base-deck-guardrail.js";

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
  id: "goatformat-deckout",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.80,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};

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

    if (role === "summon") {
      const card = entry.analysis?.cards?.[0];
      const cardId = codeOf(card) || primaryCode(entry);
      if (MILL_ENGINE_CODES.has(cardId) && !isImmediateLethal(entry, observation)) {
        const hasSetAlt = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (hasSetAlt) return "MILL_ENGINE_MUST_BE_SET";
      }
    }

    if (role === "position-change") {
      const card = entry.analysis?.cards?.[0];
      const cardId = codeOf(card) || primaryCode(entry);
      if (MILL_ENGINE_CODES.has(cardId) && !isImmediateLethal(entry, observation)) {
        return "MILL_ENGINE_PRESERVE_DEFENSE_POSITION";
      }
    }

    return null;
  },
});

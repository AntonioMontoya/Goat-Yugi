import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";

const PYRAMID_TURTLE_CODE = 77044671;
const RYU_KOKKI_CODE = 79853073;
const VAMPIRE_LORD_CODE = 53839837;
const GIANT_RAT_CODE = 97017120;
const CREATURE_SWAP_CODE = 31036355;
const BOOK_OF_LIFE_CODE = 22026707;
const ROYAL_DECREE_CODE = 51452091;
const CALL_OF_THE_HAUNTED_CODE = 97077563;
const BERSERK_GORILLA_CODE = 39111158;

export default createDeckGuardrail({
  id: "goatformat-zombie",
  tier: "Tier 2",
  playstyle: "aggro",
  riskTolerance: 0.45,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];

    const isDecreeActive = [...(observation.ownBackrow ?? []), ...(observation.opponentBackrow ?? [])].some((c) => {
      const cCode = codeOf(c);
      const cName = String(c?.name ?? knowledge?.byRuntimeCode?.[String(cCode)]?.name ?? "").toLowerCase();
      const faceUp = c?.faceUp !== false && (Number(c?.position ?? 0) & OcgPosition.FACEDOWN) === 0;
      return faceUp && (cCode === ROYAL_DECREE_CODE || cName.includes("royal decree"));
    });

    // 1. Pyramid Turtle & Giant Rat: Always prefer Set in Defense over Normal Summon Attack
    if (role === "summon" && (code === PYRAMID_TURTLE_CODE || code === GIANT_RAT_CODE || name.includes("pyramid turtle") || name.includes("giant rat"))) {
      const hasCreatureSwapInHand = (observation.ownHand ?? []).some((h) => String(h?.name ?? "").toLowerCase().includes("creature swap"));
      const hasSetAlternative = evaluated.some((other) => other !== entry && other.analysis?.role === "set");
      if (hasSetAlternative && !hasCreatureSwapInHand && !isImmediateLethal(entry, observation)) {
        return "ZOMBIE_PREFER_SET_RECRUITER";
      }
    }

    // 2. Creature Swap: Never give away Boss Monsters (Ryu Kokki, Vampire Lord, Lily)
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      if (sCode === CREATURE_SWAP_CODE || sName.includes("creature swap") || name.includes("creature swap")) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        const givesBoss = selectedIndices.some((idx) => {
          const item = selections[Number(idx)];
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
          return iName.includes("kokki") || iName.includes("vampire lord") || iName.includes("injection fairy lily");
        });
        if (givesBoss) {
          const hasRecruiterAlternative = evaluated.some((other) => !(other.candidate?.indicies ?? []).some((idx) => {
            const item = selections[Number(idx)];
            const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
            const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
            return iName.includes("kokki") || iName.includes("vampire lord") || iName.includes("injection fairy lily");
          }));
          if (hasRecruiterAlternative) {
            return "CREATURE_SWAP_PRESERVE_BOSS_ZOMBIE";
          }
        }
      }
    }

    // 3. Book of Life Target Discipline: Target high ATK Zombie (Ryu Kokki / Vampire Lord)
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)];
      const sName = String(sCard?.name ?? "").toLowerCase();
      if (sCode === BOOK_OF_LIFE_CODE || sName.includes("book of life") || name.includes("book of life")) {
        const selections = message.selects ?? [];
        const selectedIndices = entry.candidate?.indicies ?? [];
        // If selecting own GY target, prioritize Ryu Kokki (2400) or Vampire Lord (2000)
        const hasKokkiOrLord = selections.some((item) => {
          const isOwn = controllerOf(item) === Number(observation.player);
          const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
          const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
          return isOwn && (iName.includes("kokki") || iName.includes("vampire lord"));
        });
        if (hasKokkiOrLord) {
          const selectedKokkiOrLord = selectedIndices.some((idx) => {
            const item = selections[Number(idx)];
            const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
            const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
            return iName.includes("kokki") || iName.includes("vampire lord");
          });
          if (!selectedKokkiOrLord) {
            const canSelectKokki = evaluated.some((other) => (other.candidate?.indicies ?? []).some((idx) => {
              const item = selections[Number(idx)];
              const c = knowledge?.byRuntimeCode?.[String(codeOf(item))];
              const iName = String(c?.name ?? item?.name ?? "").toLowerCase();
              return iName.includes("kokki") || iName.includes("vampire lord");
            }));
            if (canSelectKokki) {
              return "BOOK_OF_LIFE_PRIORITIZE_HIGH_ATK_ZOMBIE";
            }
          }
        }
      }
    }

    // 4. Royal Decree Interaction: Do not activate Call of the Haunted while Decree is active
    if (message?.type === OcgMessageType.SELECT_IDLECMD || message?.type === OcgMessageType.SELECT_CHAIN) {
      if (code === CALL_OF_THE_HAUNTED_CODE || name.includes("call of the haunted")) {
        if (isDecreeActive && evaluated.some((other) => other !== entry)) {
          return "AVOID_CALL_UNDER_ACTIVE_ROYAL_DECREE";
        }
      }
    }

    // 5. Berserk Gorilla Defense Lockout: Never switch Berserk Gorilla to Defense
    if (role === "pos-change" || role === "to-defense") {
      if (code === BERSERK_GORILLA_CODE || name.includes("berserk gorilla")) {
        if (evaluated.some((other) => other !== entry)) {
          return "AVOID_BERSERK_GORILLA_DEFENSE_SUICIDE";
        }
      }
    }

    return null;
  },
});

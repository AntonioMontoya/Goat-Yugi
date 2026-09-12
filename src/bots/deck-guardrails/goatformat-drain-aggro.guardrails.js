import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";

const SKILL_DRAIN_CODE = 82732705;
const FUSILIER_DRAGON_CODE = 51632798;
const GOBLIN_ATTACK_FORCE_CODE = 78658564;
const GIANT_ORC_CODE = 73698449;
const ZOMBYRA_CODE = 88472456;
const SOLEMN_JUDGMENT_CODE = 41420027;
const WAVE_MOTION_CODE = 38992735;

export default createDeckGuardrail({
  id: "goatformat-drain-aggro",
  tier: "Tier 2",
  playstyle: "lockdown",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];
    const oppBackrow = observation.opponentBackrow ?? [];
    const ownLp = Number(observation.ownLp ?? 8000);

    const isBurnOpponent = oppBackrow.some((c) => {
      const cCode = codeOf(c);
      const cName = String(c?.name ?? knowledge?.byRuntimeCode?.[String(cCode)]?.name ?? "").toLowerCase();
      return cCode === WAVE_MOTION_CODE || cName.includes("wave-motion") || cName.includes("gravity bind") || cName.includes("level limit");
    }) || /burn/i.test(String(observation.opponentArchetype ?? ""))
      || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
      || /lockdown/i.test(String(observation.opponentArchetype ?? ""))
      || (context.memory?.commitments?.againstBurn === true);

    // 1. Skill Drain Activation:
    // - Never pay if own LP <= 1000
    // - Avoid activating Skill Drain against pure burn/lockdown decks with 0 effect monsters (saves 1000 LP)
    if (message?.type === OcgMessageType.SELECT_IDLECMD || message?.type === OcgMessageType.SELECT_CHAIN) {
      if (code === SKILL_DRAIN_CODE || name.includes("skill drain")) {
        if (ownLp <= 1000) {
          return "DRAIN_AGGRO_AVOID_LETHAL_SKILL_DRAIN_PAYMENT";
        }
        if (isBurnOpponent && oppMonsters.length === 0) {
          const canPass = evaluated.some((o) => o !== entry && (o.analysis?.role === "pass-chain" || o.analysis?.role === "pass"));
          if (canPass) {
            return "DRAIN_AGGRO_AVOID_SKILL_DRAIN_AGAINST_PURE_BURN";
          }
        }
      }
    }

    // 2. Fusilier Dragon: Always summon without tribute in Attack mode (becomes 2800 under Skill Drain)
    if (role === "set" && (code === FUSILIER_DRAGON_CODE || name.includes("fusilier"))) {
      const hasSummonAlternative = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
      if (hasSummonAlternative) {
        return "FUSILIER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Goblin Attack Force & Giant Orc: Always summon in Attack mode
    if (role === "set" && (code === GOBLIN_ATTACK_FORCE_CODE || code === GIANT_ORC_CODE || name.includes("goblin attack") || name.includes("giant orc"))) {
      const hasSummonAlternative = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
      if (hasSummonAlternative) {
        return "BEATDOWN_ATTACKER_PREFER_ATTACK_SUMMON";
      }
    }

    // 4. Solemn Judgment: Against Burn or low LP, do not pay half LP for minor triggers
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (code === SOLEMN_JUDGMENT_CODE || name.includes("solemn judgment")) {
        const publicChain = observation.publicChain ?? [];
        const lastTrigger = publicChain[publicChain.length - 1];
        const tCard = knowledge?.byRuntimeCode?.[String(codeOf(lastTrigger))];
        const tName = String(tCard?.name ?? lastTrigger?.name ?? "").toLowerCase();
        const isLethalThreat = tName.includes("wave-motion") || tName.includes("ring of destruction")
          || tName.includes("heavy storm") || tName.includes("snatch") || isImmediateLethal(entry, observation);
        const canPass = evaluated.some((o) => o !== entry && o.analysis?.role === "pass-chain");

        if (canPass) {
          if (ownLp <= 3000 && !isLethalThreat) {
            return "SOLEMN_PRESERVE_LP_IN_DANGER_ZONE";
          }
          if (isBurnOpponent && !isLethalThreat) {
            return "SOLEMN_HOLD_AGAINST_BURN";
          }
        }
      }
    }

    // 5. Berserk Gorilla: Never switch to Defense position
    if (role === "pos-change" || role === "to-defense") {
      if (code === 39111158 || name.includes("berserk gorilla")) {
        if (evaluated.some((o) => o !== entry)) {
          return "AVOID_BERSERK_GORILLA_DEFENSE_SUICIDE";
        }
      }
    }

    return null;
  },
});

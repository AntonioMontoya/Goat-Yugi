import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail, codeOf } from "./base-deck-guardrail.js";
import { publicCardSemantics } from "../card-semantics.js";

const TOMATO_CODES = new Set([504700142, 83011277, 12]);
const ANGEL_CODES = new Set([504700170, 95956346, 29157826]);
const CREATURE_SWAP_CODES = new Set([31036355, 39]);
const DUSTSHOOT_CODES = new Set([64697231, 1924046397]);
const ASURA_CODES = new Set([2134346, 1983003612]);
const NEWDORIA_CODES = new Set([4335645, 29697828]);
const SANGAN_CODES = new Set([504700178, 26202165, 8]);
const CHAOS_SORCERER_CODES = new Set([9596126, 651970296]);
const BLS_CODES = new Set([504700118, 72989439, 14]);

export default createDeckGuardrail({
  id: "chaos-recruiter",
  tier: "Tier 2",
  playstyle: "midrange",
  riskTolerance: 0.55,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const memory = context.memory ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp ?? 8000);
    const oppLp = Number(observation.opponentLp ?? 8000);
    const ownHand = observation.ownHand ?? [];

    // 1. Recruiter Summoning Strategy:
    // In Goat Format Chaos Recruiter, Mystic Tomato and Shining Angel are intended to be summoned
    // in Attack mode to attack, crash for GY setup, or combo with Creature Swap.
    // Setting them makes them vulnerable to Nobleman of Crossout (banishing all 3 copies from deck!).
    // Only pure flip/defensive monsters (Magician of Faith) should strongly prefer Set.
    if (role === "summon") {
      if (name.includes("magician of faith")) {
        const oppMonsters = observation.opponentMonsters ?? [];
        if (oppMonsters.length > 0 && !isImmediateLethal(entry, observation)) {
          const hasSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (hasSet) return "CHAOS_RECRUITER_PREFER_SET_MOF";
        }
      }
    }

    // 2. Creature Swap Activation:
    // Both players MUST control at least 1 monster.
    // Never give away BLS or Chaos Sorcerer!
    if (role === "activate") {
      if (CREATURE_SWAP_CODES.has(code) || name.includes("creature swap")) {
        const ownMonsters = observation.ownMonsters ?? [];
        const oppMonsters = observation.opponentMonsters ?? [];
        if (oppMonsters.length === 0 || ownMonsters.length === 0) {
          return "CREATURE_SWAP_REQUIRES_BOTH_FIELDS";
        }
        const onlyBosses = ownMonsters.every((m) => {
          const mc = codeOf(m);
          const mn = String(m?.name ?? "").toLowerCase();
          return BLS_CODES.has(mc) || CHAOS_SORCERER_CODES.has(mc) || mn.includes("black luster") || mn.includes("chaos sorcerer");
        });
        if (onlyBosses) {
          return "CREATURE_SWAP_DO_NOT_GIVE_AWAY_BOSS";
        }
      }
    }

    // 3. Selection of Creature Swap target:
    // Protect high value boss monsters; give away Tomato, Angel, Sangan, or Newdoria.
    if (message?.type === OcgMessageType.SELECT_CARD || message?.type === OcgMessageType.SELECT_TARGET) {
      const sCode = sourceCode(knowledge, message, memory, observation);
      const sCard = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode);
      const sName = String(sCard?.name ?? "").toLowerCase();
      if (CREATURE_SWAP_CODES.has(sCode) || sName.includes("creature swap")) {
        const cardTarget = entry.analysis?.cards?.[0];
        const tName = String(cardTarget?.name ?? "").toLowerCase();
        const tCode = codeOf(cardTarget);
        const isBoss = BLS_CODES.has(tCode) || CHAOS_SORCERER_CODES.has(tCode) || tName.includes("black luster") || tName.includes("chaos sorcerer");
        if (isBoss) {
          const hasBetterTarget = evaluated.some((o) => {
            const oc = codeOf(o.analysis?.cards?.[0]);
            const on = String(o.analysis?.cards?.[0]?.name ?? "").toLowerCase();
            return !BLS_CODES.has(oc) && !CHAOS_SORCERER_CODES.has(oc) && !on.includes("black luster") && !on.includes("chaos sorcerer");
          });
          if (hasBetterTarget) {
            return "CREATURE_SWAP_PROTECT_HIGH_VALUE_TARGET";
          }
        }
      }
    }

    // 4. Trap Dustshoot Timing:
    // Requires opponent to have at least 4 cards in hand.
    if (role === "activate" || role === "chain") {
      if (DUSTSHOOT_CODES.has(code) || name.includes("trap dustshoot")) {
        const oppHandCount = Number(observation.opponentHandSize ?? observation.opponentHandCount ?? 0);
        if (oppHandCount < 4) {
          return "TRAP_DUSTSHOOT_OPPONENT_HAND_TOO_SMALL";
        }
      }
    }

    // 5. Asura Priest Special Synergy:
    // Spirit monster: Never set face-down, always summon face-up to utilize multi-attack and bounce.
    if (role === "monster-set") {
      if (ASURA_CODES.has(code) || name.includes("asura priest")) {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) {
          return "ASURA_PRIEST_NEVER_SET";
        }
      }
    }

    // 6. Anti-Burn Backrow Cap:
    if (role === "spell-set") {
      const isAgainstBurn = /burn/i.test(String(observation.opponentArchetype ?? ""))
        || /burn/i.test(String(observation.opponentModel?.top?.archetype ?? ""))
        || (memory?.commitments?.againstBurn === true);
      const ownBackrow = observation.ownBackrow ?? [];
      if (isAgainstBurn && ownBackrow.length >= 2) {
        return "CHAOS_RECRUITER_CAP_BACKROW_AGAINST_BURN";
      }
    }

    return null;
  },
});

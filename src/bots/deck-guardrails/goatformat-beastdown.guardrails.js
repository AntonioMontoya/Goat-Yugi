import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const GORILLA_CODES = new Set([39168895, 165860383]); // Berserk Gorilla
const BATTLE_OX_CODES = new Set([76909279, 422592064]); // Enraged Battle Ox
const WANGHU_CODES = new Set([83986578, 100853807]); // King Tiger Wanghu
const WARWOLF_CODES = new Set([34758534, 1303153449]); // Pitch-Black Warwolf
const BAZOO_CODES = new Set([40133511, 30238598]); // Bazoo the Soul-Eater
const DUSTSHOOT_CODES = new Set([42233562, 1924046397]); // Trap Dustshoot

export default createDeckGuardrail({
  id: "goatformat-beastdown",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Berserk Gorilla: PROHIBIDO COLOCAR EN DEFENSA (se autodestruye al estar en defensa)
    if (GORILLA_CODES.has(code) || name.includes("berserk gorilla")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "NEVER_SET_BERSERK_GORILLA";
      }
    }

    // 2. Enraged Battle Ox, King Tiger Wanghu, Pitch-Black Warwolf: Beatdowns en ataque
    if (BATTLE_OX_CODES.has(code) || WANGHU_CODES.has(code) || WARWOLF_CODES.has(code)
        || name.includes("battle ox") || name.includes("wanghu") || name.includes("warwolf")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "BEAST_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Bazoo the Soul-Eater: Desterrar hasta 3 para alcanzar 2500 ATK
    if (BAZOO_CODES.has(code) || name.includes("bazoo")) {
      if (role === "activate") {
        return null; // Prioridad alta al activar efecto para superar monstruos grandes
      }
    }

    // 4. Trap Dustshoot: Retornar monstruo rival cuando tenga >= 4 cartas en mano
    if (DUSTSHOOT_CODES.has(code) || name.includes("dustshoot")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") {
        const oppHand = Number(observation.opponentHandCount ?? 0);
        if (oppHand < 4) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_DUSTSHOOT_UNTIL_OPPONENT_HAND_GE_4";
        }
      }
    }

    return null;
  }
});

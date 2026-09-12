import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SECOND_COIN_CODES = new Set([36562627, 1966681993]); // Second Coin Toss
const BLOWBACK_CODES = new Set([81380989, 1800876717]); // Blowback Dragon
const SASUKE4_CODES = new Set([77848740, 117479042]); // Sasuke Samurai #4
const TIME_WIZARD_CODES = new Set([71625222, 1687780451]); // Time Wizard
const FAIRY_BOX_CODES = new Set([60866277, 1910504263]); // Fairy Box

export default createDeckGuardrail({
  id: "goatformat-coin-toss",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.60,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Second Coin Toss: Magia continua clave para relanzar monedas fallidas
    if (SECOND_COIN_CODES.has(code) || name.includes("second coin toss")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_SECOND_COIN_TOSS_PRIORITY";
      }
      if (role === "activate") return null;
    }

    // 2. Blowback Dragon: 2300 ATK. Destruye carta en 2+ caras
    if (BLOWBACK_CODES.has(code) || name.includes("blowback")) {
      if (role === "tribute-summon") return null;
      if (role === "activate") return null; // Activar efecto de destrucción
    }

    // 3. Sasuke Samurai #4: Destrucción automática en combate en cara
    if (SASUKE4_CODES.has(code) || name.includes("sasuke samurai #4")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "SASUKE4_PREFER_ATTACK_SUMMON";
      }
    }

    // 4. Time Wizard: Limpieza total en cara. No activar si nuestro campo es superior para evitar autodaño
    if (TIME_WIZARD_CODES.has(code) || name.includes("time wizard")) {
      if (role === "activate") {
        const ownCount = (observation.ownMonsters ?? []).length;
        const oppCount = (observation.opponentMonsters ?? []).length;
        if (ownCount > oppCount && oppCount <= 1) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_TIME_WIZARD_WHEN_BOARD_DOMINATED";
        }
        return null;
      }
    }

    // 5. Fairy Box: Trampa continua para reducir a 0 ATK a atacantes rivales
    if (FAIRY_BOX_CODES.has(code) || name.includes("fairy box")) {
      if (role === "spell-set") return null;
      if (role === "activate" || role === "chain") return null;
    }

    return null;
  }
});

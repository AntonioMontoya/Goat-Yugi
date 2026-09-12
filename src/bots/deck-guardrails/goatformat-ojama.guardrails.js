import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HURRICANE_CODES = new Set([8014148]); // Ojama Delta Hurricane!!
const RESCUE_CAT_CODES = new Set([14878871]);
const SHIELD_SWORD_CODES = new Set([52097685]);
const FITTING_ROOM_CODES = new Set([30485304]);
const EQUIP_CODES = new Set([56747793, 83746708]); // United We Stand, Mage Power

export default createDeckGuardrail({
  id: "goatformat-ojama",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];

    // 1. Ojamas normales (Black, Green, Yellow): Prohibir Invocación Normal en Ataque salvo letal
    const isNormalOjama = name.includes("ojama") && (name.includes("black") || name.includes("green") || name.includes("yellow"));
    if (isNormalOjama) {
      if (role === "summon" && !isImmediateLethal(entry, observation)) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "OJAMA_NORMAL_MONSTER_PREFER_SET_DEFENSE";
      }
      if (role === "attack") {
        const currentAtk = Number(card?.attack ?? card?.atk ?? 0);
        if (currentAtk <= 0) return "OJAMA_ZERO_ATK_DO_NOT_ATTACK";
      }
    }

    // 2. Rescue Cat: Máxima prioridad de invocación y activación inmediata para poblar mesa
    if (RESCUE_CAT_CODES.has(code) || name.includes("rescue cat")) {
      if (role === "summon" || role === "activate") return null;
    }

    // 3. Enchanting Fitting Room: Reclutamiento masivo de Ojamas si hay LP y espacio en campo
    if (FITTING_ROOM_CODES.has(code) || name.includes("enchanting fitting room") || name.includes("fitting room")) {
      if (role === "activate" && ownMonsters.length <= 3 && Number(observation.ownLp ?? 8000) > 800) {
        return null;
      }
    }

    // 4. Ojama Delta Hurricane!!: Activar únicamente si los 3 Ojamas están boca arriba en campo
    if (HURRICANE_CODES.has(code) || name.includes("delta hurricane")) {
      if (role === "activate") {
        const hasBlack = ownMonsters.some((m) => String(m?.name ?? "").toLowerCase().includes("black") && !m.faceDown);
        const hasGreen = ownMonsters.some((m) => String(m?.name ?? "").toLowerCase().includes("green") && !m.faceDown);
        const hasYellow = ownMonsters.some((m) => String(m?.name ?? "").toLowerCase().includes("yellow") && !m.faceDown);

        if (hasBlack && hasGreen && hasYellow) {
          return null; // Barrido total de todas las cartas rivales
        }
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_DELTA_HURRICANE_UNTIL_OJAMA_TRIO_FACE_UP";
      }
    }

    // 5. Shield & Sword: Activar para convertir Ojamas en beaters de 1000 ATK y reducir defensas rivales
    if (SHIELD_SWORD_CODES.has(code) || name.includes("shield & sword") || name.includes("shield and sword")) {
      if (role === "activate") {
        const faceUpOjamas = ownMonsters.filter((m) => !m.faceDown && String(m?.name ?? "").toLowerCase().includes("ojama"));
        if (faceUpOjamas.length >= 2 || oppMonsters.length === 0 || isImmediateLethal(entry, observation)) {
          return null;
        }
      }
    }

    // 6. United We Stand / Mage Power: Equipar agresivamente para cerrar partida
    if (EQUIP_CODES.has(code) || name.includes("united we stand") || name.includes("mage power")) {
      if (role === "activate" && ownMonsters.length >= 1) {
        return null;
      }
    }

    return null;
  }
});

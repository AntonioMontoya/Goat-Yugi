import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const HUGE_REVOLUTION_CODES = new Set([85639257]);
const FITTING_ROOM_CODES = new Set([30485304, 30531525]); // Enchanting Fitting Room

export default createDeckGuardrail({
  id: "goatformat-huge-revolution",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownMonsters = observation.ownMonsters ?? [];
    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];

    const isTrioPiece = name.includes("oppressed people") || name.includes("people running about") || name.includes("united resistance");

    // 1. Trío Normal: Prohibir Invocación Normal en Ataque salvo letal
    if (isTrioPiece) {
      if (role === "summon" && !isImmediateLethal(entry, observation)) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "TRIO_PIECE_PREFER_SET_DEFENSE";
      }
      if (role === "attack") {
        const currentAtk = Number(card?.attack ?? card?.atk ?? 0);
        if (currentAtk < 1200) return "TRIO_PIECE_DO_NOT_ATTACK_SUICIDALLY";
      }
    }

    // 2. Huge Revolution: Prioridad de Set y activación inmediata cuando el trío esté BOCA ARRIBA en campo
    if (HUGE_REVOLUTION_CODES.has(code) || name.includes("huge revolution")) {
      if (role === "spell-set") {
        return null; // Prioridad colocarla para tenerla lista
      }
      if (role === "activate" || role === "chain") {
        const hasOppressed = ownMonsters.some((m) => !m.faceDown && String(m?.name ?? "").toLowerCase().includes("oppressed"));
        const hasRunning = ownMonsters.some((m) => !m.faceDown && String(m?.name ?? "").toLowerCase().includes("running"));
        const hasResistance = ownMonsters.some((m) => !m.faceDown && String(m?.name ?? "").toLowerCase().includes("resistance"));

        if (hasOppressed && hasRunning && hasResistance) {
          return null; // El combo está completo, arrasar el campo y la mano del rival
        }
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_HUGE_REVOLUTION_UNTIL_TRIO_ON_FIELD";
      }
    }

    // 3. Enchanting Fitting Room: Activar proactivamente para invocar piezas normales
    if (FITTING_ROOM_CODES.has(code) || name.includes("fitting room")) {
      if (role === "activate" && ownMonsters.length <= 3 && Number(observation.ownLp ?? 8000) > 800) {
        return null;
      }
    }

    // 4. Muros defensivos (Charcoal Inpachi, D.D. Trainer): Priorizar Set
    if (name.includes("inpachi") || name.includes("trainer")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "WALL_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

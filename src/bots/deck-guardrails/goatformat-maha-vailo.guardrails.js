import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const MAHA_VAILO_CODES = new Set([93013676]);
const KOTETSU_CODES = new Set([73594093]);
const EQUIP_CODES = new Set([
  40619825, // Axe of Despair
  83746708, // Mage Power
  56747793, // United We Stand
  61127349, // Big Bang Shot
  70368879, // Snatch Steal
  21417692  // Premature Burial
]);

export default createDeckGuardrail({
  id: "goatformat-maha-vailo",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Maha Vailo: Prohibir setearlo boca abajo
    if (MAHA_VAILO_CODES.has(code) || name.includes("maha vailo")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "MAHA_VAILO_PREFER_FACE_UP_SUMMON";
      }

      if (role === "attack") {
        return null; // Prioridad máxima a atacar con Maha Vailo inflado
      }

      // No invocar Maha Vailo en turno 1 sin equipamiento ni protección si tenemos Kotetsu o Gora Turtle para setear
      if (role === "summon") {
        const hand = observation.ownHand ?? [];
        const hasEquip = hand.some((c) => EQUIP_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("axe") || String(c?.name ?? "").toLowerCase().includes("power") || String(c?.name ?? "").toLowerCase().includes("stand"));
        if (hasEquip) return null; // Invocación prioritaria si podemos equiparlo inmediatamente
        if (!hasEquip && (observation.turn ?? 1) <= 2) {
          const canSetDef = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
          if (canSetDef) return "HOLD_MAHA_VAILO_UNTIL_EQUIP_READY";
        }
      }
    }

    // 2. Iron Blacksmith Kotetsu: Priorizar Set defensivo para buscar cartas de equipo
    if (KOTETSU_CODES.has(code) || name.includes("kotetsu")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "KOTETSU_PREFER_SET_DEFENSE";
      }
    }

    // 3. Cartas de Equipo: Priorizar equipar a Maha Vailo si está en campo
    if (EQUIP_CODES.has(code) || name.includes("axe of despair") || name.includes("mage power") || name.includes("united we stand") || name.includes("big bang")) {
      if (role === "activate") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasMaha = ownMonsters.some((m) => MAHA_VAILO_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("maha vailo"));
        if (hasMaha) {
          return null; // Prioridad máxima para inflar a Maha Vailo
        }
      }
    }

    // 4. Setear contra-trampas protectoras (Solemn Judgment, Spell Shield) antes del final del turno
    if ((role === "main-two" || role === "end-phase" || role === "to-next-phase") && observation.isOwnTurn) {
      const hand = observation.ownHand ?? [];
      const hasProtectionTrap = hand.some((c) => {
        const cName = String(c?.name ?? "").toLowerCase();
        return cName.includes("solemn") || cName.includes("shield type-8");
      });
      if (hasProtectionTrap) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (canSet) return "SET_PROTECTION_TRAPS_FOR_MAHA_VAILO";
      }
    }

    return null;
  }
});

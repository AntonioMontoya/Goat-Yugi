import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SPELL_ECONOMICS_CODES = new Set([6390406]);
const DIMENSION_FUSION_CODES = new Set([23557835, 1119297377]);
const MASS_DRIVER_CODES = new Set([34906152]);
const TOON_CANNON_SOLDIER_CODES = new Set([79875176]);
const DMOC_CODES = new Set([40737112, 385612863, 31560081]);
const TOON_TABLE_CODES = new Set([86318356]);

export default createDeckGuardrail({
  id: "goatformat-spell-economics-ftk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.85,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const ownBackrow = observation.ownBackrow ?? observation.ownSpells ?? [];
    const ownMonsters = observation.ownMonsters ?? [];
    const hasEconomics = ownBackrow.some((c) => SPELL_ECONOMICS_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("economics"));

    // 1. Spell Economics: Prioridad absoluta de activación continua
    if (SPELL_ECONOMICS_CODES.has(code) || name.includes("spell economics")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_SPELL_ECONOMICS_INSTEAD_OF_SET";
      }
      if (role === "activate") return null;
    }

    // 2. Toon Table of Contents: Cadena inmediata de vaciado de deck
    if (TOON_TABLE_CODES.has(code) || name.includes("toon table")) {
      if (role === "activate") return null;
    }

    // 3. Toon Cannon Soldier / Mass Driver: Prioridad de invocación y activación continua
    if (TOON_CANNON_SOLDIER_CODES.has(code) || name.includes("toon cannon soldier")) {
      if (role === "summon" && !hasEconomics && !isImmediateLethal(entry, observation)) {
        const hasOtherAction = evaluated.some((o) => o !== entry && o.analysis?.role !== "summon");
        if (hasOtherAction) return "HOLD_TOON_CANNON_SOLDIER_UNTIL_COMBO_READY";
      }
      if (role === "summon" && hasEconomics) return null;
    }

    // 4. Dimension Fusion: Ejecutar el bucle de invocación de DMoC con Spell Economics
    if (DIMENSION_FUSION_CODES.has(code) || name.includes("dimension fusion")) {
      const ownLp = Number(observation.ownLp ?? 8000);
      if (role === "activate") {
        if (!hasEconomics && ownLp <= 2000) return "DIMENSION_FUSION_LP_TOO_LOW_NO_ECONOMICS";
        return null;
      }
    }

    // 5. Mass Driver / Cannon Soldier: Prioridad máxima a tributar DMoC para burn infinito
    if (MASS_DRIVER_CODES.has(code) || name.includes("mass driver") || TOON_CANNON_SOLDIER_CODES.has(code) || name.includes("toon cannon soldier")) {
      if (role === "activate") {
        const hasDmoc = ownMonsters.some((m) => DMOC_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("chaos"));
        if (hasDmoc) return null; // Prioridad para bucle de tributo continuo
      }
    }

    // 6. DMoC / Selección de cementerio: Prioridad absoluta a recuperar Dimension Fusion
    if (message?.type === OcgMessageType.SELECT_CARD) {
      const isTargetingDimensionFusion = (entry.analysis?.cards ?? []).some(
        (c) => DIMENSION_FUSION_CODES.has(codeOf(c)) || String(c?.name ?? "").toLowerCase().includes("dimension fusion")
      );
      if (isTargetingDimensionFusion) return null;
    }

    return null;
  }
});

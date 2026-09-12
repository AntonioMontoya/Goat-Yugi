import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const BEN_KEI_CODES = new Set([84430950, 551916423]);
const KOTETSU_CODES = new Set([60451816]);
const ROTA_CODES = new Set([90432163, 40]);
const TRUNADE_CODES = new Set([42703248, 79093857]);
const HEAVY_STORM_CODES = new Set([19613556, 34]);

const EQUIP_SPELL_CODES = new Set([
  408281360, 40619825, // Axe of Despair
  27901695,  61127349, // Big Bang Shot
  225309146, 83746708, // Mage Power
  1278096542, 56747793, // United We Stand
  37,        70342110  // Snatch Steal
]);

export default createDeckGuardrail({
  id: "goatformat-ben-kei-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.80,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Armed Samurai - Ben Kei: Prohibir setear boca abajo y retener hasta tener equipos
    if (BEN_KEI_CODES.has(code) || name.includes("ben kei")) {
      if (role === "monster-set") {
        return "BEN_KEI_NEVER_SET_FACE_DOWN";
      }
      // Solo invocar de modo normal si tenemos al menos 1-2 equipos listos para equipar o letal inminente
      if (role === "summon") {
        const hand = observation.ownHand ?? [];
        const equipCount = hand.filter((c) => {
          const cCode = codeOf(c);
          return EQUIP_SPELL_CODES.has(cCode) || String(c?.name ?? "").toLowerCase().includes("axe") || String(c?.name ?? "").toLowerCase().includes("mage power") || String(c?.name ?? "").toLowerCase().includes("united");
        }).length;
        if (equipCount === 0 && !isImmediateLethal(entry, observation)) {
          const canWait = evaluated.some((o) => o !== entry && (o.analysis?.role === "monster-set" || o.analysis?.role === "pass"));
          if (canWait) return "HOLD_BEN_KEI_UNTIL_EQUIPS_READY";
        }
      }
    }

    // 2. Equipos Mágicos: NUNCA equipar a monstruos que no sean Ben Kei si Ben Kei está disponible
    if (EQUIP_SPELL_CODES.has(code) || name.includes("axe of despair") || name.includes("mage power") || name.includes("united we stand") || name.includes("big bang shot")) {
      if (role === "equip" || role === "activate") {
        const ownMonsters = observation.ownMonsters ?? [];
        const hasBenKeiOnField = ownMonsters.some((m) => {
          const mCode = codeOf(m);
          return BEN_KEI_CODES.has(mCode) || String(m?.name ?? "").toLowerCase().includes("ben kei");
        });
        const targetMonster = entry.analysis?.target;
        const targetCode = codeOf(targetMonster);
        const targetName = String(targetMonster?.name ?? "").toLowerCase();
        if (hasBenKeiOnField && !(BEN_KEI_CODES.has(targetCode) || targetName.includes("ben kei"))) {
          return "RESERVE_EQUIP_SPELLS_FOR_BEN_KEI";
        }
      }
    }

    // 3. Iron Blacksmith Kotetsu: Priorizar siempre Set defensivo para buscar equipos
    if (KOTETSU_CODES.has(code) || name.includes("kotetsu")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "KOTETSU_PREFER_SET_TO_SEARCH_EQUIPS";
      }
    }

    // 4. Limpieza de retaguardia rival con Trunade o Heavy Storm antes del turno de ataque de Ben Kei
    if (TRUNADE_CODES.has(code) || HEAVY_STORM_CODES.has(code) || name.includes("giant trunade") || name.includes("heavy storm")) {
      const oppBackrow = (observation.opponentSpells ?? []).length;
      if (oppBackrow > 0 && role === "activate") {
        return null; // Prioridad absoluta para asegurar el OTK sin interferencia
      }
    }

    // 5. Reinforcement of the Army: Prioridad de búsqueda de Ben Kei
    if (ROTA_CODES.has(code) || name.includes("reinforcement of the army")) {
      if (role === "activate" && (role === "main-one" || observation.phase === OcgPhase.MAIN1)) {
        return null;
      }
    }

    return null;
  }
});

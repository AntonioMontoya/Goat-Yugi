import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const STAMPING_CODES = new Set([81385346, 423211928]); // Stamping Destruction
const MIRAGE_DRAGON_CODES = new Set([15960641, 138615465]); // Mirage Dragon
const MASKED_DRAGON_CODES = new Set([39111158, 578701387]); // Masked Dragon
const LUSTER_DRAGON_CODES = new Set([11091375, 106323101]); // Luster Dragon
const SPEAR_DRAGON_CODES = new Set([31553716, 1595089565]); // Spear Dragon
const ELEMENT_DRAGON_CODES = new Set([30398342, 614655182]); // Element Dragon

export default createDeckGuardrail({
  id: "goatformat-dragon-aggro",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Stamping Destruction: Requiere dragón boca arriba propio. Destruye magia/trampa rival y quema 500 LP
    if (STAMPING_CODES.has(code) || name.includes("stamping destruction")) {
      const ownMonsters = observation.ownMonsters ?? [];
      const hasFaceupDragon = ownMonsters.some((m) => {
        const race = Number(m?.race ?? m?.type ?? 0);
        const mName = String(m?.name ?? "").toLowerCase();
        return mName.includes("dragon") || race === 0x2000; // DRAGON race
      });
      if (role === "activate") {
        if (!hasFaceupDragon) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
          if (canWait) return "HOLD_STAMPING_UNTIL_DRAGON_ON_FIELD";
        }
        return null;
      }
      if (role === "spell-set" && hasFaceupDragon) {
        const oppBackrow = (observation.opponentSpells ?? []).length;
        if (oppBackrow > 0) {
          const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
          if (canActivate) return "ACTIVATE_STAMPING_DESTRUCTION_TO_CLEAR_BACKROW";
        }
      }
    }

    // 2. Mirage Dragon: Bloquea trampas rivales durante Battle Phase. Invocar en Ataque antes de atacar con dragones
    if (MIRAGE_DRAGON_CODES.has(code) || name.includes("mirage dragon")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "MIRAGE_DRAGON_PREFER_ATTACK_SUMMON";
      }
    }

    // 3. Masked Dragon: Reclutador de dragones <= 1500 ATK. Priorizar colocación en defensa
    if (MASKED_DRAGON_CODES.has(code) || name.includes("masked dragon")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "MASKED_DRAGON_PREFER_SET_DEFENSE";
      }
    }

    // 4. Luster Dragon y Spear Dragon: Beatdowns principales 1900 ATK
    if (LUSTER_DRAGON_CODES.has(code) || SPEAR_DRAGON_CODES.has(code) || name.includes("luster dragon") || name.includes("spear dragon")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "DRAGON_BEATER_PREFER_ATTACK_SUMMON";
      }
    }

    // 5. Element Dragon: Invocar en ataque si hay sinergia VIENTO/FUEGO o campo despejado
    if (ELEMENT_DRAGON_CODES.has(code) || name.includes("element dragon")) {
      if (role === "monster-set") {
        const canSummon = evaluated.some((o) => o !== entry && o.analysis?.role === "summon");
        if (canSummon) return "ELEMENT_DRAGON_PREFER_ATTACK_SUMMON";
      }
    }

    return null;
  }
});

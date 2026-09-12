import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const AITSU_CODES = new Set([16586882, 691973321]); // Aitsu
const KOITSU_CODES = new Set([57405307, 1242155650]); // Koitsu
const LAST_WILL_CODES = new Set([85602018, 90965879]); // Last Will
const TURTLE_CODES = new Set([23205979, 123752463]); // UFO Turtle
const GRIZZLY_CODES = new Set([856395, 943344385]); // Mother Grizzly

export default createDeckGuardrail({
  id: "goatformat-aitsu-koitsu",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.50,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Koitsu: Monstruo Unión. Equipar a Aitsu boca arriba para darle +3000 ATK y perforación
    if (KOITSU_CODES.has(code) || name.includes("koitsu")) {
      if (role === "activate") {
        return null; // Priorizar equipar a Aitsu inmediatamente
      }
    }

    // 2. Aitsu: 100 ATK. No tributar ni invocar en ataque sin Koitsu para equipar
    if (AITSU_CODES.has(code) || name.includes("aitsu")) {
      if (role === "summon" || role === "tribute-summon") {
        const hasKoitsuInHandOrField = (observation.ownHand ?? []).some((c) => String(c?.name ?? "").toLowerCase().includes("koitsu"))
          || (observation.ownMonsters ?? []).some((m) => String(m?.name ?? "").toLowerCase().includes("koitsu"));
        if (!hasKoitsuInHandOrField && !isImmediateLethal(entry, observation)) {
          const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "summon" && o.analysis?.role !== "tribute-summon");
          if (canWait) return "HOLD_AITSU_UNTIL_KOITSU_READY";
        }
      }
      if (role === "attack") {
        const currentAtk = Number(card?.attack ?? card?.atk ?? 0);
        if (currentAtk < 1000) return "AITSU_DO_NOT_ATTACK_WITHOUT_KOITSU_BOOST";
        return null; // Si tiene los 3100 ATK de Koitsu, atacar con máxima prioridad
      }
    }

    // 3. Last Will: Activar para tutorear Aitsu o Koitsu
    if (LAST_WILL_CODES.has(code) || name.includes("last will")) {
      if (role === "spell-set") {
        const canActivate = evaluated.some((o) => o !== entry && o.analysis?.role === "activate");
        if (canActivate) return "ACTIVATE_LAST_WILL";
      }
    }

    // 4. UFO Turtle y Mother Grizzly: Reclutadores en defensa
    if (TURTLE_CODES.has(code) || GRIZZLY_CODES.has(code) || name.includes("turtle") || name.includes("grizzly")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "UNION_SEARCHER_PREFER_SET_DEFENSE";
      }
    }

    return null;
  }
});

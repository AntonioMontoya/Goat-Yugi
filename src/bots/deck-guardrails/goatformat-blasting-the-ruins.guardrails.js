import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const BLASTING_RUINS_CODES = new Set([21466326]);
const ROCK_BOMBARDMENT_CODES = new Set([20474741]);
const CYBER_JAR_CODES = new Set([34124316]);
const TOON_TABLE_CODES = new Set([86318356]);
const HEAVY_SLUMP_CODES = new Set([60100907, 1108980955]);

export default createDeckGuardrail({
  id: "goatformat-blasting-the-ruins",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.80,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Blasting the Ruins: Activar únicamente si hay >= 30 cartas en cementerio
    if (BLASTING_RUINS_CODES.has(code) || name.includes("blasting the ruins")) {
      const gyCount = (observation.graveyard ?? observation.ownGraveyard ?? []).length;
      if (role === "activate" || role === "chain") {
        if (gyCount < 30) {
          return "HOLD_BLASTING_RUINS_UNTIL_30_CARDS_IN_GY";
        }
        return null; // Prioridad máxima si se cumple el umbral de 30 cartas
      }
      if (role === "spell-set") {
        return null; // Priorizar setear para tener listas las copias
      }
    }

    // 2. Rock Bombardment: Enviar Cyber Jar al cementerio para alimentar el umbral de 30
    if (ROCK_BOMBARDMENT_CODES.has(code) || name.includes("rock bombardment")) {
      if (role === "activate" || role === "chain") {
        return null;
      }
    }

    // 3. Toon Table of Contents: Adelantar rotación de hechizos al cementerio
    if (TOON_TABLE_CODES.has(code) || name.includes("toon table")) {
      if (role === "activate") return null;
    }

    // 4. Heavy Slump: Activar solo si oponente tiene >= 8 cartas en mano
    if (HEAVY_SLUMP_CODES.has(code) || name.includes("heavy slump")) {
      const oppHandCount = Number(observation.opponentHandCount ?? observation.opponentHand?.length ?? 0);
      if (oppHandCount < 8 && (role === "activate" || role === "chain")) {
        const canWait = evaluated.some((o) => o !== entry && o.analysis?.role !== "activate");
        if (canWait) return "HOLD_HEAVY_SLUMP_UNTIL_OPP_HAND_8";
      }
    }

    // 5. Flip y reutilización de Cyber Jar con Book of Moon / Book of Taiyou / Shallow Grave
    if (name.includes("cyber jar")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "CYBER_JAR_PREFER_SET";
      }
    }

    return null;
  }
});

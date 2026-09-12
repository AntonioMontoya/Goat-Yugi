import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SPHINX_CODES = new Set([40659562, 504700080]);
const DESERT_SUNLIGHT_CODES = new Set([93747864, 504700081]);
const ARSENAL_SUMMONER_CODES = new Set([85639257, 504700082]);

export default createDeckGuardrail({
  id: "goatformat-guardian-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Guardian Sphinx: Flip face-down in MP2 to repeat bounce next turn
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "position-change") {
      if (SPHINX_CODES.has(code) || name.includes("guardian sphinx")) {
        return null; // High priority flip-down in MP2
      }
    }

    // 2. Desert Sunlight Ambush in Opponent Battle Phase
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (DESERT_SUNLIGHT_CODES.has(code) || name.includes("desert sunlight")) {
        return null;
      }
    }

    return null;
  }
});

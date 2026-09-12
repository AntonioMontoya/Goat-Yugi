import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const KAIBAMAN_CODES = new Set([34627841, 504700050]);
const BURST_STREAM_CODES = new Set([17655904, 504700051]);
const BLUE_EYES_CODES = new Set([89631139, 504700052]);
const FUSILIER_CODES = new Set([51632798, 504700053]);

export default createDeckGuardrail({
  id: "goatformat-blue-eyes-white-dragon",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownMonsters = observation.ownMonsters ?? [];
    const oppMonsters = observation.opponentMonsters ?? [];

    // 1. Kaibaman: Require BEWD in hand before tributing
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (KAIBAMAN_CODES.has(code) || name.includes("kaibaman")) {
        const hasBlueEyesInHand = (observation.ownHand ?? []).some((h) => {
          const hName = String(h?.name ?? "").toLowerCase();
          return BLUE_EYES_CODES.has(codeOf(h)) || hName.includes("blue-eyes");
        });
        if (!hasBlueEyesInHand) {
          return "KAIBAMAN_REQUIRES_BLUE_EYES_IN_HAND";
        }
      }
    }

    // 2. Burst Stream of Destruction: High value wipe (>= 2 monsters or unbeatable wall)
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (BURST_STREAM_CODES.has(code) || name.includes("burst stream")) {
        const hasBlueEyes = ownMonsters.some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return BLUE_EYES_CODES.has(codeOf(m)) || mName.includes("blue-eyes");
        });
        if (!hasBlueEyes) return "BURST_STREAM_REQUIRES_BLUE_EYES_AND_TARGETS";
        const oppFaceUp = oppMonsters.filter((m) => m?.faceUp);
        const oppDangerous = oppFaceUp.some((m) => Number(m.attack ?? m.atk ?? 0) >= 3000 || Number(m.defense ?? m.def ?? 0) >= 3000);
        if (oppMonsters.length < 2 && !oppDangerous && !isImmediateLethal(entry, observation)) {
          return "BURST_STREAM_PRESERVE_BLUE_EYES_ATTACK";
        }
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const RESCUE_CAT_CODES = new Set([14878871, 504700140]);
const WICKED_WORM_CODES = new Set([60082869, 504700180]);
const DUSTSHOOT_CODES = new Set([34694460, 504700181]);

export default createDeckGuardrail({
  id: "goatformat-cat-control",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.65,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    const FLIP_FLOP_CODES = new Set([84133008, 3510565, 15383415, 41872150]); // Des Lacooda, Stealth Bird, Scarabs, Locusts

    // 1. Trap Dustshoot: Requires opponent hand >= 4
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (DUSTSHOOT_CODES.has(code) || name.includes("trap dustshoot")) {
        const oppHand = Number(context.observation?.opponentHandSize ?? context.observation?.opponentHandCount ?? 0);
        if (oppHand < 4) return "DUSTSHOOT_REQUIRES_4_OPPONENT_CARDS";
      }
    }

    // 2. Flip-Flop Attack Veto: Des Lacooda and Stealth Bird should not suicide attack
    if (role === "attack" && (FLIP_FLOP_CODES.has(code) || name.includes("lacooda") || name.includes("stealth bird"))) {
      const oppMonsters = (context.observation?.opponentMonsters ?? []).filter((m) => m?.faceUp);
      const atk = Number(card?.atk ?? card?.attack ?? 0);
      const wouldDie = oppMonsters.some((m) => {
        const pos = Number(m.position) || 0;
        const stat = (pos & 1) !== 0 ? (Number(m.attack ?? m.atk) || 0) : (Number(m.defense ?? m.def) || 0);
        return stat >= atk;
      });
      if (wouldDie) {
        return "CAT_CONTROL_PRESERVE_FLIP_ENGINE";
      }
    }

    return null;
  }
});

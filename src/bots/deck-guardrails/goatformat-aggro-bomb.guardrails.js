import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LILY_CODES = new Set([79575620, 504700120]);
const MATAZA_CODES = new Set([22609617, 504700121]);
const PANDA_CODES = new Set([9817927, 504700122]);

export default createDeckGuardrail({
  id: "goatformat-aggro-bomb",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();
    const ownLp = Number(observation.ownLp) || 8000;

    // 1. Lily LP Management: Never pay 2000 LP if it leaves bot at <= 0 LP without winning
    if (message?.type === OcgMessageType.SELECT_CHAIN && role === "chain") {
      if (LILY_CODES.has(code) || name.includes("injection fairy lily")) {
        const oppLp = Number(observation.opponentLp) || 8000;
        const targetMonster = (observation.opponentMonsters ?? []).find((m) => (Number(m?.position) & 1) !== 0);
        const oppDefense = Number(targetMonster?.attack ?? targetMonster?.atk ?? 0);
        const wouldWin = (3400 - oppDefense) >= oppLp;
        if (ownLp <= 2000 && !wouldWin) {
          return "HOLD_LILY_BOOST_TO_PRESERVE_LIFE";
        }
      }
    }

    // 2. Self-Damage Sanity: Never trigger bomb damage that reduces own LP to 0
    if ((role === "activate" || role === "chain") && (entry.roles ?? []).includes("burn")) {
      const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();
      if (activeName.includes("ring of destruction") || activeName.includes("ceasefire")) {
        if (ownLp <= 1000 && !isImmediateLethal(entry, observation)) {
          return "AGGRO_BOMB_PRESERVE_LIFE_FROM_BURN";
        }
      }
    }

    return null;
  }
});

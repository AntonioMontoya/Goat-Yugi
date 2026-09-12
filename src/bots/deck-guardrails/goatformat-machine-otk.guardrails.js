import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const LIMITER_CODES = new Set([504700037, 23171610, 504700110]);
const TRUNADE_CODES = new Set([42703248, 73001088, 504700111]);

export default createDeckGuardrail({
  id: "goatformat-machine-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.75,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Limiter Removal activation in Main Phase: Allow for lethal push; veto premature suicide
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (LIMITER_CODES.has(code) || name.includes("limiter removal")) {
        const turn = Number(observation.turn ?? 1);
        if (turn <= 1) {
          return "AVOID_LIMITER_REMOVAL_TURN_1";
        }
        const ownMonsters = observation.ownMonsters ?? [];
        const machines = ownMonsters.filter((m) => {
          const raceVal = Number(m?.race ?? 0);
          const rName = String(m?.raceName ?? "").toLowerCase();
          return (raceVal & 0x10) !== 0 || rName.includes("machine");
        });
        if (machines.length === 0) {
          return "VETO_LIMITER_REMOVAL_NO_MACHINES";
        }
        const oppLp = Number(observation.opponentLp ?? 8000);
        const oppMonsters = observation.opponentMonsters ?? [];
        const totalMachineAtk = machines.reduce((sum, m) => sum + Number(m?.attack ?? m?.atk ?? 0), 0);
        const oppDefSum = oppMonsters.reduce((sum, m) => {
          const pos = Number(m?.position ?? 0);
          const isDef = (pos & OcgPosition.DEFENSE) !== 0;
          return sum + (isDef ? Number(m?.defense ?? m?.def ?? 0) : Number(m?.attack ?? m?.atk ?? 0));
        }, 0);
        const isLethal = (totalMachineAtk * 2 >= oppLp && oppMonsters.length === 0)
          || (totalMachineAtk * 2 - oppDefSum >= oppLp);
        const isDecisivePush = (totalMachineAtk * 2 >= 4000) || (machines.length >= 2 && totalMachineAtk >= 3000);

        if (!isLethal && !isDecisivePush) {
          // If not lethal and not a decisive push, avoid premature activation if we can set it
          const canSet = evaluated.some((e) => (LIMITER_CODES.has(primaryCode(e)) || String(e.analysis?.cards?.[0]?.name ?? "").toLowerCase().includes("limiter removal")) && ["spell-set", "set"].includes(e.analysis?.role));
          if (canSet) {
            return "DEFER_LIMITER_REMOVAL_TO_BATTLE_STEP";
          }
        }
        return null; // Allow push
      }
      if (TRUNADE_CODES.has(code) || name.includes("giant trunade")) {
        return null; // Clear backrow first
      }
    }

    // 2. Limiter Removal Damage Step Activation
    if ((message?.type === OcgMessageType.SELECT_CHAIN || message?.type === OcgMessageType.SELECT_BATTLECMD) && role === "chain") {
      if (LIMITER_CODES.has(code) || name.includes("limiter removal")) {
        return null;
      }
    }

    return null;
  }
});

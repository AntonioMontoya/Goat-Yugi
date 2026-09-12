import { primaryCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const CYBER_STEIN_CODES = new Set([1101417, 504700020, 69015963, 1096735174]);

export default createDeckGuardrail({
  id: "goatformat-cyber-stein-otk",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.95,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};

    if (role === "activate") {
      const activeCode = primaryCode(entry);
      const activeName = String(entry.analysis?.cards?.[0]?.name ?? "").toLowerCase();

      if (CYBER_STEIN_CODES.has(activeCode) || activeName.includes("cyber-stein")) {
        const ownLp = Number(observation.ownLp ?? 8000);
        // Only block if we physically cannot pay 5000 LP
        if (ownLp <= 5000) return "CYBER_STEIN_COST_TOO_HIGH";
      }
    }

    return null;
  },
});

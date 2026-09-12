import { createDeckGuardrail } from "./base-deck-guardrail.js";

export default createDeckGuardrail({
  id: "goatformat-p-a-c-m-a-n",
  tier: "Tier 3",
  playstyle: "control",
  riskTolerance: 0.85,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    // PACMAN flips monsters to trigger burn / draw even when under pressure
    return null;
  },
});

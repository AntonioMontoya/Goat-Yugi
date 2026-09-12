import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const SKILLED_DARK_CODES = new Set([73752131, 504700070]);
const TOON_TABLE_CODES = new Set([89997728, 504700071]);
const DARK_MAGIC_ATTACK_CODES = new Set([2314238, 504700072]);
const THOUSAND_KNIVES_CODES = new Set([63391643, 504700073]);
const DARK_MAGICIAN_CODES = new Set([46986414, 504700074]);

export default createDeckGuardrail({
  id: "goatformat-dark-magician",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Dark Magic Attack: Requires Dark Magician face-up and opponent backrow targets
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "activate") {
      if (DARK_MAGIC_ATTACK_CODES.has(code) || name.includes("dark magic attack")) {
        const hasDarkMagician = (observation.ownMonsters ?? []).some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return (DARK_MAGICIAN_CODES.has(codeOf(m)) || mName.includes("dark magician")) && (m?.faceUp || (Number(m?.position) & 1) !== 0);
        });
        const oppBackrow = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);
        if (!hasDarkMagician || oppBackrow === 0) {
          return "DARK_MAGIC_ATTACK_REQUIRES_DM_AND_BACKROW";
        }
      }

      // 2. Thousand Knives: Requires Dark Magician face-up and opponent monster targets
      if (THOUSAND_KNIVES_CODES.has(code) || name.includes("thousand knives")) {
        const hasDarkMagician = (observation.ownMonsters ?? []).some((m) => {
          const mName = String(m?.name ?? "").toLowerCase();
          return (DARK_MAGICIAN_CODES.has(codeOf(m)) || mName.includes("dark magician")) && (m?.faceUp || (Number(m?.position) & 1) !== 0);
        });
        const oppMonsters = Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length ?? 0);
        if (!hasDarkMagician || oppMonsters === 0) {
          return "THOUSAND_KNIVES_REQUIRES_DM_AND_MONSTER";
        }
      }
    }

    return null;
  }
});

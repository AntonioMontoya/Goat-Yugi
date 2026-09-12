import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

const BUSTER_BLADER_CODES = new Set([78193831, 504700040]);
const DNA_SURGERY_CODES = new Set([74701381, 504700041]);
const TROJAN_HORSE_CODES = new Set([38479725, 504700042]);
const EMBLEM_CODES = new Set([6390406, 504700043]);

export default createDeckGuardrail({
  id: "goatformat-buster-blader",
  tier: "Tier 3",
  playstyle: "aggro",
  riskTolerance: 0.70,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Race announcement for DNA Surgery and Hunter with 7 Weapons: Always declare Dragon
    if (message?.type === OcgMessageType.ANNOUNCE_RACE) {
      const candidates = evaluated.filter((e) => {
        const raceVal = Number(e.candidate?.races?.[0] ?? e.candidate?.value ?? e.candidate ?? 0);
        return raceVal === 0x2000 || raceVal === 8192; // Dragon
      });
      if (candidates.length > 0 && !candidates.includes(entry)) {
        return "BUSTER_BLADER_ALWAYS_DECLARE_DRAGON_RACE";
      }
    }

    // 2. Tribute Summon of Buster Blader: Require Trojan Horse, safe backrow, or necessary removal of big opposing threat
    if (message?.type === OcgMessageType.SELECT_IDLECMD && role === "summon") {
      if (BUSTER_BLADER_CODES.has(code) || name.includes("buster blader")) {
        const oppBackrow = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length ?? 0);
        const ownMonsters = observation.ownMonsters ?? [];
        const oppMonsters = observation.opponentMonsters ?? [];
        const hasTrojanHorse = ownMonsters.some((m) => TROJAN_HORSE_CODES.has(codeOf(m)) || String(m?.name ?? "").toLowerCase().includes("trojan horse"));
        const oppHasBigMonster = oppMonsters.some((m) => Number(m?.attack ?? m?.atk ?? 0) >= 1600);
        // Only avoid tributing 2 monsters if opponent has heavy backrow AND we are not beating over a dangerous monster AND not lethal
        if (!hasTrojanHorse && oppBackrow >= 2 && ownMonsters.length <= 2 && !oppHasBigMonster && !isImmediateLethal(entry, observation)) {
          return "BUSTER_BLADER_AVOID_BLIND_DOUBLE_TRIBUTE_INTO_BACKROW";
        }
      }
    }

    return null;
  }
});

import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition } from "../../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { codeOf, primaryCode, controllerOf, isImmediateLethal, sourceCode, createDeckGuardrail } from "./base-deck-guardrail.js";

// Card codes for Exodia pieces
const EXODIA_HEAD_CODES = new Set([33396948, 275663999]);
const EXODIA_NORMAL_PIECE_CODES = new Set([
  7902349, 1627907029, // Left Arm
  44519536, 1239358903, // Left Leg
  70903634, 464244570,  // Right Arm
  8124921, 1867316300,  // Right Leg
]);
const ALL_EXODIA_PIECE_CODES = new Set([...EXODIA_HEAD_CODES, ...EXODIA_NORMAL_PIECE_CODES]);

const THUNDER_DRAGON_CODES = new Set([31709826, 15]);
const DEKOICHI_CODES = new Set([87564352, 448641072]);
const MIMIC_LV1_CODES = new Set([747135, 864399341]);
const SANGAN_CODES = new Set([26202165, 8]);
const EMISSARY_CODES = new Set([70307656, 100883224]);
const BACKUP_SOLDIER_CODES = new Set([36280194, 11257053]);
const POT_OF_GREED_CODES = new Set([55144522, 30]);
const GRACEFUL_CHARITY_CODES = new Set([79571449, 31]);
const UPSTART_GOBLIN_CODES = new Set([70368879, 1330660843]);
const JAR_OF_GREED_CODES = new Set([83968380, 1018743162]);

export default createDeckGuardrail({
  id: "goatformat-exodia",
  tier: "Tier 3",
  playstyle: "combo",
  riskTolerance: 0.15,
  evaluate: (entry, evaluated, knowledge, message, context, profile) => {
    const role = entry.analysis?.role;
    const observation = context.observation ?? {};
    const card = entry.analysis?.cards?.[0];
    const code = primaryCode(entry) || codeOf(card);
    const name = String(card?.name ?? "").toLowerCase();

    // 1. Prohibir invocación en ataque o ataques de piezas de Exodia
    if (ALL_EXODIA_PIECE_CODES.has(code) || name.includes("forbidden one")) {
      if (role === "summon") {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "EXODIA_PIECE_PREFER_SET_OVER_ATTACK";
      }
      if (role === "attack") {
        return "EXODIA_PIECES_NEVER_ATTACK";
      }
    }

    // 2. Floaters / Draw engines: Prefer Set over Attack Summon
    if (role === "summon") {
      if (MIMIC_LV1_CODES.has(code) || SANGAN_CODES.has(code) || DEKOICHI_CODES.has(code) || name.includes("mimic") || name.includes("dekoichi")) {
        const canSet = evaluated.some((o) => o !== entry && o.analysis?.role === "monster-set");
        if (canSet) return "DRAW_ENGINE_PREFER_SET_DEFENSE";
      }
    }

    // 3. Activación prioritaria de Thunder Dragon para adelgazar el mazo
    if (THUNDER_DRAGON_CODES.has(code) || name.includes("thunder dragon")) {
      if (role === "activate" && message?.type === OcgMessageType.SELECT_IDLECMD) {
        return null; // Permitir y priorizar adelgazamiento de mazo
      }
    }

    // 4. Activación inmediata de motores de robo en Main Phase
    if (POT_OF_GREED_CODES.has(code) || UPSTART_GOBLIN_CODES.has(code) || GRACEFUL_CHARITY_CODES.has(code) || name.includes("upstart") || name.includes("pot of greed")) {
      if (role === "activate" && (role === "main-one" || role === "main-two" || observation.phase === OcgPhase.MAIN1)) {
        return null;
      }
    }

    // 5. Jar of Greed: Encadenar en End Phase o ante remoción rival
    if (JAR_OF_GREED_CODES.has(code) || name.includes("jar of greed")) {
      if (role === "chain") return null;
      if (observation.phase === OcgPhase.END) return null;
    }

    // 6. Backup Soldier: Solo activar cuando haya >= 3 piezas normales en cementerio y >= 5 monstruos en total
    if (BACKUP_SOLDIER_CODES.has(code) || name.includes("backup soldier")) {
      if (role === "chain" || role === "activate") {
        const ownGrave = observation.graveyard ?? observation.ownGraveyard ?? [];
        const normalPiecesInGrave = ownGrave.filter((c) => {
          const cCode = codeOf(c);
          return EXODIA_NORMAL_PIECE_CODES.has(cCode) || String(c?.name ?? "").toLowerCase().includes("forbidden one");
        }).length;
        const totalMonstersInGrave = ownGrave.filter((c) => {
          const info = knowledge?.byRuntimeCode?.[String(codeOf(c))];
          return info?.kind === "monster" || info?.type === "monster" || c.type === "monster" || c.kind === 1;
        }).length;

        if (normalPiecesInGrave < 3 || totalMonstersInGrave < 5) {
          const canPass = evaluated.some((o) => o !== entry && (o.analysis?.role === "pass" || o.analysis?.role === "to-next-phase"));
          if (canPass) return "HOLD_BACKUP_SOLDIER_UNTIL_3_PIECES_IN_GY";
        }
        if (normalPiecesInGrave >= 3 && totalMonstersInGrave >= 5) {
          return null; // Prioridad para recuperar 3 piezas y avanzar hacia victoria
        }
      }
    }

    // 7. Descarte con Graceful Charity o Monster Reincarnation: Prohibir descartar piezas salvo si Backup Soldier está listo
    if (message?.type === OcgMessageType.SELECT_DISCARD || message?.type === OcgMessageType.SELECT_CARD) {
      if (ALL_EXODIA_PIECE_CODES.has(code) || name.includes("forbidden one")) {
        const hasBackupSoldier = (observation.ownHand ?? []).concat(observation.ownBackrow ?? observation.ownSpells ?? []).some((c) => {
          const cCode = codeOf(c);
          return BACKUP_SOLDIER_CODES.has(cCode) || String(c?.name ?? "").toLowerCase().includes("backup soldier");
        });
        if (!hasBackupSoldier) {
          const hasOtherDiscard = evaluated.some((o) => o !== entry && !ALL_EXODIA_PIECE_CODES.has(primaryCode(o) || codeOf(o.analysis?.cards?.[0])));
          if (hasOtherDiscard) return "AVOID_DISCARDING_EXODIA_PIECES_WITHOUT_RECOVERY";
        }
      }
    }

    // 8. Colocar trampas defensivas y Backup Soldier antes de pasar turno
    if ((role === "main-two" || role === "end-phase" || role === "to-next-phase") && observation.isOwnTurn) {
      const hand = observation.ownHand ?? [];
      const hasDefensiveTrap = hand.some((c) => {
        const cCode = codeOf(c);
        return BACKUP_SOLDIER_CODES.has(cCode) || JAR_OF_GREED_CODES.has(cCode) || [60, 62, 63, 61].includes(cCode);
      });
      if (hasDefensiveTrap) {
        const canSetTrap = evaluated.some((o) => o !== entry && o.analysis?.role === "spell-set");
        if (canSetTrap) return "SET_DEFENSIVE_TRAPS_BEFORE_ENDING_TURN";
      }
    }

    return null;
  }
});

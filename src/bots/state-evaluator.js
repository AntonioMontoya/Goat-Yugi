import { OcgLocation, OcgMessageType, OcgPhase, OcgPosition, SelectBattleCMDAction, SelectIdleCMDAction } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { actionCardEntries, strategyActionRole } from "./deck-strategy.js";
import { publicCardSemantics } from "./card-semantics.js";
import { enforceDecisionGuardrails, matchesPublicChainCard, publicChainTargetContext, publicProgressSignature, BATTLE_LOCK_CODES, CONTINUOUS_THREAT_CODES } from "./decision-guardrails.js";
import { publicMonsterTargetPlan } from "./target-feasibility.js";

export const PLAYSTYLE_COMPONENT_WEIGHTS = Object.freeze({
  control:  Object.freeze({ material: 1.3,  board: 1.0, tempo: 0.8, future: 1.4, safety: 1.2,  coherence: 1.0 }),
  aggro:    Object.freeze({ material: 0.65, board: 1.4, tempo: 1.7, future: 0.7, safety: 0.6,  coherence: 1.0 }),
  burn:     Object.freeze({ material: 0.4,  board: 0.7, tempo: 1.3, future: 0.8, safety: 1.6,  coherence: 1.2 }),
  combo:    Object.freeze({ material: 0.85, board: 0.7, tempo: 0.8, future: 1.8, safety: 0.85, coherence: 1.4 }),
  midrange: Object.freeze({ material: 1.1,  board: 1.2, tempo: 1.2, future: 1.1, safety: 0.9,  coherence: 1.0 }),
});

export function resolvePlaystyleProfile(knowledge) {
  const explicitPlaystyle = String(knowledge?.playstyle ?? "").toLowerCase();
  if (explicitPlaystyle) {
    if (/burn/.test(explicitPlaystyle)) return "burn";
    if (/aggro|beatdown/.test(explicitPlaystyle)) return "aggro";
    if (/combo|mill|deck-out/.test(explicitPlaystyle)) return "combo";
    if (/control|lockdown|stall/.test(explicitPlaystyle)) return "control";
    if (/midrange/.test(explicitPlaystyle)) return "midrange";
  }

  const plan = knowledge?.plan ?? {};
  const text = `${knowledge?.deckId ?? ""} ${knowledge?.archetype ?? ""} ${plan.archetype ?? ""} ${plan.playstyle ?? ""} ${plan.id ?? ""}`.toLowerCase();

  if (/burn|lockdown-burn/.test(text)) return "burn";
  if (/aggro|beatdown|warrior|horus/.test(text)) return "aggro";
  if (/combo|otk|ftk|deck-out|empty-jar|reasoning|stein|cat-control/.test(text)) return "combo";
  if (/control|flip|monarch|spell-counter|gravekeeper|clown|destiny-board|goat/.test(text)) return "control";
  if (/chaos|recruiter|banish|return|midrange/.test(text)) return "midrange";

  const mainSize = Math.max(1, Number(knowledge?.mainSize) || 40);
  const roles = knowledge?.roles ?? {};
  if ((roles.burn ?? 0) / mainSize >= 0.15) return "burn";
  if ((roles.combo ?? 0) / mainSize >= 0.20) return "combo";
  if ((roles.threat ?? 0) / mainSize >= 0.40 && (roles.lethal ?? 0) / mainSize >= 0.20) return "aggro";
  if ((roles.flip ?? 0) / mainSize >= 0.15 || (roles.interaction ?? 0) / mainSize >= 0.25) return "control";

  return "midrange";
}

function codeOf(entry) { return Number(entry?.code ?? entry?.card ?? entry?.runtimeCode ?? entry?.id ?? 0); }
function controllerOf(entry) {
  const value = entry?.controller ?? entry?.controler ?? entry?.player;
  return value === undefined || value === null ? null : Number(value);
}
function faceUp(card) { return card?.faceUp === true || (Number(card?.position) & OcgPosition.FACEUP) !== 0; }
function bounded(value, minimum = -12, maximum = 12) { return Math.max(minimum, Math.min(maximum, Number(value) || 0)); }
function hasAny(roles, values) { return values.some((value) => roles.has(value)); }
function cardForCode(knowledge, value) { return knowledge?.byRuntimeCode?.[String(codeOf(value))] ?? publicCardSemantics(codeOf(value)) ?? null; }

function responseCards(knowledge, message, response) {
  return actionCardEntries(knowledge, message, response);
}

function selectedBoardInstance(message, response, observation = {}) {
  const entry = message?.pos_changes?.[Number(response?.index)];
  if (!entry) return null;
  const code = codeOf(entry);
  return (observation.ownMonsters ?? []).find((card) => codeOf(card) === code
    && (entry.sequence === undefined || Number(card.sequence) === Number(entry.sequence)))
    ?? (observation.ownMonsters ?? []).find((card) => codeOf(card) === code)
    ?? null;
}

function sourceCard(knowledge, message, memory = null, observation = {}) {
  const code = Number(message?.code ?? message?.card?.code ?? message?.triggering_card?.code ?? 0);
  if (code) return cardForCode(knowledge, { code });
  const recent = recentActions(memory, observation);
  const decision = Number(observation?.decisions) || 0;
  const fallback = [...recent].reverse().find((action) => Number(action.cardCode)
    && ["activate", "chain", "position-change", "summon", "special-summon"].includes(action.role)
    && (!decision || !Number(action.decision) || decision - Number(action.decision) <= 4));
  return cardForCode(knowledge, { code: fallback?.cardCode });
}

function recentActions(memory, observation) {
  const turn = Number(observation?.turn) || 0;
  return (memory?.recent ?? []).filter((action) => Number(action.turn) === turn);
}

function wasJustSummonedFaceUp(memory, observation, cardCode) {
  return recentActions(memory, observation).some((action) => ["summon", "special-summon"].includes(action.role)
    && Number(action.cardCode) === Number(cardCode));
}

function wasJustDeployedOrExposed(memory, observation, cardCode) {
  return recentActions(memory, observation).some((action) => ["summon", "special-summon", "position-change"].includes(action.role)
    && Number(action.cardCode) === Number(cardCode));
}

function boardFacts(observation = {}) {
  const ownMonsters = observation.ownMonsters ?? [];
  const opponentMonsters = observation.opponentMonsters ?? [];
  return {
    ownMonsters,
    opponentMonsters,
    ownFaceUp: ownMonsters.filter(faceUp),
    opponentFaceUp: opponentMonsters.filter(faceUp),
    ownFaceDown: ownMonsters.filter((card) => !faceUp(card)),
    opponentFaceDown: opponentMonsters.filter((card) => !faceUp(card)),
    ownBackrow: Number(observation.ownBackrowCount ?? observation.ownBackrow?.length) || 0,
    opponentBackrow: Math.max(
      Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length) || 0,
      (observation.publicChain ?? []).some((entry) => Number(entry.controller) !== Number(observation.player)
        && [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(entry.location))) ? 1 : 0,
    ),
    ownPower: Number(observation.ownBoardPower) || 0,
    opponentPower: Number(observation.opponentThreat) || 0,
    ownLp: Number(observation.ownLp) || 8000,
    opponentLp: Number(observation.opponentLp) || 8000,
    ownDeckSize: Math.max(0, Number(observation.ownDeckSize) || 0),
    opponentDeckSize: Math.max(0, Number(observation.opponentDeckSize) || 0),
  };
}

function numericRole(roles, prefix) {
  let maximum = 0;
  for (const role of roles) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(role);
    if (match) maximum = Math.max(maximum, Number(match[1]) || 0);
  }
  return maximum;
}

function visibleCopyCount(observation, runtimeCode) {
  const zones = [observation.ownHand, observation.hand, observation.ownMonsters, observation.ownBackrow, observation.graveyard, observation.banished];
  return zones.flatMap((zone) => zone ?? []).filter((entry) => Number(entry?.runtimeCode ?? entry?.code) === Number(runtimeCode)).length;
}

function deckSafetyAdjustment(roles, card, observation, board) {
  const draw = numericRole(roles, "draw-count") || (roles.has("draw") ? 1 : 0);
  const consume = numericRole(roles, "deck-consume");
  let value = 0;
  if (draw && board.ownDeckSize) {
    if (board.ownDeckSize <= draw + 1) value -= 12;
    else if (board.ownDeckSize <= Math.max(5, draw + 3)) value -= 5;
  }
  if (consume && board.ownDeckSize) {
    if (board.ownDeckSize <= consume) value -= 14;
    else if (board.ownDeckSize + 2 < board.opponentDeckSize) value -= bounded((board.opponentDeckSize - board.ownDeckSize) * 0.9, 2, 7);
  }
  if (roles.has("search-copies") && card && visibleCopyCount(observation, card.runtimeCode) >= Number(card.count)) value -= 10;
  return value;
}

function intrinsicCardValue(card, observation = {}) {
  if (!card) return 0;
  const roles = new Set(card.roles ?? []);
  let value = card.kind === "MONSTER" ? bounded((Math.max(Number(card.atk) || 0, Number(card.def) || 0) - 700) / 850, 0, 2.2) : 0.6;
  if (hasAny(roles, ["draw", "search", "advantage"])) value += 2.8;
  if (hasAny(roles, ["interaction", "negate", "removal"])) value += Number(observation.opponentMonsterCount ?? observation.opponentMonsters?.length) + Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length) > 0 ? 1.8 : 0.7;
  if (hasAny(roles, ["flip", "engine", "recovery"])) value += 1.5;
  if (roles.has("persistent-effect")) value += 2.2;
  if (roles.has("one-shot-effect")) value += 0.2;
  if (roles.has("boss")) value += observation.chaosReady ? 2.5 : 0.5;
  if (roles.has("lethal") && Number(observation.opponentLp) <= Number(card.atk)) value += 4;
  if (roles.has("cost-half-lp")) value -= Number(observation.ownLp) <= 2500 ? 1.5 : 0.5;
  return bounded(value, -2, 9);
}

function activationCost(roles, board, observation = {}) {
  let cost = 0;
  if (roles.has("cost-half-lp")) cost += board.ownLp <= 2500 ? 5 : board.ownLp <= 5000 ? 3.5 : 2.5;
  for (const role of roles) {
    const lp = /^cost-lp-(\d+)$/.exec(role);
    if (lp) {
      const isEarlyDuo = roles.has("trinity") && roles.has("hand-destruction") && board.ownLp >= 4000 && Number(observation?.turn ?? 1) <= 4;
      if (!isEarlyDuo) {
        cost += bounded(Number(lp[1]) / Math.max(1200, board.ownLp * 0.35), 0.2, 4);
      }
    }
    const discard = /^cost-discard-(\d+)$/.exec(role);
    if (discard) cost += Number(discard[1]) * 1.5;
  }
  if (roles.has("cost-tribute")) {
    const hasTokens = (board.ownMonsters ?? []).some((m) => m.isToken || m.token || m.roles?.includes("token") || (Number(m.atk) === 0 && Number(m.def) === 0));
    if (!hasTokens) cost += 2;
  }
  return cost;
}

/**
 * Projects a legal response into a compact, card-agnostic value model. The
 * evaluator reasons from public state, costs, stats and semantic roles derived
 * from card text. It never checks a card name or peeks at hidden information.
 */
export function projectResponseValue(knowledge, message, response, { observation = {}, memory = null } = {}) {
  const role = strategyActionRole(message, response);
  const cards = responseCards(knowledge, message, response);
  const roles = new Set(cards.flatMap((card) => card.roles ?? []));
  const board = boardFacts(observation);
  const components = { material: 0, board: 0, tempo: 0, future: 0, safety: 0, coherence: 0 };
  const reasons = [];
  const playstyle = resolvePlaystyleProfile(knowledge);

  if (role === "summon" || role === "special-summon") {
    for (const card of cards) {
      const attack = Number(card.atk) || 0;
      const defense = Number(card.def) || 0;
      const cardName = String(card.name ?? "").toLowerCase();
      const isGravekeeper = cardName.includes("gravekeeper");
      const necrovalleyActive = (board.ownBackrowCards ?? observation.ownBackrow ?? []).some((b) => {
        const bc = codeOf(b);
        const bn = String(b?.name ?? "").toLowerCase();
        return (bc === 47355498 || bc === 135106001 || bn.includes("necrovalley")) && (b?.faceUp === true || (Number(b?.position) & 1) !== 0);
      });
      const effectiveAttack = attack + (isGravekeeper && necrovalleyActive ? 500 : 0);
      const effectiveDefense = defense + (isGravekeeper && necrovalleyActive ? 500 : 0);
      const immediateLethal = !board.opponentMonsters.length && effectiveAttack > 0 && effectiveAttack >= board.opponentLp;
      components.board += bounded((effectiveAttack - 1000) / 700, -1.5, 2.5);
      components.tempo += 1;
      if ((playstyle === "aggro" || necrovalleyActive) && effectiveAttack >= 1600 && effectiveAttack >= effectiveDefense) {
        components.tempo += 1.5;
        components.board += 1.0;
        reasons.push(necrovalleyActive ? "NECROVALLEY_BEATER_PRESSURE" : "AGGRO_PROACTIVE_PRESSURE");
      }
      if (card.roles?.includes("flip") && !immediateLethal) {
        components.future -= 3.5;
        reasons.push("FACEUP_SUMMON_DOES_NOT_ENABLE_FLIP_VALUE");
      }
      const isTsukuyomi = cardName.includes("tsukuyomi") || (card.roles?.includes("spirit") && card.roles?.includes("position"));
      if (isTsukuyomi) {
        const hasOpponentFaceUpThreat = (board.opponentFaceUp ?? []).some((m) => {
          const mAtk = Number(m.attack ?? m.atk ?? 0);
          const mDef = Number(m.defense ?? m.def ?? 0);
          const mName = String(m.name ?? "").toLowerCase();
          const hasDangerousEffect = mName.includes("mirage dragon") || mName.includes("jinzo") || mName.includes("thousand-eyes") || mName.includes("relinquished") || mName.includes("black luster");
          return mAtk >= 1500 || mAtk > mDef || hasDangerousEffect;
        });
        const hasRecyclableFlip = (board.ownMonsters ?? []).some((m) => {
          const sem = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
          return sem?.roles?.includes("flip") && m.faceUp === true;
        });
        if (hasOpponentFaceUpThreat || hasRecyclableFlip) {
          components.tempo += 2.5;
          components.board += 2.0;
          components.material += 1.0;
          reasons.push("TSUKUYOMI_FLIP_TACTICAL_VALUE");
        }
      }
      if (!isTsukuyomi && board.opponentPower > effectiveAttack && board.opponentFaceUp.length) {
        components.safety -= bounded((board.opponentPower - effectiveAttack) / 900, 0, 2.5);
      }
      if (immediateLethal) components.tempo += 6;
      const isBreaker = !card.roles?.includes("continuous-engine") && (
        (card.roles?.includes("counter-resource") && (card.roles?.includes("backrow-removal") || card.roles?.includes("destroy-removal"))) ||
        cardName.includes("breaker the magical warrior")
      );
      if (isBreaker && board.opponentBackrow === 0 && board.opponentMonsters.length === 0 && Number(observation.turn ?? 1) <= 2) {
        components.tempo -= 2.5;
        reasons.push("HOLD_BREAKER_UNTIL_OPPONENT_SETS_BACKROW");
      }
      if (effectiveAttack < 1000 && !isTsukuyomi && !card.roles?.includes("continuous-engine") && Number(observation.turn ?? 1) <= 1 && !immediateLethal) {
        components.safety -= 2.5;
        components.tempo -= 1.5;
        reasons.push("AVOID_WEAK_ATTACK_SUMMON_ON_FIRST_TURN");
      }
      if ((card.roles?.includes("sinister-engine") || cardName === "sinister serpent") && Number(observation.turn ?? 1) <= 2) {
        components.future -= 2.5;
        reasons.push("PRESERVE_SINISTER_IN_HAND_FOR_DISCARD");
      }
    }
  }

  if (role === "monster-set") {
    for (const card of cards) {
      const attack = Number(card.atk) || 0;
      const defense = Number(card.def) || 0;
      const isFlip = card.roles?.includes("flip");
      const isWall = defense > attack || hasAny(new Set(card.roles ?? []), ["defense", "stall"]);
      const isBeater = attack >= 1400 && attack > defense;

      components.board += bounded((defense - 700) / 800, -0.5, 2.2);
      if (isFlip) {
        const isSpellRecovery = card.roles?.includes("spell-recovery") || String(card.name ?? "").toLowerCase() === "magician of faith";
        const graveSpells = (observation.ownGrave ?? []).filter((g) => {
          const sem = publicCardSemantics(Number(g?.runtimeCode ?? g?.code ?? 0));
          return sem?.kind === "SPELL" || sem?.roles?.includes("trinity") || sem?.roles?.includes("spell-engine");
        }).length;
        if (isSpellRecovery && graveSpells === 0) {
          components.future += 0.5;
          reasons.push("SET_FLIP_NO_GRAVE_TARGETS_YET");
        } else {
          components.future += 4.5;
          components.coherence += 2;
          reasons.push("SET_ENABLES_FUTURE_FLIP_VALUE");
        }
      } else if (isBeater) {
        components.future -= 2.5;
        components.coherence -= 2;
        components.tempo -= 1.5;
        reasons.push("SETTING_BEATER_LOSES_PROACTIVE_PRESSURE");
      }
      if (card.roles?.includes("spirit") || card.class === "Spirit") {
        components.future -= 3.5;
        components.coherence -= 2.0;
        reasons.push("PRESERVE_SPIRIT_UTILITY_IN_HAND");
      }
      if (playstyle === "aggro" && !isFlip && !isWall) {
        components.tempo -= 1.0;
        components.board -= 0.5;
        reasons.push("AGGRO_DISCOURAGES_PASSIVE_SET");
      }
      if (isWall || defense >= 1400) components.safety += 1;
      else if (defense < 1000 && !isFlip) components.safety -= 1;
      if (hasAny(new Set(card.roles ?? []), ["defense", "stall"])) components.safety += 1.2;
      if (board.ownMonsters.length >= 3) components.coherence -= (board.ownMonsters.length - 2) * 1.4;
      if (board.ownFaceDown.length >= 2) components.future -= (board.ownFaceDown.length - 1) * 0.8;
      components.safety += deckSafetyAdjustment(new Set(card.roles ?? []), card, observation, board) * 0.35;
    }
  }

  if (role === "spell-set") {
    const phase = Number(observation.phase) || 0;
    const isTurn1 = Number(observation.turn ?? 1) <= 1;
    const isMain1 = (phase & OcgPhase.MAIN1) !== 0 || phase === OcgPhase.MAIN1 || phase === 4;
    const isMain2 = (phase & OcgPhase.MAIN2) !== 0 || phase === OcgPhase.MAIN2 || phase === 8 || phase === 16;
    const handSize = Number(observation.handSize ?? observation.ownHand?.length) || 0;

    for (const card of cards) {
      const cardRoles = new Set(card.roles ?? []);
      const isCardReactive = cardRoles.has("reactive") || cardRoles.has("interaction") || cardRoles.has("defense") || cardRoles.has("negate");
      const isNormalSpell = card.kind === "SPELL" && !cardRoles.has("reactive") && !cardRoles.has("quick-play");

      if (isNormalSpell) {
        if (handSize > 6) {
          components.future += 1.0;
          reasons.push("SET_SPELL_TO_AVOID_END_PHASE_DISCARD");
        } else {
          components.future -= 3.0;
          components.tempo -= 1.5;
          reasons.push("AVOID_SETTING_NORMAL_SPELL_WITHOUT_PRESSURE");
        }
      }

      if (isTurn1) {
        if (isCardReactive) {
          components.safety += 2.5;
          components.future += 1.5;
          reasons.push("TURN_ONE_SET_DEFENSIVE_BACKROW");
        }
      } else {
        if (isMain1) {
          components.tempo -= 2.0;
          components.safety -= 1.5;
          reasons.push("DEFER_SET_TO_MAIN_PHASE_2");
        } else if (isMain2) {
          if (isCardReactive) {
            components.safety += 2.5;
            components.tempo += 1.0;
            reasons.push("MAIN_PHASE_2_SET_DEFENSIVE_BACKROW");
          }
        }
      }

      const ownBackCount = Number(board.ownBackrow) || 0;
      if (ownBackCount >= 2) {
        components.safety -= 2.0;
        reasons.push("RISK_HEAVY_STORM_BLOWOUT_ON_THIRD_BACKROW");
      }
    }
  }

  if (role === "activate" || role === "chain") {
    const hasPublicChain = (observation.publicChain ?? []).length > 0;
    const respondingToOpponent = (observation.publicChain ?? []).some((entry) => Number(entry.controller) !== Number(observation.player));
    if (!roles.has("absorb")) {
      components.material -= 1;
    } else {
      components.material += 2;
      components.board += 2;
      components.tempo += 2.5;
      reasons.push("ABSORB_OPPONENT_MONSTER");
    }
    components.material -= activationCost(roles, board, observation);
    components.safety += cards.reduce((sum, card) => sum + deckSafetyAdjustment(new Set(card.roles ?? []), card, observation, board), 0);
    if (hasAny(roles, ["draw", "search", "advantage"])) {
      components.material += 4;
      components.future += 1;
    }
    if (roles.has("trinity")) {
      if (roles.has("hand-destruction")) {
        const oppHand = Number(observation.opponentHandCount ?? observation.opponentHand?.length ?? 5);
        if (oppHand >= 2) {
          components.material += 4.5;
          components.tempo += 2.0;
          reasons.push("DELINQUENT_DUO_EARLY_HAND_DESTRUCTION");
        } else if (oppHand === 1) {
          components.material += 1.5;
        } else {
          components.material -= 5;
          reasons.push("AVOID_DUO_ON_EMPTY_OPPONENT_HAND");
        }
      } else if (roles.has("draw")) {
        components.material += 2.0;
        reasons.push("TRINITY_DRAW_POWER");
      }
    }
    if (hasAny(roles, ["combo", "engine", "grave-setup"])) components.future += 1.5;
    if (roles.has("cost-tribute") && roles.has("combo")) {
      const hasTokens = (board.ownMonsters ?? []).some((m) => m.isToken || m.token || m.roles?.includes("token") || (Number(m.atk) === 0 && Number(m.def) === 0));
      if (hasTokens) {
        components.material += 2.0;
        components.board += 2.5;
        components.tempo += 1.5;
        reasons.push("METAMORPHOSIS_CONVERT_TOKEN_TO_FUSION");
      }
    }
    if (roles.has("interaction")) {
      const targetPlan = publicMonsterTargetPlan(roles, observation);
      const opposingTargets = targetPlan.opponent;
      const strongestOpposingAttack = Math.max(0, ...opposingTargets.filter(faceUp).map((card) => Number(card.attack) || 0));
      const hasDefensiveThreat = opposingTargets.some((card) => {
        const cRoles = new Set(cardForCode(knowledge, card)?.roles ?? []);
        const def = Number(card.defense ?? card.def ?? 0);
        return def >= 1400 || cRoles.has("burn") || cRoles.has("clock") || cRoles.has("stall") || cRoles.has("flip");
      });
      const worthwhileRemovalTarget = opposingTargets.length > 0
        && (roles.has("absorb")
          || roles.has("swing") && opposingTargets.length >= 2
          || opposingTargets.length === 1 && board.ownPower >= board.opponentLp
          || strongestOpposingAttack >= 1000
          || strongestOpposingAttack >= board.ownLp
          || hasDefensiveThreat);
      const monsterRelevant = (roles.has("monster-removal") || roles.has("take-control")) ? (worthwhileRemovalTarget ? opposingTargets.length : 0)
        : roles.has("position") ? opposingTargets.length : 0;
      const backrowRelevant = roles.has("backrow-removal") ? board.opponentBackrow : 0;
      const generalRelevant = !roles.has("monster-removal") && !roles.has("backrow-removal") && !roles.has("position") && !roles.has("take-control") ? board.opponentMonsters.length + board.opponentBackrow : 0;
      const replyingToOwnChain = role === "chain" && hasPublicChain && !respondingToOpponent;
      const reusableFlipValue = roles.has("position") && targetPlan.own.some((card) => cardForCode(knowledge, card)?.roles?.includes("flip")
        && !wasJustSummonedFaceUp(memory, observation, codeOf(card)));
      // Some legal trigger windows create value without a visible target: for
      // example, placing a Spell Counter or denying the next Draw Phase.
      // They must not inherit the removal-only "empty target" penalty.
      const independentValue = hasAny(roles, ["counter-resource", "draw-denial", "self-turn-face-down", "pacman-engine"]) || reusableFlipValue ? 1 : 0;
      const relevantOpposingState = replyingToOwnChain && !independentValue ? 0 : monsterRelevant + backrowRelevant + generalRelevant + independentValue;
      components.tempo += relevantOpposingState ? 2.5 : -3;
      if (cards[0]?.kind === "MONSTER" && (roles.has("self-turn-face-down") || roles.has("pacman-engine"))) {
        components.tempo += 2.5;
        components.future += 2.5;
        reasons.push("PACMAN_RESET_FACE_DOWN");
      }
      if (cards[0]?.kind === "MONSTER" && (roles.has("monster-removal") || roles.has("removal") || roles.has("banish-removal")) && worthwhileRemovalTarget) {
        components.material += roles.has("cost-tribute") ? 2.5 : 1.5;
        components.board += bounded((strongestOpposingAttack - 1000) / 700, 1.0, 3.5);
        components.tempo += 1.5;
        reasons.push("MONSTER_IGNITION_REMOVAL");
      }
      if (cards[0]?.kind === "MONSTER" && (roles.has("backrow-removal") || roles.has("spell-removal") || roles.has("destroy-removal")) && board.opponentBackrow > 0) {
        const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
        const oppHasLockOrClock = (observation.opponentBackrow ?? []).some((c) =>
          isCardActiveFaceUp(c) && (CONTINUOUS_THREAT_CODES.has(codeOf(c)) || BATTLE_LOCK_CODES.has(codeOf(c)))
        );
        components.material += 1.5;
        components.tempo += oppHasLockOrClock ? 4.0 : 2.0;
        components.board += 1.5;
        if (oppHasLockOrClock) components.safety += 2.5;
        reasons.push(oppHasLockOrClock ? "MONSTER_IGNITION_DESTROY_LOCK_OR_CLOCK" : "MONSTER_IGNITION_BACKROW_REMOVAL");
      }
      if (cards[0]?.kind === "MONSTER" && (roles.has("attack-boost") || roles.has("dynamic-atk"))) {
        const oppStrongerOrEqual = (board.opponentFaceUp ?? []).some((opp) => {
          const oppAtk = Number(opp.attack ?? opp.atk ?? 0);
          const oppDef = Number(opp.defense ?? opp.def ?? 0);
          const oppStat = (Number(opp.position) & OcgPosition.ATTACK) !== 0 ? oppAtk : oppDef;
          return oppStat >= (Number(cards[0]?.attack ?? cards[0]?.atk) || 0) && oppStat <= 2500;
        });
        const openBoardSafeHit = board.opponentMonsters.length === 0 && board.opponentBackrow === 0;
        if (oppStrongerOrEqual || openBoardSafeHit) {
          components.tempo += 3.0;
          components.board += 2.5;
          reasons.push("ACTIVATE_ATTACK_BOOST_BEFORE_BATTLE");
        }
      }
      if (!relevantOpposingState) reasons.push(role === "chain" && hasPublicChain ? "CHAIN_NEEDS_IMMEDIATE_PUBLIC_JUSTIFICATION" : "INTERACTION_HAS_NO_VISIBLE_OPPOSING_VALUE");
      if (role === "chain" && !roles.has("negate")) {
        const activeChain = publicChainTargetContext(knowledge, observation, {
          owner: observation.player,
          sourceCode: Number(cards[0]?.runtimeCode) || 0,
          sourceAlreadyChained: false,
        });
        const removalLike = ["backrow-removal", "backrow-sweeper", "monster-removal", "swing", "destroy-removal"]
          .some((value) => roles.has(value));
        if (removalLike && activeChain.card?.roles?.includes("one-shot-effect")
          && activeChain.otherTargetCount === 0 && !independentValue) {
          // The card already has a resolving effect. Removing a Normal
          // Spell/Trap here does not negate it and only burns our resource.
          components.tempo -= 8;
          components.coherence -= 5;
          reasons.push("REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT");
        }
      }
    }
    if (roles.has("swing")) {
      const opposingTargets = roles.has("backrow-removal") ? board.opponentBackrow : board.opponentMonsters.length;
      const ownCollateral = roles.has("target-opponent-board") ? 0 : (roles.has("backrow-removal") ? board.ownBackrow : board.ownMonsters.length);
      components.material += bounded((opposingTargets - ownCollateral) * 1.4, -5, 5);
      if (roles.has("backrow-sweeper")) {
        const isLethalPush = board.ownPower >= board.opponentLp;
        if (isLethalPush && board.opponentBackrow >= 1) {
          components.tempo += 5.0;
          reasons.push("HEAVY_STORM_LETHAL_CLEAR");
        } else if (board.opponentBackrow >= 3) {
          components.material += 4.5;
          components.tempo += 2.0;
          reasons.push("HEAVY_STORM_MASS_ADVANTAGE");
        } else if (board.opponentBackrow === 2) {
          components.material += 2.0;
          reasons.push("HEAVY_STORM_FAVORABLE_TRADE");
        } else if (board.opponentBackrow === 1) {
          const isCardActiveFaceUp = (c) => c?.faceUp === true || (Number(c?.position) & 1) !== 0;
          const oppHasLockOrClock = (observation.opponentBackrow ?? []).some((c) =>
            isCardActiveFaceUp(c) && (CONTINUOUS_THREAT_CODES.has(codeOf(c)) || BATTLE_LOCK_CODES.has(codeOf(c)))
          );
          if (oppHasLockOrClock) {
            components.material += 2.0;
            components.tempo += 4.0;
            components.safety += 3.0;
            reasons.push("HEAVY_STORM_DESTROY_CRITICAL_CLOCK_OR_LOCK");
          } else {
            components.material -= 4.0;
            components.tempo -= 2.0;
            reasons.push("AVOID_HEAVY_STORM_ON_SINGLE_TARGET");
          }
        }
      }
    }
    if (roles.has("position")) {
      const targetPlan = publicMonsterTargetPlan(roles, observation);
      const reusableOwnEngines = targetPlan.own.filter((entry) => {
        const card = cardForCode(knowledge, entry);
        return card?.roles?.includes("flip") && !wasJustSummonedFaceUp(memory, observation, entry.runtimeCode);
      });
      if (targetPlan.opponentCount && (role !== "chain" || respondingToOpponent || !hasPublicChain)) components.tempo += 2;
      else if (reusableOwnEngines.length) components.future += 1.5;
      else {
        components.coherence -= 4;
        reasons.push("POSITION_EFFECT_DOES_NOT_ADVANCE_CURRENT_STATE");
      }
    }
    if (hasAny(roles, ["defense", "stall"]) && (board.opponentPower > 0 || board.ownLp <= 3000)) components.safety += 2;
    if (playstyle === "burn") {
      if (roles.has("burn")) {
        components.tempo += 2.5;
        components.safety += 0.8;
        reasons.push("BURN_CLOCK_ADVANCEMENT");
        if (board.opponentMonsters.length >= 3) {
          components.material += 2.0;
          components.tempo += 1.5;
          reasons.push("MASS_BURN_PUNISHES_WIDE_BOARD");
        }
      }
      if (hasAny(roles, ["stall", "defense"])) {
        components.safety += 2.0;
        reasons.push("BURN_STALL_PROTECTION");
      }
      if (roles.has("cost-half-lp") || [...roles].some((r) => /^cost-lp-\d+$/.test(r))) {
        components.safety -= 4.0;
        reasons.push("BURN_AVOIDS_VOLUNTARY_LP_LOSS");
      }
    }
    if (playstyle === "combo") {
      if (hasAny(roles, ["combo", "engine"])) {
        components.future += 2.0;
        reasons.push("COMBO_PIECE_ACCUMULATION");
      }
      if (role === "activate" && hasAny(roles, ["search", "draw"])) {
        components.future += 1.5;
        reasons.push("COMBO_DIGGING_FOR_PIECES");
      }
    }
  }

  if (role === "spell-set") {
    components.material -= 0.25;
    const reactive = roles.has("reactive") || hasAny(roles, ["defense", "stall", "negate"]);
    components.future += reactive ? 2 : -1.5;
    components.safety += reactive ? 1 : 0;
    if (!reactive) { components.coherence -= 1.5; reasons.push("SETTING_A_NON_REACTIVE_CARD_HIDES_A_FUTURE_ACTION"); }
    if (board.ownBackrow >= 2) components.safety -= (board.ownBackrow - 1) * 1.1;
    if (board.ownBackrow >= 4) components.coherence -= 2;
  }

  if (role === "attack") {
    const attacker = cards[0];
    const attack = Number(message?.attacks?.[Number(response.index)]?.attack ?? attacker?.attack ?? attacker?.atk) || 0;
    const targetStats = board.opponentFaceUp.map((card) => (Number(card.position) & OcgPosition.ATTACK) !== 0
      ? Number(card.attack) || 0
      : Number(card.defense) || 0);
    const canChangePositionOnAttack = roles.has("position") || String(attacker?.name ?? "").toLowerCase().includes("assailant");
    const canDefeatVisible = targetStats.some((value) => attack >= value)
      || (canChangePositionOnAttack && board.opponentFaceUp.some((card) => attack >= (Number(card.defense) || 0)));
    const canConvertBattleEffect = roles.has("banish-removal") || roles.has("battle-removal");
    const canBoostInDamageStep = roles.has("damage-step-boost") || String(attacker?.name ?? "").toLowerCase().includes("injection fairy lily");
    const canAttackDirectly = roles.has("direct-attacker");
    if (attack === 0 && !canConvertBattleEffect && !roles.has("floater") && !roles.has("death-trigger")) {
      components.tempo -= 10;
      components.safety -= 8;
      reasons.push("ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET");
    } else if (!targetStats.length || canDefeatVisible || board.opponentFaceDown.length || canConvertBattleEffect || canBoostInDamageStep || canAttackDirectly) {
      components.tempo += 2;
    } else {
      components.tempo -= 7;
      components.safety -= bounded((Math.min(...targetStats) - attack) / 500, 0.5, 3);
      reasons.push("ATTACK_HAS_NO_PROFITABLE_VISIBLE_TARGET");
    }
    if (!board.opponentMonsters.length && board.opponentBackrow > 0) {
      const isFloater = roles.has("floater") || roles.has("death-trigger") || roles.has("grave-trigger");
      if (isFloater) {
        components.safety += 2.0;
        reasons.push("PROBE_UNKNOWN_BACKROW_WITH_FLOATER");
      } else {
        const ownAttackers = (board.ownMonsters ?? []).filter((m) => (Number(m.position) & OcgPosition.ATTACK) !== 0);
        const maxOwnAtk = Math.max(...ownAttackers.map((m) => Number(m.attack ?? m.atk) || 0), attack);
        if (attack < maxOwnAtk) {
          components.safety += 1.0;
          reasons.push("PROBE_UNKNOWN_BACKROW_WITH_LOWER_ATK");
        }
      }
    }
    if (!board.opponentMonsters.length && attack >= board.opponentLp) components.tempo += 8;
    if (playstyle === "aggro") {
      components.tempo += 1.2;
      reasons.push("AGGRO_ATTACK_PRESSURE");
    }
  }

  if (role === "battle-phase") {
    const unequippedAbsorb = (board.ownMonsters ?? []).some((m) => {
      const sem = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
      return sem?.roles?.includes("absorb") && (Number(m.attack ?? m.atk ?? 0) === 0);
    });
    const hasUnusedIgnitionRemoval = (board.ownMonsters ?? []).some((m) => {
      const sem = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
      const mRoles = new Set(sem?.roles ?? []);
      const isRemoval = mRoles.has("monster-removal") || mRoles.has("removal") || mRoles.has("banish-removal");
      const mAtk = Number(m.attack ?? m.atk ?? 0);
      const oppStronger = (board.opponentMonsters ?? []).some((opp) => (Number(opp.attack ?? opp.atk ?? 0) > mAtk) || (Number(opp.defense ?? opp.def ?? 0) > mAtk));
      return isRemoval && oppStronger;
    });
    const hasUnusedIgnitionBoost = (board.ownMonsters ?? []).some((m) => {
      const sem = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
      const mRoles = new Set(sem?.roles ?? []);
      const isBoost = mRoles.has("attack-boost") || mRoles.has("dynamic-atk") || String(m.name ?? "").toLowerCase().includes("bazoo");
      const mAtk = Number(m.attack ?? m.atk ?? 0);
      const oppStronger = (board.opponentMonsters ?? []).some((opp) => (Number(opp.attack ?? opp.atk ?? 0) > mAtk && Number(opp.attack ?? opp.atk ?? 0) <= 2500) || (Number(opp.defense ?? opp.def ?? 0) > mAtk && Number(opp.defense ?? opp.def ?? 0) <= 2500));
      const hasGraveFuel = (observation.graveyard ?? []).some((c) => !c.kind || c.kind === "MONSTER");
      return isBoost && oppStronger && hasGraveFuel && mAtk < 2500;
    });
    const hasUnusedIgnitionBackrowRemoval = (board.ownMonsters ?? []).some((m) => {
      const sem = knowledge?.byRuntimeCode?.[String(codeOf(m))] ?? publicCardSemantics(codeOf(m));
      const mRoles = new Set(sem?.roles ?? []);
      const isBreaker = mRoles.has("backrow-removal") || String(m.name ?? "").toLowerCase().includes("breaker");
      const oppHasLock = (observation.opponentBackrow ?? []).some((c) =>
        (c?.faceUp === true || (Number(c?.position) & 1) !== 0) && (CONTINUOUS_THREAT_CODES.has(codeOf(c)) || BATTLE_LOCK_CODES.has(codeOf(c)))
      );
      return isBreaker && oppHasLock;
    });
    if ((unequippedAbsorb || hasUnusedIgnitionRemoval || hasUnusedIgnitionBoost || hasUnusedIgnitionBackrowRemoval) && (board.opponentMonsters.length > 0 || hasUnusedIgnitionBackrowRemoval)) {
      components.tempo -= 4;
      components.safety -= 3;
      reasons.push(unequippedAbsorb ? "PRIORITIZE_ABSORPTION_BEFORE_BATTLE" : hasUnusedIgnitionBackrowRemoval ? "PRIORITIZE_BACKROW_REMOVAL_BEFORE_BATTLE" : hasUnusedIgnitionBoost ? "PRIORITIZE_BOOST_BEFORE_BATTLE" : "PRIORITIZE_REMOVAL_BEFORE_BATTLE");
    } else {
      components.tempo += board.ownPower > 0 ? 1 : -0.5;
      if (playstyle === "aggro" && board.ownPower > 0) {
        components.tempo += 1.5;
        reasons.push("AGGRO_ENTER_BATTLE_PROACTIVELY");
      }
    }
  }
  if (role === "end-phase") components.tempo -= 0.5;
  if (role === "position-change") {
    const instance = selectedBoardInstance(message, response, observation);
    const currentPosition = Number(instance?.position) || 0;
    const attack = Number(cards[0]?.atk) || Number(instance?.attack) || 0;
    const defense = Number(cards[0]?.def) || Number(instance?.defense) || 0;
    const isBeater = attack >= 1400 && attack > defense;
    const isWall = defense > attack || roles.has("defense") || roles.has("stall");

    if ((currentPosition & OcgPosition.FACEDOWN) !== 0) {
      if (attack === 0 && !roles.has("flip") && !roles.has("absorb") && !roles.has("variable-atk") && !roles.has("dynamic-atk")) {
        components.tempo -= 7;
        components.safety -= 6;
        reasons.push("AVOID_SHIFTING_ZERO_ATK_TO_ATTACK_POSITION");
      } else {
        components.future += roles.has("flip") ? 3.5 : 0.3;
        components.tempo += roles.has("flip") || isBeater ? 1.5 : 0;
      }
    } else if ((currentPosition & OcgPosition.ATTACK) !== 0) {
      if (isBeater && defense < 1400) {
        components.board -= bounded((attack - defense) / 600, 1.5, 3.5);
        components.tempo -= 2.5;
        components.safety -= 1.0;
        reasons.push("BEATER_DEFENSE_CHANGE_EXPOSES_WEAK_DEFENSE");
      } else {
        components.board += bounded((defense - attack) / 700, -2.5, 2.5);
        components.safety += (board.opponentPower > attack && (isWall || defense >= board.opponentPower)) ? 1.2 : -0.8;
        if (!board.opponentMonsters.length && attack > 0) components.tempo -= 3;
      }
    } else if ((currentPosition & OcgPosition.DEFENSE) !== 0) {
      if (attack === 0 && !roles.has("absorb") && !roles.has("variable-atk") && !roles.has("dynamic-atk")) {
        components.tempo -= 7;
        components.safety -= 6;
        reasons.push("AVOID_SHIFTING_ZERO_ATK_TO_ATTACK_POSITION");
      } else {
        components.board += bounded((attack - defense) / 700, -2.5, 2.5);
        components.tempo += !board.opponentMonsters.length || attack >= board.opponentPower || isBeater ? 2.5 : -1;
      }
    } else components.future += 0.1;
    components.safety += cards.reduce((sum, card) => sum + deckSafetyAdjustment(new Set(card.roles ?? []), card, observation, board), 0);
  }
  if (role === "yes" || role === "no") {
    const isYes = role === "yes";
    if (roles.has("battle-banisher")) {
      const oppMonsters = observation.opponentMonsters ?? [];
      const oppAtkMax = Math.max(0, ...oppMonsters.map((m) => Number(m.attack ?? m.atk ?? 0)));
      const ownAtk = Number(cards[0]?.atk) || 1500;
      const oppBattled = observation.battledOpponentMonster ?? null;
      const oppStat = Number(oppBattled?.attack ?? oppBattled?.atk ?? oppAtkMax);
      const isOppThreat = oppStat >= 1600 || oppStat >= ownAtk
        || oppMonsters.some((m) => Number(m.attack ?? m.atk ?? 0) >= 1600 || (m.roles ?? []).includes("boss"))
        || Number(observation.opponentThreat) >= 1600;

      if (isOppThreat) {
        if (isYes) {
          components.tempo += 3.5;
          components.material += 1.0;
          reasons.push("DD_BANISH_HIGH_THREAT");
        } else {
          components.tempo -= 3.0;
          reasons.push("DD_REFUSE_BANISH_THREAT_PENALTY");
        }
      } else {
        if (!isYes) {
          components.material += 2.5;
          components.tempo += 2.0;
          reasons.push("PRESERVE_DD_WARRIOR_LADY");
        } else {
          components.material -= 3.0;
          components.tempo -= 2.0;
          reasons.push("AVOID_SELF_BANISH_ON_WEAK_TARGET");
        }
      }
    } else if (roles.has("recruiter")) {
      if (isYes) {
        components.material += 3.5;
        components.tempo += 2.5;
        reasons.push("RECRUITER_SPECIAL_SUMMON");
      } else {
        components.material -= 4.0;
        components.tempo -= 3.0;
      }
    } else if (roles.has("recovery") || roles.has("advantage") || roles.has("draw") || roles.has("engine")) {
      if (isYes) {
        components.material += 3.0;
        components.tempo += 2.0;
        reasons.push("TRIGGER_OPTIONAL_ADVANTAGE");
      } else {
        components.material -= 3.0;
        components.tempo -= 2.0;
      }
    } else {
      if (isYes) components.coherence += hasAny(roles, ["engine", "combo", "interaction", "advantage"]) ? 1 : 0;
      if (!isYes) components.coherence -= hasAny(roles, ["engine", "combo", "interaction", "advantage"]) ? 1 : 0;
    }
  }

  const causalCard = sourceCard(knowledge, message, memory, observation);
  const causalRoles = new Set(causalCard?.roles ?? []);
  if (message?.type === OcgMessageType.SELECT_CARD && causalRoles.has("position")) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const selections = message.selects ?? message.select_cards ?? [];
    for (const index of response.indicies ?? []) {
      const entry = selections[Number(index)];
      const card = cardForCode(knowledge, entry);
      const controller = controllerOf(entry);
      if (controller !== null && controller !== owner) {
        components.tempo += 3.5;
        components.safety += 1.5;
        if ((Number(card?.atk) || 0) >= 1500 || card?.roles?.includes("boss") || card?.roles?.includes("threat")) {
          components.tempo += 2;
          components.safety += 2;
          reasons.push("DISRUPT_OPPONENT_THREAT_OR_LOCK");
        } else {
          reasons.push("TURN_OPPONENT_MONSTER_FACE_DOWN");
        }
      } else if (wasJustSummonedFaceUp(memory, observation, codeOf(entry))) {
        components.material -= 3;
        components.coherence -= 5;
        reasons.push("SPENDING_A_CARD_TO_REPAIR_THE_PREVIOUS_ACTION");
      } else if (card?.roles?.includes("flip")) {
        components.future += 3;
        components.material += 1;
        reasons.push("RESET_OWN_FLIP_EFFECT");
      } else if (card?.roles?.includes("absorb") || ["relinquished", "thousand-eyes restrict"].some((n) => String(card?.name ?? "").toLowerCase().includes(n))) {
        components.future += 3.5;
        components.material += 1.5;
        components.tempo += 2.0;
        reasons.push("RESET_ABSORPTION_EFFECT");
      } else {
        components.tempo -= 6;
        components.coherence -= 5;
        components.safety -= 3;
        reasons.push("AVOID_TURNING_OWN_NON_FLIP_MONSTER_FACE_DOWN");
      }
    }
  }

  if (message?.type === OcgMessageType.SELECT_CARD) {
    const owner = Number(observation.player ?? message.player ?? 0);
    const selections = message.selects ?? message.select_cards ?? [];
    const activeChain = causalRoles.has("removal") && !causalRoles.has("negate")
      ? publicChainTargetContext(knowledge, observation, {
        owner,
        sourceCode: Number(causalCard?.runtimeCode) || 0,
        sourceAlreadyChained: true,
      })
      : null;
    for (const index of response.indicies ?? []) {
      const entry = selections[Number(index)];
      const card = cardForCode(knowledge, entry);
      const controller = controllerOf(entry);
      const location = Number(entry?.location) || 0;
      const intrinsic = intrinsicCardValue(card, observation);
      if (location === OcgLocation.HAND && controller === owner) {
        const cardRoles = new Set(card?.roles ?? []);
        const isSinister = cardRoles.has("sinister-engine") || cardRoles.has("discard-fodder") || String(card?.name ?? "").toLowerCase() === "sinister serpent" || String(card?.name ?? "").toLowerCase() === "night assailant";
        if (isSinister) {
          components.material += 3.5;
          reasons.push("DISCARD_FREE_RECURSIVE_SERPENT");
        } else {
          components.material -= intrinsic;
          const ownGrave = observation.ownGrave ?? [];
          const oppLight = ownGrave.filter((g) => publicCardSemantics(codeOf(g))?.attribute === "LIGHT").length;
          const oppDark = ownGrave.filter((g) => publicCardSemantics(codeOf(g))?.attribute === "DARK").length;
          const attr = card?.attribute ?? publicCardSemantics(card?.runtimeCode)?.attribute;
          if ((attr === "LIGHT" && oppLight === 0 && oppDark > 0) || (attr === "DARK" && oppDark === 0 && oppLight > 0)) {
            components.future += 1.5;
            reasons.push("DISCARD_ENABLES_CHAOS_THRESHOLD");
          } else {
            reasons.push("DISCARD_LOWEST_FUTURE_VALUE");
          }
        }
      } else if (location === OcgLocation.EXTRA) {
        const cardRoles = new Set(card?.roles ?? []);
        const cardAtk = Number(card?.atk) || 0;
        components.board += bounded((cardAtk - 1000) / 700, 0.5, 3.5);
        if (cardRoles.has("absorb")) {
          components.board += 4.0;
          components.tempo += 3.0;
          reasons.push("FUSION_ABSORB_THOUSAND_EYES");
        } else if (cardRoles.has("negate") || cardRoles.has("spell-engine")) {
          components.safety += 3.0;
          components.tempo += 2.0;
          reasons.push("FUSION_LOCKDOWN_NEGATOR");
        } else if (cardRoles.has("hand-destruction") || cardRoles.has("burn")) {
          components.tempo += 2.5;
          reasons.push("FUSION_TACTICAL_EFFECT");
        }
      } else if ((location === OcgLocation.DECK && causalRoles.has("search")) || (location === OcgLocation.GRAVE && (causalRoles.has("recovery") || causalRoles.has("revive")))) {
        components.future += intrinsic;
        if (location === OcgLocation.GRAVE && (card?.roles?.includes("trinity") || ["pot of greed", "graceful charity", "delinquent duo"].includes(String(card?.name ?? "").toLowerCase()))) {
          components.future += 5.0;
          reasons.push("RECOVER_TRINITY_SPELL");
        }
        if (causalRoles.has("revive")) {
          const cardAtk = Number(card?.atk) || 0;
          const cardDef = Number(card?.def) || 0;
          const cardRoles = new Set(card?.roles ?? []);
          components.board += bounded((Math.max(cardAtk, cardDef) - 700) / 600, 1.0, 4.5);
          components.tempo += 2.0;
          if (cardRoles.has("boss") || cardAtk >= 2400) {
            components.tempo += 2.5;
            reasons.push("REVIVE_HIGH_THREAT_BOSS");
          } else if (cardRoles.has("negate")) {
            components.safety += 2.5;
            reasons.push("REVIVE_LOCKDOWN_MONSTER");
          } else if (cardRoles.has("flip")) {
            components.future += 1.5;
            reasons.push("REVIVE_UTILITY_MONSTER");
          }
        }
      } else if ((location === OcgLocation.MZONE || location === OcgLocation.SZONE) && (causalRoles.has("removal") || causalRoles.has("take-control") || causalRoles.has("control-swap") || causalRoles.has("equip") || causalRoles.has("absorb"))) {
        if (controller !== null && controller !== owner) {
          if (causalRoles.has("take-control")) {
            components.tempo += 3.5;
            components.board += bounded((Number(card?.atk) || 0) / 600, 1.5, 4.0);
            if (card?.roles?.includes("boss") || (Number(card?.atk) || 0) >= 2400) {
              components.tempo += 2.5;
              reasons.push("TAKE_CONTROL_OPPONENT_BOSS");
            } else {
              reasons.push("TAKE_CONTROL_OPPONENT_THREAT");
            }
          } else if (causalRoles.has("absorb")) {
            const cardAtk = Number(card?.atk) || 0;
            components.board += bounded(cardAtk / 500, 1.5, 5.0);
            components.tempo += 3.0 + bounded(cardAtk / 600, 0.5, 3.5);
            if (card?.roles?.includes("boss") || cardAtk >= 2400) {
              components.tempo += 2.5;
              reasons.push("ABSORB_OPPONENT_BOSS");
            } else {
              reasons.push("ABSORB_OPPONENT_THREAT");
            }
          } else {
            components.tempo += intrinsic + 1;
          }
        } else {
          if (causalRoles.has("control-swap")) {
            const cardAtk = Number(card?.atk) || 0;
            const isTokenOrFloater = card?.roles?.includes("token") || card?.roles?.includes("floater") || cardAtk <= 1000;
            if (isTokenOrFloater) {
              components.material += 2.5;
              components.tempo += 2.0;
              reasons.push("SWAP_LOW_VALUE_OR_FLOATER");
            } else {
              components.board -= bounded((cardAtk - 1000) / 500, 2.0, 6.0);
              components.tempo -= 3.0;
              reasons.push("AVOID_GIVING_HIGH_VALUE_MONSTER_IN_SWAP");
            }
          } else if (causalRoles.has("equip")) {
            const cardAtk = Number(card?.atk) || 0;
            components.tempo += 2.0 + bounded(cardAtk / 800, 0, 3.0);
            reasons.push("EQUIP_BENEFIT_OWN_BEATER");
          } else {
            components.tempo += -intrinsic - 2;
          }
        }
        if (activeChain?.card?.roles?.includes("one-shot-effect") && matchesPublicChainCard(entry, activeChain.entry)) {
          components.tempo -= 8;
          components.coherence -= 5;
          reasons.push("REMOVAL_DOES_NOT_NEGATE_ACTIVE_ONE_SHOT");
        }
        if (controller === owner && wasJustDeployedOrExposed(memory, observation, codeOf(entry)) && !causalRoles.has("control-swap") && !causalRoles.has("equip")) {
          components.coherence -= 6;
          reasons.push("REMOVING_A_RESOURCE_JUST_DEPLOYED_OR_EXPOSED");
        }
      }
    }
  }

  if (message?.type === OcgMessageType.ANNOUNCE_RACE) {
    const RACE_MAP = {
      warrior: 1n, spellcaster: 2n, fairy: 4n, fiend: 8n, zombie: 16n, machine: 32n,
      aqua: 64n, pyro: 128n, rock: 256n, wingedbeast: 512n, plant: 1024n, insect: 2048n,
      thunder: 4096n, dragon: 8192n, beast: 16384n, beastwarrior: 32768n, dinosaur: 65536n,
      fish: 131072n, seaserpent: 262144n, reptile: 524288n
    };
    const raceFlag = (c) => {
      if (!c) return 0n;
      if (typeof c.race === "bigint") return c.race;
      if (typeof c.race === "number") return BigInt(c.race);
      const str = String(c.race || "").toLowerCase().replace(/[^a-z]/g, "");
      return RACE_MAP[str] ?? 0n;
    };
    const races = response.races ?? [];
    const oppMonsters = board.opponentMonsters ?? [];
    let matchedOppAtk = 0;
    let matchedCount = 0;
    for (const opp of oppMonsters) {
      const sem = knowledge?.byRuntimeCode?.[String(codeOf(opp))] ?? publicCardSemantics(codeOf(opp));
      const oppFlag = raceFlag(opp) || raceFlag(sem);
      const oppStr = String(sem?.race ?? opp.race ?? "").toLowerCase().replace(/[^a-z]/g, "");
      if (races.some((r) => (typeof r === "bigint" && oppFlag && r === oppFlag) || String(r).toLowerCase().replace(/[^a-z]/g, "") === oppStr)) {
        matchedOppAtk += Number(opp.attack ?? opp.atk ?? 0);
        matchedCount += 1;
      }
    }
    if (matchedCount > 0) {
      components.tempo += 3.5 + bounded(matchedOppAtk / 600, 0.5, 4.0);
      components.material += matchedCount * 1.5;
      reasons.push("ANNOUNCE_RACE_MATCHES_OPPONENT_BOARD");
    } else {
      components.tempo -= 3.0;
      reasons.push("ANNOUNCE_RACE_MATCHES_NO_OPPOSING_TARGETS");
    }
  }

  if (message?.type === OcgMessageType.SELECT_TRIBUTE || message?.type === OcgMessageType.SELECT_SUM) {
    const selections = message.selects ?? [];
    for (const index of response.indicies ?? []) {
      const sel = selections[Number(index)];
      const card = cardForCode(knowledge, sel);
      const cardRoles = new Set(card?.roles ?? []);
      const atk = Number(card?.atk ?? sel?.attack ?? 0);
      const isToken = sel?.isToken || (Number(sel?.type) & 0x4000) !== 0 || cardRoles.has("token") || (atk === 0 && Number(card?.def ?? sel?.defense ?? 0) === 0);
      const isFloater = cardRoles.has("floater") || cardRoles.has("search-on-death") || cardRoles.has("grave-trigger")
        || ["sangan", "sinister serpent"].some((n) => String(card?.name ?? "").toLowerCase().includes(n));
      const isBoss = cardRoles.has("boss") || atk >= 2400;
      const isBeater = atk >= 1800;
      const isFaceUp = sel?.faceUp === true || (Number(sel?.position) & OcgPosition.FACEUP) !== 0;
      const isSpentFlip = isFaceUp && cardRoles.has("flip") && atk <= 1000;

      if (isToken) {
        components.material += 2.0;
        reasons.push("TRIBUTE_TOKEN_COST_FREE");
      } else if (isFloater) {
        components.material += 2.5;
        components.future += 1.5;
        reasons.push("TRIBUTE_FLOATER_FOR_VALUE");
      } else if (isSpentFlip) {
        components.material += 1.0;
        reasons.push("TRIBUTE_SPENT_FLIP_MONSTER");
      } else if (isBoss) {
        components.material -= 8.0;
        components.board -= 4.0;
        reasons.push("AVOID_TRIBUTING_BOSS");
      } else if (isBeater) {
        components.material -= 3.5;
        components.board -= 2.0;
        reasons.push("AVOID_TRIBUTING_BEATER");
      } else {
        components.material -= intrinsicCardValue(card, observation);
      }
    }
  }

  if (message?.type === OcgMessageType.SELECT_OPTION) {
    const sCode = Number(message?.code ?? message?.card?.code ?? 0);
    const src = knowledge?.byRuntimeCode?.[String(sCode)] ?? publicCardSemantics(sCode) ?? sourceCard(knowledge, message, memory, observation);
    const srcRoles = new Set(src?.roles ?? []);
    const isEcon = srcRoles.has("modal-control") || String(src?.name ?? "").toLowerCase().includes("enemy controller");
    if (isEcon) {
      const ownMonsters = observation.ownMonsters ?? [];
      const hasDisposableTribute = ownMonsters.some((m) => m.isToken || (Number(m.attack ?? m.atk ?? 0) <= 1000) || (m.roles ?? []).includes("floater"));
      const oppBoss = Math.max(0, ...(observation.opponentMonsters ?? []).map((m) => Number(m.attack ?? m.atk ?? 0)));
      const canTakeControlForValue = hasDisposableTribute && oppBoss >= 1800;

      if (response.index === 1) {
        if (canTakeControlForValue) {
          components.tempo += 4.0;
          components.board += 3.0;
          reasons.push("ECON_TAKE_CONTROL_OPPONENT_THREAT");
        } else {
          components.material -= 4.0;
          reasons.push("ECON_AVOID_TRIBUTE_WITHOUT_FODDER");
        }
      } else if (response.index === 0) {
        if (!canTakeControlForValue) {
          components.tempo += 2.0;
          reasons.push("ECON_CHANGE_POSITION_PREFERRED");
        } else {
          components.tempo -= 1.0;
        }
      }
    }
  }

  if (message?.type === OcgMessageType.ANNOUNCE_NUMBER) {
    const options = message.options ?? [];
    const declaredNumber = options[Number(response.value)] ?? response.value;
    const oppGrave = observation.opponentGrave ?? [];
    const oppGraveLevels = oppGrave.map((g) => {
      const sem = knowledge?.byRuntimeCode?.[String(codeOf(g))] ?? publicCardSemantics(codeOf(g));
      return Number(sem?.level) || 0;
    }).filter((l) => l > 0);

    if (declaredNumber === 4) {
      components.tempo += 3.0;
      reasons.push("REASONING_DECLARE_LEVEL_4");
    } else if (declaredNumber === 6 && oppGraveLevels.includes(6)) {
      components.tempo += 2.5;
      reasons.push("REASONING_DECLARE_LEVEL_6");
    } else if (declaredNumber === 8 && oppGraveLevels.includes(8)) {
      components.tempo += 2.5;
      reasons.push("REASONING_DECLARE_LEVEL_8");
    } else {
      components.tempo -= 1.0;
    }
  }

  const weights = PLAYSTYLE_COMPONENT_WEIGHTS[playstyle] ?? PLAYSTYLE_COMPONENT_WEIGHTS.midrange;
  const value = Object.entries(components).reduce((sum, [key, comp]) => sum + comp * (weights[key] ?? 1.0), 0);
  return { role, cards, components, reasons, playstyle, value: bounded(value, -20, 20) };
}

function primaryCode(entry) { return Number(entry.analysis.cards?.[0]?.runtimeCode) || 0; }

/** Removes only responses dominated by another legal route to the same card. */
export function reasonAboutResponses(knowledge, message, candidates, context = {}) {
  const evaluated = candidates.map((candidate) => ({ candidate, analysis: projectResponseValue(knowledge, message, candidate, context), dominated: false }));
  const guarded = enforceDecisionGuardrails(knowledge, message, evaluated, context);
  for (const current of guarded.allowed) {
    const code = primaryCode(current);
    if (!code) continue;
    const semanticRoles = new Set(current.analysis.cards?.[0]?.roles ?? []);
    // A lower immediate board score must not erase the only route that turns
    // on a persistent engine. Conversely, FLIP value needs the set route.
    if (semanticRoles.has("continuous-engine") && ["summon", "special-summon", "activate"].includes(current.analysis.role)) continue;
    if (semanticRoles.has("flip") && current.analysis.role === "monster-set") continue;
    if (semanticRoles.has("multi-attack") && ["summon", "special-summon"].includes(current.analysis.role)) continue;
    const alternatives = guarded.allowed.filter((other) => other !== current && primaryCode(other) === code);
    if (alternatives.some((other) => other.analysis.value >= current.analysis.value + 2.5)) current.dominated = true;
  }
  const undominated = guarded.allowed.filter((entry) => !entry.dominated);
  const coherent = undominated.filter((entry) => entry.analysis.components.coherence > -4.5);
  let filterFailure = guarded.filterFailure ?? null;
  if (!coherent.length && !undominated.length && guarded.allowed.length > 0) {
    filterFailure = "ALL_CANDIDATES_DOMINATED_OR_INCOHERENT";
  }
  const pool = coherent.length ? coherent : undominated.length ? undominated : evaluated;
  const bestProjected = Math.max(...pool.map((entry) => entry.analysis.value));
  const viable = pool.filter((entry) => entry.analysis.value >= bestProjected - 6 || entry.analysis.value >= 0);
  const selected = viable.length ? viable : pool;
  selected.rejectedByGuardrails = guarded.rejected;
  selected.afterSafetyCount = guarded.allowed.length;
  selected.filterFailure = filterFailure;
  return selected;
}

export function rememberResponse(memory, knowledge, message, response, observation = {}) {
  const next = memory ?? { recent: [] };
  const analysis = projectResponseValue(knowledge, message, response, { observation, memory: next });
  const turn = Number(observation.turn) || 0;
  next.recent = (next.recent ?? []).filter((entry) => Number(entry.turn) >= turn - 1);
  next.recent.push({ turn, decision: Number(observation.decisions) || 0, role: analysis.role, cardCode: Number(analysis.cards?.[0]?.runtimeCode) || 0, roles: [...new Set(analysis.cards.flatMap((card) => card.roles ?? []))], value: analysis.value, progressSignature: publicProgressSignature(observation) });
  if (next.recent.length > 16) next.recent = next.recent.slice(-16);
  return next;
}

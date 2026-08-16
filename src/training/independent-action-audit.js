import { OcgLocation, OcgMessageType, OcgPosition } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";
import { actionCardEntries, strategyActionRole } from "../bots/deck-strategy.js";
import { candidateResponses } from "../bots/legal-candidates.js";
import { publicCardSemantics } from "../bots/card-semantics.js";
import { publicMonsterTargetPlan } from "../bots/target-feasibility.js";

function codeOf(entry) { return Number(entry?.runtimeCode ?? entry?.code ?? entry?.card ?? 0); }
function controllerOf(entry) {
  const value = entry?.controller ?? entry?.controler ?? entry?.player;
  return value === undefined || value === null ? null : Number(value);
}
function faceUp(entry) { return entry?.faceUp === true || (Number(entry?.position) & OcgPosition.FACEUP) !== 0; }
function increment(target, key) { target[key] = (Number(target[key]) || 0) + 1; }

function semantics(knowledge, entry) {
  return knowledge?.byRuntimeCode?.[String(codeOf(entry))] ?? publicCardSemantics(codeOf(entry)) ?? null;
}

function rolesForAction(knowledge, message, response) {
  return new Set(actionCardEntries(knowledge, message, response).flatMap((card) => card.roles ?? []));
}

function hasPassAlternative(message, response, knowledge, observation) {
  const roles = candidateResponses(message, response, { deckKnowledge: knowledge, observation }).map((candidate) => strategyActionRole(message, candidate));
  return roles.some((role) => ["pass-chain", "end-phase", "main-two"].includes(role));
}

function selectionFacts(message, response, owner) {
  const values = message?.selects ?? message?.select_cards ?? [];
  const selected = (response?.indicies ?? []).map((index) => values[Number(index)]).filter(Boolean);
  const isBackrow = (entry) => [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(entry?.location));
  return {
    values,
    selected,
    own: selected.filter((entry) => controllerOf(entry) === owner),
    opponent: selected.filter((entry) => controllerOf(entry) !== null && controllerOf(entry) !== owner),
    availableOpponent: values.filter((entry) => controllerOf(entry) !== null && controllerOf(entry) !== owner),
    ownBackrow: selected.filter((entry) => controllerOf(entry) === owner && isBackrow(entry)),
    availableOpponentBackrow: values.filter((entry) => controllerOf(entry) !== null && controllerOf(entry) !== owner && isBackrow(entry)),
  };
}

function critical(code, detail) { return { severity: "critical", code, detail }; }
function review(code, detail) { return { severity: "review", code, detail }; }

function inspectDecision({ message, response, observation, knowledge, state, decision }) {
  const owner = Number(observation.player ?? message.player ?? 0);
  const role = strategyActionRole(message, response);
  const actionCards = actionCardEntries(knowledge, message, response);
  const roles = rolesForAction(knowledge, message, response);
  const findings = [];

  if (message.type === OcgMessageType.SELECT_IDLECMD && role === "summon") {
    const selected = actionCards[0];
    const canSetSameCard = (message.monster_sets ?? []).some((entry) => codeOf(entry) === Number(selected?.runtimeCode));
    if (selected?.roles?.includes("flip") && canSetSameCard
      && !(Number(observation.opponentMonsterCount) === 0 && Number(selected.atk) >= Number(observation.opponentLp))) {
      findings.push(critical("FLIP_SUMMONED_FACEUP_WITH_SET_AVAILABLE", selected.name));
    }
  }

  if (["activate", "chain"].includes(role) && hasPassAlternative(message, response, knowledge, observation)) {
    const targetPlan = publicMonsterTargetPlan(roles, observation);
    const opponentBackrow = Number(observation.opponentBackrowCount ?? observation.opponentBackrow?.length) || 0;
    const opponentChainBackrow = (observation.publicChain ?? []).some((entry) => Number(entry.controller) !== owner
      && [OcgLocation.SZONE, OcgLocation.FZONE].includes(Number(entry.location)));
    const ownBackrow = Number(observation.ownBackrowCount ?? observation.ownBackrow?.length) || 0;
    const positiveEngine = ["draw", "search", "advantage", "burn", "alternate-win"].some((value) => roles.has(value));
    if (roles.has("monster-removal") && targetPlan.constrained && targetPlan.opponentCount === 0 && !positiveEngine) {
      findings.push(critical("TARGETED_REMOVAL_WITHOUT_OPPONENT_TARGET", actionCards[0]?.name ?? role));
    }
    if (roles.has("backrow-sweeper") && opponentBackrow === 0 && !opponentChainBackrow && ownBackrow > 0 && !roles.has("recycle-board")) {
      findings.push(critical("BACKROW_SWEEPER_ONLY_HITS_OWN_FIELD", actionCards[0]?.name ?? role));
    }
    // Targeted backrow removal is certified when the following SELECT_CARD is
    // answered. The activation snapshot can briefly show zero opposing cards
    // while OCGCore is opening a response window, so judging it here creates
    // false positives. Sweepers are still safe to judge immediately above.
  }

  if (role === "attack") {
    const attacker = actionCards[0];
    const attack = Number(attacker?.atk) || 0;
    const visible = (observation.opponentMonsters ?? []).filter(faceUp);
    const hidden = (observation.opponentMonsters ?? []).filter((entry) => !faceUp(entry));
    const targetStats = visible.map((entry) => {
      const card = semantics(knowledge, entry);
      return (Number(entry.position) & OcgPosition.ATTACK) !== 0
        ? Number(entry.attack ?? card?.atk) || 0
        : Number(entry.defense ?? card?.def) || 0;
    });
    const attackerRoles = new Set(attacker?.roles ?? []);
    if (targetStats.length && !hidden.length && targetStats.every((value) => value > attack)
      && !attackerRoles.has("banish-removal") && !attackerRoles.has("battle-removal")) {
      findings.push(critical("ATTACK_DECLARED_WITHOUT_PROFITABLE_VISIBLE_TARGET", attacker?.name ?? "attacker"));
    }
  }

  if (message.type === OcgMessageType.SELECT_CARD) {
    const direct = semantics(knowledge, { code: Number(message.code ?? message.card?.code ?? message.triggering_card?.code ?? 0) });
    const selection = selectionFacts(message, response, owner);
    const recentAttackTarget = state.lastAttack && decision - state.lastAttack.decision <= 3
      && selection.values.length > 0
      && selection.values.every((entry) => Number(entry.location) === OcgLocation.MZONE);
    const remembered = !recentAttackTarget && decision - Number(state.lastSource?.decision) <= 4 ? state.lastSource?.card : null;
    const source = direct ?? remembered;
    const sourceRoles = new Set(source?.roles ?? []);
    if (["removal", "monster-removal", "backrow-removal", "position"].some((value) => sourceRoles.has(value))
      && selection.own.length > 0 && selection.availableOpponent.length > 0) {
      findings.push(critical("SELF_TARGET_WITH_OPPONENT_TARGET_AVAILABLE", source?.name ?? "effect"));
    }
    if (sourceRoles.has("backrow-removal") && selection.ownBackrow.length > 0 && selection.availableOpponentBackrow.length === 0
      && state.lastSource?.hadPassAlternative) {
      findings.push(critical("BACKROW_REMOVAL_FORCED_TO_OWN_CARD", source?.name ?? "backrow removal"));
    }
    if (sourceRoles.has("position") && selection.own.length > 0) {
      const justSummonedFlip = selection.own.some((entry) => {
        const recent = state.deployed?.[String(codeOf(entry))];
        return semantics(knowledge, entry)?.roles?.includes("flip")
          && ["summon", "special-summon"].includes(recent?.role)
          && decision - Number(recent?.decision ?? -100) <= 5;
      });
      const respondingToOpponent = (observation.publicChain ?? []).some((entry) => controllerOf(entry) !== null
        && controllerOf(entry) !== owner);
      if (justSummonedFlip && selection.availableOpponent.length === 0 && !respondingToOpponent) {
        findings.push(critical("POSITION_EFFECT_REPAIRS_JUST_DEPLOYED_MONSTER", source?.name ?? "position"));
      }
    }
  }

  if (message.type === OcgMessageType.SELECT_IDLECMD && role === "end-phase" && message.to_bp
    && Number(observation.opponentMonsterCount) === 0
    && Number(observation.ownBoardPower) >= Number(observation.opponentLp)
    && Number(observation.ownBoardPower) > 0) {
    findings.push(review("POTENTIAL_OPEN_LETHAL_SKIPPED", `power ${observation.ownBoardPower}, LP ${observation.opponentLp}`));
  }

  if (["summon", "special-summon", "position-change"].includes(role)) {
    for (const card of actionCards) state.deployed[String(card.runtimeCode)] = { decision, role };
  }
  if (["activate", "chain"].includes(role) && actionCards[0]) {
    state.lastSource = {
      decision,
      card: actionCards[0],
      hadPassAlternative: hasPassAlternative(message, response, knowledge, observation),
    };
  }
  if (role === "attack") {
    const attacker = actionCards[0];
    state.lastAttack = { decision, attack: Number(attacker?.atk) || 0, name: attacker?.name ?? "attacker" };
  }
  return { role, actionCards, findings };
}

function emptyAudit() {
  return { schema: 1, decisions: 0, reasoned: 0, forced: 0, critical: 0, review: 0, byCode: {}, byRole: {}, examples: [] };
}

export function createIndependentActionAudit({ targetPlayer = null, sampleLimit = 24, metadata = {} } = {}) {
  const audit = emptyAudit();
  const states = new Map();
  return {
    capture(trace, context = {}) {
      const player = Number(trace?.player ?? context.player ?? context.observation?.player ?? 0);
      if (targetPlayer !== null && Number(targetPlayer) !== player) return;
      const message = context.message;
      const response = context.response;
      const observation = context.observation ?? {};
      const knowledge = context.bot?.deckKnowledge ?? context.deckKnowledge;
      if (!message || !response || !knowledge) return;
      const state = states.get(player) ?? { deployed: {}, lastSource: null, lastAttack: null };
      states.set(player, state);
      const legal = candidateResponses(message, response, { deckKnowledge: knowledge, observation });
      const forced = legal.length <= 1;
      const decision = audit.decisions + 1;
      const inspected = inspectDecision({ message, response, observation, knowledge, state, decision });
      audit.decisions += 1;
      increment(audit.byRole, inspected.role);
      if (forced) audit.forced += 1;
      else audit.reasoned += 1;
      for (const finding of inspected.findings) {
        audit[finding.severity] += 1;
        increment(audit.byCode, finding.code);
        if (audit.examples.length < sampleLimit) audit.examples.push({
          ...metadata,
          player,
          decision: Number(context.decisions) || decision,
          turn: Number(observation.turn) || 0,
          phase: Number(observation.phase) || 0,
          requestType: Number(message.type) || 0,
          role: inspected.role,
          cards: inspected.actionCards.map((card) => card.name),
          severity: finding.severity,
          code: finding.code,
          detail: finding.detail,
          publicState: {
            ownLp: Number(observation.ownLp) || 0,
            opponentLp: Number(observation.opponentLp) || 0,
            ownMonsters: Number(observation.ownMonsterCount) || 0,
            opponentMonsters: Number(observation.opponentMonsterCount) || 0,
            ownBackrow: Number(observation.ownBackrowCount) || 0,
            opponentBackrow: Number(observation.opponentBackrowCount) || 0,
          },
          publicChain: (observation.publicChain ?? []).map((entry) => ({
            code: Number(entry.code) || 0,
            controller: controllerOf(entry),
            location: Number(entry.location) || 0,
            sequence: Number(entry.sequence) || 0,
          })),
          selection: {
            options: (message.selects ?? message.select_cards ?? []).map((entry) => ({
              code: codeOf(entry),
              controller: controllerOf(entry),
              location: Number(entry.location) || 0,
              sequence: Number(entry.sequence) || 0,
            })),
            chosenIndices: [...(response.indicies ?? [])].map(Number),
          },
        });
      }
    },
    result() { return finalizeIndependentActionAudit(audit); },
  };
}

export function mergeIndependentActionAudits(values = [], { sampleLimit = 24 } = {}) {
  const merged = emptyAudit();
  for (const value of values) {
    for (const key of ["decisions", "reasoned", "forced", "critical", "review"]) merged[key] += Number(value?.[key]) || 0;
    for (const [code, count] of Object.entries(value?.byCode ?? {})) merged.byCode[code] = (merged.byCode[code] ?? 0) + Number(count);
    for (const [role, count] of Object.entries(value?.byRole ?? {})) merged.byRole[role] = (merged.byRole[role] ?? 0) + Number(count);
    for (const example of value?.examples ?? []) if (merged.examples.length < sampleLimit) merged.examples.push(structuredClone(example));
  }
  return finalizeIndependentActionAudit(merged);
}

export function finalizeIndependentActionAudit(audit) {
  return {
    schema: 1,
    decisions: Number(audit.decisions) || 0,
    reasoned: Number(audit.reasoned) || 0,
    forced: Number(audit.forced) || 0,
    critical: Number(audit.critical) || 0,
    review: Number(audit.review) || 0,
    criticalRate: Number(audit.critical) / Math.max(1, Number(audit.reasoned)),
    reviewRate: Number(audit.review) / Math.max(1, Number(audit.reasoned)),
    byCode: { ...(audit.byCode ?? {}) },
    byRole: { ...(audit.byRole ?? {}) },
    examples: structuredClone(audit.examples ?? []),
    authority: "raw-public-message-response",
    caveat: "El auditor es independiente de la puntuación interna del bot y detecta una taxonomía acotada; no certifica por sí solo la jugada óptima.",
  };
}

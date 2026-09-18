import { chooseCoreBotResponse } from "../engine/ocgcore-backend.js";
import { candidateResponses } from "./legal-candidates.js";
import { actionCardEntries, buildDeckKnowledge, deckSnapshot, scoreDeckStrategy, strategyActionRole } from "./deck-strategy.js";
import { inferOpponentDeck, opponentEvidenceCards, restoreRememberedOpponentFieldCards, updateOpponentEvidence, updateOpponentFieldMemory } from "./opponent-model.js";
import { Nexo2PolicyNetwork, nexo2FeatureVector, policyProbabilities } from "./nexo2-policy.js";
import { computeResidualPolicyDistribution, selectResidualAction } from "../training/nexo2-policy-contract.js";
import { publicBeliefRollout } from "./public-belief-search.js";
import { planStrategicResponses } from "./strategic-planner.js";
import { reasonAboutResponses, rememberResponse } from "./state-evaluator.js";
import { tacticalResponseAdjustment } from "./tactical-evaluator.js";
import { GOAT_BASE_KNOWLEDGE_FINGERPRINT, GOAT_BASE_KNOWLEDGE_SCHEMA, baseKnowledgeFeatures, decisionTrainingSignal, normalizeGoatObservation, normalizeReasonCodes } from "./goat-base-knowledge.js";
import { createNegativeInferenceTracker, updateNegativeInference } from "./negative-inference.js";

export const STRATEGIC_DECISION_SCHEMA = 8;
export const NEXO2_ALGORITHM = "ocgcore-public-belief-policy-value-v1";

function configuredNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(numeric) ? numeric : fallback));
}

export class StrategicBot {
  constructor({ id = "strategic-base", botId = id, name = "Strategic Base", algorithm = "ocgcore-public-strategic-v4", deckId = "generic", deck = null, profile = deckId, style = "Adaptativo", persona = {}, state = "Validado", skillMmr = 0, certification = null, seed = 1, policyWeights = {}, neuralModel = null, freezeLinearPolicy = null, decisionConfig = {}, trainingState = {}, training = false, exploration = 0.08, learningRate = 0.018, legacyNegativeInference = false } = {}) {
    this.id = id;
    this.botId = botId;
    this.name = name;
    this.algorithm = algorithm;
    this.deckId = deckId;
    this.profile = profile;
    this.style = style;
    this.persona = structuredClone(persona);
    this.state = state;
    this.skillMmr = Math.max(0, Number(skillMmr) || 0);
    this.certification = certification ? structuredClone(certification) : null;
    this.seed = Number(seed) || 1;
    this.randomState = this.seed >>> 0 || 1;
    this.policyWeights = { ...policyWeights };
    this.nexo2Enabled = algorithm === NEXO2_ALGORITHM || [1, 2, 3].includes(Number(neuralModel?.schema)) || neuralModel?.type === "public-action-mlp-policy-value";
    this.deckKnowledge = buildDeckKnowledge(deckId, deck);
    const defaultRiskAversion = this.nexo2Enabled
      ? Math.max(0.02, Math.min(0.40, (1 - Number(this.deckKnowledge?.riskTolerance ?? 0.5)) * 0.40))
      : 0;
    this.decisionConfig = {
      deckWeight: configuredNumber(decisionConfig.deckWeight, 1, 0, 3),
      stateWeight: configuredNumber(decisionConfig.stateWeight, 1.8, 0, 4),
      tacticalWeight: configuredNumber(decisionConfig.tacticalWeight, 0.5, 0, 3),
      planningScale: configuredNumber(decisionConfig.planningScale, 0.3, 0, 1.5),
      policyScale: configuredNumber(decisionConfig.policyScale, this.nexo2Enabled ? 0.35 : 1.75, 0, 5),
      viabilityMargin: configuredNumber(decisionConfig.viabilityMargin, this.nexo2Enabled ? 3.5 : 1.5, 0.5, 8),
      beliefScale: configuredNumber(decisionConfig.beliefScale, this.nexo2Enabled ? 0.75 : 0, 0, 2.5),
      neuralScale: configuredNumber(decisionConfig.neuralScale, this.nexo2Enabled ? 1.35 : 0, 0, 4),
      valueScale: configuredNumber(decisionConfig.valueScale, this.nexo2Enabled ? 0.6 : 0, 0, 2),
      riskAversion: configuredNumber(decisionConfig.riskAversion, defaultRiskAversion, 0, 1),
      maxBaseRegret: configuredNumber(decisionConfig.maxBaseRegret, this.nexo2Enabled ? 3.5 : 8, 0, 8),
    };
    this.freezeLinearPolicy = freezeLinearPolicy === null ? this.nexo2Enabled : freezeLinearPolicy === true;
    this.training = training === true;
    this.exploration = Math.max(0, Math.min(0.5, Number(exploration) || 0));
    this.learningRate = Math.max(0.001, Math.min(0.2, Number(learningRate) || 0.018));
    this.trainingState = { rewardBaseline: Number(trainingState.rewardBaseline) || 0, episodes: Math.max(0, Number(trainingState.episodes) || 0) };
    this.neuralPolicy = this.nexo2Enabled ? new Nexo2PolicyNetwork(neuralModel ?? {}, { seed: this.seed ^ 0xa511e9b3, learningRate: Math.min(0.02, this.learningRate * 0.24) }) : null;
    this.trajectory = [];
    this.reasoningMemory = { recent: [] };
    this.decisions = 0;
    this.opponentModel = null;
    this.opponentEvidence = {};
    this.opponentFieldMemory = {};
    this.lastObservation = null;
    this.legacyNegativeInference = legacyNegativeInference === true;
    this.negativeInferenceTracker = createNegativeInferenceTracker({ legacy: this.legacyNegativeInference });
  }

  chooseResponse(message, context = {}) {
    this.decisions += 1;
    this.lastReasoning = null;
    const rawObservation = normalizeGoatObservation({ ...(context.observation ?? {}), decisions: Number(context.observation?.decisions) || this.decisions }, message);
    this.opponentFieldMemory = updateOpponentFieldMemory(this.opponentFieldMemory, rawObservation);
    const observation = restoreRememberedOpponentFieldCards(rawObservation, this.opponentFieldMemory);
    this.lastObservation = structuredClone(observation);
    this.opponentEvidence = updateOpponentEvidence(this.opponentEvidence, observation);
    this.opponentModel = inferOpponentDeck({ ...observation, opponentSeenCards: opponentEvidenceCards(this.opponentEvidence) });
    this.negativeInferenceTracker = updateNegativeInference(this.negativeInferenceTracker, observation, message, null);
    const baseline = chooseCoreBotResponse(message, { ...context, profile: "generic", weights: {}, brave: false });
    const legal = candidateResponses(message, baseline, { deckKnowledge: this.deckKnowledge, observation });
    if (legal.length <= 1) {
      const onlyLegal = legal[0] ?? baseline;
      this.lastReasoning = {
        requestType: Number(message?.type),
        forced: true,
        promptForced: message?.forced === true,
        playstyle: this.style,
        opponentModel: structuredClone(this.opponentModel),
        baseKnowledge: { schema: GOAT_BASE_KNOWLEDGE_SCHEMA, fingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT, state: observation.goatState, window: observation.goatWindow },
        baseline: { role: strategyActionRole(message, baseline), cards: actionCardNames(this.deckKnowledge, message, baseline) },
        selected: { role: strategyActionRole(message, onlyLegal), cards: actionCardNames(this.deckKnowledge, message, onlyLegal), semanticRoles: [], score: null, plannedScore: null, projectedValue: null, policyValue: 0, reasons: ["ONLY_LEGAL_RESPONSE"], reasonCodes: normalizeReasonCodes(["ONLY_LEGAL_RESPONSE"], { actionRole: strategyActionRole(message, onlyLegal), observation }), components: {}, evaluationComponents: {} },
        alternatives: [],
        rejected: [],
        counts: {
          legal: legal.length,
          afterSafety: legal.length,
          viable: legal.length,
        },
        bestHeuristic: null,
        bestPlanned: null,
        bestNeural: null,
        filterFailure: null,
      };
      rememberResponse(this.reasoningMemory, this.deckKnowledge, message, onlyLegal, observation);
      return structuredClone(onlyLegal);
    }
    const reasoned = reasonAboutResponses(this.deckKnowledge, message, legal, { observation, memory: this.reasoningMemory });
    const rejectedByGuardrails = reasoned.rejectedByGuardrails ?? [];
    const evaluated = reasoned.map(({ candidate, analysis }) => {
      const coreScore = scoreDeckStrategy(this.deckKnowledge, message, candidate, { actionRole: strategyActionRole(message, candidate), observation, baseline: false }) * this.decisionConfig.deckWeight + Number(analysis.value) * this.decisionConfig.stateWeight;
      const tactical = tacticalResponseAdjustment(this.deckKnowledge, message, candidate, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, negativeInference: this.negativeInferenceTracker });
      return { candidate, analysis, baseScore: coreScore + tactical * this.decisionConfig.tacticalWeight };
    });
    const planned = planStrategicResponses(this.deckKnowledge, message, evaluated, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, persona: this.persona, planningScale: this.decisionConfig.planningScale, negativeInference: this.negativeInferenceTracker });
    const boardRelation = Number(observation.ownBoardPower) > Number(observation.opponentThreat) + 500 ? "ahead" : Number(observation.opponentThreat) > Number(observation.ownBoardPower) + 500 ? "behind" : "even";
    const turnBin = Math.min(6, Math.floor((Number(observation.turn) || 0) / 2));
    const phaseBin = String(Number(observation.phase) || 0);
    const backrowBin = Math.min(2, Number(observation.opponentBackrowCount) || 0);
    const handBin = Math.min(3, Math.floor((Number(observation.ownHand?.length) || 0) / 2));
    const turnOwner = observation.isOwnTurn === true ? "own" : observation.isOwnTurn === false ? "opponent" : "unknown";
    const prepared = planned.map((entry, networkIndex) => {
      const semanticRoles = entry.roles ?? [];
      const plan = this.deckKnowledge.plan ?? {};
      const features = [
        `action:${entry.role}`,
        `style:${entry.playstyle}:action:${entry.role}`,
        `board:${boardRelation}:action:${entry.role}`,
        `turn:${turnBin}:action:${entry.role}`,
        `phase:${phaseBin}:action:${entry.role}`,
        `opponent-backrow:${backrowBin}:action:${entry.role}`,
        `hand:${handBin}:action:${entry.role}`,
        `turn-owner:${turnOwner}:action:${entry.role}`,
        ...baseKnowledgeFeatures(this.deckKnowledge, observation, entry),
        `plan:${plan.id ?? "generic"}`,
        `playstyle:${plan.playstyle ?? plan.archetype ?? "adaptive"}`,
        ...(plan.priorityRoles ?? []).map((role) => `plan-priority:${role}`),
        ...(plan.openingRoles ?? []).map((role) => `plan-opening:${role}`),
        ...(plan.keepRoles ?? []).map((role) => `plan-keep:${role}`),
        ...(plan.counterplayRoles ?? []).map((role) => `plan-counterplay:${role}`),
        ...(plan.strengths ?? []).map((strength) => `plan-strength:${strength}`),
        ...(plan.lossConditions ?? []).map((condition) => `plan-loss-condition:${condition}`),
        ...(plan.goals ?? []).map((goal) => `plan-goal:${goal}`),
        ...(plan.keyCards ?? []).map((card) => `plan-key-card:${card}`),
        ...semanticRoles.map((role) => `semantic:${role}`),
        ...semanticRoles.map((role) => `style:${entry.playstyle}:semantic:${role}`),
        ...semanticRoles.map((role) => `board:${boardRelation}:semantic:${role}`),
        ...semanticRoles.map((role) => `turn-owner:${turnOwner}:semantic:${role}`),
      ];
      if (this.opponentModel?.ready) features.push(`opponent:${this.opponentModel.top?.archetype}:action:${entry.role}`);
      const rawPolicyValue = features.reduce((sum, feature) => sum + Number(this.policyWeights[feature] ?? 0), 0) / Math.sqrt(Math.max(1, features.length));
      const linearPolicyValue = Math.tanh(rawPolicyValue) * this.decisionConfig.policyScale;
      const belief = this.nexo2Enabled ? publicBeliefRollout(this.deckKnowledge, entry, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, negativeInference: this.negativeInferenceTracker, riskAversion: this.decisionConfig.riskAversion }) : null;
      const beliefValue = Number(belief?.value) || 0;
      const plannedScore = Number(entry.score) + beliefValue * this.decisionConfig.beliefScale;
      const nexo2Input = this.neuralPolicy ? nexo2FeatureVector(this.deckKnowledge, entry, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, belief, negativeInference: this.negativeInferenceTracker }) : null;
      return { ...entry, networkIndex, features, linearPolicyValue, belief, beliefValue, basePlannerScore: Number(entry.score), plannedScore, nexo2Input };
    });
    let selected = null;
    let viable = [];
    let ranked = [];
    let legacyBest = null;
    let plannedBest = null;
    let neuralBest = null;
    let rejectedPolicyOverride = null;
    let chosenResidualIndex = 0;
    let residualDist = null;

    if (this.nexo2Enabled && this.neuralPolicy) {
      // Coherent on-policy residual policy gradient contract (Phase 7)
      residualDist = computeResidualPolicyDistribution(prepared, this.neuralPolicy, {
        temperature: 1.0,
        alpha: 1.0,
      });

      for (let i = 0; i < prepared.length; i += 1) {
        prepared[i].prior = residualDist.priors[i];
        prepared[i].rawNeuralLogit = residualDist.logits[i];
        prepared[i].neuralPolicyValue = residualDist.logits[i];
        prepared[i].qValue = residualDist.qValues[i];
        prepared[i].neuralStateValue = residualDist.qValues[i];
        prepared[i].z = residualDist.zs[i];
        prepared[i].policyProbability = residualDist.probabilities[i];
        prepared[i].score = residualDist.zs[i];
      }

      const selection = selectResidualAction(prepared, residualDist, {
        training: this.training,
        prng: () => this.nextRandom(),
      });
      selected = selection.chosenCandidate ?? prepared[0];
      chosenResidualIndex = selection.chosenIndex;

      ranked = [...prepared].sort((left, right) => right.score - left.score);
      viable = prepared;
      legacyBest = prepared.reduce((best, entry) => (Number(entry.basePlannerScore) > Number(best?.basePlannerScore ?? -Infinity) ? entry : best), null);
      plannedBest = prepared.reduce((best, entry) => (Number(entry.plannedScore) > Number(best?.plannedScore ?? -Infinity) ? entry : best), null);
      neuralBest = prepared.reduce((best, entry) => (Number(entry.rawNeuralLogit) > Number(best?.rawNeuralLogit ?? -Infinity) ? entry : best), null);

      if (this.training && selected?.features) {
        const counterfactual = ranked.find((entry) => entry !== selected) ?? null;
        this.trajectory.push({
          policyVersion: this.neuralPolicy.policyVersion ?? 1,
          policySchema: 3,
          candidateIds: prepared.map((e) => e.candidateId ?? e.role),
          inputs: prepared.map((e) => e.nexo2Input),
          heuristicScores: prepared.map((e) => Number(e.plannedScore) + Number(e.linearPolicyValue)),
          priors: residualDist.priors,
          logits: residualDist.logits,
          qValues: residualDist.qValues,
          zs: residualDist.zs,
          probabilities: residualDist.probabilities,
          chosenIndex: chosenResidualIndex,
          logp: selection.logp,
          forced: false,
          trainable: prepared.length > 1,
          features: [...new Set(selected.features)],
          alternatives: ranked.filter((entry) => entry !== selected).slice(0, 5).map((entry) => [...new Set(entry.features)]),
          stateSignal: publicStateSignal(observation),
          selectedRole: selected.role,
          selectedScore: Number(selected.score) || 0,
          selectedPlannedScore: Number(selected.plannedScore) || 0,
          selectedProjectedValue: Number(selected.analysis?.value) || 0,
          alternativeRole: counterfactual?.role ?? null,
          alternativeScore: Number(counterfactual?.score) || 0,
          alternativePlannedScore: Number(counterfactual?.plannedScore) || 0,
          alternativeProjectedValue: Number(counterfactual?.analysis?.value) || 0,
          goatState: observation.goatState,
          goatWindow: observation.goatWindow,
          baseKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
          selectedReasonCodes: normalizeReasonCodes(selected.analysis?.reasons ?? [], { actionRole: selected.role, observation }),
          localRewardSignal: decisionTrainingSignal({ actionRole: selected.role, projectedValue: selected.analysis?.value, reasons: selected.analysis?.reasons ?? [], observation }),
          nexo2Inputs: prepared.map((e) => e.nexo2Input),
          nexo2Chosen: chosenResidualIndex,
          nexo2Teacher: legacyBest ? prepared.indexOf(legacyBest) : null,
        });
      }
    } else {
      ranked = prepared.map((entry) => {
        const policyValue = entry.linearPolicyValue;
        return { ...entry, neuralPolicyValue: 0, neuralStateValue: 0, policyValue, score: entry.plannedScore + policyValue };
      }).sort((left, right) => right.score - left.score);
      const bestBasePlanner = Math.max(...ranked.map((entry) => Number(entry.basePlannerScore) || 0));
      legacyBest = ranked.reduce((best, entry) => (Number(entry.basePlannerScore) > Number(best?.basePlannerScore ?? -Infinity) ? entry : best), null);
      plannedBest = ranked.reduce((best, entry) => (Number(entry.plannedScore) > Number(best?.plannedScore ?? -Infinity) ? entry : best), null);
      neuralBest = null;
      viable = ranked.filter((entry) => Number(entry.basePlannerScore) >= bestBasePlanner - this.decisionConfig.viabilityMargin);
      selected = viable[0] ?? ranked[0] ?? evaluated[0];
      if (this.training && viable.length > 1 && this.nextRandom() < this.exploration) {
        selected = viable[Math.floor(this.nextRandom() * Math.min(viable.length, 6))];
      }
      if (!this.training && selected !== plannedBest
        && Number(selected?.analysis?.value) < 0
        && Number(plannedBest?.analysis?.value) >= Number(selected?.analysis?.value) + 0.75
        && Number(selected?.plannedScore) < Number(plannedBest?.plannedScore)) {
        rejectedPolicyOverride = selected;
        selected = plannedBest;
      }
      if (!this.training && selected !== legacyBest
        && Number(selected?.basePlannerScore) < Number(legacyBest?.basePlannerScore) - this.decisionConfig.maxBaseRegret) {
        rejectedPolicyOverride = selected;
        selected = legacyBest;
      }
      if (this.training && selected?.features) {
        const counterfactual = ranked.find((entry) => entry !== selected) ?? null;
        this.trajectory.push({
          features: [...new Set(selected.features)],
          alternatives: ranked.filter((entry) => entry !== selected).slice(0, 5).map((entry) => [...new Set(entry.features)]),
          stateSignal: publicStateSignal(observation),
          selectedRole: selected.role,
          selectedScore: Number(selected.score) || 0,
          selectedPlannedScore: Number(selected.plannedScore) || 0,
          selectedProjectedValue: Number(selected.analysis?.value) || 0,
          alternativeRole: counterfactual?.role ?? null,
          alternativeScore: Number(counterfactual?.score) || 0,
          alternativePlannedScore: Number(counterfactual?.plannedScore) || 0,
          alternativeProjectedValue: Number(counterfactual?.analysis?.value) || 0,
          goatState: observation.goatState,
          goatWindow: observation.goatWindow,
          baseKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
          selectedReasonCodes: normalizeReasonCodes(selected.analysis?.reasons ?? [], { actionRole: selected.role, observation }),
          localRewardSignal: decisionTrainingSignal({ actionRole: selected.role, projectedValue: selected.analysis?.value, reasons: selected.analysis?.reasons ?? [], observation }),
          nexo2Inputs: null,
          nexo2Chosen: null,
          nexo2Teacher: null,
        });
      }
    }
    this.lastReasoning = {
      requestType: Number(message?.type),
      promptForced: message?.forced === true,
      playstyle: selected?.playstyle ?? this.style,
      opponentModel: structuredClone(this.opponentModel),
      baseKnowledge: { schema: GOAT_BASE_KNOWLEDGE_SCHEMA, fingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT, state: observation.goatState, window: observation.goatWindow, damageStep: observation.goatDamageStep === true },
      baseline: { role: strategyActionRole(message, baseline), cards: actionCardNames(this.deckKnowledge, message, baseline) },
      forced: false,
      selected: selected ? { role: selected.role, cards: (selected.analysis?.cards ?? []).map((card) => card.name), semanticRoles: [...(selected.roles ?? [])], score: selected.score, plannedScore: selected.plannedScore, projectedValue: selected.analysis?.value, policyValue: selected.policyValue, linearPolicyValue: selected.linearPolicyValue, neuralPolicyValue: selected.neuralPolicyValue, neuralStateValue: selected.neuralStateValue, beliefValue: selected.beliefValue, reasons: [...(selected.analysis?.reasons ?? [])], reasonCodes: normalizeReasonCodes(selected.analysis?.reasons ?? [], { actionRole: selected.role, observation }), localRewardSignal: decisionTrainingSignal({ actionRole: selected.role, projectedValue: selected.analysis?.value, reasons: selected.analysis?.reasons ?? [], observation }), components: { ...selected.components, belief: selected.beliefValue }, beliefComponents: { ...(selected.belief?.components ?? {}) }, evaluationComponents: { ...(selected.analysis?.components ?? {}) } } : null,
      alternatives: ranked.filter((entry) => entry !== selected).map((entry) => ({ role: entry.role, cards: (entry.analysis?.cards ?? []).map((card) => card.name), semanticRoles: [...(entry.roles ?? [])], score: entry.score, plannedScore: entry.plannedScore, projectedValue: entry.analysis?.value, policyValue: entry.policyValue, linearPolicyValue: entry.linearPolicyValue, neuralPolicyValue: entry.neuralPolicyValue, neuralStateValue: entry.neuralStateValue, beliefValue: entry.beliefValue, reasons: [...(entry.analysis?.reasons ?? [])], reasonCodes: normalizeReasonCodes(entry.analysis?.reasons ?? [], { actionRole: entry.role, observation }), localRewardSignal: decisionTrainingSignal({ actionRole: entry.role, projectedValue: entry.analysis?.value, reasons: entry.analysis?.reasons ?? [], observation }), components: { ...entry.components, belief: entry.beliefValue }, beliefComponents: { ...(entry.belief?.components ?? {}) }, evaluationComponents: { ...(entry.analysis?.components ?? {}) } })),
      rejected: [
        ...rejectedByGuardrails.map((entry) => ({ role: entry.analysis?.role, cards: (entry.analysis?.cards ?? []).map((card) => card.name), guardrail: entry.guardrail, reasonCodes: normalizeReasonCodes([entry.guardrail], { actionRole: entry.analysis?.role, observation }) })),
        ...(rejectedPolicyOverride ? [{ role: rejectedPolicyOverride.role, cards: (rejectedPolicyOverride.analysis?.cards ?? []).map((card) => card.name), guardrail: "LEARNED_OVERRIDE_WORSE_PUBLIC_ROUTE" }] : []),
      ],
      counts: {
        legal: legal.length,
        afterSafety: reasoned.afterSafetyCount ?? reasoned.length,
        viable: viable.length,
      },
      bestHeuristic: legacyBest ? { role: legacyBest.role, cards: (legacyBest.analysis?.cards ?? []).map((c) => c.name), score: legacyBest.basePlannerScore } : null,
      bestPlanned: plannedBest ? { role: plannedBest.role, cards: (plannedBest.analysis?.cards ?? []).map((c) => c.name), score: plannedBest.plannedScore } : null,
      bestNeural: neuralBest ? { role: neuralBest.role, cards: (neuralBest.analysis?.cards ?? []).map((c) => c.name), score: neuralBest.neuralPolicyValue } : null,
      filterFailure: reasoned.filterFailure ?? null,
    };
    rememberResponse(this.reasoningMemory, this.deckKnowledge, message, selected.candidate, observation);
    this.negativeInferenceTracker = updateNegativeInference(this.negativeInferenceTracker, observation, message, selected.candidate);
    if ((selected.roles ?? []).includes("delayed-win")) {
      this.reasoningMemory.commitments ??= {};
      this.reasoningMemory.commitments.delayedWin = true;
    }
    return structuredClone(selected.candidate);
  }

  nextRandom() {
    let value = this.randomState >>> 0;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.randomState = value >>> 0 || 1;
    return this.randomState / 0x100000000;
  }

  consumeEpisode() {
    const episode = this.trajectory;
    this.trajectory = [];
    return episode;
  }

  learnFromEpisode(episode = [], reward = 0) {
    const result = Math.max(-1, Math.min(1, Number(reward) || 0));
    const total = Math.max(1, episode.length);
    const advantage = result - this.trainingState.rewardBaseline;
    this.trainingState.episodes += 1;
    const baselineRate = Math.min(0.05, 1 / Math.max(5, this.trainingState.episodes));
    this.trainingState.rewardBaseline += (result - this.trainingState.rewardBaseline) * baselineRate;
    if (!this.freezeLinearPolicy) for (let index = 0; index < episode.length; index += 1) {
      const trace = episode[index];
      const temporal = Math.pow(0.997, Math.min(240, total - index - 1));
      const nextSignal = Number(episode[Math.min(total - 1, index + 1)]?.stateSignal) || 0;
      const localProgress = Math.max(-0.6, Math.min(0.6, nextSignal - (Number(trace.stateSignal) || 0)));
      const chosen = [...new Set(trace.features ?? [])];
      const plannedMargin = (Number(trace.selectedPlannedScore) || 0) - (Number(trace.alternativePlannedScore) || 0);
      const projectedMargin = (Number(trace.selectedProjectedValue) || 0) - (Number(trace.alternativeProjectedValue) || 0);
      const avoidableRegret = Math.max(0, -plannedMargin);
      const localEvidence = Math.max(-0.35, Math.min(0.35, projectedMargin * 0.08));
      const localRewardSignal = Math.max(-0.35, Math.min(0.35, Number(trace.localRewardSignal) || 0));
      // The final result remains authoritative, but logs now attribute extra
      // blame to an explored decision that had a clearly better public route.
      // This avoids punishing every sound action equally after a long loss.
      const lossCorrection = result < 0 ? -Math.min(0.5, avoidableRegret * 0.18) : 0;
      const credit = advantage * temporal + localProgress * 0.35 + localEvidence + localRewardSignal * 0.5 + lossCorrection;
      const delta = this.learningRate * credit / Math.sqrt(total) / Math.sqrt(Math.max(1, chosen.length));
      for (const feature of chosen) this.policyWeights[feature] = Math.max(-2.5, Math.min(2.5, Number(this.policyWeights[feature] ?? 0) * 0.9998 + delta));
      const alternatives = trace.alternatives ?? [];
      if (alternatives.length) for (const features of alternatives) {
        const contrast = [...new Set(features)].filter((feature) => !chosen.includes(feature));
        for (const feature of contrast) this.policyWeights[feature] = Math.max(-2.5, Math.min(2.5, Number(this.policyWeights[feature] ?? 0) * 0.9998 - delta / alternatives.length * 0.35));
      }
    }
    if (this.neuralPolicy) this.lastNeuralLearning = this.neuralPolicy.learnEpisode(episode, result);
  }

  manifest() {
    return {
      id: this.id,
      botId: this.botId,
      name: this.name,
      algorithm: this.algorithm,
      deckId: this.deckId,
      profile: this.profile,
      style: this.style,
      persona: structuredClone(this.persona),
      state: this.state,
      skillMmr: this.skillMmr,
      certification: structuredClone(this.certification),
      decisions: this.decisions,
      seed: this.seed,
      randomState: this.randomState,
      policyWeights: Object.fromEntries(Object.entries(this.policyWeights).filter(([, value]) => Math.abs(Number(value)) >= 0.0001)),
      decisionConfig: { ...this.decisionConfig },
      decisionSchema: STRATEGIC_DECISION_SCHEMA,
      policySchema: this.nexo2Enabled ? 3 : 2,
      baseKnowledgeSchema: GOAT_BASE_KNOWLEDGE_SCHEMA,
      baseKnowledgeFingerprint: GOAT_BASE_KNOWLEDGE_FINGERPRINT,
      ...(this.neuralPolicy ? { neuralModel: this.neuralPolicy.manifest() } : {}),
      freezeLinearPolicy: this.freezeLinearPolicy,
      trainingState: { ...this.trainingState },
      training: false,
      exploration: this.exploration,
      learningRate: this.learningRate,
      strategy: deckSnapshot(this.deckKnowledge),
    };
  }
}

function actionCardNames(knowledge, message, response) {
  return actionCardEntries(knowledge, message, response).map((card) => card.name);
}

function publicStateSignal(observation = {}) {
  const lp = (Number(observation.ownLp) - Number(observation.opponentLp)) / 8000;
  const board = (Number(observation.ownBoardPower) - Number(observation.opponentThreat)) / 5000;
  const material = ((Number(observation.handSize) + Number(observation.ownMonsterCount) + Number(observation.ownBackrowCount))
    - (Number(observation.opponentHandSize) + Number(observation.opponentMonsterCount) + Number(observation.opponentBackrowCount))) / 12;
  return Math.max(-2, Math.min(2, lp + board + material));
}

import { chooseCoreBotResponse } from "../engine/ocgcore-backend.js";
import { candidateResponses } from "./legal-candidates.js";
import { actionCardEntries, buildDeckKnowledge, deckSnapshot, scoreDeckStrategy, strategyActionRole } from "./deck-strategy.js";
import { inferOpponentDeck, opponentEvidenceCards, updateOpponentEvidence } from "./opponent-model.js";
import { Nexo2PolicyNetwork, nexo2FeatureVector, policyProbabilities } from "./nexo2-policy.js";
import { publicBeliefRollout } from "./public-belief-search.js";
import { planStrategicResponses } from "./strategic-planner.js";
import { reasonAboutResponses, rememberResponse } from "./state-evaluator.js";
import { tacticalResponseAdjustment } from "./tactical-evaluator.js";

export const STRATEGIC_DECISION_SCHEMA = 7;
export const NEXO2_ALGORITHM = "ocgcore-public-belief-policy-value-v1";

function configuredNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(numeric) ? numeric : fallback));
}

export class StrategicBot {
  constructor({ id = "strategic-base", botId = id, name = "Strategic Base", algorithm = "ocgcore-public-strategic-v4", deckId = "generic", deck = null, profile = deckId, style = "Adaptativo", persona = {}, state = "Validado", skillMmr = 0, certification = null, seed = 1, policyWeights = {}, neuralModel = null, freezeLinearPolicy = null, decisionConfig = {}, trainingState = {}, training = false, exploration = 0.08, learningRate = 0.018 } = {}) {
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
    this.nexo2Enabled = algorithm === NEXO2_ALGORITHM || neuralModel?.schema === 1;
    this.decisionConfig = {
      deckWeight: configuredNumber(decisionConfig.deckWeight, 1, 0, 3),
      stateWeight: configuredNumber(decisionConfig.stateWeight, 1.8, 0, 4),
      tacticalWeight: configuredNumber(decisionConfig.tacticalWeight, 0.5, 0, 3),
      planningScale: configuredNumber(decisionConfig.planningScale, 0.3, 0, 1.5),
      policyScale: configuredNumber(decisionConfig.policyScale, 1.75, 0, 5),
      viabilityMargin: configuredNumber(decisionConfig.viabilityMargin, 1.5, 0.5, 8),
      beliefScale: configuredNumber(decisionConfig.beliefScale, this.nexo2Enabled ? 0.7 : 0, 0, 2.5),
      neuralScale: configuredNumber(decisionConfig.neuralScale, this.nexo2Enabled ? 1.1 : 0, 0, 4),
      valueScale: configuredNumber(decisionConfig.valueScale, this.nexo2Enabled ? 0.45 : 0, 0, 2),
      riskAversion: configuredNumber(decisionConfig.riskAversion, this.nexo2Enabled ? 0.25 : 0, 0, 1),
      maxBaseRegret: configuredNumber(decisionConfig.maxBaseRegret, this.nexo2Enabled ? 0.75 : 8, 0, 8),
    };
    this.freezeLinearPolicy = freezeLinearPolicy === null ? this.nexo2Enabled : freezeLinearPolicy === true;
    this.training = training === true;
    this.exploration = Math.max(0, Math.min(0.5, Number(exploration) || 0));
    this.learningRate = Math.max(0.001, Math.min(0.2, Number(learningRate) || 0.018));
    this.trainingState = { rewardBaseline: Number(trainingState.rewardBaseline) || 0, episodes: Math.max(0, Number(trainingState.episodes) || 0) };
    this.neuralPolicy = this.nexo2Enabled ? new Nexo2PolicyNetwork(neuralModel ?? {}, { seed: this.seed ^ 0xa511e9b3, learningRate: Math.min(0.02, this.learningRate * 0.24) }) : null;
    this.trajectory = [];
    this.deckKnowledge = buildDeckKnowledge(deckId, deck);
    this.reasoningMemory = { recent: [] };
    this.decisions = 0;
    this.opponentModel = null;
    this.opponentEvidence = {};
  }

  chooseResponse(message, context = {}) {
    this.decisions += 1;
    this.lastReasoning = null;
    const observation = { ...(context.observation ?? {}), decisions: Number(context.observation?.decisions) || this.decisions };
    this.opponentEvidence = updateOpponentEvidence(this.opponentEvidence, observation);
    this.opponentModel = inferOpponentDeck({ ...observation, opponentSeenCards: opponentEvidenceCards(this.opponentEvidence) });
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
        baseline: { role: strategyActionRole(message, baseline), cards: actionCardNames(this.deckKnowledge, message, baseline) },
        selected: { role: strategyActionRole(message, onlyLegal), cards: actionCardNames(this.deckKnowledge, message, onlyLegal), semanticRoles: [], score: null, plannedScore: null, projectedValue: null, policyValue: 0, reasons: ["ONLY_LEGAL_RESPONSE"], components: {}, evaluationComponents: {} },
        alternatives: [],
        rejected: [],
      };
      rememberResponse(this.reasoningMemory, this.deckKnowledge, message, onlyLegal, observation);
      return structuredClone(onlyLegal);
    }
    const reasoned = reasonAboutResponses(this.deckKnowledge, message, legal, { observation, memory: this.reasoningMemory });
    const rejectedByGuardrails = reasoned.rejectedByGuardrails ?? [];
    const evaluated = reasoned.map(({ candidate, analysis }) => {
      const coreScore = scoreDeckStrategy(this.deckKnowledge, message, candidate, { actionRole: strategyActionRole(message, candidate), observation, baseline: false }) * this.decisionConfig.deckWeight + Number(analysis.value) * this.decisionConfig.stateWeight;
      const tactical = tacticalResponseAdjustment(this.deckKnowledge, message, candidate, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel });
      return { candidate, analysis, baseScore: coreScore + tactical * this.decisionConfig.tacticalWeight };
    });
    const planned = planStrategicResponses(this.deckKnowledge, message, evaluated, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, persona: this.persona, planningScale: this.decisionConfig.planningScale });
    const boardRelation = Number(observation.ownBoardPower) > Number(observation.opponentThreat) + 500 ? "ahead" : Number(observation.opponentThreat) > Number(observation.ownBoardPower) + 500 ? "behind" : "even";
    const turnBin = Math.min(6, Math.floor((Number(observation.turn) || 0) / 2));
    const phaseBin = String(Number(observation.phase) || 0);
    const backrowBin = Math.min(2, Number(observation.opponentBackrowCount) || 0);
    const handBin = Math.min(3, Math.floor((Number(observation.ownHand?.length) || 0) / 2));
    const turnOwner = observation.isOwnTurn === true ? "own" : observation.isOwnTurn === false ? "opponent" : "unknown";
    const prepared = planned.map((entry, networkIndex) => {
      const semanticRoles = entry.roles ?? [];
      const features = [
        `action:${entry.role}`,
        `style:${entry.playstyle}:action:${entry.role}`,
        `board:${boardRelation}:action:${entry.role}`,
        `turn:${turnBin}:action:${entry.role}`,
        `phase:${phaseBin}:action:${entry.role}`,
        `opponent-backrow:${backrowBin}:action:${entry.role}`,
        `hand:${handBin}:action:${entry.role}`,
        `turn-owner:${turnOwner}:action:${entry.role}`,
        ...semanticRoles.map((role) => `semantic:${role}`),
        ...semanticRoles.map((role) => `style:${entry.playstyle}:semantic:${role}`),
        ...semanticRoles.map((role) => `board:${boardRelation}:semantic:${role}`),
        ...semanticRoles.map((role) => `turn-owner:${turnOwner}:semantic:${role}`),
      ];
      if (this.opponentModel?.ready) features.push(`opponent:${this.opponentModel.top?.archetype}:action:${entry.role}`);
      const rawPolicyValue = features.reduce((sum, feature) => sum + Number(this.policyWeights[feature] ?? 0), 0) / Math.sqrt(Math.max(1, features.length));
      const linearPolicyValue = Math.tanh(rawPolicyValue) * this.decisionConfig.policyScale;
      const belief = this.nexo2Enabled ? publicBeliefRollout(this.deckKnowledge, entry, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, riskAversion: this.decisionConfig.riskAversion }) : null;
      const beliefValue = Number(belief?.value) || 0;
      const plannedScore = Number(entry.score) + beliefValue * this.decisionConfig.beliefScale;
      const nexo2Input = this.neuralPolicy ? nexo2FeatureVector(this.deckKnowledge, entry, { observation, memory: this.reasoningMemory, opponentModel: this.opponentModel, belief }) : null;
      return { ...entry, networkIndex, features, linearPolicyValue, belief, beliefValue, basePlannerScore: Number(entry.score), plannedScore, nexo2Input };
    });
    const network = this.neuralPolicy ? this.neuralPolicy.scoreBatch(prepared.map((entry) => entry.nexo2Input)) : [];
    const neuralConfidence = this.neuralPolicy ? Math.min(1, Math.sqrt(Number(this.neuralPolicy.trainingState.episodes) / 160)) : 0;
    const ranked = prepared.map((entry, index) => {
      const neuralPolicyValue = Number(network[index]?.policy) || 0;
      const neuralStateValue = Number(network[index]?.value) || 0;
      const policyValue = entry.linearPolicyValue + neuralPolicyValue * this.decisionConfig.neuralScale * neuralConfidence + neuralStateValue * this.decisionConfig.valueScale * neuralConfidence;
      return { ...entry, neuralPolicyValue, neuralStateValue, policyValue, score: entry.plannedScore + policyValue };
    }).sort((left, right) => right.score - left.score);
    const bestBasePlanner = Math.max(...ranked.map((entry) => Number(entry.basePlannerScore) || 0));
    const legacyBest = ranked.reduce((best, entry) => Number(entry.basePlannerScore) > Number(best?.basePlannerScore ?? -Infinity) ? entry : best, null);
    const plannedBest = ranked.reduce((best, entry) => Number(entry.plannedScore) > Number(best?.plannedScore ?? -Infinity) ? entry : best, null);
    const viable = ranked.filter((entry) => Number(entry.basePlannerScore) >= bestBasePlanner - this.decisionConfig.viabilityMargin);
    let selected = viable[0] ?? ranked[0] ?? evaluated[0];
    if (this.training && viable.length > 1 && this.nextRandom() < this.exploration) {
      if (this.neuralPolicy) {
        const probabilities = policyProbabilities(viable.map((entry) => entry.score), 1.35);
        let threshold = this.nextRandom();
        let choice = viable.length - 1;
        for (let index = 0; index < probabilities.length; index += 1) {
          threshold -= probabilities[index];
          if (threshold <= 0) { choice = index; break; }
        }
        selected = viable[choice];
      } else selected = viable[Math.floor(this.nextRandom() * Math.min(viable.length, 6))];
    }
    let rejectedPolicyOverride = null;
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
    if (selected?.features) {
      const counterfactual = ranked.find((entry) => entry !== selected) ?? null;
      const learningPool = viable.length ? viable : ranked;
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
        nexo2Inputs: this.neuralPolicy ? learningPool.map((entry) => entry.nexo2Input) : null,
        nexo2Chosen: this.neuralPolicy ? learningPool.indexOf(selected) : null,
        nexo2Teacher: this.neuralPolicy ? learningPool.indexOf(legacyBest) : null,
      });
    }
    this.lastReasoning = {
      requestType: Number(message?.type),
      promptForced: message?.forced === true,
      playstyle: selected?.playstyle ?? this.style,
      opponentModel: structuredClone(this.opponentModel),
      baseline: { role: strategyActionRole(message, baseline), cards: actionCardNames(this.deckKnowledge, message, baseline) },
      forced: false,
      selected: selected ? { role: selected.role, cards: (selected.analysis?.cards ?? []).map((card) => card.name), semanticRoles: [...(selected.roles ?? [])], score: selected.score, plannedScore: selected.plannedScore, projectedValue: selected.analysis?.value, policyValue: selected.policyValue, linearPolicyValue: selected.linearPolicyValue, neuralPolicyValue: selected.neuralPolicyValue, neuralStateValue: selected.neuralStateValue, beliefValue: selected.beliefValue, reasons: [...(selected.analysis?.reasons ?? [])], components: { ...selected.components, belief: selected.beliefValue }, beliefComponents: { ...(selected.belief?.components ?? {}) }, evaluationComponents: { ...(selected.analysis?.components ?? {}) } } : null,
      alternatives: ranked.filter((entry) => entry !== selected).slice(0, 8).map((entry) => ({ role: entry.role, cards: (entry.analysis?.cards ?? []).map((card) => card.name), semanticRoles: [...(entry.roles ?? [])], score: entry.score, plannedScore: entry.plannedScore, projectedValue: entry.analysis?.value, policyValue: entry.policyValue, linearPolicyValue: entry.linearPolicyValue, neuralPolicyValue: entry.neuralPolicyValue, neuralStateValue: entry.neuralStateValue, beliefValue: entry.beliefValue, reasons: [...(entry.analysis?.reasons ?? [])], components: { ...entry.components, belief: entry.beliefValue }, beliefComponents: { ...(entry.belief?.components ?? {}) }, evaluationComponents: { ...(entry.analysis?.components ?? {}) } })),
      rejected: [
        ...rejectedByGuardrails.slice(0, 8).map((entry) => ({ role: entry.analysis?.role, cards: (entry.analysis?.cards ?? []).map((card) => card.name), guardrail: entry.guardrail })),
        ...(rejectedPolicyOverride ? [{ role: rejectedPolicyOverride.role, cards: (rejectedPolicyOverride.analysis?.cards ?? []).map((card) => card.name), guardrail: "LEARNED_OVERRIDE_WORSE_PUBLIC_ROUTE" }] : []),
      ],
    };
    rememberResponse(this.reasoningMemory, this.deckKnowledge, message, selected.candidate, observation);
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
      // The final result remains authoritative, but logs now attribute extra
      // blame to an explored decision that had a clearly better public route.
      // This avoids punishing every sound action equally after a long loss.
      const lossCorrection = result < 0 ? -Math.min(0.5, avoidableRegret * 0.18) : 0;
      const credit = advantage * temporal + localProgress * 0.35 + localEvidence + lossCorrection;
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

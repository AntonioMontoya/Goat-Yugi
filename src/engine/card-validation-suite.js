import { CARDS } from "./cards.js";
import { auditAllCardEffects } from "./card-effect-audit.js";
import { auditCardTextContracts } from "./card-text-contract-audit.js";
import { runHighRiskCardRegressions } from "./card-regressions.js";
import { validateCardRuntime } from "./card-runtime-contract.js";
import { auditCardLuaSources } from "./lua-static-audit.js";
import { validateOcgcoreScripts } from "./ocgcore-backend.js";

export async function runCardValidationSuite({ sample = 120, maxSteps = 30, workers = 2, seed = 2005 } = {}) {
  const runtime = validateCardRuntime(CARDS);
  const scripts = await validateOcgcoreScripts();
  const luaStatic = auditCardLuaSources();
  const textContracts = auditCardTextContracts();
  const regressions = await runHighRiskCardRegressions();
  const behavior = await auditAllCardEffects({ sample, maxSteps, workers, seed });
  const passed = runtime.executable === runtime.cards
    && runtime.missing.length === 0
    && runtime.duplicateRuntimeCodes.length === 0
    && scripts.loadFailures.length === 0
    && scripts.errors.length === 0
    && scripts.process.passed
    && luaStatic.passed
    && textContracts.passed
    && regressions.passed
    && behavior.smokePass
    && behavior.sourceFailures.length === 0;

  return {
    command: "cards:check",
    passed,
    catalog: {
      cards: runtime.cards,
      executable: runtime.executable,
      missing: runtime.missing.length,
      duplicateRuntimeCodes: runtime.duplicateRuntimeCodes,
      byRuntime: runtime.byRuntime,
    },
    scriptLoad: {
      loadedScripts: scripts.loadedScripts,
      loadFailures: scripts.loadFailures,
      coreErrors: scripts.errors,
      authoritativeSmoke: scripts.process.passed,
    },
    staticAudits: {
      luaLocalCalls: {
        scripts: luaStatic.scripts,
        highConfidenceIssues: luaStatic.highConfidence,
        reviewIssues: luaStatic.issues.filter((issue) => issue.confidence === "REVIEW"),
        passed: luaStatic.passed,
      },
      textToScript: {
        checked: textContracts.checked,
        rules: textContracts.rules,
        candidates: textContracts.candidates,
        passed: textContracts.passed,
      },
    },
    directedRegressions: regressions,
    behaviorSmoke: {
      selectionMode: behavior.selectionMode,
      sampledCards: behavior.cards,
      totalCards: behavior.requestedCards,
      workers: behavior.workers,
      maxSteps: behavior.maxSteps,
      smokePass: behavior.smokePass,
      failures: behavior.failures,
      botReviews: behavior.botReviews,
      sourceFailures: behavior.sourceFailures,
      effectsObserved: behavior.effectObserved,
      coverage: behavior.coverage,
    },
    scope: {
      exhaustiveRuntimeCoverage: runtime.executable === runtime.cards && scripts.loadFailures.length === 0,
      exhaustiveBehaviorCoverage: false,
      note: `El chequeo rápido cubre todo el enlace y carga de runtime, contratos estáticos texto-script, regresiones dirigidas y una muestra estratificada; no certifica cada ruling de las ${runtime.cards.toLocaleString("es-ES")} cartas jugables.`,
    },
  };
}

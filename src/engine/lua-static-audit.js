import { OCGCORE_CARD_ENTRIES } from "../data/ocgcore-assets.js";
import { OCGCORE_SCRIPT_SOURCES } from "../data/ocgcore-script-sources.js";
import { HISTORICAL_SCRIPT_OVERRIDES } from "../data/historical-script-overrides.js";

function parameterNames(raw) {
  return String(raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && value !== "...");
}

function functionDefinitions(source) {
  const lines = String(source ?? "").split(/\r?\n/);
  const definitions = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^function\s+s\.(\w+)\s*\(([^)]*)\)/);
    if (!match) continue;
    const body = [];
    let cursor = index + 1;
    while (cursor < lines.length && !/^end\s*(?:--.*)?$/.test(lines[cursor])) {
      body.push(lines[cursor]);
      cursor += 1;
    }
    const parameters = parameterNames(match[2]);
    const bodyText = body.join("\n");
    let requiredArity = 0;
    for (let parameter = 0; parameter < parameters.length; parameter += 1) {
      if (new RegExp(`\\b${parameters[parameter]}\\b`).test(bodyText)) requiredArity = parameter + 1;
    }
    definitions.set(match[1], {
      name: match[1],
      line: index + 1,
      parameters,
      requiredArity,
      body: bodyText,
    });
  }
  return definitions;
}

function closingParen(source, opening) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = opening; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function argumentCount(raw) {
  if (!String(raw).trim()) return 0;
  let count = 1;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (const char of raw) {
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if ("({[".includes(char)) depth += 1;
    else if (")}]".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) count += 1;
  }
  return count;
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function localCalls(source, definitions) {
  const calls = [];
  const matcher = /s\.(\w+)\s*\(/g;
  let match;
  while ((match = matcher.exec(source))) {
    const prefix = source.slice(Math.max(0, match.index - 16), match.index);
    if (/function\s+$/.test(prefix)) continue;
    const opening = source.indexOf("(", match.index);
    const closing = closingParen(source, opening);
    if (closing < 0) continue;
    const definition = definitions.get(match[1]);
    calls.push({
      name: match[1],
      line: lineNumberAt(source, match.index),
      arguments: argumentCount(source.slice(opening + 1, closing)),
      definition,
    });
    matcher.lastIndex = closing + 1;
  }
  return calls;
}

function likelyOptional(definition, missingParameters) {
  return missingParameters.every((parameter) => {
    const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:${escaped}\\s*=\\s*${escaped}\\s+or|${escaped}\\s*==\\s*nil|not\\s+${escaped})`).test(definition.body);
  });
}

export function auditLuaSource(source, { script = "inline.lua" } = {}) {
  const definitions = functionDefinitions(source);
  const issues = [];
  for (const call of localCalls(String(source ?? ""), definitions)) {
    if (!call.definition || call.arguments >= call.definition.requiredArity) continue;
    const missingParameters = call.definition.parameters.slice(call.arguments, call.definition.requiredArity);
    issues.push({
      script,
      function: call.name,
      callLine: call.line,
      definitionLine: call.definition.line,
      arguments: call.arguments,
      requiredArity: call.definition.requiredArity,
      missingParameters,
      confidence: likelyOptional(call.definition, missingParameters) ? "REVIEW" : "HIGH",
    });
  }
  return issues;
}

export function auditCardLuaSources() {
  const cardsByScript = new Map();
  for (const entry of OCGCORE_CARD_ENTRIES) {
    if (!cardsByScript.has(entry.script)) cardsByScript.set(entry.script, []);
    cardsByScript.get(entry.script).push(entry.name);
  }
  const issues = [];
  let scripts = 0;
  for (const [script, cards] of cardsByScript) {
    const source = HISTORICAL_SCRIPT_OVERRIDES[script] ?? OCGCORE_SCRIPT_SOURCES[script];
    if (!source) continue;
    scripts += 1;
    issues.push(...auditLuaSource(source, { script }).map((issue) => ({ ...issue, cards })));
  }
  const highConfidence = issues.filter((issue) => issue.confidence === "HIGH");
  return {
    command: "cards:lua-audit",
    scripts,
    issues,
    highConfidence,
    passed: highConfidence.length === 0,
    note: "Análisis estático de llamadas a funciones locales Lua; los avisos REVIEW requieren un escenario antes de considerarse fallos.",
  };
}

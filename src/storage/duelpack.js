const MAGIC = [0x44, 0x4c, 0x50, 0x31]; // DLP1, TypeScript vertical slice
const CORE_MAGIC = [0x44, 0x4c, 0x43, 0x31]; // DLC1, OCGCore decision trace

class Writer {
  constructor() { this.bytes = []; }
  u8(value) { this.bytes.push(Number(value) & 0xff); }
  varint(value) {
    let n = Math.max(0, Number(value) >>> 0);
    while (n >= 0x80) { this.u8((n & 0x7f) | 0x80); n >>>= 7; }
    this.u8(n);
  }
  bytesFrom(values) { for (const value of values) this.u8(value); }
  json(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    this.varint(bytes.length);
    this.bytesFrom(bytes);
  }
  result() { return Uint8Array.from(this.bytes); }
}

class Reader {
  constructor(bytes) { this.bytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes); this.index = 0; }
  u8() { if (this.index >= this.bytes.length) throw new Error("Duelpack truncado."); return this.bytes[this.index++]; }
  varint() {
    let result = 0;
    let shift = 0;
    for (;;) {
      const value = this.u8();
      result |= (value & 0x7f) << shift;
      if (!(value & 0x80)) return result >>> 0;
      shift += 7;
      if (shift > 35) throw new Error("Varint inválido.");
    }
  }
  take(length) { if (this.index + length > this.bytes.length) throw new Error("Duelpack truncado."); const result = this.bytes.slice(this.index, this.index + length); this.index += length; return result; }
  json() { return JSON.parse(new TextDecoder().decode(this.take(this.varint()))); }
}

function encodeAction(writer, action, typeIndex) {
  writer.varint(typeIndex.get(action.action.type) ?? 0);
  writer.varint(action.actor ?? 0);
  writer.varint(action.action.cardUid ?? 0);
  writer.varint(action.action.attackerUid ?? 0);
  writer.varint(action.action.targetUid ?? 0);
  const tributes = action.action.tributes ?? [];
  writer.varint(tributes.length);
  for (const uid of tributes) writer.varint(uid);
}

function decodeAction(reader, types) {
  const type = types[reader.varint()];
  const actor = reader.varint();
  const cardUid = reader.varint();
  const attackerUid = reader.varint();
  const targetUid = reader.varint();
  const tributeCount = reader.varint();
  const tributes = [];
  for (let i = 0; i < tributeCount; i += 1) tributes.push(reader.varint());
  const action = { type, playerId: actor };
  if (cardUid) action.cardUid = cardUid;
  if (attackerUid) action.attackerUid = attackerUid;
  if (targetUid) action.targetUid = targetUid;
  if (tributeCount) action.tributes = tributes;
  return { actor, action };
}

function uniqueJsonValues(values) {
  return [...new Set(values.map((value) => JSON.stringify(value)))].map((value) => JSON.parse(value));
}

function encodeCoreDuelPack(replays, manifest = {}) {
  const decks = uniqueJsonValues(replays.flatMap((replay) => replay.decks ?? [[], []]));
  const extraDecks = uniqueJsonValues(replays.flatMap((replay) => replay.extraDecks ?? [[], []]));
  const bots = uniqueJsonValues(replays.flatMap((replay) => [replay.bots?.[0] ?? null, replay.bots?.[1] ?? null]));
  const terminations = [...new Set(replays.map((replay) => replay.terminationReason ?? "UNKNOWN"))];
  const deckIndex = new Map(decks.map((deck, index) => [JSON.stringify(deck), index]));
  const extraIndex = new Map(extraDecks.map((deck, index) => [JSON.stringify(deck), index]));
  const botIndex = new Map(bots.map((bot, index) => [JSON.stringify(bot), index]));
  const writer = new Writer();
  writer.bytesFrom(CORE_MAGIC);
  writer.u8(3);
  writer.json({ schema: 1, engine: "ocgcore", decks, extraDecks, bots, terminations, manifest });
  writer.varint(replays.length);
  for (const replay of replays) {
    writer.varint(replay.seed ?? 0);
    writer.u8(replay.startingPlayer === null || replay.startingPlayer === undefined ? 2 : replay.startingPlayer);
    writer.u8(replay.result === null || replay.result === undefined ? 2 : replay.result);
    writer.varint(Math.max(0, terminations.indexOf(replay.terminationReason ?? "UNKNOWN")));
    writer.varint(replay.turns ?? 0);
    writer.varint(replay.decisions ?? replay.decisionTrace?.length ?? 0);
    writer.varint(deckIndex.get(JSON.stringify(replay.decks?.[0] ?? [])) ?? 0);
    writer.varint(deckIndex.get(JSON.stringify(replay.decks?.[1] ?? [])) ?? 0);
    writer.varint(extraIndex.get(JSON.stringify(replay.extraDecks?.[0] ?? [])) ?? 0);
    writer.varint(extraIndex.get(JSON.stringify(replay.extraDecks?.[1] ?? [])) ?? 0);
    writer.varint(botIndex.get(JSON.stringify(replay.bots?.[0] ?? null)) ?? 0);
    writer.varint(botIndex.get(JSON.stringify(replay.bots?.[1] ?? null)) ?? 0);
    const trace = replay.decisionTrace ?? [];
    writer.varint(trace.length);
    for (const decision of trace) {
      writer.varint(decision.player ?? 0);
      writer.varint(decision.messageType ?? 0);
      writer.json(decision.requestHash ?? null);
      writer.json(decision.response ?? null);
      const retries = decision.retries ?? [];
      writer.varint(retries.length);
      for (const retry of retries) writer.json(retry);
    }
  }
  return writer.result();
}

function decodeCoreDuelPack(bytes) {
  const reader = new Reader(bytes);
  for (const byte of CORE_MAGIC) if (reader.u8() !== byte) throw new Error("No es un Duelpack DLC1.");
  const version = reader.u8();
  if (![1, 2, 3].includes(version)) throw new Error(`Versión de Duelpack OCGCore no soportada: ${version}`);
  const header = reader.json();
  const count = reader.varint();
  const games = [];
  for (let i = 0; i < count; i += 1) {
    const seed = reader.varint();
    const startingPlayerCode = reader.u8();
    const resultCode = reader.u8();
    const terminationReason = header.terminations[reader.varint()];
    const turns = reader.varint();
    const decisions = reader.varint();
    const deckA = header.decks[reader.varint()];
    const deckB = header.decks[reader.varint()];
    const extraA = header.extraDecks[reader.varint()];
    const extraB = header.extraDecks[reader.varint()];
    const botA = version >= 3 ? header.bots?.[reader.varint()] ?? null : null;
    const botB = version >= 3 ? header.bots?.[reader.varint()] ?? null : null;
    const decisionCount = reader.varint();
    const decisionTrace = [];
    for (let decisionIndex = 0; decisionIndex < decisionCount; decisionIndex += 1) {
      const decision = { player: reader.varint(), messageType: reader.varint(), requestHash: version >= 2 ? reader.json() : null, response: reader.json() };
      if (version >= 2) {
        const retryCount = reader.varint();
        decision.retries = [];
        for (let retryIndex = 0; retryIndex < retryCount; retryIndex += 1) decision.retries.push(reader.json());
      }
      decisionTrace.push(decision);
    }
    games.push({
      schema: 1,
      engine: "ocgcore",
      engineVersion: header.manifest.engineVersion,
      formatVersion: header.manifest.formatVersion,
      cardDatabaseVersion: header.manifest.cardDatabaseVersion,
      seed,
      startingPlayer: startingPlayerCode === 2 ? null : startingPlayerCode,
      decks: [deckA, deckB],
      extraDecks: [extraA, extraB],
      bots: [botA, botB],
      result: resultCode === 2 ? null : resultCode,
      terminationReason,
      turns,
      decisions,
      decisionTrace,
    });
  }
  return { version, engine: "ocgcore", header, games, bytes: bytes.length };
}

export function encodeDuelPack(replays, manifest = {}) {
  if (replays.some((replay) => replay?.engine === "ocgcore")) {
    if (replays.some((replay) => replay?.engine !== "ocgcore")) throw new Error("No se pueden mezclar replays TypeScript y OCGCore en un Duelpack.");
    return encodeCoreDuelPack(replays, manifest);
  }
  const types = [...new Set(replays.flatMap((replay) => replay.actions.map((entry) => entry.action.type)))];
  const typeIndex = new Map(types.map((type, index) => [type, index]));
  const decks = [...new Set(replays.flatMap((replay) => replay.decks.map((deck) => JSON.stringify(deck))))].map((value) => JSON.parse(value));
  const deckIndex = new Map(decks.map((deck, index) => [JSON.stringify(deck), index]));
  const terminations = [...new Set(replays.map((replay) => replay.terminationReason))];
  const writer = new Writer();
  writer.bytesFrom(MAGIC);
  writer.u8(1);
  writer.json({ schema: 1, types, decks, terminations, manifest });
  writer.varint(replays.length);
  for (const replay of replays) {
    writer.varint(replay.seed);
    writer.u8(replay.startingPlayer ?? 0);
    writer.u8(replay.result === null ? 2 : replay.result ?? 2);
    writer.varint(terminations.indexOf(replay.terminationReason));
    writer.varint(replay.turns);
    writer.varint(replay.decisions);
    writer.varint(deckIndex.get(JSON.stringify(replay.decks[0])) ?? 0);
    writer.varint(deckIndex.get(JSON.stringify(replay.decks[1])) ?? 0);
    writer.varint(replay.actions.length);
    for (const action of replay.actions) encodeAction(writer, action, typeIndex);
  }
  return writer.result();
}

export function decodeDuelPack(bytes) {
  const probe = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  if (probe.length >= 4 && probe[0] === CORE_MAGIC[0] && probe[1] === CORE_MAGIC[1] && probe[2] === CORE_MAGIC[2] && probe[3] === CORE_MAGIC[3]) return decodeCoreDuelPack(probe);
  const reader = new Reader(bytes);
  for (const byte of MAGIC) if (reader.u8() !== byte) throw new Error("No es un Duelpack DLP1.");
  const version = reader.u8();
  if (version !== 1) throw new Error(`Versión de Duelpack no soportada: ${version}`);
  const header = reader.json();
  const count = reader.varint();
  const games = [];
  for (let i = 0; i < count; i += 1) {
    const seed = reader.varint();
    const startingPlayer = reader.u8();
    const resultCode = reader.u8();
    const terminationReason = header.terminations[reader.varint()];
    const turns = reader.varint();
    const decisions = reader.varint();
    const deckA = header.decks[reader.varint()];
    const deckB = header.decks[reader.varint()];
    const actionCount = reader.varint();
    const actions = [];
    for (let actionIndex = 0; actionIndex < actionCount; actionIndex += 1) actions.push(decodeAction(reader, header.types));
    games.push({ schema: 1, engineVersion: header.manifest.engineVersion, formatVersion: header.manifest.formatVersion, cardDatabaseVersion: header.manifest.cardDatabaseVersion, seed, startingPlayer, decks: [deckA, deckB], result: resultCode === 2 ? null : resultCode, terminationReason, turns, decisions, actions });
  }
  return { version, header, games, bytes: bytes.length };
}

export function inspectDuelPack(bytes) {
  const decoded = decodeDuelPack(bytes);
  const summary = {
    bytes: decoded.bytes,
    games: decoded.games.length,
    schema: decoded.header.schema,
    manifest: decoded.header.manifest,
    engine: decoded.engine ?? "typescript",
    actionTypes: decoded.header.types ?? [...new Set(decoded.games.flatMap((game) => (game.decisionTrace ?? []).map((decision) => decision.messageType)))],
    byResult: {},
    byTermination: {},
    decisions: decoded.games.reduce((total, game) => total + game.decisions, 0),
    turns: decoded.games.reduce((total, game) => total + game.turns, 0)
  };
  for (const game of decoded.games) {
    const result = String(game.result ?? "draw");
    summary.byResult[result] = (summary.byResult[result] ?? 0) + 1;
    summary.byTermination[game.terminationReason] = (summary.byTermination[game.terminationReason] ?? 0) + 1;
  }
  return summary;
}

export function exportPackJson(bytes) {
  return JSON.stringify(decodeDuelPack(bytes), null, 2);
}

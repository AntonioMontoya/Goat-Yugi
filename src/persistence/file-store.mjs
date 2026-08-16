import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { decodeDuelPack, encodeDuelPack, inspectDuelPack } from "../storage/duelpack.js";

export const PERSISTENCE_SCHEMA = 1;

function bytesOf(value) {
  return value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(value);
}

export function sha256(value) {
  return createHash("sha256").update(bytesOf(value)).digest("hex");
}

export function safeRunId(value) {
  const id = String(value ?? "").trim();
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(id)) throw new Error("Identificador de run no válido.");
  return id;
}

export function controlledPath(rootDir, ...parts) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Ruta fuera del directorio controlado.");
  return target;
}

function atomicWrite(target, data) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, data);
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    if (!fs.existsSync(target)) throw error;
    fs.rmSync(target, { force: true });
    fs.renameSync(temporary, target);
  }
}

export function writeJsonAtomic(target, value) {
  atomicWrite(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

export function writeBinaryAtomic(target, value) {
  atomicWrite(target, bytesOf(value));
}

export function createRunLayout(rootDir, runId) {
  const id = safeRunId(runId);
  const directory = controlledPath(rootDir, id);
  for (const child of ["chunks", "checkpoint", "retained", "logs"]) fs.mkdirSync(controlledPath(directory, child), { recursive: true });
  return { id, directory, chunks: controlledPath(directory, "chunks"), checkpoint: controlledPath(directory, "checkpoint"), retained: controlledPath(directory, "retained"), logs: controlledPath(directory, "logs") };
}

export function writeRunManifest(layout, manifest) {
  const next = { schema: PERSISTENCE_SCHEMA, ...manifest, updatedAt: new Date().toISOString() };
  writeJsonAtomic(controlledPath(layout.directory, "manifest.json"), next);
  return next;
}

export function readRunManifest(rootDir, runId) {
  const layout = createRunLayout(rootDir, runId);
  const target = controlledPath(layout.directory, "manifest.json");
  if (!fs.existsSync(target)) throw new Error(`No existe manifest para el run ${layout.id}.`);
  return { layout, manifest: readJson(target) };
}

export function writeCheckpoint(layout, checkpoint) {
  writeJsonAtomic(controlledPath(layout.checkpoint, "latest.json"), { schema: PERSISTENCE_SCHEMA, ...checkpoint, savedAt: new Date().toISOString() });
  return controlledPath(layout.checkpoint, "latest.json");
}

export function readCheckpoint(layout) {
  const target = controlledPath(layout.checkpoint, "latest.json");
  return fs.existsSync(target) ? readJson(target) : null;
}

export function writeDuelChunk(layout, { index = 1, replays = [], manifest = {}, firstGame = 0 } = {}) {
  const name = `chunk_${String(index).padStart(6, "0")}`;
  const raw = encodeDuelPack(replays, manifest);
  const compressed = deflateSync(raw);
  const rawFile = `${name}.duelpack`;
  const compressedFile = `${rawFile}.deflate`;
  writeBinaryAtomic(controlledPath(layout.chunks, rawFile), raw);
  writeBinaryAtomic(controlledPath(layout.chunks, compressedFile), compressed);
  return {
    id: index,
    firstGame,
    lastGame: firstGame + Math.max(0, replays.length - 1),
    games: replays.length,
    file: `chunks/${rawFile}`,
    compressedFile: `chunks/${compressedFile}`,
    rawBytes: raw.byteLength,
    compressedBytes: compressed.byteLength,
    checksum: sha256(raw),
    compressedChecksum: sha256(compressed),
    schema: 1,
    state: "COMPLETE",
    writtenAt: new Date().toISOString()
  };
}

function pathFromManifest(layout, relative) {
  const normalized = String(relative ?? "");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) throw new Error("Referencia de archivo no controlada en el manifest.");
  return controlledPath(layout.directory, normalized.split("/").join(path.sep));
}

export function verifyRun(layout, manifest, { inflate = true } = {}) {
  const errors = [];
  const chunks = manifest.chunks ?? [];
  let games = 0;
  let rawBytes = 0;
  let compressedBytes = 0;
  for (const chunk of chunks) {
    try {
      const rawPath = pathFromManifest(layout, chunk.file);
      const compressedPath = pathFromManifest(layout, chunk.compressedFile);
      if (!fs.existsSync(rawPath) || !fs.existsSync(compressedPath)) throw new Error("faltan archivos del chunk");
      const raw = fs.readFileSync(rawPath);
      const compressed = fs.readFileSync(compressedPath);
      if (sha256(raw) !== chunk.checksum) throw new Error("checksum raw no coincide");
      if (sha256(compressed) !== chunk.compressedChecksum) throw new Error("checksum comprimido no coincide");
      if (inflate && !Buffer.from(inflateSync(compressed)).equals(raw)) throw new Error("deflate no reconstruye el chunk raw");
      const inspected = inspectDuelPack(raw);
      if (inspected.games !== chunk.games) throw new Error(`games ${inspected.games} != ${chunk.games}`);
      games += inspected.games;
      rawBytes += raw.byteLength;
      compressedBytes += compressed.byteLength;
    } catch (error) {
      errors.push({ chunk: chunk.id, message: error.message });
    }
  }
  return { valid: errors.length === 0, errors, chunks: chunks.length, games, rawBytes, compressedBytes };
}

export function readRunGames(layout, manifest) {
  const games = [];
  for (const chunk of manifest.chunks ?? []) {
    const decoded = decodeDuelPack(fs.readFileSync(pathFromManifest(layout, chunk.file)));
    games.push(...decoded.games);
  }
  return games;
}

export function chooseRetainedGames(games, { wins = 20, losses = 20, errors = true } = {}) {
  const retained = [];
  const pushIf = (game) => { if (game && !retained.includes(game)) retained.push(game); };
  for (const game of games) if (errors && game.terminationReason === "INVALID_ACTION") pushIf(game);
  for (const game of games) if (game.result === 0 && retained.filter((value) => value.result === 0).length < wins) pushIf(game);
  for (const game of games) if (game.result === 1 && retained.filter((value) => value.result === 1).length < losses) pushIf(game);
  return retained;
}

export function cleanRun(rootDir, runId, { keepWins = 20, keepLosses = 20, force = false } = {}) {
  const { layout, manifest } = readRunManifest(rootDir, runId);
  if (!force && !["COMPLETED", "CANCELLED", "CLEANABLE"].includes(manifest.status)) throw new Error(`El run está en estado ${manifest.status ?? "desconocido"}; no se puede limpiar sin --force.`);
  const verification = verifyRun(layout, manifest);
  if (!verification.valid) throw new Error(`No se limpia un run corrupto: ${verification.errors.map((error) => error.message).join("; ")}`);
  const games = readRunGames(layout, manifest);
  const retainedGames = chooseRetainedGames(games, { wins: keepWins, losses: keepLosses, errors: true });
  const retainedPack = encodeDuelPack(retainedGames, { runId, mode: "retained", sourceSchema: manifest.schema });
  writeBinaryAtomic(controlledPath(layout.retained, "selected.duelpack"), retainedPack);
  writeBinaryAtomic(controlledPath(layout.retained, "selected.duelpack.deflate"), deflateSync(retainedPack));
  const deleted = [];
  for (const chunk of manifest.chunks ?? []) {
    for (const relative of [chunk.file, chunk.compressedFile]) {
      const target = pathFromManifest(layout, relative);
      if (fs.existsSync(target)) { fs.rmSync(target, { force: true }); deleted.push(relative); }
    }
  }
  const retention = { retainedGames: retainedGames.length, deletedFiles: deleted, retainedRawBytes: retainedPack.byteLength, cleanedAt: new Date().toISOString(), policy: { keepWins, keepLosses, keepErrors: true }, informationLost: "Trayectorias no seleccionadas y sus secuencias individuales dejan de estar disponibles; las métricas y el modelo permanecen." };
  const nextManifest = writeRunManifest(layout, { ...manifest, status: "CLEANED", chunks: [], retention, permanentFiles: ["manifest.json", "retained/selected.duelpack", "retained/selected.duelpack.deflate"] });
  return { layout, manifest: nextManifest, verification, retention };
}

import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { hasReasoningCertification } from "../src/bots/intelligence.js";

const MAX_LINES = 1500;
const assetsDirectory = fileURLToPath(new URL("../dist/assets/", import.meta.url));
const bundledModels = [
  {
    source: fileURLToPath(new URL("../artifacts/training-runs/maestro-chaos-10k-20260808/certified-200-v5.json", import.meta.url)),
    target: fileURLToPath(new URL("../dist/models/maestro-chaos-ia200.json", import.meta.url)),
  },
];

for (const model of bundledModels) {
  try {
    await access(model.source);
    const manifest = JSON.parse(await readFile(model.source, "utf8"));
    if (!hasReasoningCertification(manifest.certification)) continue;
    await mkdir(fileURLToPath(new URL("../dist/models/", import.meta.url)), { recursive: true });
    await copyFile(model.source, model.target);
  } catch {
    // Bundled trained models are optional in clean source checkouts.
  }
}

for (const entry of await readdir(assetsDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const file = join(assetsDirectory, entry.name);
  const source = await readFile(file, "utf8");
  const result = await transform(source, {
    charset: "utf8",
    format: "esm",
    legalComments: "inline",
    minify: true,
    sourcefile: entry.name,
    supported: { "template-literal": false },
    target: "es2020",
  });
  const lines = result.code.split(/\r?\n/).length;
  if (lines > MAX_LINES) throw new Error(`${entry.name} conserva ${lines} líneas después de compactar.`);
  await writeFile(file, result.code, "utf8");
}

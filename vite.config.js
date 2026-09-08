import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { generateServiceWorker } from "./generate-sw.mjs";

function copyPwaFilesPlugin() {
  return {
    name: "copy-pwa-files",
    closeBundle() {
      const distDir = fileURLToPath(new URL("dist", import.meta.url));
      const rootDir = fileURLToPath(new URL(".", import.meta.url));
      const manifestSrc = fileURLToPath(new URL("manifest.webmanifest", import.meta.url));
      const manifestDest = fileURLToPath(new URL("dist/manifest.webmanifest", import.meta.url));

      if (existsSync(manifestSrc)) copyFileSync(manifestSrc, manifestDest);

      // Automatically generate fresh sw.js with exact chunk hashes in dist and root
      try {
        generateServiceWorker(distDir, rootDir);
      } catch (err) {
        console.warn("[copy-pwa-files] Warning generating service worker:", err);
      }
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("assets", import.meta.url)),
  plugins: [copyPwaFilesPlugin()],
  build: {
    outDir: fileURLToPath(new URL("dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
      },
    },
  },
  esbuild: {
    supported: { "template-literal": false },
  },
});

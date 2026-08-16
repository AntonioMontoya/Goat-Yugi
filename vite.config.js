import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

function copyPwaFilesPlugin() {
  return {
    name: "copy-pwa-files",
    closeBundle() {
      const distDir = fileURLToPath(new URL("dist", import.meta.url));
      const swSrc = fileURLToPath(new URL("sw.js", import.meta.url));
      const swDest = fileURLToPath(new URL("dist/sw.js", import.meta.url));
      const manifestSrc = fileURLToPath(new URL("manifest.webmanifest", import.meta.url));
      const manifestDest = fileURLToPath(new URL("dist/manifest.webmanifest", import.meta.url));

      if (existsSync(swSrc)) copyFileSync(swSrc, swDest);
      if (existsSync(manifestSrc)) copyFileSync(manifestSrc, manifestDest);
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

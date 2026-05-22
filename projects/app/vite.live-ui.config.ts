import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, "src/live-ui"),
  base: "/",
  build: {
    outDir: resolve(here, "dist/live-ui"),
    emptyOutDir: true,
    sourcemap: false,
  },
});

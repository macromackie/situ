import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, "src/client"),
  base: "/",
  build: {
    outDir: resolve(here, "dist/client"),
    emptyOutDir: true,
    sourcemap: false,
  },
});

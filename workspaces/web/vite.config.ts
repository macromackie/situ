import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [stylex({}), react()],
  build: {
    outDir: resolve(import.meta.dirname, "../../dist/web"),
    emptyOutDir: true,
  },
});

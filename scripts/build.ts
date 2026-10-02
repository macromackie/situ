import { build } from "esbuild";
await build({
  entryPoints: ["workspaces/server/src/worker.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  outfile: "dist/worker.js",
});

import { build } from "esbuild";
import { mkdir, cp, writeFile } from "node:fs/promises";
await mkdir("dist/public", { recursive: true });
await build({
  entryPoints: ["src/server/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
});
await build({
  entryPoints: ["src/cli/main.ts"],
  outfile: "dist/situ.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
});
await build({
  entryPoints: ["src/web/app.tsx"],
  outfile: "dist/public/app.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  minify: true,
  external: ["/fonts/*"],
});
await cp("public", "dist/public", { recursive: true });
await writeFile(
  "dist/public/index.html",
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Situ</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
);

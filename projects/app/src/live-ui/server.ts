import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { InternalError } from "@situ/errors";

const liveUiClientFileName = "app.js";
const liveUiClientPath = `/assets/${liveUiClientFileName}`;
const projectRoutePattern = /^\/projects\/[^/]+\/?$/;

const here = dirname(fileURLToPath(import.meta.url));
const clientEntryPoint = join(here, "main.tsx");
// A `bun build --compile` standalone binary keeps its source in an embedded
// virtual filesystem (paths under `$bunfs`) that `Bun.build` cannot read. Such a
// binary serves the bundle built at release time instead of building on request.
const runningAsStandaloneBinary = here.includes("$bunfs");

let clientScriptPromise: Promise<string> | undefined;

export function isLiveUiPath(pathname: string): boolean {
  return pathname === "/" || projectRoutePattern.test(pathname) || pathname === liveUiClientPath;
}

export async function handleLiveUiGetRequest(input: {
  readonly pathname: string;
}): Promise<Response> {
  if (input.pathname === "/" || projectRoutePattern.test(input.pathname)) {
    return htmlResponse(renderLiveUiShell());
  }

  if (input.pathname === liveUiClientPath) {
    return javascriptResponse(await buildLiveUiClientScript());
  }

  throw new InternalError({
    message: "Live UI route was not handled.",
    details: { path: input.pathname },
  });
}

function renderLiveUiShell(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>situ live report</title>
  </head>
  <body>
    <div id="root">
      <main style="font-family: system-ui, sans-serif; padding: 32px;">
        Syncing local Situ records...
      </main>
    </div>
    <script type="module" src="${liveUiClientPath}"></script>
  </body>
</html>
`;
}

async function buildLiveUiClientScript(): Promise<string> {
  clientScriptPromise ??= buildClientScript();
  return await clientScriptPromise;
}

async function buildClientScript(): Promise<string> {
  // Compiled binary: serve the bundle built at release time and shipped beside
  // the binary at `<install>/versions/<v>/assets/app.js` (see ADR 0098).
  if (runningAsStandaloneBinary) {
    const prebuilt = join(
      dirname(realpathSync(process.execPath)),
      "..",
      "assets",
      liveUiClientFileName,
    );
    if (!existsSync(prebuilt)) {
      throw new InternalError({
        message: "Live UI browser bundle is missing from the install.",
        details: { prebuilt },
      });
    }
    return await Bun.file(prebuilt).text();
  }

  // Running from source: build the browser bundle on demand so it stays fresh.
  const result = await Bun.build({
    entrypoints: [clientEntryPoint],
    format: "esm",
    target: "browser",
    minify: false,
    sourcemap: "none",
  });

  if (!result.success) {
    throw new InternalError({
      message: "Live UI browser bundle could not be built.",
      details: {
        logs: result.logs.map((log) => log.message),
      },
    });
  }

  const output = result.outputs[0];
  if (output === undefined) {
    throw new InternalError({
      message: "Live UI browser bundle did not produce output.",
    });
  }

  return await output.text();
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function javascriptResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/javascript; charset=utf-8",
    },
  });
}

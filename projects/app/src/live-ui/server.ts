import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { InternalError } from "@situ/errors";

const liveUiClientPath = "/assets/live-report.js";
const projectRoutePattern = /^\/projects\/[^/]+\/?$/;

const here = dirname(fileURLToPath(import.meta.url));
const clientEntryPoint = join(here, "main.tsx");

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

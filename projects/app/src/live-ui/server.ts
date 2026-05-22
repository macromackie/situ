import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { InternalError, NotFoundError } from "@situ/errors";

const liveUiAssetPathPrefix = "/assets/";
const projectRoutePattern = /^\/projects\/[^/]+\/?$/;

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..", "..");
const sourceBuildDirectory = join(appRoot, "dist", "live-ui");
const viteConfigPath = join(appRoot, "vite.live-ui.config.ts");
// A `bun build --compile` standalone binary keeps its source in an embedded
// virtual filesystem (paths under `$bunfs`). Such a binary serves the Vite
// output built at release time instead of invoking Vite at request time.
const runningAsStandaloneBinary = here.includes("$bunfs");

let buildDirectoryPromise: Promise<string> | undefined;

export function isLiveUiPath(pathname: string): boolean {
  return isLiveUiShellPath(pathname) || isLiveUiAssetPath(pathname);
}

export async function handleLiveUiGetRequest(input: {
  readonly pathname: string;
}): Promise<Response> {
  if (isLiveUiShellPath(input.pathname)) {
    return htmlResponse(await readLiveUiShell());
  }

  if (isLiveUiAssetPath(input.pathname)) {
    return await liveUiAssetResponse({ pathname: input.pathname });
  }

  throw new InternalError({
    message: "Live UI route was not handled.",
    details: { path: input.pathname },
  });
}

function isLiveUiShellPath(pathname: string): boolean {
  return pathname === "/" || projectRoutePattern.test(pathname);
}

function isLiveUiAssetPath(pathname: string): boolean {
  return pathname.startsWith(liveUiAssetPathPrefix);
}

async function readLiveUiShell(): Promise<string> {
  const buildDirectory = await getLiveUiBuildDirectory();
  return await readFile(join(buildDirectory, "index.html"), "utf8");
}

async function liveUiAssetResponse(input: { readonly pathname: string }): Promise<Response> {
  const buildDirectory = await getLiveUiBuildDirectory();
  const assetsDirectory = resolve(buildDirectory, "assets");
  const assetPath = resolve(buildDirectory, `.${input.pathname}`);

  if (!isPathInsideDirectory({ path: assetPath, directory: assetsDirectory })) {
    throw new NotFoundError({
      message: "HTTP route was not found.",
      details: { path: input.pathname },
    });
  }

  if (!existsSync(assetPath)) {
    throw new NotFoundError({
      message: "HTTP route was not found.",
      details: { path: input.pathname },
    });
  }

  return new Response(await readFile(assetPath), {
    headers: {
      "cache-control": "no-store",
      "content-type": contentTypeForAssetPath(assetPath),
    },
  });
}

function isPathInsideDirectory(input: {
  readonly path: string;
  readonly directory: string;
}): boolean {
  return input.path === input.directory || input.path.startsWith(`${input.directory}${sep}`);
}

async function getLiveUiBuildDirectory(): Promise<string> {
  buildDirectoryPromise ??= resolveLiveUiBuildDirectory();
  return await buildDirectoryPromise;
}

async function resolveLiveUiBuildDirectory(): Promise<string> {
  const buildDirectory = runningAsStandaloneBinary
    ? join(dirname(realpathSync(process.execPath)), "..", "assets", "live-ui")
    : sourceBuildDirectory;

  if (existsSync(join(buildDirectory, "index.html"))) {
    return buildDirectory;
  }

  if (runningAsStandaloneBinary) {
    throw new InternalError({
      message: "Live UI build is missing from the install.",
      details: { buildDirectory },
    });
  }

  await buildSourceLiveUi();
  return buildDirectory;
}

async function buildSourceLiveUi(): Promise<void> {
  const vite = await import("vite");
  await vite.build({
    configFile: viteConfigPath,
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function contentTypeForAssetPath(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

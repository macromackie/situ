/**
 * `situ self-update` and the interactive update prompt.
 *
 * The binary is a single `bun build --compile` artifact installed under
 * `$SITU_INSTALL_HOME/versions/<version>` with a `current` symlink (ADR 0098).
 * Rather than re-implement the download/verify/swap here, this orchestrator
 * resolves the target version and then runs the canonical installer
 * (`config/scripts/install.sh`) — the same path a human uses — so there is one
 * tested source of truth for the actual swap.
 *
 * All I/O (resolving the latest tag, running the installer, reading/writing the
 * throttle state, prompting) is injected so the logic is unit-testable.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { throwParserError } from "./flags.js";
import type { SituCliInvocation, SituCliResult } from "./types.js";

const defaultReleaseRepo = "macromackie/situ";
export const updateCheckIntervalMs = 24 * 60 * 60 * 1000;

const releaseVersionPattern = /^v(\d+)\.(\d+)\.(\d+)$/;

// Commands that are themselves meta/short-lived never trigger the update prompt.
const promptIneligibleCommands = new Set([
  "help",
  "version",
  "doctor",
  "runbook",
  "serve",
  "self-update",
]);

export type ReleasePlatform = "darwin-arm64" | "linux-x64" | "linux-arm64";

export type UpdateCheckState = {
  readonly lastCheckedAtMs: number;
  readonly latestSeen?: string;
};

export type SelfUpdateDeps = {
  readonly fetchLatestVersion: (repo: string, environment: NodeJS.ProcessEnv) => Promise<string>;
  readonly runInstaller: (version: string, environment: NodeJS.ProcessEnv) => Promise<number>;
  readonly readCheckState: (path: string) => UpdateCheckState | undefined;
  readonly writeCheckState: (path: string, state: UpdateCheckState) => void;
  readonly promptLine: (question: string) => Promise<string>;
  readonly write: (text: string) => void;
  readonly nowMs: () => number;
};

export function detectReleasePlatform(platform: string, arch: string): ReleasePlatform | undefined {
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "linux" && (arch === "x64" || arch === "x86_64")) return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  return undefined;
}

export function resolveReleaseRepo(environment?: NodeJS.ProcessEnv): string {
  const value = environment?.SITU_RELEASE_REPO;
  return value !== undefined && value.trim() !== "" ? value.trim() : defaultReleaseRepo;
}

export function isReleaseVersion(value: string): boolean {
  return releaseVersionPattern.test(value);
}

/** True when `candidate` is a strict release version newer than `current`. */
export function isNewerReleaseVersion(current: string, candidate: string): boolean {
  const candidateMatch = releaseVersionPattern.exec(candidate);
  if (candidateMatch === null) return false;

  const currentMatch = releaseVersionPattern.exec(current);
  // A non-release current (e.g. the 0.0.0-dev build) treats any release as newer.
  if (currentMatch === null) return true;

  for (let part = 1; part <= 3; part += 1) {
    const currentPart = Number(currentMatch[part]);
    const candidatePart = Number(candidateMatch[part]);
    if (candidatePart > currentPart) return true;
    if (candidatePart < currentPart) return false;
  }
  return false;
}

function resolveInstallHome(environment?: NodeJS.ProcessEnv): string | undefined {
  const explicit = environment?.SITU_INSTALL_HOME;
  if (explicit !== undefined && explicit.trim() !== "") return explicit;
  const home = environment?.HOME;
  if (home !== undefined && home.trim() !== "") return join(home, ".local", "share", "situ");
  return undefined;
}

function updateCheckStatePath(environment?: NodeJS.ProcessEnv): string | undefined {
  const installHome = resolveInstallHome(environment);
  return installHome === undefined ? undefined : join(installHome, ".update-check.json");
}

/**
 * Whether an interactive command should run a throttled update check + prompt.
 * Strictly gated: text mode, a real TTY on both ends, not CI, an eligible
 * command, and at least `updateCheckIntervalMs` since the last check. Agents and
 * scripts never see a prompt (ADR 0092 keeps non-interactive runs prompt-free).
 */
export function shouldOfferUpdate(input: {
  readonly command?: string;
  readonly outputMode: SituCliOutputMode;
  readonly stdoutIsTty: boolean;
  readonly stdinIsTty: boolean;
  readonly environment?: NodeJS.ProcessEnv;
  readonly lastCheckedAtMs?: number;
  readonly nowMs: number;
}): boolean {
  if (input.command === undefined || promptIneligibleCommands.has(input.command)) return false;
  if (input.outputMode !== "text") return false;
  if (!input.stdoutIsTty || !input.stdinIsTty) return false;

  const env = input.environment ?? {};
  if (isTruthyEnv(env.CI) || isTruthyEnv(env.SITU_NO_UPDATE_NOTIFIER)) return false;

  if (input.lastCheckedAtMs !== undefined) {
    if (input.nowMs - input.lastCheckedAtMs < updateCheckIntervalMs) return false;
  }
  return true;
}

function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

type SituCliOutputMode = SituCliInvocation["outputMode"];

function parseSelfUpdateArgs(invocation: SituCliInvocation): { readonly checkOnly: boolean } {
  let checkOnly = false;
  for (const arg of invocation.rest) {
    if (arg === "--check") {
      checkOnly = true;
      continue;
    }
    throwParserError({
      message: `Unknown self-update argument: ${arg}`,
      details: { command: "self-update", argument: arg },
      outputMode: invocation.outputMode,
    });
  }
  return { checkOnly };
}

/**
 * Guards `self-update` in the pure `runSituCli` path: validates arguments, then
 * reports that the real update runs through `mainSituCli` (mirrors `serve`).
 */
export function runSelfUpdateFiniteCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  parseSelfUpdateArgs(input.invocation);
  throwParserError({
    message: "Command self-update must be run through mainSituCli.",
    details: { command: "self-update" },
    outputMode: input.invocation.outputMode,
  });
}

/** Runs `situ self-update [--check]`, targeting the latest release. */
export async function runSelfUpdateCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly deps: SelfUpdateDeps;
}): Promise<SituCliResult> {
  const { invocation, deps } = input;
  const { checkOnly } = parseSelfUpdateArgs(invocation);
  const repo = resolveReleaseRepo(invocation.environment);
  const current = invocation.version;
  const latest = await deps.fetchLatestVersion(repo, invocation.environment ?? {});

  if (!isNewerReleaseVersion(current, latest)) {
    return ok(`situ ${current} is already the latest release.\n`);
  }

  if (checkOnly) {
    return ok(`situ ${latest} is available (you have ${current}). Run \`situ self-update\`.\n`);
  }

  deps.write(`Updating situ ${current} → ${latest}…\n`);
  const exitCode = await deps.runInstaller(latest, invocation.environment ?? {});
  if (exitCode !== 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error: situ self-update failed (installer exited ${exitCode}).\n`,
    };
  }
  return ok(`situ updated to ${latest}. Restart any running situ commands to use it.\n`);
}

/**
 * Throttled, TTY-gated update prompt run after an eligible command. Failures are
 * swallowed: an update check must never break or delay the user's actual command
 * beyond its own timeout.
 */
export async function maybePromptForUpdate(input: {
  readonly invocation: SituCliInvocation;
  readonly stdoutIsTty: boolean;
  readonly stdinIsTty: boolean;
  readonly deps: SelfUpdateDeps;
}): Promise<void> {
  const { invocation, deps } = input;
  const statePath = updateCheckStatePath(invocation.environment);
  const nowMs = deps.nowMs();
  const previous = statePath === undefined ? undefined : deps.readCheckState(statePath);

  if (
    !shouldOfferUpdate({
      command: invocation.command,
      outputMode: invocation.outputMode,
      stdoutIsTty: input.stdoutIsTty,
      stdinIsTty: input.stdinIsTty,
      environment: invocation.environment,
      lastCheckedAtMs: previous?.lastCheckedAtMs,
      nowMs,
    })
  ) {
    return;
  }

  const repo = resolveReleaseRepo(invocation.environment);
  let latest: string;
  try {
    latest = await deps.fetchLatestVersion(repo, invocation.environment ?? {});
  } catch {
    // Network or parse failure: record the attempt so we stay throttled, stay quiet.
    persistCheck({ statePath, deps, nowMs });
    return;
  }

  persistCheck({ statePath, deps, nowMs, latestSeen: latest });
  if (!isNewerReleaseVersion(invocation.version, latest)) return;

  deps.write(`\nsitu ${latest} is available (you have ${invocation.version}).\n`);
  const answer = (await deps.promptLine(`Update now? [y/N] `)).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") {
    deps.write("Skipped. Run `situ self-update` whenever you're ready.\n");
    return;
  }

  deps.write(`Updating situ ${invocation.version} → ${latest}…\n`);
  const exitCode = await deps.runInstaller(latest, invocation.environment ?? {});
  deps.write(
    exitCode === 0
      ? `situ updated to ${latest}.\n`
      : `situ self-update failed (installer exited ${exitCode}); run \`situ self-update\` to retry.\n`,
  );
}

function persistCheck(input: {
  readonly statePath?: string;
  readonly deps: SelfUpdateDeps;
  readonly nowMs: number;
  readonly latestSeen?: string;
}): void {
  if (input.statePath === undefined) return;
  try {
    input.deps.writeCheckState(input.statePath, {
      lastCheckedAtMs: input.nowMs,
      latestSeen: input.latestSeen,
    });
  } catch {
    // A non-writable install home should not break anything.
  }
}

function ok(stdout: string): SituCliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

// ── Default real dependencies ─────────────────────────────────────────────────

export function createDefaultSelfUpdateDeps(
  write: (text: string) => void,
  writeStderr: (text: string) => void,
): SelfUpdateDeps {
  return {
    fetchLatestVersion: realFetchLatestVersion,
    runInstaller: realRunInstaller,
    readCheckState: realReadCheckState,
    writeCheckState: realWriteCheckState,
    promptLine: (question) => realPromptLine(question, writeStderr),
    write,
    nowMs: () => Date.now(),
  };
}

async function realFetchLatestVersion(
  repo: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "situ-cli",
  };
  const token = environment.GH_TOKEN ?? environment.GITHUB_TOKEN;
  if (token !== undefined && token !== "") headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub releases lookup failed for ${repo} (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as { readonly tag_name?: unknown };
  if (typeof body.tag_name !== "string" || body.tag_name === "") {
    throw new Error(`GitHub releases lookup for ${repo} returned no tag_name.`);
  }
  return body.tag_name;
}

function realRunInstaller(version: string, environment: NodeJS.ProcessEnv): Promise<number> {
  const repo = resolveReleaseRepo(environment);
  const installUrl = `https://raw.githubusercontent.com/${repo}/main/config/scripts/install.sh`;
  const script = `set -e; curl -fsSL "$SITU_INSTALL_URL" | sh -s -- "$SITU_TARGET_VERSION"`;

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", script], {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, SITU_INSTALL_URL: installUrl, SITU_TARGET_VERSION: version },
    });
    child.on("error", () => resolve(127));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function realReadCheckState(path: string): UpdateCheckState | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<UpdateCheckState>;
    if (typeof parsed.lastCheckedAtMs !== "number") return undefined;
    return {
      lastCheckedAtMs: parsed.lastCheckedAtMs,
      latestSeen: typeof parsed.latestSeen === "string" ? parsed.latestSeen : undefined,
    };
  } catch {
    return undefined;
  }
}

function realWriteCheckState(path: string, state: UpdateCheckState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

function realPromptLine(question: string, writeStderr: (text: string) => void): Promise<string> {
  writeStderr(question);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const onData = (chunk: Buffer | string): void => {
      stdin.off("data", onData);
      try {
        stdin.pause();
      } catch {
        // ignore
      }
      resolve(String(chunk));
    };
    try {
      stdin.resume();
    } catch {
      resolve("");
      return;
    }
    stdin.once("data", onData);
  });
}

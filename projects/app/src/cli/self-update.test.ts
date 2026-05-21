import { expect, test } from "bun:test";

import {
  detectReleasePlatform,
  isNewerReleaseVersion,
  isReleaseVersion,
  maybePromptForUpdate,
  resolveReleaseRepo,
  runSelfUpdateCommand,
  type SelfUpdateDeps,
  type UpdateCheckState,
  shouldOfferUpdate,
  updateCheckIntervalMs,
} from "./self-update.js";
import type { SituCliInvocation } from "./types.js";

function invocation(overrides: Partial<SituCliInvocation> = {}): SituCliInvocation {
  return {
    command: "self-update",
    rest: [],
    outputMode: "text",
    environment: {},
    cwd: "/tmp",
    version: "v0.0.1",
    ...overrides,
  };
}

type Calls = {
  installed: string[];
  written: string[];
  prompts: string[];
  stateWrites: UpdateCheckState[];
};

function fakeDeps(calls: Calls, overrides: Partial<SelfUpdateDeps> = {}): SelfUpdateDeps {
  return {
    fetchLatestVersion: async () => "v0.0.2",
    runInstaller: async (version) => {
      calls.installed.push(version);
      return 0;
    },
    readCheckState: () => undefined,
    writeCheckState: (_path, state) => {
      calls.stateWrites.push(state);
    },
    promptLine: async (question) => {
      calls.prompts.push(question);
      return "n";
    },
    write: (text) => {
      calls.written.push(text);
    },
    nowMs: () => 1_700_000_000_000,
    ...overrides,
  };
}

function emptyCalls(): Calls {
  return { installed: [], written: [], prompts: [], stateWrites: [] };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

test("detectReleasePlatform maps supported platform/arch pairs", () => {
  expect(detectReleasePlatform("darwin", "arm64")).toBe("darwin-arm64");
  expect(detectReleasePlatform("linux", "x64")).toBe("linux-x64");
  expect(detectReleasePlatform("linux", "arm64")).toBe("linux-arm64");
  expect(detectReleasePlatform("win32", "x64")).toBeUndefined();
});

test("resolveReleaseRepo defaults to macromackie/situ and honors the env override", () => {
  expect(resolveReleaseRepo({})).toBe("macromackie/situ");
  expect(resolveReleaseRepo({ SITU_RELEASE_REPO: "acme/situ" })).toBe("acme/situ");
  expect(resolveReleaseRepo({ SITU_RELEASE_REPO: "  " })).toBe("macromackie/situ");
});

test("isReleaseVersion accepts strict vX.Y.Z only", () => {
  expect(isReleaseVersion("v1.2.3")).toBe(true);
  expect(isReleaseVersion("1.2.3")).toBe(false);
  expect(isReleaseVersion("v1.2.3-beta")).toBe(false);
  expect(isReleaseVersion("0.0.0-dev")).toBe(false);
});

test("isNewerReleaseVersion compares semantic release versions", () => {
  expect(isNewerReleaseVersion("v0.0.1", "v0.0.2")).toBe(true);
  expect(isNewerReleaseVersion("v0.0.2", "v0.0.2")).toBe(false);
  expect(isNewerReleaseVersion("v0.0.3", "v0.0.2")).toBe(false);
  expect(isNewerReleaseVersion("v0.9.0", "v0.10.0")).toBe(true);
  // a non-release current (the dev build) treats any release as newer
  expect(isNewerReleaseVersion("0.0.0-dev", "v0.0.1")).toBe(true);
  // a non-release candidate is never "newer"
  expect(isNewerReleaseVersion("v0.0.1", "nightly")).toBe(false);
});

test("shouldOfferUpdate only fires for eligible interactive commands", () => {
  const base = {
    command: "status",
    outputMode: "text" as const,
    stdoutIsTty: true,
    stdinIsTty: true,
    environment: {},
    nowMs: 1_000_000,
  };
  expect(shouldOfferUpdate(base)).toBe(true);
  expect(shouldOfferUpdate({ ...base, command: "version" })).toBe(false);
  expect(shouldOfferUpdate({ ...base, command: "self-update" })).toBe(false);
  expect(shouldOfferUpdate({ ...base, command: undefined })).toBe(false);
  expect(shouldOfferUpdate({ ...base, outputMode: "json" })).toBe(false);
  expect(shouldOfferUpdate({ ...base, stdoutIsTty: false })).toBe(false);
  expect(shouldOfferUpdate({ ...base, stdinIsTty: false })).toBe(false);
  expect(shouldOfferUpdate({ ...base, environment: { CI: "true" } })).toBe(false);
  expect(shouldOfferUpdate({ ...base, environment: { SITU_NO_UPDATE_NOTIFIER: "1" } })).toBe(false);
});

test("shouldOfferUpdate throttles to the check interval", () => {
  const base = {
    command: "status",
    outputMode: "text" as const,
    stdoutIsTty: true,
    stdinIsTty: true,
    environment: {},
    nowMs: 10 * updateCheckIntervalMs,
  };
  expect(shouldOfferUpdate({ ...base, lastCheckedAtMs: base.nowMs - 1_000 })).toBe(false);
  expect(
    shouldOfferUpdate({ ...base, lastCheckedAtMs: base.nowMs - updateCheckIntervalMs - 1 }),
  ).toBe(true);
});

// ── situ self-update ──────────────────────────────────────────────────────────

test("self-update is a no-op when already on the latest release", async () => {
  const calls = emptyCalls();
  const result = await runSelfUpdateCommand({
    invocation: invocation({ version: "v0.0.2" }),
    deps: fakeDeps(calls),
  });
  expect(result).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "situ v0.0.2 is already the latest release.\n",
  });
  expect(calls.installed).toEqual([]);
});

test("self-update --check reports an available release without installing", async () => {
  const calls = emptyCalls();
  const result = await runSelfUpdateCommand({
    invocation: invocation({ rest: ["--check"] }),
    deps: fakeDeps(calls),
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("situ v0.0.2 is available (you have v0.0.1)");
  expect(calls.installed).toEqual([]);
});

test("self-update runs the installer for the latest release", async () => {
  const calls = emptyCalls();
  const result = await runSelfUpdateCommand({ invocation: invocation(), deps: fakeDeps(calls) });
  expect(calls.installed).toEqual(["v0.0.2"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("situ updated to v0.0.2");
  expect(calls.written.join("")).toContain("Updating situ v0.0.1 → v0.0.2");
});

test("self-update reports a failed installer run", async () => {
  const calls = emptyCalls();
  const result = await runSelfUpdateCommand({
    invocation: invocation(),
    deps: fakeDeps(calls, { runInstaller: async () => 3 }),
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("installer exited 3");
});

// ── interactive update prompt ───────────────────────────────────────────────

const interactive = { stdoutIsTty: true, stdinIsTty: true };

test("prompt installs the update when the user confirms", async () => {
  const calls = emptyCalls();
  await maybePromptForUpdate({
    invocation: invocation({ command: "status", environment: { HOME: "/tmp/nope" } }),
    ...interactive,
    deps: fakeDeps(calls, { promptLine: async () => "y\n" }),
  });
  expect(calls.installed).toEqual(["v0.0.2"]);
  expect(calls.stateWrites).toHaveLength(1);
});

test("prompt skips installing when the user declines", async () => {
  const calls = emptyCalls();
  await maybePromptForUpdate({
    invocation: invocation({ command: "status", environment: { HOME: "/tmp/nope" } }),
    ...interactive,
    deps: fakeDeps(calls, { promptLine: async () => "no" }),
  });
  expect(calls.installed).toEqual([]);
  expect(calls.written.join("")).toContain("Run `situ self-update`");
});

test("prompt never fires for non-interactive or json runs", async () => {
  const calls = emptyCalls();
  let fetched = 0;
  const deps = fakeDeps(calls, {
    fetchLatestVersion: async () => {
      fetched += 1;
      return "v0.0.2";
    },
  });
  await maybePromptForUpdate({
    invocation: invocation({ command: "status" }),
    stdoutIsTty: false,
    stdinIsTty: false,
    deps,
  });
  await maybePromptForUpdate({
    invocation: invocation({ command: "status", outputMode: "json" }),
    ...interactive,
    deps,
  });
  expect(fetched).toBe(0);
  expect(calls.installed).toEqual([]);
});

test("prompt swallows a failed update check but still records the throttle", async () => {
  const calls = emptyCalls();
  await maybePromptForUpdate({
    invocation: invocation({ command: "status", environment: { HOME: "/tmp/nope" } }),
    ...interactive,
    deps: fakeDeps(calls, {
      fetchLatestVersion: async () => {
        throw new Error("offline");
      },
    }),
  });
  expect(calls.installed).toEqual([]);
  expect(calls.stateWrites).toHaveLength(1);
});

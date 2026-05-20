import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { runTerminalSession } from "./terminal-session.js";

test("runTerminalSession types into a real pseudo-terminal", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: [
      "-lc",
      ["printf 'READY> '", "IFS= read -r line", "printf '\\nSAW:%s\\n' \"$line\""].join("; "),
    ],
    cwd: rootPath,
    environment: process.env,
    initialInput: "/goal run autoresearch\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
  });

  expect(result.exitCode).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(result.stdout).toContain("READY>");
  expect(result.stdout).toContain("SAW:/goal run autoresearch");
  expect(existsSync(transcriptPath)).toBe(true);
  expect(readFileSync(cleanTranscriptPath, "utf8")).toBe(result.stdout);
});

test("runTerminalSession answers basic terminal capability queries", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: [
      "-lc",
      [
        "printf '\\033[6n'",
        "IFS= read -r -s -n 6 reply",
        "reply_hex=$(printf '%s' \"$reply\" | od -An -tx1 | tr -d ' \\n')",
        "printf '\\nREPLY:%s\\nREADY> ' \"$reply_hex\"",
        "IFS= read -r line",
        "printf '\\nSAW:%s\\n' \"$line\"",
      ].join("; "),
    ],
    cwd: rootPath,
    environment: process.env,
    initialInput: "/goal run autoresearch\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
  });

  expect(result.exitCode).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(result.stdout).toContain("REPLY:1b5b313b3152");
  expect(result.stdout).toContain("SAW:/goal run autoresearch");
});

test("runTerminalSession gives spawned commands a usable terminal size", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: ["-lc", "stty size; printf 'READY> '; IFS= read -r line"],
    cwd: rootPath,
    environment: process.env,
    initialInput: "ok\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("40 120");
});

test("runTerminalSession accepts the Codex trust prompt before typing input", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: [
      "-lc",
      [
        "printf 'Do you trust the contents of this directory?'",
        "IFS= read -r trust",
        "printf '\\nTRUST:%s\\nREADY> ' \"$trust\"",
        "IFS= read -r line",
        "printf '\\nSAW:%s\\n' \"$line\"",
      ].join("; "),
    ],
    cwd: rootPath,
    environment: process.env,
    initialInput: "/goal run autoresearch\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("TRUST:");
  expect(result.stdout).toContain("SAW:/goal run autoresearch");
});

test("runTerminalSession accepts the Claude trust prompt before typing input", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: [
      "-lc",
      [
        "printf 'Quick safety check\\nEnter to confirm'",
        "IFS= read -r trust",
        "printf '\\nTRUST:%s\\nREADY> ' \"$trust\"",
        "IFS= read -r line",
        "printf '\\nSAW:%s\\n' \"$line\"",
      ].join("; "),
    ],
    cwd: rootPath,
    environment: process.env,
    initialInput: "/goal run autoresearch\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("TRUST:");
  expect(result.stdout).toContain("SAW:/goal run autoresearch");
});

test("runTerminalSession can send a delayed follow-up input", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: [
      "-lc",
      [
        "printf 'READY> '",
        "IFS= read -r line",
        "IFS= read -r follow_up",
        'printf \'\\nSAW:%s|%s\\n\' "$line" "$follow_up"',
      ].join("; "),
    ],
    cwd: rootPath,
    environment: process.env,
    initialInput: "queued input\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
    followUpInput: "submit\r",
    followUpDelayMs: 20,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SAW:queued input|submit");
});

test("runTerminalSession answers post-input command permission prompts", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-session-test-"));
  const transcriptPath = join(rootPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(rootPath, "terminal-transcript.txt");

  const result = await runTerminalSession({
    command: "/bin/bash",
    args: [
      "-lc",
      [
        "printf 'READY> '",
        "IFS= read -r line",
        "printf 'Do you want to proceed?'",
        "IFS= read -r approval",
        'printf \'\\nSAW:%s|%s\\n\' "$line" "$approval"',
      ].join("; "),
    ],
    cwd: rootPath,
    environment: process.env,
    initialInput: "/goal run autoresearch\r",
    readyPatterns: [/READY>/],
    timeoutMs: 5_000,
    transcriptPath,
    cleanTranscriptPath,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SAW:/goal run autoresearch|");
});

import { spawn } from "node:child_process";
import { createWriteStream, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { normalizeTerminalText, stripAnsi } from "./transcript.js";

const defaultReadyTimeoutMs = 4_000;
const killGraceMs = 5_000;
const maxBufferedTranscriptCharacters = 20 * 1024 * 1024;

export type TerminalSessionResult = {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string;
  readonly timedOut: boolean;
  readonly transcriptPath: string;
  readonly cleanTranscriptPath: string;
};

export type RunTerminalSessionInput = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly initialInput: string;
  readonly readyPatterns: readonly RegExp[];
  readonly timeoutMs: number;
  readonly transcriptPath: string;
  readonly cleanTranscriptPath: string;
  readonly readyTimeoutMs?: number;
  readonly followUpInput?: string;
  readonly followUpDelayMs?: number;
};

/**
 * Runs an interactive command in a pseudo-terminal and captures its transcript.
 */
export async function runTerminalSession(
  input: RunTerminalSessionInput,
): Promise<TerminalSessionResult> {
  mkdirSync(dirname(input.transcriptPath), { recursive: true });
  mkdirSync(dirname(input.cleanTranscriptPath), { recursive: true });

  const scriptPath = writeExpectDriver();

  return await new Promise((resolveResult) => {
    const rawTranscript = createWriteStream(input.transcriptPath, {
      encoding: "utf8",
      flags: "w",
    });
    const readyPattern = buildExpectReadyPattern({
      readyPatterns: input.readyPatterns,
    });
    const child = spawn(
      "expect",
      [
        scriptPath,
        input.initialInput,
        readyPattern,
        String(input.readyTimeoutMs ?? defaultReadyTimeoutMs),
        input.followUpInput ?? "",
        String(input.followUpDelayMs ?? 0),
        input.command,
        ...input.args,
      ],
      {
        cwd: input.cwd,
        env: input.environment,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let bufferedTranscript = "";
    let stderr = "";
    let timedOut = false;
    let resolved = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: {
      readonly exitCode?: number;
      readonly signal?: NodeJS.Signals;
      readonly errorMessage?: string;
    }): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimer(timeout);
      clearTimer(killTimeout);

      const cleanTranscript = normalizeTerminalText({
        text: stripAnsi({
          text: bufferedTranscript,
        }),
      });

      writeFileSync(input.cleanTranscriptPath, cleanTranscript, "utf8");
      rawTranscript.end(() => {
        resolveResult({
          command: [input.command, ...input.args],
          cwd: input.cwd,
          exitCode: result.exitCode,
          signal: result.signal,
          stdout: cleanTranscript,
          stderr,
          errorMessage: result.errorMessage,
          timedOut,
          transcriptPath: input.transcriptPath,
          cleanTranscriptPath: input.cleanTranscriptPath,
        });
      });
    };

    timeout = setTimeout(() => {
      timedOut = true;
      killProcessTree({ pid: child.pid, signal: "SIGTERM" });

      killTimeout = setTimeout(() => {
        killProcessTree({ pid: child.pid, signal: "SIGKILL" });
      }, killGraceMs);
    }, input.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      rawTranscript.write(chunk);
      bufferedTranscript = appendTranscript({
        transcript: bufferedTranscript,
        chunk,
      });
    });

    child.stderr.on("data", (chunk: string) => {
      stderr = appendTranscript({
        transcript: stderr,
        chunk,
      });
    });

    child.on("error", (error) => {
      finish({
        errorMessage: error.message,
      });
    });

    child.on("close", (code, signal) => {
      finish({
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        errorMessage: timedOut ? `pty ${input.command} ETIMEDOUT` : undefined,
      });
    });
  });
}

function writeExpectDriver(): string {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-terminal-driver-"));
  const scriptPath = join(rootPath, "driver.expect");
  const commonPromptHandlers = [
    '-re "Do you trust the contents of this directory" { send -- "\\r"; exp_continue }',
    '-re "Press enter to continue" { send -- "\\r"; exp_continue }',
    '-re "Enter.*confirm" { send -- "\\r"; exp_continue }',
    '-re "Do.*want.*proceed" { send -- "\\r"; exp_continue }',
    '-ex "\\033\\[6n" { send -- "\\033\\[1;1R"; exp_continue }',
    '-ex "\\033\\[c" { send -- "\\033\\[?1;2c"; exp_continue }',
    '-ex "\\033\\[>c" { send -- "\\033\\[>0;0;0c"; exp_continue }',
    '-ex "\\033\\[?u" { send -- "\\033\\[?0u"; exp_continue }',
    '-ex "\\033\\]10;?\\033\\\\" { send -- "\\033\\]10;rgb:ffff/ffff/ffff\\033\\\\"; exp_continue }',
    '-ex "\\033\\]11;?\\033\\\\" { send -- "\\033\\]11;rgb:0000/0000/0000\\033\\\\"; exp_continue }',
    '-ex "\\033\\]10;?\\007" { send -- "\\033\\]10;rgb:ffff/ffff/ffff\\033\\\\"; exp_continue }',
    '-ex "\\033\\]11;?\\007" { send -- "\\033\\]11;rgb:0000/0000/0000\\033\\\\"; exp_continue }',
  ];
  const indentedCommonPromptHandlers = commonPromptHandlers.map((line) => `    ${line}`);
  const finalCommonPromptHandlers = commonPromptHandlers.map((line) => `  ${line}`);

  writeFileSync(
    scriptPath,
    [
      "set initial_input [lindex $argv 0]",
      "set ready_pattern [lindex $argv 1]",
      "set ready_timeout_ms [lindex $argv 2]",
      "set follow_up_input [lindex $argv 3]",
      "set follow_up_delay_ms [lindex $argv 4]",
      "set command [lindex $argv 5]",
      "set command_args [lrange $argv 6 end]",
      "set spawn_argv [linsert $command_args 0 $command]",
      'set stty_init "rows 40 columns 120"',
      "log_user 0",
      "spawn {*}$spawn_argv",
      "log_user 1",
      "set ready_deadline [expr {[clock milliseconds] + $ready_timeout_ms}]",
      "while {[clock milliseconds] < $ready_deadline} {",
      "  set remaining_ms [expr {$ready_deadline - [clock milliseconds]}]",
      "  if {$remaining_ms <= 0} {",
      "    break",
      "  }",
      "  set timeout [expr {int(ceil(double($remaining_ms) / 1000.0))}]",
      "  expect {",
      ...indentedCommonPromptHandlers,
      "    -re $ready_pattern { break }",
      "    timeout { break }",
      "    eof {",
      "      set wait_result [wait]",
      "      exit [lindex $wait_result 3]",
      "    }",
      "  }",
      "}",
      "send -- $initial_input",
      'if {$follow_up_input ne "" && $follow_up_delay_ms > 0} {',
      "  set timeout [expr {int(ceil(double($follow_up_delay_ms) / 1000.0))}]",
      "  expect {",
      ...indentedCommonPromptHandlers,
      "    eof {",
      "      set wait_result [wait]",
      "      exit [lindex $wait_result 3]",
      "    }",
      "    timeout { send -- $follow_up_input }",
      "  }",
      "}",
      "set timeout -1",
      "expect {",
      ...finalCommonPromptHandlers,
      "  eof {}",
      "}",
      "set wait_result [wait]",
      "exit [lindex $wait_result 3]",
      "",
    ].join("\n"),
    {
      encoding: "utf8",
      mode: 0o755,
    },
  );

  return scriptPath;
}

function buildExpectReadyPattern(input: { readonly readyPatterns: readonly RegExp[] }): string {
  if (input.readyPatterns.length === 0) {
    return "a^";
  }

  return input.readyPatterns.map((pattern) => pattern.source).join("|");
}

function appendTranscript(input: { readonly transcript: string; readonly chunk: string }): string {
  if (input.transcript.length >= maxBufferedTranscriptCharacters) {
    return input.transcript;
  }

  const nextTranscript = `${input.transcript}${input.chunk}`;

  if (nextTranscript.length <= maxBufferedTranscriptCharacters) {
    return nextTranscript;
  }

  return nextTranscript.slice(0, maxBufferedTranscriptCharacters);
}

function clearTimer(timer: ReturnType<typeof setTimeout> | undefined): void {
  if (timer === undefined) {
    return;
  }

  clearTimeout(timer);
}

function killProcessTree(input: {
  readonly pid: number | undefined;
  readonly signal: string;
}): void {
  if (input.pid === undefined) {
    return;
  }

  try {
    if (process.platform === "win32") {
      process.kill(input.pid, input.signal);
      return;
    }

    process.kill(-input.pid, input.signal);
  } catch {
    // The process may already have exited.
  }
}

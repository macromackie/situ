import { spawnSync } from "node:child_process";

const maxBufferedCharacters = 20 * 1024 * 1024;

export type CommandResult = {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string;
  readonly timedOut: boolean;
};

/**
 * Runs a local process and captures its observable result.
 */
export function runCommand(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}): CommandResult {
  const result = spawnSync(input.command, [...input.args], {
    cwd: input.cwd,
    env: input.environment ?? process.env,
    encoding: "utf8",
    maxBuffer: maxBufferedCharacters,
    timeout: input.timeoutMs,
  });

  return {
    command: [input.command, ...input.args],
    cwd: input.cwd,
    exitCode: result.status === null ? undefined : result.status,
    signal: result.signal ?? undefined,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    errorMessage: result.error?.message,
    timedOut:
      result.error !== undefined && "code" in result.error && result.error.code === "ETIMEDOUT",
  };
}

/**
 * Truncates command output for scorer-friendly evidence.
 */
export function truncateText(input: {
  readonly text: string;
  readonly maxCharacters: number;
}): string {
  if (input.text.length <= input.maxCharacters) {
    return input.text;
  }

  return `${input.text.slice(0, input.maxCharacters)}\n[truncated ${input.text.length - input.maxCharacters} characters]`;
}

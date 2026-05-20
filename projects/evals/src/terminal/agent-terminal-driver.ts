import type { WorkspaceAutoresearchCase } from "../harness/types.js";
import type { MaterializedWorkspaceEnvironment } from "../harness/workspace-environment.js";

export type AgentTerminalDriverId = "codex" | "claude";

export type AgentTerminalCommand = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
};

export type AgentTerminalDriver = {
  readonly id: AgentTerminalDriverId;
  readonly displayName: string;
  readonly readyPatterns: readonly RegExp[];
  readonly readyTimeoutMs: number;
  readonly followUpInput?: string;
  readonly followUpDelayMs?: number;
  readonly buildCommand: (input: BuildAgentTerminalCommandInput) => AgentTerminalCommand;
};

export type BuildAgentTerminalCommandInput = {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly environment: MaterializedWorkspaceEnvironment;
};

/**
 * Resolves the local agent CLI used by terminal-native evals.
 */
export function resolveAgentTerminalDriverId(input: {
  readonly value?: string;
}): AgentTerminalDriverId {
  const value = input.value?.trim();

  if (value === undefined || value.length === 0) {
    return "codex";
  }

  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error(`Unknown SITU_AGENT_EVAL_DRIVER: ${value}`);
}

/**
 * Gets a terminal driver by id.
 */
export function getAgentTerminalDriver(input: {
  readonly id: AgentTerminalDriverId;
}): AgentTerminalDriver {
  if (input.id === "codex") {
    return codexTerminalDriver;
  }

  return claudeTerminalDriver;
}

/**
 * Builds the slash-command text submitted to the interactive agent CLI.
 */
export function buildNativeGoalInput(input: { readonly prompt: string }): string {
  const goalText = input.prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");

  return `/goal ${goalText}\r`;
}

const codexTerminalDriver = {
  id: "codex",
  displayName: "Codex CLI",
  readyPatterns: [/Explain this codebase/],
  readyTimeoutMs: 20_000,
  followUpInput: "\r",
  followUpDelayMs: 10_000,
  buildCommand: ({ environment }) => ({
    command: "codex",
    args: [
      "--enable",
      "goals",
      "--cd",
      environment.repositoryPath,
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "never",
      "--no-alt-screen",
      ...optionalAddDirArgs({ path: environment.situHomePath }),
      ...optionalAddDirArgs({ path: environment.runOutputPath }),
      ...optionalAddDirArgs({ path: environment.agentOutputPath }),
      ...optionalAddDirArgs({ path: environment.worktreesPath }),
      ...optionalOptionArgs({
        option: "--model",
        value: process.env.SITU_CODEX_EVAL_MODEL,
      }),
    ],
    cwd: environment.repositoryPath,
    environment: {
      ...environment.environment,
      SITU_RUN_OUTPUT_DIR: environment.runOutputPath,
    },
  }),
} satisfies AgentTerminalDriver;

const claudeTerminalDriver = {
  id: "claude",
  displayName: "Claude Code",
  readyPatterns: [],
  readyTimeoutMs: 20_000,
  followUpInput: "\r",
  followUpDelayMs: 8_000,
  buildCommand: ({ environment }) => ({
    command: "claude",
    args: [
      "--permission-mode",
      process.env.SITU_CLAUDE_EVAL_PERMISSION_MODE ?? "dontAsk",
      "--allowedTools",
      "Bash",
      "Edit",
      "Write",
      "MultiEdit",
      "Read",
      "LS",
      "Glob",
      "Grep",
      "--effort",
      process.env.SITU_CLAUDE_EVAL_EFFORT ?? "medium",
      ...optionalAddDirArgs({ path: environment.situHomePath }),
      ...optionalAddDirArgs({ path: environment.runOutputPath }),
      ...optionalAddDirArgs({ path: environment.agentOutputPath }),
      ...optionalAddDirArgs({ path: environment.worktreesPath }),
      ...optionalOptionArgs({
        option: "--model",
        value: process.env.SITU_CLAUDE_EVAL_MODEL,
      }),
    ],
    cwd: environment.repositoryPath,
    environment: {
      ...environment.environment,
      SITU_RUN_OUTPUT_DIR: environment.runOutputPath,
    },
  }),
} satisfies AgentTerminalDriver;

function optionalAddDirArgs(input: { readonly path: string | undefined }): readonly string[] {
  if (input.path === undefined || input.path.trim().length === 0) {
    return [];
  }

  return ["--add-dir", input.path.trim()];
}

function optionalOptionArgs(input: {
  readonly option: string;
  readonly value: string | undefined;
}): readonly string[] {
  if (input.value === undefined || input.value.trim().length === 0) {
    return [];
  }

  return [input.option, input.value.trim()];
}

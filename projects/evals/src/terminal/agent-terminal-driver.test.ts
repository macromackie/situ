import { expect, test } from "bun:test";

import {
  buildNativeGoalInput,
  getAgentTerminalDriver,
  resolveAgentTerminalDriverId,
} from "./agent-terminal-driver.js";
import type { WorkspaceAutoresearchCase } from "../harness/types.js";
import type { MaterializedWorkspaceEnvironment } from "../harness/workspace-environment.js";

test("buildNativeGoalInput submits one terminal slash command", () => {
  const input = buildNativeGoalInput({
    prompt: ["Use Situ.", "", "Run real autoresearch.", "Show status."].join("\n"),
  });

  expect(input).toBe("/goal Use Situ. Run real autoresearch. Show status.\r");
});

test("resolveAgentTerminalDriverId defaults to codex", () => {
  expect(resolveAgentTerminalDriverId({})).toBe("codex");
  expect(resolveAgentTerminalDriverId({ value: "claude" })).toBe("claude");
});

test("codex terminal driver enables native goals and writable eval directories", () => {
  const command = getAgentTerminalDriver({ id: "codex" }).buildCommand({
    workspaceCase: workspaceCaseFixture,
    environment: environmentFixture,
  });

  expect(command.command).toBe("codex");
  expect(command.cwd).toBe("/tmp/situ-eval/repository");
  expect(command.args).toContain("--enable");
  expect(command.args).toContain("goals");
  expect(command.args).toContain("--no-alt-screen");
  expect(command.args).toContain("/tmp/situ-eval/agent-output");
  expect(command.environment.SITU_RUN_OUTPUT_DIR).toBe("/tmp/situ-eval/run-output");
  expect(getAgentTerminalDriver({ id: "codex" }).readyTimeoutMs).toBe(20_000);
  expect(getAgentTerminalDriver({ id: "codex" }).followUpInput).toBe("\r");
});

test("claude terminal driver uses Claude permission mode and eval directories", () => {
  const command = getAgentTerminalDriver({ id: "claude" }).buildCommand({
    workspaceCase: workspaceCaseFixture,
    environment: environmentFixture,
  });

  expect(command.command).toBe("claude");
  expect(command.cwd).toBe("/tmp/situ-eval/repository");
  expect(command.args).toContain("--permission-mode");
  expect(command.args).toContain("dontAsk");
  expect(command.args).toContain("--allowedTools");
  expect(command.args).toContain("Bash");
  expect(command.args).toContain("Edit");
  expect(command.args).toContain("Write");
  expect(command.args).toContain("--effort");
  expect(command.args).toContain("medium");
  expect(command.args).toContain("/tmp/situ-eval/agent-output");
  expect(command.environment.SITU_RUN_OUTPUT_DIR).toBe("/tmp/situ-eval/run-output");
  expect(getAgentTerminalDriver({ id: "claude" }).readyTimeoutMs).toBe(20_000);
  expect(getAgentTerminalDriver({ id: "claude" }).followUpInput).toBe("\r");
});

const workspaceCaseFixture = {
  id: "example-case",
  title: "Example case",
  workspacePath: "/source/example-case",
  projectId: "project_example",
  targetCandidateCount: 2,
  requiresSynthesis: false,
  protectedPaths: ["harness.py", "final.tsv"],
  editablePaths: ["program.py"],
  harnessCommand: "python harness.py",
  researchInstructionsMarkdown: "- Try real improvements.",
  goalMarkdown: "Improve the example case.",
  expectedOutcomeMarkdown: "Situ records and worktrees show real progress.",
} satisfies WorkspaceAutoresearchCase;

const environmentFixture = {
  rootPath: "/tmp/situ-eval",
  workspaceRootPath: "/tmp/situ-eval/workspace",
  repositoryPath: "/tmp/situ-eval/repository",
  initialCommitSha: "abc123",
  situHomePath: "/tmp/situ-eval/situ-home",
  runOutputPath: "/tmp/situ-eval/run-output",
  agentOutputPath: "/tmp/situ-eval/agent-output",
  worktreesPath: "/tmp/situ-eval/worktrees",
  environment: {
    PATH: "/tmp/situ-eval/bin",
    SITU_HOME: "/tmp/situ-eval/situ-home",
  },
} satisfies MaterializedWorkspaceEnvironment;

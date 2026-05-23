import { expect, test } from "bun:test";

import { buildWorkspaceManagerTerminalCommand } from "./codex.js";
import type { WorkspaceAutoresearchCase } from "./harness/types.js";
import type { MaterializedWorkspaceEnvironment } from "./harness/workspace-environment.js";

test("workspace manager command launches one native-goal terminal manager", () => {
  const command = buildWorkspaceManagerTerminalCommand({
    workspaceCase: workspaceCaseFixture,
    environment: environmentFixture,
  });

  expect(command.driverId).toBe("codex");
  expect(command.command).toBe("codex");
  expect(command.args.slice(0, 3)).toEqual(["--enable", "goals", "--cd"]);
  expect(command.args).toContain("--no-alt-screen");
  expect(command.args).toContain("--ask-for-approval");
  expect(command.args).toContain("never");
  expect(command.args).toContain("workspace-write");
  expect(command.args).toContain("/tmp/situ-eval/repository");
  expect(command.args).toContain("/tmp/situ-eval/worktrees");
  expect(command.environment.SITU_RUN_OUTPUT_DIR).toBe("/tmp/situ-eval/run-output");
  expect(command.goalInput.startsWith("/goal ")).toBe(true);
  expect(command.goalInput.endsWith("\r")).toBe(true);
  expect(command.goalInput.length).toBeLessThan(1_000);
  expect(command.goalInput).toContain("/tmp/situ-eval/agent-output/manager/prompt.md");
  expect(command.goalInput).toContain("execute it as the full Situ autoresearch eval goal");
  expect(sectionHeadings(command.prompt)).toEqual(
    expect.arrayContaining([
      "Stable environment",
      "Autoresearch loop",
      "Baseline requirements",
      "Delegation guidance",
      "Overfit discipline",
      "Checkpoint reporting",
      "Final authored research report (REQUIRED before completion)",
      "Workspace constraints",
      "Case-specific research guidance",
      "Useful Situ commands",
      "Completion",
    ]),
  );
  expect(command.prompt).toContain("Target candidate count: 2");
  // The MDX-authored-report loop must be present in the prompt so the manager
  // knows to read the brief, edit the draft, preview, and submit before declaring
  // the run complete.
  expect(command.prompt).toContain("situ reports instructions");
  expect(command.prompt).toContain("situ reports preview");
  expect(command.prompt).toContain("situ reports submit");
  expect(command.prompt).toContain("situ reports generate");
  expect(command.prompt).toContain("mark it as overfit-risky rather than a clean accepted result");
  expect(command.prompt).toContain("best non-leaky generalizing branch");
  expect(command.prompt).toContain("situ live attempts start");
  expect(command.prompt).toContain("do not fake metric values");
  expect(command.prompt).toContain("same node key with `situ live attempts publish`");
});

function sectionHeadings(markdown: string): readonly string[] {
  return markdown
    .split("\n")
    .filter((line) => line.endsWith(":"))
    .map((line) => line.slice(0, -1));
}

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

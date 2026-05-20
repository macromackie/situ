import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { runCommand } from "../command.js";
import type { WorkspaceAutoresearchCase, WorkspaceManagerRun } from "./types.js";
import {
  collectWorkspaceRunEvidence,
  type MaterializedWorkspaceEnvironment,
} from "./workspace-environment.js";

test("workspace evidence captures the generated visual Situ report", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-eval-evidence-test-"));

  try {
    const environment = createMaterializedEnvironment({ rootPath });
    const workspaceCase = createWorkspaceCase();
    const manager = createManagerRun({ environment });

    const output = collectWorkspaceRunEvidence({
      workspaceCase,
      environment,
      manager,
    });

    expect(output.visualReport.exitCode).toBe(0);
    expect(output.visualReport.command).toContain("situ");
    expect(output.visualReport.command).toContain("--format");
    expect(output.visualReport.command).toContain("html");
    expect(output.visualReportPath).toBe(join(environment.runOutputPath, "SITU_REPORT.html"));
    expect(output.visualReportHtml).toContain("Visual Situ Report");
    expect(output.runArtifacts.map((artifact) => artifact.relativePath)).toContain(
      "SITU_REPORT.html",
    );
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

function createMaterializedEnvironment(input: {
  readonly rootPath: string;
}): MaterializedWorkspaceEnvironment {
  const repositoryPath = join(input.rootPath, "repository");
  const runOutputPath = join(input.rootPath, "run-output");
  const agentOutputPath = join(input.rootPath, "agent-output");
  const worktreesPath = join(input.rootPath, "worktrees");
  const situHomePath = join(input.rootPath, "situ-home");
  const binPath = join(input.rootPath, "bin");

  mkdirSync(repositoryPath, { recursive: true });
  mkdirSync(runOutputPath, { recursive: true });
  mkdirSync(agentOutputPath, { recursive: true });
  mkdirSync(worktreesPath, { recursive: true });
  mkdirSync(situHomePath, { recursive: true });
  mkdirSync(binPath, { recursive: true });
  writeFileSync(join(repositoryPath, "README.md"), "# fixture\n", "utf8");
  writeFakeSituCli({ binPath });

  const commandEnvironment = {
    ...process.env,
    PATH: `${binPath}:${process.env.PATH ?? ""}`,
    SITU_HOME: situHomePath,
  };
  initializeRepository({
    repositoryPath,
    environment: commandEnvironment,
  });

  return {
    rootPath: input.rootPath,
    workspaceRootPath: join(input.rootPath, "workspace"),
    repositoryPath,
    initialCommitSha: readHeadSha({
      repositoryPath,
      environment: commandEnvironment,
    }),
    situHomePath,
    runOutputPath,
    agentOutputPath,
    worktreesPath,
    environment: commandEnvironment,
  };
}

function writeFakeSituCli(input: { readonly binPath: string }): void {
  const situPath = join(input.binPath, "situ");

  writeFileSync(
    situPath,
    [
      "#!/bin/sh",
      // Parse out --out <path> so we can honor the new flag in `reports generate`.
      'out_path=""',
      'prev=""',
      'for arg in "$@"; do',
      '  if [ "$prev" = "--out" ]; then out_path="$arg"; fi',
      '  prev="$arg"',
      "done",
      'case "$*" in',
      '  *"reports generate"*)',
      "    html='<!doctype html>\\n<html><body><h1>Visual Situ Report</h1></body></html>\\n'",
      '    if [ -n "$out_path" ]; then',
      '      printf "$html" > "$out_path"',
      "      printf 'Wrote html report to %s\\n' \"$out_path\"",
      "    else",
      '      printf "$html"',
      "    fi",
      "    ;;",
      '  *"experiments list"*) printf \'{"experiments":[]}\\n\' ;;',
      '  *"baselines list"*) printf \'{"baselines":[]}\\n\' ;;',
      '  *"measurements list"*) printf \'{"measurements":[]}\\n\' ;;',
      '  *"measurements recent"*) printf \'{"measurements":[]}\\n\' ;;',
      '  *"events recent"*) printf \'{"events":[]}\\n\' ;;',
      '  *"reports recent"*) printf \'{"reports":[]}\\n\' ;;',
      '  *"projects current"*) printf \'{"projects":[]}\\n\' ;;',
      '  *"tasks current"*) printf \'{"tasks":[]}\\n\' ;;',
      '  *"status"*) printf \'{"isIdle":true}\\n\' ;;',
      '  *"verify"*) printf \'{"ok":true}\\n\' ;;',
      "  *) printf '{}\\n' ;;",
      "esac",
    ].join("\n"),
    "utf8",
  );
  chmodSync(situPath, 0o755);
}

function initializeRepository(input: {
  readonly repositoryPath: string;
  readonly environment: NodeJS.ProcessEnv;
}): void {
  for (const args of [
    ["init"],
    ["config", "user.name", "Situ Test"],
    ["config", "user.email", "situ-test@example.invalid"],
    ["add", "."],
    ["commit", "-m", "Initial test repository"],
  ]) {
    runCommand({
      command: "git",
      args,
      cwd: input.repositoryPath,
      environment: input.environment,
    });
  }
}

function readHeadSha(input: {
  readonly repositoryPath: string;
  readonly environment: NodeJS.ProcessEnv;
}): string {
  return runCommand({
    command: "git",
    args: ["rev-parse", "HEAD"],
    cwd: input.repositoryPath,
    environment: input.environment,
  }).stdout.trim();
}

function createWorkspaceCase(): WorkspaceAutoresearchCase {
  return {
    id: "visual-report-case",
    title: "Visual report case",
    workspacePath: "/source/visual-report-case",
    projectId: "project_visual_report_case",
    targetCandidateCount: 1,
    requiresSynthesis: false,
    protectedPaths: ["README.md"],
    editablePaths: ["README.md"],
    harnessCommand: "true",
    researchInstructionsMarkdown: "- Keep it small.",
    goalMarkdown: "Run a visual report eval.",
    expectedOutcomeMarkdown: "The visual report is generated after the manager run.",
  };
}

function createManagerRun(input: {
  readonly environment: MaterializedWorkspaceEnvironment;
}): WorkspaceManagerRun {
  const transcriptPath = join(input.environment.agentOutputPath, "terminal.ansi");
  const cleanTranscriptPath = join(input.environment.agentOutputPath, "terminal.txt");

  writeFileSync(transcriptPath, "", "utf8");
  writeFileSync(cleanTranscriptPath, "", "utf8");

  return {
    actorId: "manager",
    driverId: "codex",
    outputPath: input.environment.agentOutputPath,
    promptPath: join(input.environment.agentOutputPath, "prompt.md"),
    goalInputPath: join(input.environment.agentOutputPath, "goal-input.txt"),
    transcriptPath,
    cleanTranscriptPath,
    terminal: {
      command: ["codex", "--enable", "goals"],
      cwd: input.environment.repositoryPath,
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      transcriptPath,
      cleanTranscriptPath,
    },
    prompt: "Use Situ.",
    goalInput: "/goal Use Situ.\r",
    finalMessage: "",
    startedAtUnixMs: Date.parse("2026-05-16T04:00:00.000Z"),
    endedAtUnixMs: Date.parse("2026-05-16T04:01:00.000Z"),
  };
}

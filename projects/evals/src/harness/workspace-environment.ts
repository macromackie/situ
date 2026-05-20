import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { reportTrace } from "evalite/traces";

import { runCommand, type CommandResult } from "../command.js";
import type {
  WorkspaceAutoresearchCase,
  WorkspaceAutoresearchOutput,
  WorkspaceManagerRun,
  WorkspaceRunArtifact,
  WorkspaceWorktreeSummary,
} from "./types.js";

const evalsProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const situCliShimPath = join(evalsProjectRoot, "src", "harness", "situ-cli.ts");
const resultsHeader = "commit\tdev_accuracy\tdev_wps\tfinal_accuracy\tstatus\tdescription\n";
const maxCollectedArtifacts = 80;
const maxCollectedArtifactBytes = 2 * 1024 * 1024;

export type MaterializedWorkspaceEnvironment = {
  readonly rootPath: string;
  readonly workspaceRootPath: string;
  readonly repositoryPath: string;
  readonly initialCommitSha: string;
  readonly situHomePath: string;
  readonly runOutputPath: string;
  readonly agentOutputPath: string;
  readonly worktreesPath: string;
  readonly environment: NodeJS.ProcessEnv;
};

export function baselineIdForWorkspaceCase(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
}): string {
  return `baseline_${input.workspaceCase.id.replaceAll("-", "_")}_native`;
}

/**
 * Materializes an isolated copy of an eval workspace for one root manager run.
 */
export async function materializeWorkspaceEnvironment(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
}): Promise<MaterializedWorkspaceEnvironment> {
  const rootPath = await mkdtemp(join(tmpdir(), `situ-eval-${input.workspaceCase.id}-`));
  const situHomePath = join(rootPath, "situ-home");
  const workspaceRootPath = join(situHomePath, "evals", "workspaces", input.workspaceCase.id);
  const repositoryPath = join(workspaceRootPath, "repository");
  const binPath = join(workspaceRootPath, "bin");
  const runOutputPath = join(workspaceRootPath, "run-output");
  const agentOutputPath = join(workspaceRootPath, "agent-output");
  const worktreesPath = join(workspaceRootPath, "worktrees");

  mkdirSync(repositoryPath, { recursive: true });
  mkdirSync(binPath, { recursive: true });
  mkdirSync(situHomePath, { recursive: true });
  mkdirSync(runOutputPath, { recursive: true });
  mkdirSync(agentOutputPath, { recursive: true });
  mkdirSync(worktreesPath, { recursive: true });

  cpSync(input.workspaceCase.workspacePath, repositoryPath, {
    recursive: true,
    errorOnExist: false,
    force: true,
  });
  rewriteLabDirPlaceholder({ repositoryPath });
  writeFileSync(join(runOutputPath, "results.tsv"), resultsHeader, "utf8");

  writeFileSync(
    join(binPath, "situ"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `exec bun ${JSON.stringify(situCliShimPath)} "$@"`,
      "",
    ].join("\n"),
    {
      encoding: "utf8",
      mode: 0o755,
    },
  );

  const environment = {
    ...process.env,
    PATH: `${binPath}:${process.env.PATH ?? ""}`,
    SITU_HOME: situHomePath,
    SITU_RUN_OUTPUT_DIR: runOutputPath,
    SITU_EVAL_AGENT_OUTPUT_DIR: agentOutputPath,
    SITU_EVAL_PROJECT_ID: input.workspaceCase.projectId,
    SITU_EVAL_WORKSPACE_DIR: repositoryPath,
    SITU_EVAL_WORKTREES_DIR: worktreesPath,
    SITU_EVAL_TARGET_CANDIDATE_COUNT: String(input.workspaceCase.targetCandidateCount),
    SITU_EVAL_SYNTHESIS_REQUIRED: input.workspaceCase.requiresSynthesis ? "1" : "0",
  };

  const initialCommitSha = initializeGitRepository({
    repositoryPath,
    environment,
  });

  reportTrace({
    input: {
      step: "materialize-workspace-environment",
      caseId: input.workspaceCase.id,
      sourceWorkspacePath: input.workspaceCase.workspacePath,
    },
    output: {
      rootPath,
      workspaceRootPath,
      repositoryPath,
      initialCommitSha,
      situHomePath,
      runOutputPath,
      agentOutputPath,
      worktreesPath,
    },
    start: Date.now(),
    end: Date.now(),
  });

  return {
    rootPath,
    workspaceRootPath,
    repositoryPath,
    initialCommitSha,
    situHomePath,
    runOutputPath,
    agentOutputPath,
    worktreesPath,
    environment,
  };
}

/**
 * Captures the final observable state after a local-agent workspace eval run.
 */
export function collectWorkspaceRunEvidence(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly environment: MaterializedWorkspaceEnvironment;
  readonly manager: WorkspaceManagerRun;
}): WorkspaceAutoresearchOutput {
  const commandEnvironment = input.environment.environment;
  const repositoryPath = input.environment.repositoryPath;

  const situStatus = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "status", "--project", input.workspaceCase.projectId],
  });
  const situVerify = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "verify", "--project", input.workspaceCase.projectId],
  });
  const experimentsList = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "experiments", "list", "--project-id", input.workspaceCase.projectId],
  });
  const baselinesList = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "baselines", "list", "--project-id", input.workspaceCase.projectId],
  });
  const baselineMeasurementsList = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: [
      "--json",
      "measurements",
      "list",
      "--baseline-id",
      baselineIdForWorkspaceCase({ workspaceCase: input.workspaceCase }),
    ],
  });
  const eventsRecent = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "events", "recent", "--limit", "100"],
  });
  const measurementsRecent = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "measurements", "recent", "--limit", "100"],
  });
  const reportsRecent = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "reports", "recent", "--limit", "20"],
  });
  const visualReportPath = join(input.environment.runOutputPath, "SITU_REPORT.html");
  // Use --out so the CLI writes directly to disk. Capturing the HTML via
  // stdout is unreliable for authored reports because Bun's spawnSync truncates
  // at the macOS 64KB pipe buffer, while authored MDX with embedded fonts is
  // typically ~250-400KB.
  const visualReport = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: [
      "reports",
      "generate",
      "--project-id",
      input.workspaceCase.projectId,
      "--format",
      "html",
      "--generated-at",
      new Date(input.manager.endedAtUnixMs).toISOString(),
      "--out",
      visualReportPath,
    ],
  });

  const projectsCurrent = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "projects", "current", "--status", "active"],
  });
  const tasksCurrent = runSituCommand({
    repositoryPath,
    environment: commandEnvironment,
    args: ["--json", "tasks", "current", "--project-status", "active"],
  });
  const gitStatus = runCommand({
    command: "git",
    args: ["status", "--short"],
    cwd: repositoryPath,
    environment: commandEnvironment,
  });
  const gitDiff = runCommand({
    command: "git",
    args: ["diff", input.environment.initialCommitSha, "--"],
    cwd: repositoryPath,
    environment: commandEnvironment,
  });
  const protectedGitDiff = runCommand({
    command: "git",
    args: ["diff", input.environment.initialCommitSha, "--", ...input.workspaceCase.protectedPaths],
    cwd: repositoryPath,
    environment: commandEnvironment,
  });
  const worktreeList = runCommand({
    command: "git",
    args: ["worktree", "list", "--porcelain"],
    cwd: repositoryPath,
    environment: commandEnvironment,
  });
  const worktreeSummaries = collectWorktreeSummaries({
    environment: input.environment,
    protectedPaths: input.workspaceCase.protectedPaths,
  });

  return {
    caseId: input.workspaceCase.id,
    title: input.workspaceCase.title,
    sourceWorkspacePath: input.workspaceCase.workspacePath,
    repositoryPath,
    initialCommitSha: input.environment.initialCommitSha,
    situHomePath: input.environment.situHomePath,
    runOutputPath: input.environment.runOutputPath,
    agentOutputPath: input.environment.agentOutputPath,
    worktreesPath: input.environment.worktreesPath,
    protectedPaths: input.workspaceCase.protectedPaths,
    manager: input.manager,
    situStatus,
    situVerify,
    baselinesList,
    baselineMeasurementsList,
    experimentsList,
    eventsRecent,
    measurementsRecent,
    reportsRecent,
    visualReport,
    visualReportPath,
    visualReportHtml: readOptionalText(visualReportPath),
    projectsCurrent,
    tasksCurrent,
    worktreeList,
    worktreeSummaries,
    runArtifacts: collectRunArtifacts({ rootPath: input.environment.runOutputPath }),
    agentArtifacts: collectRunArtifacts({ rootPath: input.environment.agentOutputPath }),
    gitStatus,
    gitDiff,
    protectedGitDiff,
    resultsTsv: readOptionalText(join(input.environment.runOutputPath, "results.tsv")),
    runLog: readOptionalText(join(input.environment.runOutputPath, "run.log")),
    finalReportMarkdown:
      readOptionalText(join(repositoryPath, "FINAL_REPORT.md")) ??
      readOptionalText(join(input.environment.runOutputPath, "FINAL_REPORT.md")),
  };
}

function initializeGitRepository(input: {
  readonly repositoryPath: string;
  readonly environment: NodeJS.ProcessEnv;
}): string {
  const commands = [
    ["init"],
    ["config", "user.name", "Situ Eval"],
    ["config", "user.email", "situ-eval@example.invalid"],
    ["add", "."],
    ["commit", "-m", "Initial workspace repository"],
  ] as const;

  for (const args of commands) {
    const result = runCommand({
      command: "git",
      args,
      cwd: input.repositoryPath,
      environment: input.environment,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to initialize workspace git repository: ${result.stderr}`);
    }
  }

  const result = runCommand({
    command: "git",
    args: ["rev-parse", "HEAD"],
    cwd: input.repositoryPath,
    environment: input.environment,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to read initial workspace commit: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function rewriteLabDirPlaceholder(input: { readonly repositoryPath: string }): void {
  const objectivePath = join(input.repositoryPath, "OBJECTIVE.md");

  if (!existsSync(objectivePath)) {
    return;
  }

  const text = readFileSync(objectivePath, "utf8");

  writeFileSync(objectivePath, text.replaceAll("<LAB_DIR>", input.repositoryPath), "utf8");
}

function collectWorktreeSummaries(input: {
  readonly environment: MaterializedWorkspaceEnvironment;
  readonly protectedPaths: readonly string[];
}): readonly WorkspaceWorktreeSummary[] {
  if (!existsSync(input.environment.worktreesPath)) {
    return [];
  }

  return readdirSync(input.environment.worktreesPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(input.environment.worktreesPath, entry.name))
    .filter((path) => isGitWorktree({ path, environment: input.environment.environment }))
    .map((path) => ({
      path,
      branch: runCommand({
        command: "git",
        args: ["rev-parse", "--abbrev-ref", "HEAD"],
        cwd: path,
        environment: input.environment.environment,
      }),
      head: runCommand({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: path,
        environment: input.environment.environment,
      }),
      status: runCommand({
        command: "git",
        args: ["status", "--short"],
        cwd: path,
        environment: input.environment.environment,
      }),
      diff: runCommand({
        command: "git",
        args: ["diff", input.environment.initialCommitSha, "--"],
        cwd: path,
        environment: input.environment.environment,
      }),
      protectedDiff: runCommand({
        command: "git",
        args: ["diff", input.environment.initialCommitSha, "--", ...input.protectedPaths],
        cwd: path,
        environment: input.environment.environment,
      }),
      log: runCommand({
        command: "git",
        args: ["log", "--oneline", `${input.environment.initialCommitSha}..HEAD`],
        cwd: path,
        environment: input.environment.environment,
      }),
      logFull: runCommand({
        command: "git",
        args: ["log", "--format=fuller", `${input.environment.initialCommitSha}..HEAD`],
        cwd: path,
        environment: input.environment.environment,
      }),
      commits: runCommand({
        command: "git",
        args: ["log", "--format=%H", `${input.environment.initialCommitSha}..HEAD`],
        cwd: path,
        environment: input.environment.environment,
      }),
    }));
}

function isGitWorktree(input: {
  readonly path: string;
  readonly environment: NodeJS.ProcessEnv;
}): boolean {
  const result = runCommand({
    command: "git",
    args: ["rev-parse", "--is-inside-work-tree"],
    cwd: input.path,
    environment: input.environment,
  });

  return result.exitCode === 0 && result.stdout.trim() === "true";
}

function collectRunArtifacts(input: {
  readonly rootPath: string;
}): readonly WorkspaceRunArtifact[] {
  if (!existsSync(input.rootPath)) {
    return [];
  }

  return collectArtifactPaths({ rootPath: input.rootPath, currentPath: input.rootPath })
    .slice(0, maxCollectedArtifacts)
    .flatMap((path) => {
      const text = readOptionalText(path);

      if (text === undefined) {
        return [];
      }

      return [
        {
          relativePath: relative(input.rootPath, path).replaceAll("\\", "/"),
          text,
        },
      ];
    });
}

function collectArtifactPaths(input: {
  readonly rootPath: string;
  readonly currentPath: string;
}): readonly string[] {
  return readdirSync(input.currentPath, { withFileTypes: true }).flatMap((entry) => {
    const path = join(input.currentPath, entry.name);

    if (entry.isDirectory()) {
      return collectArtifactPaths({ rootPath: input.rootPath, currentPath: path });
    }

    if (!entry.isFile()) {
      return [];
    }

    if (!isUsefulTextArtifact(path)) {
      return [];
    }

    const stats = statSync(path);

    if (stats.size > maxCollectedArtifactBytes) {
      return [];
    }

    return [path];
  });
}

function isUsefulTextArtifact(path: string): boolean {
  return [".html", ".json", ".jsonl", ".log", ".md", ".txt", ".tsv", ".yaml", ".yml"].some(
    (suffix) => path.endsWith(suffix),
  );
}

function runSituCommand(input: {
  readonly repositoryPath: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly args: readonly string[];
}): CommandResult {
  return runCommand({
    command: "situ",
    args: input.args,
    cwd: input.repositoryPath,
    environment: input.environment,
  });
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  return readFileSync(path, "utf8");
}

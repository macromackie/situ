import { evalite } from "evalite";

import { runWorkspaceTerminalManager } from "../codex.js";
import { listWorkspaceAutoresearchCases } from "../harness/workspace-cases.js";
import {
  collectWorkspaceRunEvidence,
  materializeWorkspaceEnvironment,
} from "../harness/workspace-environment.js";
import type { WorkspaceAutoresearchCase, WorkspaceAutoresearchOutput } from "../harness/types.js";
import { scoreWithCodexJudge } from "../judges/codex-judge.js";
import { collectLiveMapEvidence } from "./live-map-evidence.js";
import { collectOverfitEvidence } from "./overfit-evidence.js";

type ParsedExperiment = {
  readonly id?: string;
  readonly taskId?: string;
  readonly title?: string;
  readonly status?: string;
  readonly summaryMarkdown?: string;
  readonly baseRef?: string;
  readonly branchName?: string;
  readonly worktreePath?: string;
  readonly assignedTo?: unknown;
};

type ParsedTask = {
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly assignedTo?: unknown;
};

type ParsedMeasurement = {
  readonly id?: string;
  readonly baselineId?: string;
  readonly experimentId?: string;
  readonly metricName?: string;
  readonly numericValue?: number;
  readonly summaryMarkdown?: string;
  readonly measuredBy?: unknown;
  readonly metadata?: {
    readonly createdAt?: string;
  };
};

type ParsedBaseline = {
  readonly id?: string;
  readonly status?: string;
};

type ParsedReport = {
  readonly id?: string;
  readonly title?: string;
  readonly bodyMarkdown?: string;
  readonly projectId?: string;
  readonly target?: {
    readonly targetKind?: string;
    readonly targetId?: string;
  };
};

const mdxAuthoredMarker = /<ResearchReport\b/;
const authoredHtmlFontEmbedMarker = "data:font/woff2;base64,";
const taskHardCapMs = 15 * 60 * 1000;

type ParsedActorRef = {
  readonly actorId?: string;
};

type ParsedResultRow = {
  readonly commit: string;
  readonly devAccuracy?: number;
  readonly status: string;
  readonly description: string;
};

evalite<WorkspaceAutoresearchCase, WorkspaceAutoresearchOutput, string>(
  "Terminal workspace autoresearch",
  {
    data: () =>
      listWorkspaceAutoresearchCases({
        caseIds: selectedCaseIdsFromEnvironment(),
      }).map((workspaceCase) => ({
        input: workspaceCase,
        expected: workspaceCase.expectedOutcomeMarkdown,
      })),
    task: async (workspaceCase) => {
      // Per-case 15-minute hard cap. The manager has its own 10-minute terminal
      // budget; the remaining ~5 minutes covers the agent's report-submit step
      // and evidence collection. If anything hangs past 15 minutes, the entire
      // task fails fast so the suite does not stall.
      return runWithHardCap({
        capMs: taskHardCapMs,
        caseId: workspaceCase.id,
        work: async () => {
          const environment = await materializeWorkspaceEnvironment({ workspaceCase });
          const manager = await runWorkspaceTerminalManager({
            workspaceCase,
            environment,
          });
          return collectWorkspaceRunEvidence({
            workspaceCase,
            environment,
            manager,
          });
        },
      });
    },
    scorers: [
      {
        name: "situ-observability",
        description: "Supporting scorer for mechanical Situ and workspace observability.",
        scorer: ({ input, output }) => {
          const verification = parseVerifyOutput(output.situVerify.stdout);
          const status = parseStatusOutput(output.situStatus.stdout);
          const experiments = parseExperimentsOutput(output.experimentsList.stdout);
          const baselines = parseBaselinesOutput(output.baselinesList.stdout);
          const tasks = parseTasksOutput(output.tasksCurrent.stdout);
          const reports = parseReportsOutput(output.reportsRecent.stdout);
          const measurements = mergeMeasurements([
            ...parseMeasurementsOutput(output.baselineMeasurementsList.stdout),
            ...parseMeasurementsOutput(output.measurementsRecent.stdout),
          ]);
          const baselineMeasurements = measurements.filter(
            (measurement) => measurement.baselineId !== undefined,
          );
          const experimentMeasurements = measurements.filter(
            (measurement) => measurement.experimentId !== undefined,
          );
          const workerActorEvidence = collectWorkerActorEvidence({
            experiments,
            tasks,
            measurements,
          });
          const baselineBeforeCandidateMeasurements =
            baselineMeasurementsPrecedeCandidateMeasurements({
              baselineMeasurements,
              experimentMeasurements,
            });
          const baselineMetricNames = new Set(
            baselineMeasurements.flatMap((measurement) => {
              if (measurement.metricName === undefined) {
                return [];
              }

              return [measurement.metricName];
            }),
          );
          const comparableExperimentMeasurementCount = experimentMeasurements.filter(
            (measurement) =>
              measurement.metricName !== undefined &&
              baselineMetricNames.has(measurement.metricName),
          ).length;
          const measuredExperimentCount = countDistinctMeasuredExperiments(experimentMeasurements);
          const comparableMeasuredExperimentCount = countDistinctMeasuredExperiments(
            experimentMeasurements.filter(
              (measurement) =>
                measurement.metricName !== undefined &&
                baselineMetricNames.has(measurement.metricName),
            ),
          );
          const comparableMeasuredExperimentIds = distinctMeasuredExperimentIds(
            experimentMeasurements.filter(
              (measurement) =>
                measurement.metricName !== undefined &&
                baselineMetricNames.has(measurement.metricName),
            ),
          );
          const overfitEvidence = collectOverfitEvidence({
            experiments,
            measurements,
            allowAcceptedOverfitRisk: input.allowAcceptedOverfitRisk,
          });
          const resultsRows = countRunResultRows(output);
          const projectReportCount = reports.filter(
            (report) =>
              report.projectId === input.projectId &&
              report.target?.targetKind === "project" &&
              report.target.targetId === input.projectId,
          ).length;
          const authoredReports = reports.filter(
            (report) =>
              report.projectId === input.projectId &&
              report.target?.targetKind === "project" &&
              report.target.targetId === input.projectId &&
              typeof report.bodyMarkdown === "string" &&
              mdxAuthoredMarker.test(report.bodyMarkdown),
          );
          const authoredReportPresent = authoredReports.length >= 1;
          const visualReportLooksAuthored =
            typeof output.visualReportHtml === "string" &&
            output.visualReportHtml.includes(authoredHtmlFontEmbedMarker);
          const worktreeCount = output.worktreeSummaries.length;
          const experimentWorktreeCount = countExperimentWorktrees({
            experiments,
            output,
          });
          const protectedDiffsClean =
            output.protectedGitDiff.stdout.trim().length === 0 &&
            output.worktreeSummaries.every(
              (summary) => summary.protectedDiff.stdout.trim().length === 0,
            );
          const managerUsedNativeGoal = managerSubmittedNativeGoal(output);
          const synthesisEvidence = input.requiresSynthesis
            ? collectSynthesisEvidence({
                workspaceCase: input,
                output,
                experiments,
                tasks,
                measurements,
              })
            : undefined;
          const isolatedExperiments = experiments.filter(
            (experiment) =>
              experiment.branchName !== undefined &&
              experiment.worktreePath !== undefined &&
              experiment.assignedTo !== undefined,
          );
          const startedExperimentIds = distinctExperimentIds(isolatedExperiments);
          const liveMapEvidence = collectLiveMapEvidence({
            liveRecordsJson: output.liveRecords.stdout,
            startedExperimentIds,
            measuredExperimentIds: comparableMeasuredExperimentIds,
          });
          const checkpointedExperimentCount = experiments.filter(
            (experiment) =>
              experiment.status === "ready_for_review" ||
              experiment.status === "accepted" ||
              experiment.status === "rejected" ||
              experiment.status === "abandoned",
          ).length;
          const checkpointedTaskCount = tasks.filter(
            (task) => task.status === "in_review" || task.status === "done",
          ).length;
          const requiredCount = input.targetCandidateCount;
          const hasBaselineRecords = baselines.length >= 1 && baselineMeasurements.length >= 1;
          const hasCandidateRecords =
            isolatedExperiments.length >= requiredCount &&
            experimentWorktreeCount >= requiredCount &&
            measuredExperimentCount >= requiredCount &&
            comparableMeasuredExperimentCount >= requiredCount &&
            comparableExperimentMeasurementCount >= requiredCount;
          const hasLiveMapCoverage =
            liveMapEvidence.startedExperimentRefCount >= requiredCount &&
            liveMapEvidence.livePlottableDetailCount >= requiredCount &&
            liveMapEvidence.measuredExperimentRefCount >= requiredCount;
          const hasProjectReport = projectReportCount >= 1;
          const hasSynthesisEvidence = !input.requiresSynthesis || synthesisEvidence?.ok === true;

          return {
            score:
              managerUsedNativeGoal &&
              status !== undefined &&
              verification !== undefined &&
              resultsRows >= 1 &&
              protectedDiffsClean &&
              hasBaselineRecords &&
              hasCandidateRecords &&
              hasLiveMapCoverage &&
              overfitEvidence.ok &&
              hasProjectReport &&
              authoredReportPresent &&
              visualReportLooksAuthored &&
              hasSynthesisEvidence &&
              checkpointedExperimentCount >= 1 &&
              checkpointedTaskCount >= 1
                ? 1
                : 0,
            metadata: {
              managerExitCode: output.manager.terminal.exitCode,
              managerTimedOut: output.manager.terminal.timedOut,
              managerUsedNativeGoal,
              worktreeCount,
              experimentWorktreeCount,
              protectedDiffsClean,
              isolatedExperimentCount: isolatedExperiments.length,
              checkpointedExperimentCount,
              checkpointedTaskCount,
              workerActorEvidence,
              baselineCount: baselines.length,
              baselineMeasurementCount: baselineMeasurements.length,
              baselineBeforeCandidateMeasurements,
              experimentMeasurementCount: experimentMeasurements.length,
              comparableExperimentMeasurementCount,
              measuredExperimentCount,
              comparableMeasuredExperimentCount,
              comparableMeasuredExperimentIds,
              hasLiveMapCoverage,
              liveMapEvidence,
              overfitEvidence,
              projectReportCount,
              authoredReportPresent,
              authoredReportCount: authoredReports.length,
              authoredReportTitles: authoredReports
                .flatMap((report) => (typeof report.title === "string" ? [report.title] : []))
                .slice(0, 5),
              visualReportLooksAuthored,
              visualReportSize: output.visualReportHtml?.length ?? 0,
              exitCode: output.situVerify.exitCode,
              resultsRows,
              status,
              verification,
              synthesis: synthesisEvidence,
              stderr: output.situVerify.stderr,
            },
          };
        },
      },
      {
        name: "codex-llm-judge",
        description:
          "Critical LLM judge over the terminal run, Situ records, workspace output, and final artifacts.",
        scorer: ({ input, output }) =>
          scoreWithCodexJudge({
            workspaceCase: input,
            output,
          }),
      },
    ],
    columns: ({ input, output, scores }) => [
      {
        label: "case",
        value: input.id,
      },
      {
        label: "managerExit",
        value: output.manager.terminal.exitCode ?? "none",
      },
      {
        label: "managerTimedOut",
        value: output.manager.terminal.timedOut ? "yes" : "no",
      },
      {
        label: "verifyExit",
        value: output.situVerify.exitCode,
      },
      {
        label: "scores",
        value: scores.map((score) => `${score.name}:${score.score}`).join(", "),
      },
    ],
  },
);

function parseVerifyOutput(value: string): { readonly ok: boolean } | undefined {
  try {
    const parsed = JSON.parse(value) as { readonly ok?: unknown };

    if (typeof parsed.ok !== "boolean") {
      return undefined;
    }

    return { ok: parsed.ok };
  } catch {
    return undefined;
  }
}

function parseStatusOutput(value: string): { readonly isIdle: boolean } | undefined {
  try {
    const parsed = JSON.parse(value) as { readonly isIdle?: unknown };

    if (typeof parsed.isIdle !== "boolean") {
      return undefined;
    }

    return { isIdle: parsed.isIdle };
  } catch {
    return undefined;
  }
}

function countResultRows(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  const rows = value
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  return Math.max(0, rows.length - 1);
}

function parseExperimentsOutput(value: string): readonly ParsedExperiment[] {
  try {
    const parsed = JSON.parse(value) as { readonly experiments?: unknown };

    if (!Array.isArray(parsed.experiments)) {
      return [];
    }

    return parsed.experiments
      .map((experiment) => experiment as ParsedExperiment)
      .filter((experiment) => typeof experiment === "object" && experiment !== null);
  } catch {
    return [];
  }
}

function parseMeasurementsOutput(value: string): readonly ParsedMeasurement[] {
  try {
    const parsed = JSON.parse(value) as { readonly measurements?: unknown };

    if (!Array.isArray(parsed.measurements)) {
      return [];
    }

    return parsed.measurements
      .map((measurement) => measurement as ParsedMeasurement)
      .filter((measurement) => typeof measurement === "object" && measurement !== null);
  } catch {
    return [];
  }
}

function parseBaselinesOutput(value: string): readonly ParsedBaseline[] {
  try {
    const parsed = JSON.parse(value) as { readonly baselines?: unknown };

    if (!Array.isArray(parsed.baselines)) {
      return [];
    }

    return parsed.baselines
      .map((baseline) => baseline as ParsedBaseline)
      .filter((baseline) => typeof baseline === "object" && baseline !== null);
  } catch {
    return [];
  }
}

function parseReportsOutput(value: string): readonly ParsedReport[] {
  try {
    const parsed = JSON.parse(value) as { readonly reports?: unknown };

    if (!Array.isArray(parsed.reports)) {
      return [];
    }

    return parsed.reports
      .map((report) => report as ParsedReport)
      .filter((report) => typeof report === "object" && report !== null);
  } catch {
    return [];
  }
}

/**
 * Races `work` against the hard wall-clock cap so a hung manager or evidence
 * collection step cannot stall the entire suite past the budget.
 */
async function runWithHardCap<TValue>(input: {
  readonly capMs: number;
  readonly caseId: string;
  readonly work: () => Promise<TValue>;
}): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<TValue>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Eval case "${input.caseId}" exceeded ${Math.round(input.capMs / 1000)} s hard cap.`,
        ),
      );
    }, input.capMs);
  });
  try {
    return await Promise.race([input.work(), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function parseTasksOutput(value: string): readonly ParsedTask[] {
  try {
    const parsed = JSON.parse(value) as { readonly tasks?: unknown };

    if (!Array.isArray(parsed.tasks)) {
      return [];
    }

    return parsed.tasks
      .map((task) => task as ParsedTask)
      .filter((task) => typeof task === "object" && task !== null);
  } catch {
    return [];
  }
}

function mergeMeasurements(
  measurements: readonly ParsedMeasurement[],
): readonly ParsedMeasurement[] {
  const seen = new Set<string>();
  const merged: ParsedMeasurement[] = [];

  for (const measurement of measurements) {
    const key = measurement.id ?? JSON.stringify(measurement);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(measurement);
  }

  return merged;
}

/**
 * Collects non-gating evidence that the manager delegated work.
 */
function collectWorkerActorEvidence(input: {
  readonly experiments: readonly ParsedExperiment[];
  readonly tasks: readonly ParsedTask[];
  readonly measurements: readonly ParsedMeasurement[];
}): {
  readonly assignedActorIds: readonly string[];
  readonly measurementActorIds: readonly string[];
  readonly nonManagerActorIds: readonly string[];
  readonly nonManagerActorCount: number;
} {
  const assignedActorIds = uniqueStrings([
    ...input.experiments.flatMap((experiment) => actorIdFromUnknown(experiment.assignedTo)),
    ...input.tasks.flatMap((task) => actorIdFromUnknown(task.assignedTo)),
  ]);
  const measurementActorIds = uniqueStrings(
    input.measurements.flatMap((measurement) => actorIdFromUnknown(measurement.measuredBy)),
  );
  const nonManagerActorIds = uniqueStrings(
    [...assignedActorIds, ...measurementActorIds].filter((actorId) => actorId !== "manager"),
  );

  return {
    assignedActorIds,
    measurementActorIds,
    nonManagerActorIds,
    nonManagerActorCount: nonManagerActorIds.length,
  };
}

function actorIdFromUnknown(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const actor = value as ParsedActorRef;

  if (typeof actor.actorId !== "string") {
    return [];
  }

  const actorId = actor.actorId.trim();

  if (actorId.length === 0) {
    return [];
  }

  return [actorId];
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

/**
 * Checks that shared baseline evidence came before candidate measurements.
 */
function baselineMeasurementsPrecedeCandidateMeasurements(input: {
  readonly baselineMeasurements: readonly ParsedMeasurement[];
  readonly experimentMeasurements: readonly ParsedMeasurement[];
}): boolean {
  const baselineTimes = input.baselineMeasurements.flatMap((measurement) =>
    timestampMillis(measurement.metadata?.createdAt),
  );
  const experimentTimes = input.experimentMeasurements.flatMap((measurement) =>
    timestampMillis(measurement.metadata?.createdAt),
  );

  if (baselineTimes.length === 0 || experimentTimes.length === 0) {
    return false;
  }

  return Math.max(...baselineTimes) <= Math.min(...experimentTimes);
}

function timestampMillis(value: string | undefined): readonly number[] {
  if (value === undefined) {
    return [];
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return [];
  }

  return [parsed];
}

function managerSubmittedNativeGoal(output: WorkspaceAutoresearchOutput): boolean {
  const command = output.manager.terminal.command;
  const submittedGoal = output.manager.goalInput.trimStart().startsWith("/goal ");

  return (
    submittedGoal &&
    (output.manager.driverId === "claude" ||
      (command.includes("codex") &&
        hasEnableFlag({
          command,
          feature: "goals",
        })))
  );
}

function hasEnableFlag(input: {
  readonly command: readonly string[];
  readonly feature: string;
}): boolean {
  return input.command.some(
    (arg, index) => arg === "--enable" && input.command[index + 1] === input.feature,
  );
}

function countRunResultRows(output: WorkspaceAutoresearchOutput): number {
  return countArtifactResultRows(output.runArtifacts);
}

function countDistinctMeasuredExperiments(measurements: readonly ParsedMeasurement[]): number {
  return new Set(
    measurements.flatMap((measurement) => {
      if (measurement.experimentId === undefined) {
        return [];
      }

      return [measurement.experimentId];
    }),
  ).size;
}

function distinctMeasuredExperimentIds(
  measurements: readonly ParsedMeasurement[],
): readonly string[] {
  return Array.from(
    new Set(
      measurements.flatMap((measurement) => {
        if (measurement.experimentId === undefined) {
          return [];
        }

        return [measurement.experimentId];
      }),
    ),
  );
}

function distinctExperimentIds(experiments: readonly ParsedExperiment[]): readonly string[] {
  return Array.from(
    new Set(
      experiments.flatMap((experiment) => {
        if (experiment.id === undefined) {
          return [];
        }

        return [experiment.id];
      }),
    ),
  );
}

function countExperimentWorktrees(input: {
  readonly experiments: readonly ParsedExperiment[];
  readonly output: WorkspaceAutoresearchOutput;
}): number {
  return input.experiments.filter((experiment) =>
    input.output.worktreeSummaries.some(
      (summary) =>
        summary.path === experiment.worktreePath ||
        summary.branch.stdout.trim() === experiment.branchName,
    ),
  ).length;
}

function collectSynthesisEvidence(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly output: WorkspaceAutoresearchOutput;
  readonly experiments: readonly ParsedExperiment[];
  readonly tasks: readonly ParsedTask[];
  readonly measurements: readonly ParsedMeasurement[];
}): {
  readonly ok: boolean;
  readonly synthesisExperimentExists: boolean;
  readonly synthesisTaskExists: boolean;
  readonly synthesisBaseNotInitial: boolean;
  readonly synthesisWorktreeExists: boolean;
  readonly cherryPickCount: number;
  readonly cherryPickSourceBranchCount: number;
  readonly representedBranchCount: number;
  readonly synthesisMeasurementCount: number;
  readonly synthesisCheckpointedExperiment: boolean;
  readonly synthesisCheckpointedTask: boolean;
  readonly synthesisRows: number;
  readonly candidateMaxDevAccuracy?: number;
  readonly synthesisMaxDevAccuracy?: number;
  readonly synthesisAccuracyAtLeastBestCandidate: boolean;
} {
  const synthesisExperiment = findSynthesisExperiment({
    experiments: input.experiments,
    initialCommitSha: input.output.initialCommitSha,
  });
  const synthesisTask =
    input.tasks.find((task) => task.id === synthesisExperiment?.taskId) ??
    findNamedSynthesisTask({ tasks: input.tasks });
  const synthesisSummary = input.output.worktreeSummaries.find(
    (summary) =>
      summary.path === synthesisExperiment?.worktreePath ||
      summary.branch.stdout.trim() === synthesisExperiment?.branchName,
  );
  const candidateSummaries = input.output.worktreeSummaries.filter(
    (summary) => summary !== synthesisSummary,
  );
  const baseSource = candidateSummaries.find(
    (summary) => summary.head.stdout.trim() === synthesisExperiment?.baseRef,
  );
  const cherryPickedCommits = parseCherryPickedOriginalCommits(
    synthesisSummary?.logFull.stdout ?? "",
  );
  const cherryPickSourceBranches = new Set<string>();

  for (const commit of cherryPickedCommits) {
    const source = candidateSummaries.find((summary) =>
      commitList(summary.commits.stdout).includes(commit),
    );

    if (source !== undefined && source.branch.stdout.trim() !== baseSource?.branch.stdout.trim()) {
      cherryPickSourceBranches.add(source.branch.stdout.trim());
    }
  }

  const representedBranches = new Set<string>();

  if (baseSource !== undefined) {
    representedBranches.add(baseSource.branch.stdout.trim());
  }

  for (const branchName of cherryPickSourceBranches) {
    representedBranches.add(branchName);
  }

  const synthesisMeasurementCount =
    synthesisExperiment?.id === undefined
      ? 0
      : input.measurements.filter(
          (measurement) => measurement.experimentId === synthesisExperiment.id,
        ).length;
  const resultRows = parseResultRows(input.output.runArtifacts);
  const synthesisResultRows = resultRows.filter((row) =>
    isSynthesisResultRow({
      row,
      synthesisHead: synthesisSummary?.head.stdout.trim(),
    }),
  );
  const candidateResultRows = resultRows.filter((row) => isCandidateResultRow({ row }));
  const synthesisRows = synthesisResultRows.length;
  const candidateMaxDevAccuracy = maxResultRowDevAccuracy(candidateResultRows);
  const synthesisMaxDevAccuracy = maxResultRowDevAccuracy(synthesisResultRows);
  const synthesisAccuracyAtLeastBestCandidate =
    candidateMaxDevAccuracy !== undefined &&
    synthesisMaxDevAccuracy !== undefined &&
    synthesisMaxDevAccuracy >= candidateMaxDevAccuracy;
  const synthesisCheckpointedExperiment =
    synthesisExperiment?.status === "ready_for_review" ||
    synthesisExperiment?.status === "accepted";
  const synthesisCheckpointedTask =
    synthesisTask?.status === "in_review" || synthesisTask?.status === "done";
  const synthesisBaseNotInitial =
    synthesisExperiment?.baseRef !== undefined &&
    synthesisExperiment.baseRef !== input.output.initialCommitSha;
  const synthesisWorktreeExists = synthesisSummary !== undefined;
  const ok =
    input.experiments.length >= input.workspaceCase.targetCandidateCount + 1 &&
    synthesisExperiment !== undefined &&
    synthesisTask !== undefined &&
    synthesisBaseNotInitial &&
    synthesisWorktreeExists &&
    cherryPickedCommits.length >= 2 &&
    cherryPickSourceBranches.size >= 2 &&
    representedBranches.size >= 3 &&
    synthesisMeasurementCount >= 1 &&
    synthesisCheckpointedExperiment &&
    synthesisCheckpointedTask &&
    (synthesisRows >= 1 || synthesisMaxDevAccuracy !== undefined) &&
    (synthesisAccuracyAtLeastBestCandidate ||
      candidateMaxDevAccuracy === undefined ||
      synthesisMaxDevAccuracy === undefined);

  return {
    ok,
    synthesisExperimentExists: synthesisExperiment !== undefined,
    synthesisTaskExists: synthesisTask !== undefined,
    synthesisBaseNotInitial,
    synthesisWorktreeExists,
    cherryPickCount: cherryPickedCommits.length,
    cherryPickSourceBranchCount: cherryPickSourceBranches.size,
    representedBranchCount: representedBranches.size,
    synthesisMeasurementCount,
    synthesisCheckpointedExperiment,
    synthesisCheckpointedTask,
    synthesisRows,
    candidateMaxDevAccuracy,
    synthesisMaxDevAccuracy,
    synthesisAccuracyAtLeastBestCandidate,
  };
}

function findNamedSynthesisTask(input: {
  readonly tasks: readonly ParsedTask[];
}): ParsedTask | undefined {
  return input.tasks.find((task) =>
    [task.id, task.title]
      .filter((value) => value !== undefined)
      .join(" ")
      .toLowerCase()
      .includes("synthesis"),
  );
}

function findSynthesisExperiment(input: {
  readonly experiments: readonly ParsedExperiment[];
  readonly initialCommitSha: string;
}): ParsedExperiment | undefined {
  const followUpExperiments = input.experiments.filter(
    (experiment) =>
      experiment.baseRef !== undefined && experiment.baseRef !== input.initialCommitSha,
  );

  return (
    followUpExperiments.find((experiment) =>
      [experiment.id, experiment.title, experiment.branchName]
        .filter((value) => value !== undefined)
        .join(" ")
        .toLowerCase()
        .includes("synthesis"),
    ) ?? followUpExperiments[0]
  );
}

function parseCherryPickedOriginalCommits(value: string): readonly string[] {
  return Array.from(value.matchAll(/cherry picked from commit ([0-9a-f]{7,40})/gi)).map(
    (match) => match[1] ?? "",
  );
}

function commitList(value: string): readonly string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function countArtifactResultRows(artifacts: WorkspaceAutoresearchOutput["runArtifacts"]): number {
  return artifacts
    .filter((artifact) => artifact.relativePath.endsWith("results.tsv"))
    .reduce((sum, artifact) => sum + countResultRows(artifact.text), 0);
}

function parseResultRows(
  artifacts: WorkspaceAutoresearchOutput["runArtifacts"],
): readonly ParsedResultRow[] {
  return artifacts
    .filter((artifact) => artifact.relativePath.endsWith("results.tsv"))
    .flatMap((artifact) =>
      artifact.text
        .split("\n")
        .slice(1)
        .flatMap((row) => parseResultRow(row)),
    );
}

function parseResultRow(row: string): readonly ParsedResultRow[] {
  const columns = row.split("\t");
  const commit = columns[0]?.trim() ?? "";
  const devAccuracy = Number(columns[1]);
  const status = columns[4]?.trim().toLowerCase() ?? "";
  const description = columns[5]?.trim().toLowerCase() ?? "";

  if (commit.length === 0 || status.length === 0) {
    return [];
  }

  return [
    {
      commit,
      devAccuracy: Number.isFinite(devAccuracy) ? devAccuracy : undefined,
      status,
      description,
    },
  ];
}

function isSynthesisResultRow(input: {
  readonly row: ParsedResultRow;
  readonly synthesisHead?: string;
}): boolean {
  if (input.row.status.includes("synthesis") || input.row.description.includes("synthesis")) {
    return true;
  }

  if (input.synthesisHead === undefined) {
    return false;
  }

  return input.synthesisHead.startsWith(input.row.commit);
}

function isCandidateResultRow(input: { readonly row: ParsedResultRow }): boolean {
  return (
    !input.row.status.includes("baseline") &&
    !input.row.status.includes("synthesis") &&
    !input.row.description.includes("synthesis")
  );
}

function maxResultRowDevAccuracy(rows: readonly ParsedResultRow[]): number | undefined {
  const values = rows.flatMap((row) => {
    if (row.devAccuracy === undefined) {
      return [];
    }

    return [row.devAccuracy];
  });

  if (values.length === 0) {
    return undefined;
  }

  return Math.max(...values);
}

function selectedCaseIdsFromEnvironment(): readonly string[] | undefined {
  const rawValue = process.env.SITU_EVAL_CASE_IDS;

  if (rawValue === undefined || rawValue.trim().length === 0) {
    return undefined;
  }

  return rawValue
    .split(",")
    .map((caseId) => caseId.trim())
    .filter((caseId) => caseId.length > 0);
}

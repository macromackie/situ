import { nowTimestamp, type SituId } from "@situ/common";
import { NotFoundError, ValidationError } from "@situ/errors";
import type { ArtifactRecord } from "@situ/artifacts";
import type { ExperimentRecord } from "@situ/experiments";
import type { MeasurementRecord } from "@situ/measurements";
import type { ProjectRecord } from "@situ/projects";
import type { ReportRecord } from "@situ/reports";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";

import { createAppActionContext, type AppActionContext } from "../actions/index.js";
import type {
  SituVerifyBlockingRecord,
  SituVerifyCheck,
  SituVerifyOutput,
  VerifySituInput,
} from "./types.js";

/**
 * Verifies record-level completion evidence for a project set.
 */
export function verifySitu(input: VerifySituInput): SituVerifyOutput {
  validateVerifyScope(input);

  const context = createAppActionContext({ database: input.database });
  const projects = targetProjects({
    context,
    projectId: input.projectId,
    repositoryPath: input.repositoryPath,
  });
  const projectIds = projects.map((project) => project.id);
  const related = collectRelatedRecords({
    context,
    projectIds,
  });
  const checks = [
    checkHasProject({ projects, requestedProjectId: input.projectId }),
    checkNoActiveTasks({ tasks: related.tasks }),
    checkNoActiveExperiments({ experiments: related.experiments }),
    checkAcceptedExperimentsReviewed({
      experiments: related.experiments,
      reviews: related.reviews,
    }),
    checkAcceptedExperimentsHaveEvidence({
      experiments: related.experiments,
      measurements: related.measurements,
      artifacts: related.artifacts,
    }),
    checkFinalReportPresent({
      projects,
      reports: related.reports,
    }),
  ];

  return {
    generatedAt: input.generatedAt ?? nowTimestamp(),
    repositoryPath: input.repositoryPath,
    projectIds,
    ok: checks.every((check) => check.ok),
    checks,
  };
}

type VerifyScopeInput = {
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
};

function validateVerifyScope(input: VerifyScopeInput): void {
  if (input.projectId === undefined || input.repositoryPath === undefined) {
    return;
  }

  throw new ValidationError({
    message: "Verification scope accepts projectId or repositoryPath, not both.",
    details: {
      projectId: input.projectId,
      repositoryPath: input.repositoryPath,
    },
  });
}

function targetProjects(input: {
  readonly context: AppActionContext;
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
}): readonly ProjectRecord[] {
  if (input.projectId !== undefined) {
    const project = input.context.repositories.projects.getById({ id: input.projectId });

    if (project === undefined) {
      throw new NotFoundError({
        message: "Project was not found.",
        details: { id: input.projectId },
      });
    }

    return [project];
  }

  if (input.repositoryPath !== undefined) {
    return input.context.repositories.projects.list({
      repositoryPath: input.repositoryPath,
      status: "active",
    });
  }

  return input.context.repositories.projects.list({ status: "active" });
}

type RelatedRecords = {
  readonly tasks: readonly TaskRecord[];
  readonly experiments: readonly ExperimentRecord[];
  readonly measurements: readonly MeasurementRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly reports: readonly ReportRecord[];
};

function collectRelatedRecords(input: {
  readonly context: AppActionContext;
  readonly projectIds: readonly SituId<"project">[];
}): RelatedRecords {
  if (input.projectIds.length === 0) {
    return {
      tasks: [],
      experiments: [],
      measurements: [],
      artifacts: [],
      reviews: [],
      reports: [],
    };
  }

  const projectIdSet = new Set<string>(input.projectIds);
  const tasks = input.context.repositories.tasks.list({ projectIds: input.projectIds });
  const experiments = input.context.repositories.experiments
    .list()
    .filter((experiment) => projectIdSet.has(experiment.projectId));
  const experimentIdSet = new Set<string>(experiments.map((experiment) => experiment.id));
  const measurements = input.context.repositories.measurements.listAll().filter((measurement) => {
    if (measurement.experimentId === undefined) {
      return false;
    }

    return experimentIdSet.has(measurement.experimentId);
  });
  const artifacts = input.context.repositories.artifacts
    .listAll()
    .filter(
      (artifact) =>
        experimentIdSet.has(artifact.target.targetId) &&
        artifact.target.targetKind === "experiment",
    );
  const reviews = input.context.repositories.reviews
    .listAll()
    .filter((review) => experimentIdSet.has(review.experimentId));
  const reports = input.context.repositories.reports
    .listAll()
    .filter((report) => projectIdSet.has(report.projectId));

  return {
    tasks,
    experiments,
    measurements,
    artifacts,
    reviews,
    reports,
  };
}

function checkHasProject(input: {
  readonly projects: readonly ProjectRecord[];
  readonly requestedProjectId?: SituId<"project">;
}): SituVerifyCheck {
  const blockingRecords =
    input.projects.length === 0
      ? [
          {
            targetKind: "project" as const,
            targetId: input.requestedProjectId ?? "active-projects",
            reason: "No target project was found.",
          },
        ]
      : [];

  return makeCheck({
    name: "has-project",
    okSummary: `${input.projects.length} project(s) found.`,
    failSummary: "No target project was found.",
    blockingRecords,
  });
}

function checkNoActiveTasks(input: { readonly tasks: readonly TaskRecord[] }): SituVerifyCheck {
  const blockingRecords = input.tasks
    .filter((task) => ["triage", "backlog", "in_progress", "in_review"].includes(task.status))
    .map((task) => ({
      targetKind: "task" as const,
      targetId: task.id,
      reason: `Task is ${task.status}.`,
    }));

  return makeCheck({
    name: "no-active-tasks",
    okSummary: "No active tasks remain.",
    failSummary: `${blockingRecords.length} active task(s) remain.`,
    blockingRecords,
  });
}

function checkNoActiveExperiments(input: {
  readonly experiments: readonly ExperimentRecord[];
}): SituVerifyCheck {
  const blockingRecords = input.experiments
    .filter((experiment) => ["planned", "running", "ready_for_review"].includes(experiment.status))
    .map((experiment) => ({
      targetKind: "experiment" as const,
      targetId: experiment.id,
      reason: `Experiment is ${experiment.status}.`,
    }));

  return makeCheck({
    name: "no-active-experiments",
    okSummary: "No active experiments remain.",
    failSummary: `${blockingRecords.length} active experiment(s) remain.`,
    blockingRecords,
  });
}

function checkAcceptedExperimentsReviewed(input: {
  readonly experiments: readonly ExperimentRecord[];
  readonly reviews: readonly ReviewRecord[];
}): SituVerifyCheck {
  const approvedExperimentIds = new Set(
    input.reviews
      .filter((review) => review.decision === "approved")
      .map((review) => review.experimentId),
  );
  const blockingRecords = input.experiments
    .filter(
      (experiment) => experiment.status === "accepted" && !approvedExperimentIds.has(experiment.id),
    )
    .map((experiment) => ({
      targetKind: "experiment" as const,
      targetId: experiment.id,
      reason: "Accepted experiment has no approved review.",
    }));

  return makeCheck({
    name: "accepted-experiments-reviewed",
    okSummary: "Accepted experiments have approved reviews.",
    failSummary: `${blockingRecords.length} accepted experiment(s) lack approved review.`,
    blockingRecords,
  });
}

function checkAcceptedExperimentsHaveEvidence(input: {
  readonly experiments: readonly ExperimentRecord[];
  readonly measurements: readonly MeasurementRecord[];
  readonly artifacts: readonly ArtifactRecord[];
}): SituVerifyCheck {
  const measuredExperimentIds = new Set(
    input.measurements.flatMap((measurement) => {
      if (measurement.experimentId === undefined) {
        return [];
      }

      return [measurement.experimentId];
    }),
  );
  const artifactExperimentIds = new Set(
    input.artifacts
      .filter((artifact) => artifact.target.targetKind === "experiment")
      .map((artifact) => artifact.target.targetId),
  );
  const blockingRecords = input.experiments
    .filter(
      (experiment) =>
        experiment.status === "accepted" &&
        !measuredExperimentIds.has(experiment.id) &&
        !artifactExperimentIds.has(experiment.id),
    )
    .map((experiment) => ({
      targetKind: "experiment" as const,
      targetId: experiment.id,
      reason: "Accepted experiment has no measurement or artifact evidence.",
    }));

  return makeCheck({
    name: "accepted-experiments-have-evidence",
    okSummary: "Accepted experiments have evidence.",
    failSummary: `${blockingRecords.length} accepted experiment(s) lack evidence.`,
    blockingRecords,
  });
}

function checkFinalReportPresent(input: {
  readonly projects: readonly ProjectRecord[];
  readonly reports: readonly ReportRecord[];
}): SituVerifyCheck {
  const projectReportIds = new Set(
    input.reports
      .filter((report) => report.target.targetKind === "project")
      .map((report) => report.target.targetId),
  );
  const blockingRecords = input.projects
    .filter((project) => !projectReportIds.has(project.id))
    .map((project) => ({
      targetKind: "project" as const,
      targetId: project.id,
      reason: "Project has no final project-targeted report.",
    }));

  return makeCheck({
    name: "final-report-present",
    okSummary: "Final project reports are present.",
    failSummary: `${blockingRecords.length} project(s) lack a final report.`,
    blockingRecords,
  });
}

function makeCheck(input: {
  readonly name: SituVerifyCheck["name"];
  readonly okSummary: string;
  readonly failSummary: string;
  readonly blockingRecords: readonly SituVerifyBlockingRecord[];
}): SituVerifyCheck {
  const ok = input.blockingRecords.length === 0;

  return {
    name: input.name,
    ok,
    summary: ok ? input.okSummary : input.failSummary,
    blockingRecords: input.blockingRecords,
  };
}

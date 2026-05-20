import {
  diffIsoTimestampsInHours,
  nowTimestamp,
  type IsoTimestamp,
  type SituId,
} from "@situ/common";
import { NotFoundError, ValidationError } from "@situ/errors";
import type { ArtifactRecord } from "@situ/artifacts";
import type { BaselineRecord } from "@situ/baselines";
import type { ExperimentRecord } from "@situ/experiments";
import type { MeasurementRecord } from "@situ/measurements";
import type { NotificationRecord } from "@situ/notifications";
import type { ProjectRecord } from "@situ/projects";
import type { ReportRecord } from "@situ/reports";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";

import { createAppActionContext, type AppActionContext } from "../actions/index.js";
import type {
  GetSituStatusInput,
  SituExperimentStatusCounts,
  SituNotificationStatusCounts,
  SituProjectStatusCounts,
  SituReviewDecisionCounts,
  SituStatusOutput,
  SituTaskStatusCounts,
  SituWorkStatusCounts,
} from "./types.js";

const defaultStaleAfterHours = 24;

/**
 * Summarizes active Situ work for a project set.
 */
export function getSituStatus(input: GetSituStatusInput): SituStatusOutput {
  validateStatusScope(input);

  const context = createAppActionContext({ database: input.database });
  const generatedAt = input.generatedAt ?? nowTimestamp();
  const staleAfterHours = input.staleAfterHours ?? defaultStaleAfterHours;
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
  const projectCounts = countProjects({ projects });
  const taskCounts = countTasks({ tasks: related.tasks });
  const experimentCounts = countExperiments({ experiments: related.experiments });
  const reviewCounts = countReviews({ reviews: related.reviews });
  const notificationCounts = countNotifications({ notifications: related.notifications });
  const staleAssignments = countStaleAssignments({
    tasks: related.tasks,
    experiments: related.experiments,
    generatedAt,
    staleAfterHours,
  });
  const work = countWork({
    tasks: taskCounts,
    experiments: experimentCounts,
    reviews: reviewCounts,
    notifications: notificationCounts,
    staleAssignments,
  });

  return {
    generatedAt,
    repositoryPath: input.repositoryPath,
    projectIds,
    projects: projectCounts,
    work,
    tasks: taskCounts,
    experiments: experimentCounts,
    notifications: notificationCounts,
    reviews: reviewCounts,
    staleAssignments,
    isIdle: work.pending === 0 && work.running === 0 && work.review === 0 && work.attention === 0,
  };
}

type StatusScopeInput = {
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
};

function validateStatusScope(input: StatusScopeInput): void {
  if (input.projectId === undefined || input.repositoryPath === undefined) {
    return;
  }

  throw new ValidationError({
    message: "Status scope accepts projectId or repositoryPath, not both.",
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
  readonly baselines: readonly BaselineRecord[];
  readonly experiments: readonly ExperimentRecord[];
  readonly measurements: readonly MeasurementRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly reports: readonly ReportRecord[];
  readonly notifications: readonly NotificationRecord[];
};

function collectRelatedRecords(input: {
  readonly context: AppActionContext;
  readonly projectIds: readonly SituId<"project">[];
}): RelatedRecords {
  if (input.projectIds.length === 0) {
    return {
      tasks: [],
      baselines: [],
      experiments: [],
      measurements: [],
      artifacts: [],
      reviews: [],
      reports: [],
      notifications: [],
    };
  }

  const projectIdSet = new Set<string>(input.projectIds);
  const tasks = input.context.repositories.tasks.list({ projectIds: input.projectIds });
  const taskIdSet = new Set(tasks.map((task) => task.id));
  const experiments = input.context.repositories.experiments
    .list()
    .filter((experiment) => projectIdSet.has(experiment.projectId));
  const experimentIdSet = new Set(experiments.map((experiment) => experiment.id));
  const baselines = input.context.repositories.baselines
    .list()
    .filter((baseline) => projectIdSet.has(baseline.projectId));
  const baselineIdSet = new Set(baselines.map((baseline) => baseline.id));
  const measurements = input.context.repositories.measurements.listAll().filter((measurement) =>
    isRelevantMeasurement({
      measurement,
      baselineIdSet,
      experimentIdSet,
    }),
  );
  const measurementIdSet = new Set(measurements.map((measurement) => measurement.id));
  const reviews = input.context.repositories.reviews
    .listAll()
    .filter((review) => experimentIdSet.has(review.experimentId));
  const reviewIdSet = new Set(reviews.map((review) => review.id));
  const reports = input.context.repositories.reports
    .listAll()
    .filter((report) => projectIdSet.has(report.projectId));
  const reportIdSet = new Set(reports.map((report) => report.id));
  const artifacts = input.context.repositories.artifacts.listAll().filter((artifact) =>
    isRelevantTarget({
      targetKind: artifact.target.targetKind,
      targetId: artifact.target.targetId,
      projectIdSet,
      taskIdSet,
      baselineIdSet,
      experimentIdSet,
      measurementIdSet,
      reviewIdSet,
      reportIdSet,
      artifactIdSet: new Set(),
    }),
  );
  const artifactIdSet = new Set(artifacts.map((artifact) => artifact.id));
  const notifications = input.context.repositories.notifications.listAll().filter((notification) =>
    isRelevantTarget({
      targetKind: notification.target.targetKind,
      targetId: notification.target.targetId,
      projectIdSet,
      taskIdSet,
      baselineIdSet,
      experimentIdSet,
      measurementIdSet,
      reviewIdSet,
      reportIdSet,
      artifactIdSet,
    }),
  );

  return {
    tasks,
    baselines,
    experiments,
    measurements,
    artifacts,
    reviews,
    reports,
    notifications,
  };
}

function isRelevantTarget(input: {
  readonly targetKind: string;
  readonly targetId: string;
  readonly projectIdSet: ReadonlySet<string>;
  readonly taskIdSet: ReadonlySet<string>;
  readonly baselineIdSet: ReadonlySet<string>;
  readonly experimentIdSet: ReadonlySet<string>;
  readonly measurementIdSet: ReadonlySet<string>;
  readonly artifactIdSet: ReadonlySet<string>;
  readonly reviewIdSet: ReadonlySet<string>;
  readonly reportIdSet: ReadonlySet<string>;
}): boolean {
  switch (input.targetKind) {
    case "project":
      return input.projectIdSet.has(input.targetId);

    case "task":
      return input.taskIdSet.has(input.targetId);

    case "baseline":
      return input.baselineIdSet.has(input.targetId);

    case "experiment":
      return input.experimentIdSet.has(input.targetId);

    case "measurement":
      return input.measurementIdSet.has(input.targetId);

    case "artifact":
      return input.artifactIdSet.has(input.targetId);

    case "review":
      return input.reviewIdSet.has(input.targetId);

    case "report":
      return input.reportIdSet.has(input.targetId);

    default:
      return false;
  }
}

function isRelevantMeasurement(input: {
  readonly measurement: MeasurementRecord;
  readonly baselineIdSet: ReadonlySet<string>;
  readonly experimentIdSet: ReadonlySet<string>;
}): boolean {
  if (
    input.measurement.baselineId !== undefined &&
    input.baselineIdSet.has(input.measurement.baselineId)
  ) {
    return true;
  }

  if (
    input.measurement.experimentId !== undefined &&
    input.experimentIdSet.has(input.measurement.experimentId)
  ) {
    return true;
  }

  return false;
}

function countProjects(input: {
  readonly projects: readonly ProjectRecord[];
}): SituProjectStatusCounts {
  return {
    active: input.projects.filter((project) => project.status === "active").length,
    archived: input.projects.filter((project) => project.status === "archived").length,
  };
}

function countTasks(input: { readonly tasks: readonly TaskRecord[] }): SituTaskStatusCounts {
  return {
    triage: input.tasks.filter((task) => task.status === "triage").length,
    backlog: input.tasks.filter((task) => task.status === "backlog").length,
    in_progress: input.tasks.filter((task) => task.status === "in_progress").length,
    in_review: input.tasks.filter((task) => task.status === "in_review").length,
    done: input.tasks.filter((task) => task.status === "done").length,
    canceled: input.tasks.filter((task) => task.status === "canceled").length,
  };
}

function countExperiments(input: {
  readonly experiments: readonly ExperimentRecord[];
}): SituExperimentStatusCounts {
  return {
    planned: input.experiments.filter((experiment) => experiment.status === "planned").length,
    running: input.experiments.filter((experiment) => experiment.status === "running").length,
    ready_for_review: input.experiments.filter(
      (experiment) => experiment.status === "ready_for_review",
    ).length,
    accepted: input.experiments.filter((experiment) => experiment.status === "accepted").length,
    rejected: input.experiments.filter((experiment) => experiment.status === "rejected").length,
    abandoned: input.experiments.filter((experiment) => experiment.status === "abandoned").length,
  };
}

function countNotifications(input: {
  readonly notifications: readonly NotificationRecord[];
}): SituNotificationStatusCounts {
  return {
    unread: input.notifications.filter(
      (notification) => notification.dismissedAt === undefined && notification.readAt === undefined,
    ).length,
    read: input.notifications.filter(
      (notification) => notification.dismissedAt === undefined && notification.readAt !== undefined,
    ).length,
    dismissed: input.notifications.filter((notification) => notification.dismissedAt !== undefined)
      .length,
  };
}

function countReviews(input: {
  readonly reviews: readonly ReviewRecord[];
}): SituReviewDecisionCounts {
  return {
    approved: input.reviews.filter((review) => review.decision === "approved").length,
    changes_requested: input.reviews.filter((review) => review.decision === "changes_requested")
      .length,
    rejected: input.reviews.filter((review) => review.decision === "rejected").length,
    commented: input.reviews.filter((review) => review.decision === "commented").length,
  };
}

function countStaleAssignments(input: {
  readonly tasks: readonly TaskRecord[];
  readonly experiments: readonly ExperimentRecord[];
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
}): number {
  let count = 0;

  for (const task of input.tasks) {
    if (
      task.assignedTo !== undefined &&
      (task.status === "in_progress" || task.status === "in_review") &&
      isOlderThanThreshold({
        updatedAt: task.metadata.updatedAt,
        generatedAt: input.generatedAt,
        staleAfterHours: input.staleAfterHours,
      })
    ) {
      count += 1;
    }
  }

  for (const experiment of input.experiments) {
    if (
      experiment.assignedTo !== undefined &&
      (experiment.status === "running" || experiment.status === "ready_for_review") &&
      isOlderThanThreshold({
        updatedAt: experiment.metadata.updatedAt,
        generatedAt: input.generatedAt,
        staleAfterHours: input.staleAfterHours,
      })
    ) {
      count += 1;
    }
  }

  return count;
}

function isOlderThanThreshold(input: {
  readonly updatedAt: IsoTimestamp;
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
}): boolean {
  return (
    diffIsoTimestampsInHours({
      earlier: input.updatedAt,
      later: input.generatedAt,
    }) > input.staleAfterHours
  );
}

function countWork(input: {
  readonly tasks: SituTaskStatusCounts;
  readonly experiments: SituExperimentStatusCounts;
  readonly reviews: SituReviewDecisionCounts;
  readonly notifications: SituNotificationStatusCounts;
  readonly staleAssignments: number;
}): SituWorkStatusCounts {
  return {
    pending: input.tasks.triage + input.tasks.backlog + input.experiments.planned,
    running: input.tasks.in_progress + input.experiments.running,
    review:
      input.tasks.in_review + input.experiments.ready_for_review + input.reviews.changes_requested,
    attention: input.notifications.unread + input.staleAssignments,
    completed:
      input.tasks.done +
      input.tasks.canceled +
      input.experiments.accepted +
      input.experiments.rejected +
      input.experiments.abandoned,
  };
}

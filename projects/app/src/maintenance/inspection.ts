import type { IsoTimestamp } from "@situ/common";
import { createSyncMetadata, diffIsoTimestampsInHours, nowTimestamp } from "@situ/common";
import { ValidationError } from "@situ/errors";
import type { ExperimentRecord, ExperimentStatus } from "@situ/experiments";
import type { TaskRecord, TaskStatus } from "@situ/tasks";

import type { AppActionContext } from "../actions/index.js";
import type {
  ExperimentStatusCounts,
  InspectMaintenanceInput,
  MaintenanceInspection,
  MaintenanceInspectionOptions,
  NormalizedMaintenanceInspectionOptions,
  NotificationInspectionCounts,
  PrimitiveRecordCounts,
  StaleAssignment,
  StaleExperimentStatus,
  StaleTaskStatus,
  TaskStatusCounts,
} from "./types.js";

const defaultStaleAfterHours = 24;

const recordPrimitives = [
  "projects",
  "tasks",
  "comments",
  "events",
  "notifications",
  "experiments",
  "measurements",
  "artifacts",
  "reviews",
  "reports",
] as const satisfies readonly (keyof PrimitiveRecordCounts)[];

const taskStatuses = [
  "triage",
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "canceled",
] as const satisfies readonly TaskStatus[];

const experimentStatuses = [
  "planned",
  "running",
  "ready_for_review",
  "accepted",
  "rejected",
  "abandoned",
] as const satisfies readonly ExperimentStatus[];

type MaintenanceRecordPrimitive = keyof PrimitiveRecordCounts;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type CountRow = {
  readonly count: number;
};

type NotificationCountsRow = {
  readonly unread: number;
  readonly read: number;
  readonly dismissed: number;
};

/**
 * Normalizes maintenance inspection options without reading application state.
 */
export function normalizeMaintenanceInspectionOptions(
  input: MaintenanceInspectionOptions = {},
): NormalizedMaintenanceInspectionOptions {
  return {
    generatedAt:
      input.now === undefined ? nowTimestamp() : createSyncMetadata({ now: input.now }).createdAt,
    staleAfterHours: normalizeStaleAfterHours({ staleAfterHours: input.staleAfterHours }),
  };
}

/**
 * Inspects existing application state without creating or mutating records.
 */
export function inspectMaintenance(input: InspectMaintenanceInput): MaintenanceInspection {
  const options = normalizeMaintenanceInspectionOptions({
    now: input.now,
    staleAfterHours: input.staleAfterHours,
  });
  const tasks = input.context.repositories.tasks.list();
  const experiments = input.context.repositories.experiments.list();

  return {
    generatedAt: options.generatedAt,
    staleAfterHours: options.staleAfterHours,
    records: countRecords({ context: input.context }),
    tasks: countTasksByStatus({ tasks }),
    experiments: countExperimentsByStatus({ experiments }),
    notifications: countNotifications({ context: input.context }),
    staleAssignments: collectStaleAssignments({
      tasks,
      experiments,
      generatedAt: options.generatedAt,
      staleAfterHours: options.staleAfterHours,
    }),
  };
}

type NormalizeStaleAfterHoursInput = {
  readonly staleAfterHours?: number;
};

function normalizeStaleAfterHours(input: NormalizeStaleAfterHoursInput): number {
  if (input.staleAfterHours === undefined) {
    return defaultStaleAfterHours;
  }

  if (Number.isFinite(input.staleAfterHours) && input.staleAfterHours > 0) {
    return input.staleAfterHours;
  }

  throw new ValidationError({
    message: "Expected a positive stale threshold in hours.",
    details: { field: "staleAfterHours" },
  });
}

function countRecords(input: { readonly context: AppActionContext }): PrimitiveRecordCounts {
  const counts = {} as Mutable<PrimitiveRecordCounts>;

  for (const primitive of recordPrimitives) {
    counts[primitive] = countRows({
      context: input.context,
      tableName: primitive,
    });
  }

  return counts;
}

function countRows(input: {
  readonly context: AppActionContext;
  readonly tableName: MaintenanceRecordPrimitive;
}): number {
  return (
    input.context.database
      .query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`)
      .get()?.count ?? 0
  );
}

function countTasksByStatus(input: { readonly tasks: readonly TaskRecord[] }): TaskStatusCounts {
  const counts = emptyTaskCounts();

  for (const task of input.tasks) {
    counts[task.status] += 1;
  }

  return counts;
}

function emptyTaskCounts(): Mutable<TaskStatusCounts> {
  const counts = {} as Mutable<TaskStatusCounts>;

  for (const status of taskStatuses) {
    counts[status] = 0;
  }

  return counts;
}

function countExperimentsByStatus(input: {
  readonly experiments: readonly ExperimentRecord[];
}): ExperimentStatusCounts {
  const counts = emptyExperimentCounts();

  for (const experiment of input.experiments) {
    counts[experiment.status] += 1;
  }

  return counts;
}

function emptyExperimentCounts(): Mutable<ExperimentStatusCounts> {
  const counts = {} as Mutable<ExperimentStatusCounts>;

  for (const status of experimentStatuses) {
    counts[status] = 0;
  }

  return counts;
}

function countNotifications(input: {
  readonly context: AppActionContext;
}): NotificationInspectionCounts {
  const row = input.context.database
    .query<NotificationCountsRow, []>(
      `
SELECT
  COALESCE(SUM(CASE WHEN dismissed_at IS NULL AND read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread,
  COALESCE(SUM(CASE WHEN dismissed_at IS NULL AND read_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS read,
  COALESCE(SUM(CASE WHEN dismissed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS dismissed
FROM notifications
`,
    )
    .get();

  return {
    unread: row?.unread ?? 0,
    read: row?.read ?? 0,
    dismissed: row?.dismissed ?? 0,
  };
}

type CollectStaleAssignmentsInput = {
  readonly tasks: readonly TaskRecord[];
  readonly experiments: readonly ExperimentRecord[];
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
};

function collectStaleAssignments(input: CollectStaleAssignmentsInput): readonly StaleAssignment[] {
  const staleAssignments: StaleAssignment[] = [];

  for (const task of input.tasks) {
    const staleAssignment = staleTaskAssignment({
      task,
      generatedAt: input.generatedAt,
      staleAfterHours: input.staleAfterHours,
    });

    if (staleAssignment !== undefined) {
      staleAssignments.push(staleAssignment);
    }
  }

  for (const experiment of input.experiments) {
    const staleAssignment = staleExperimentAssignment({
      experiment,
      generatedAt: input.generatedAt,
      staleAfterHours: input.staleAfterHours,
    });

    if (staleAssignment !== undefined) {
      staleAssignments.push(staleAssignment);
    }
  }

  return sortStaleAssignments({ staleAssignments });
}

function sortStaleAssignments(input: {
  readonly staleAssignments: readonly StaleAssignment[];
}): readonly StaleAssignment[] {
  const sorted: StaleAssignment[] = [];

  for (const assignment of input.staleAssignments) {
    const insertIndex = sorted.findIndex(
      (existingAssignment) => compareStaleAssignments(assignment, existingAssignment) < 0,
    );

    if (insertIndex === -1) {
      sorted.push(assignment);
      continue;
    }

    sorted.splice(insertIndex, 0, assignment);
  }

  return sorted;
}

type StaleTaskAssignmentInput = {
  readonly task: TaskRecord;
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
};

function staleTaskAssignment(input: StaleTaskAssignmentInput): StaleAssignment | undefined {
  if (input.task.assignedTo === undefined || !isStaleTaskStatus(input.task.status)) {
    return undefined;
  }

  const ageHours = ageHoursSince({
    now: input.generatedAt,
    timestamp: input.task.metadata.updatedAt,
  });

  if (!(ageHours > input.staleAfterHours)) {
    return undefined;
  }

  return {
    target: {
      targetKind: "task",
      targetId: input.task.id,
    },
    projectId: input.task.projectId,
    title: input.task.title,
    status: input.task.status,
    assignedTo: input.task.assignedTo,
    updatedAt: input.task.metadata.updatedAt,
    ageHours: floorToTwoDecimals(ageHours),
  };
}

type StaleExperimentAssignmentInput = {
  readonly experiment: ExperimentRecord;
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
};

function staleExperimentAssignment(
  input: StaleExperimentAssignmentInput,
): StaleAssignment | undefined {
  if (
    input.experiment.assignedTo === undefined ||
    !isStaleExperimentStatus(input.experiment.status)
  ) {
    return undefined;
  }

  const ageHours = ageHoursSince({
    now: input.generatedAt,
    timestamp: input.experiment.metadata.updatedAt,
  });

  if (!(ageHours > input.staleAfterHours)) {
    return undefined;
  }

  return {
    target: {
      targetKind: "experiment",
      targetId: input.experiment.id,
    },
    projectId: input.experiment.projectId,
    taskId: input.experiment.taskId,
    title: input.experiment.title,
    status: input.experiment.status,
    assignedTo: input.experiment.assignedTo,
    updatedAt: input.experiment.metadata.updatedAt,
    ageHours: floorToTwoDecimals(ageHours),
  };
}

function ageHoursSince(input: {
  readonly now: IsoTimestamp;
  readonly timestamp: IsoTimestamp;
}): number {
  return diffIsoTimestampsInHours({
    earlier: input.timestamp,
    later: input.now,
  });
}

function floorToTwoDecimals(value: number): number {
  return Math.floor(value * 100) / 100;
}

function isStaleTaskStatus(status: TaskStatus): status is StaleTaskStatus {
  return status === "in_progress" || status === "in_review";
}

function isStaleExperimentStatus(status: ExperimentStatus): status is StaleExperimentStatus {
  return status === "running" || status === "ready_for_review";
}

function compareStaleAssignments(left: StaleAssignment, right: StaleAssignment): number {
  const updatedAtComparison = left.updatedAt.localeCompare(right.updatedAt);

  if (updatedAtComparison !== 0) {
    return updatedAtComparison;
  }

  const targetKindComparison = left.target.targetKind.localeCompare(right.target.targetKind);

  if (targetKindComparison !== 0) {
    return targetKindComparison;
  }

  return left.target.targetId.localeCompare(right.target.targetId);
}

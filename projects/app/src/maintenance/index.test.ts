import { expect, test } from "bun:test";

import type { SituId, TargetKind, TargetRef } from "@situ/common";
import { ValidationError } from "@situ/errors";
import {
  inspectMaintenance as inspectMaintenanceFromApp,
  normalizeMaintenanceInspectionOptions as normalizeMaintenanceInspectionOptionsFromApp,
} from "@situ/app";

import { createAppActionContext } from "../actions/index.js";
import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { inspectMaintenance, normalizeMaintenanceInspectionOptions } from "./index.js";

type TestContext = ReturnType<typeof createAppActionContext>;
type TestDatabase = ReturnType<typeof openAppDatabase>;
type CountedTable =
  | "projects"
  | "tasks"
  | "comments"
  | "events"
  | "notifications"
  | "experiments"
  | "measurements"
  | "artifacts"
  | "reviews"
  | "reports";

type CountRow = {
  readonly count: number;
};

function target<TKind extends TargetKind>(
  targetKind: TKind,
  targetId: SituId<TKind>,
): TargetRef<TKind> {
  return {
    targetKind,
    targetId,
  };
}

function countRows(input: { readonly database: TestDatabase; readonly tableName: CountedTable }) {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function countTables(input: { readonly database: TestDatabase }): Record<CountedTable, number> {
  return {
    projects: countRows({ database: input.database, tableName: "projects" }),
    tasks: countRows({ database: input.database, tableName: "tasks" }),
    comments: countRows({ database: input.database, tableName: "comments" }),
    events: countRows({ database: input.database, tableName: "events" }),
    notifications: countRows({ database: input.database, tableName: "notifications" }),
    experiments: countRows({ database: input.database, tableName: "experiments" }),
    measurements: countRows({ database: input.database, tableName: "measurements" }),
    artifacts: countRows({ database: input.database, tableName: "artifacts" }),
    reviews: countRows({ database: input.database, tableName: "reviews" }),
    reports: countRows({ database: input.database, tableName: "reports" }),
  };
}

function createInspectionFixture(input: { readonly context: TestContext }): void {
  const project = input.context.repositories.projects.create({
    id: "project_maintenance" as SituId<"project">,
    name: "Maintenance Project",
    repositoryPath: "/tmp/maintenance-project",
    goalMarkdown: "Exercise maintenance inspection.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-10T12:00:00.000Z",
  });
  const oldestTask = input.context.repositories.tasks.create({
    id: "task_maintenance_oldest" as SituId<"task">,
    projectId: project.id,
    title: "Oldest stale task",
    bodyMarkdown: "This task is oldest.",
    status: "in_review",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-1",
      displayName: "Worker 1",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-11T12:00:00.000Z",
  });
  const tiedTask = input.context.repositories.tasks.create({
    id: "task_maintenance_tied" as SituId<"task">,
    projectId: project.id,
    title: "Tied stale task",
    bodyMarkdown: "This task ties an experiment timestamp.",
    status: "in_progress",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-2",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-12T10:52:15.600Z",
  });
  input.context.repositories.tasks.create({
    id: "task_maintenance_boundary" as SituId<"task">,
    projectId: project.id,
    title: "Boundary task",
    bodyMarkdown: "Exactly at the stale threshold.",
    status: "in_progress",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-3",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-12T12:00:00.000Z",
  });
  input.context.repositories.tasks.create({
    id: "task_maintenance_done" as SituId<"task">,
    projectId: project.id,
    title: "Completed assigned task",
    bodyMarkdown: "Done work should not be stale.",
    status: "done",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-4",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-11T10:00:00.000Z",
  });
  const tiedExperiment = input.context.repositories.experiments.create({
    id: "experiment_maintenance_tied" as SituId<"experiment">,
    projectId: project.id,
    taskId: tiedTask.id,
    title: "Tied stale experiment",
    summaryMarkdown: "This experiment ties a task timestamp.",
    status: "running",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-5",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-12T10:52:15.600Z",
  });
  input.context.repositories.experiments.create({
    id: "experiment_maintenance_review" as SituId<"experiment">,
    projectId: project.id,
    taskId: oldestTask.id,
    title: "Ready stale experiment",
    summaryMarkdown: "Ready for review work is active.",
    status: "ready_for_review",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-6",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-12T09:00:00.000Z",
  });
  input.context.repositories.experiments.create({
    id: "experiment_maintenance_accepted" as SituId<"experiment">,
    projectId: project.id,
    taskId: oldestTask.id,
    title: "Accepted experiment",
    summaryMarkdown: "Accepted work should not be stale.",
    status: "accepted",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-7",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-11T09:00:00.000Z",
  });

  input.context.repositories.comments.create({
    id: "comment_maintenance" as SituId<"comment">,
    target: target("task", oldestTask.id),
    bodyMarkdown: "Maintenance comment.",
    author: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T08:00:00.000Z",
  });
  input.context.repositories.events.create({
    id: "event_maintenance" as SituId<"event">,
    target: target("task", oldestTask.id),
    actor: {
      actorKind: "human",
      actorId: "scott",
    },
    summaryMarkdown: "Maintenance event.",
    now: "2026-05-13T08:01:00.000Z",
  });
  input.context.repositories.measurements.create({
    id: "measurement_maintenance" as SituId<"measurement">,
    experimentId: tiedExperiment.id,
    revisionNumber: 1,
    metricName: "latency_ms",
    numericValue: 12,
    summaryMarkdown: "Measurement summary.",
    measuredBy: {
      actorKind: "local_agent",
      actorId: "measurer-1",
    },
    now: "2026-05-13T08:02:00.000Z",
  });
  input.context.repositories.artifacts.create({
    id: "artifact_maintenance" as SituId<"artifact">,
    target: target("experiment", tiedExperiment.id),
    title: "Maintenance artifact",
    summaryMarkdown: "Artifact summary.",
    uri: "file:///tmp/maintenance-artifact.txt",
    createdBy: {
      actorKind: "local_agent",
      actorId: "worker-5",
    },
    now: "2026-05-13T08:03:00.000Z",
  });
  input.context.repositories.reviews.create({
    id: "review_maintenance" as SituId<"review">,
    experimentId: tiedExperiment.id,
    revisionNumber: 1,
    decision: "commented",
    bodyMarkdown: "Review body.",
    reviewer: {
      actorKind: "human",
      actorId: "reviewer-1",
    },
    now: "2026-05-13T08:04:00.000Z",
  });
  input.context.repositories.reports.create({
    id: "report_maintenance" as SituId<"report">,
    projectId: project.id,
    target: target("experiment", tiedExperiment.id),
    title: "Maintenance report",
    bodyMarkdown: "Report body.",
    generatedBy: {
      actorKind: "local_agent",
      actorId: "reporter-1",
    },
    now: "2026-05-13T08:05:00.000Z",
  });

  input.context.repositories.notifications.create({
    id: "notification_maintenance_unread" as SituId<"notification">,
    recipient: {
      recipientId: "worker-1",
    },
    target: target("task", oldestTask.id),
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    summaryMarkdown: "Unread notification.",
    now: "2026-05-13T08:06:00.000Z",
  });
  const readNotification = input.context.repositories.notifications.create({
    id: "notification_maintenance_read" as SituId<"notification">,
    recipient: {
      recipientId: "worker-2",
    },
    target: target("task", tiedTask.id),
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    summaryMarkdown: "Read notification.",
    now: "2026-05-13T08:07:00.000Z",
  });
  input.context.repositories.notifications.markRead({
    id: readNotification.id,
    now: "2026-05-13T08:08:00.000Z",
  });
  const dismissedNotification = input.context.repositories.notifications.create({
    id: "notification_maintenance_dismissed" as SituId<"notification">,
    recipient: {
      recipientId: "worker-3",
    },
    target: target("experiment", tiedExperiment.id),
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    summaryMarkdown: "Dismissed notification.",
    now: "2026-05-13T08:09:00.000Z",
  });
  input.context.repositories.notifications.markRead({
    id: dismissedNotification.id,
    now: "2026-05-13T08:10:00.000Z",
  });
  input.context.repositories.notifications.dismiss({
    id: dismissedNotification.id,
    now: "2026-05-13T08:11:00.000Z",
  });
}

test("exports the maintenance API from @situ/app", () => {
  expect(inspectMaintenanceFromApp).toBe(inspectMaintenance);
  expect(normalizeMaintenanceInspectionOptionsFromApp).toBe(normalizeMaintenanceInspectionOptions);
});

test("normalizes maintenance inspection options without a database", () => {
  expect(
    normalizeMaintenanceInspectionOptions({
      now: "2026-05-14T08:30:15.250-07:00",
      staleAfterHours: 12.5,
    }),
  ).toEqual({
    generatedAt: "2026-05-14T15:30:15.250Z",
    staleAfterHours: 12.5,
  });
  expect(normalizeMaintenanceInspectionOptions({ staleAfterHours: 6 }).staleAfterHours).toBe(6);
});

test("inspects maintenance state without mutating domain records", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    createInspectionFixture({ context });
    const beforeCounts = countTables({ database });
    const inspection = inspectMaintenance({
      context,
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(inspection.generatedAt).toBe("2026-05-13T12:00:00.000Z");
    expect(inspection.staleAfterHours).toBe(24);
    expect(Object.keys(inspection.records)).toEqual([
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
    ]);
    expect(inspection.records).toEqual({
      projects: 1,
      tasks: 4,
      comments: 1,
      events: 1,
      notifications: 3,
      experiments: 3,
      measurements: 1,
      artifacts: 1,
      reviews: 1,
      reports: 1,
    });
    expect(Object.keys(inspection.tasks)).toEqual([
      "triage",
      "backlog",
      "in_progress",
      "in_review",
      "done",
      "canceled",
    ]);
    expect(inspection.tasks).toEqual({
      triage: 0,
      backlog: 0,
      in_progress: 2,
      in_review: 1,
      done: 1,
      canceled: 0,
    });
    expect(Object.keys(inspection.experiments)).toEqual([
      "planned",
      "running",
      "ready_for_review",
      "accepted",
      "rejected",
      "abandoned",
    ]);
    expect(inspection.experiments).toEqual({
      planned: 0,
      running: 1,
      ready_for_review: 1,
      accepted: 1,
      rejected: 0,
      abandoned: 0,
    });
    expect(inspection.notifications).toEqual({
      unread: 1,
      read: 1,
      dismissed: 1,
    });
    expect(
      inspection.staleAssignments.map((assignment) => [
        assignment.target.targetKind,
        assignment.target.targetId,
        assignment.ageHours,
      ]),
    ).toEqual([
      ["task", "task_maintenance_oldest", 48],
      ["experiment", "experiment_maintenance_review", 27],
      ["experiment", "experiment_maintenance_tied", 25.12],
      ["task", "task_maintenance_tied", 25.12],
    ]);
    expect(inspection.staleAssignments[2]).toMatchObject({
      target: {
        targetKind: "experiment",
        targetId: "experiment_maintenance_tied",
      },
      projectId: "project_maintenance",
      taskId: "task_maintenance_tied",
      title: "Tied stale experiment",
      status: "running",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-5",
      },
      updatedAt: "2026-05-12T10:52:15.600Z",
      ageHours: 25.12,
    });
    expect(countTables({ database })).toEqual(beforeCounts);
  } finally {
    database.close();
  }
});

test("honors a caller-provided stale threshold", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    createInspectionFixture({ context });
    const inspection = inspectMaintenance({
      context,
      now: "2026-05-13T12:00:00.000Z",
      staleAfterHours: 26,
    });

    expect(inspection.staleAfterHours).toBe(26);
    expect(inspection.staleAssignments.map((assignment) => assignment.target.targetId)).toEqual([
      "task_maintenance_oldest",
      "experiment_maintenance_review",
    ]);
  } finally {
    database.close();
  }
});

test("validates maintenance inspection options", () => {
  expect(() =>
    normalizeMaintenanceInspectionOptions({
      now: "not a timestamp",
    }),
  ).toThrow(ValidationError);

  for (const staleAfterHours of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
    expect(() =>
      normalizeMaintenanceInspectionOptions({
        staleAfterHours,
      }),
    ).toThrow(ValidationError);
  }
});

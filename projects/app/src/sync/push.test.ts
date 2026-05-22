import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ErrorKind, ValidationError } from "@situ/errors";

import { createAppActionContext } from "../actions/index.js";
import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { getLastMutationId } from "./client-mutations.js";
import { processReplicachePull } from "./pull.js";
import { processReplicachePush } from "./push.js";
import type { ReplicachePushRequest } from "./types.js";
import { parseReplicachePushRequest } from "./validation.js";

type CountRow = {
  readonly count: number;
};

type TableNameRow = {
  readonly name: string;
};

function push(input: {
  readonly mutations: ReplicachePushRequest["mutations"];
}): ReplicachePushRequest {
  return {
    pushVersion: 1,
    clientGroupID: "client-group-1",
    profileID: "profile-1",
    schemaVersion: "schema-1",
    mutations: input.mutations,
  };
}

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName:
    | "projects"
    | "tasks"
    | "comments"
    | "events"
    | "notifications"
    | "baselines"
    | "experiments"
    | "measurements"
    | "artifacts"
    | "reports"
    | "reviews";
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function listRuntimeOrSchedulerTables(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
}): readonly string[] {
  return input.database
    .query<TableNameRow, []>(
      `
SELECT name
FROM sqlite_master
WHERE type = 'table' AND (name LIKE '%runtime%' OR name LIKE '%scheduler%')
ORDER BY name ASC
`,
    )
    .all()
    .map((row) => row.name);
}

function createProjectAndTask(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly projectId?: SituId<"project">;
  readonly taskId?: SituId<"task">;
}): void {
  const context = createAppActionContext({ database: input.database });
  const project = context.repositories.projects.create({
    id: input.projectId ?? ("project_sync_experiment_parent" as SituId<"project">),
    name: "Experiment Parent Project",
    repositoryPath: "/tmp/sync-experiment-parent",
    goalMarkdown: "Support experiment sync tests.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
  });

  context.repositories.tasks.create({
    id: input.taskId ?? ("task_sync_experiment_parent" as SituId<"task">),
    projectId: project.id,
    title: "Experiment Parent Task",
    bodyMarkdown: "Support experiment sync tests.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
  });
}

function createProject(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly projectId?: SituId<"project">;
}): void {
  const context = createAppActionContext({ database: input.database });

  context.repositories.projects.create({
    id: input.projectId ?? ("project_sync_report_parent" as SituId<"project">),
    name: "Report Parent Project",
    repositoryPath: "/tmp/sync-report-parent",
    goalMarkdown: "Support report sync tests.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
  });
}

function createProjectTaskAndExperiment(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly projectId?: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly experimentId?: SituId<"experiment">;
}): void {
  const projectId = input.projectId ?? ("project_sync_evidence_parent" as SituId<"project">);
  const taskId = input.taskId ?? ("task_sync_evidence_parent" as SituId<"task">);
  const context = createAppActionContext({ database: input.database });

  createProjectAndTask({
    database: input.database,
    projectId,
    taskId,
  });
  context.repositories.experiments.create({
    id: input.experimentId ?? ("experiment_sync_evidence_parent" as SituId<"experiment">),
    projectId,
    taskId,
    title: "Evidence Parent Experiment",
    summaryMarkdown: "Support evidence sync tests.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
  });
}

test("processes project and task mutations in order", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {
              id: "project_sync_1",
              eventId: "event_sync_project_1",
              name: "Sync Project",
              repositoryPath: "/tmp/sync-project",
              goalMarkdown: "Exercise sync project creation",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:00:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "tasks.create",
            args: {
              id: "task_sync_1",
              eventId: "event_sync_task_1",
              projectId: "project_sync_1",
              title: "Sync Task",
              bodyMarkdown: "Exercise sync task creation",
              status: "backlog",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              assignedTo: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:01:00.000Z",
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "tasks.move",
            args: {
              id: "task_sync_1",
              eventId: "event_sync_task_move_1",
              status: "in_progress",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:02:00.000Z",
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 3,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "projects" })).toBe(1);
    expect(countRows({ database, tableName: "tasks" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(3);
    expect(countRows({ database, tableName: "notifications" })).toBe(1);
    const context = createAppActionContext({ database });
    const notification = context.repositories.notifications.listAll()[0];

    expect(
      context.repositories.tasks.getById({
        id: "task_sync_1" as SituId<"task">,
      })?.status,
    ).toBe("in_progress");
    expect(notification?.id.startsWith("notification_")).toBe(true);
    expect(notification).toEqual({
      id: notification?.id,
      recipient: {
        recipientId: "worker-1",
        displayName: undefined,
      },
      target: {
        targetKind: "task",
        targetId: "task_sync_1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: undefined,
      },
      summaryMarkdown: "Assigned task: Sync Task",
      bodyMarkdown: undefined,
      readAt: undefined,
      dismissedAt: undefined,
      metadata: {
        createdAt: "2026-05-13T12:01:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(3);
  } finally {
    database.close();
  }
});

test("processes tasks.create without assignment and creates no notification", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_unassigned_task" as SituId<"project">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "tasks.create",
            args: {
              id: "task_sync_unassigned",
              eventId: "event_sync_unassigned",
              projectId: "project_sync_unassigned_task",
              title: "Unassigned Sync Task",
              bodyMarkdown: "Exercise sync task creation without assignment.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:01:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "tasks" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("processes projects.archive with the exact lifecycle event and client state", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_archive" as SituId<"project">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.archive",
            args: {
              id: "project_sync_archive",
              eventId: "event_sync_project_archive",
              actor: {
                actorKind: "human",
                actorId: "scott",
                displayName: "Scott",
              },
              now: "2026-05-13T12:10:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.getById({
      id: "project_sync_archive" as SituId<"project">,
    });
    const event = context.repositories.events.getById({
      id: "event_sync_project_archive" as SituId<"event">,
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(project?.status).toBe("archived");
    expect(project?.metadata.updatedAt).toBe("2026-05-13T12:10:00.000Z");
    expect(event).toEqual({
      id: "event_sync_project_archive",
      target: {
        targetKind: "project",
        targetId: "project_sync_archive",
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      summaryMarkdown: "Archived project",
      metadata: {
        createdAt: "2026-05-13T12:10:00.000Z",
        updatedAt: "2026-05-13T12:10:00.000Z",
      },
    });
    expect(countRows({ database, tableName: "projects" })).toBe(1);
    expect(countRows({ database, tableName: "tasks" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(countRows({ database, tableName: "comments" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(countRows({ database, tableName: "reports" })).toBe(0);
    expect(countRows({ database, tableName: "experiments" })).toBe(0);
    expect(countRows({ database, tableName: "measurements" })).toBe(0);
    expect(countRows({ database, tableName: "artifacts" })).toBe(0);
    expect(countRows({ database, tableName: "reviews" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("processes tasks.assign with exact assignment and clear-assignee events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectAndTask({
      database,
      projectId: "project_sync_assign" as SituId<"project">,
      taskId: "task_sync_assign" as SituId<"task">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "tasks.assign",
            args: {
              id: "task_sync_assign",
              eventId: "event_sync_task_assign",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              assignedTo: {
                actorKind: "local_agent",
                actorId: "worker-1",
                displayName: "Worker One",
              },
              now: "2026-05-13T12:11:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "tasks.assign",
            args: {
              id: "task_sync_assign",
              eventId: "event_sync_task_clear_assignee",
              actor: {
                actorKind: "human",
                actorId: "scott",
                displayName: "Scott",
              },
              now: "2026-05-13T12:12:00.000Z",
            },
            timestamp: 2,
          },
        ],
      }),
    });
    const context = createAppActionContext({ database });
    const task = context.repositories.tasks.getById({
      id: "task_sync_assign" as SituId<"task">,
    });
    const assignEvent = context.repositories.events.getById({
      id: "event_sync_task_assign" as SituId<"event">,
    });
    const clearEvent = context.repositories.events.getById({
      id: "event_sync_task_clear_assignee" as SituId<"event">,
    });
    const notification = context.repositories.notifications.listAll()[0];

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 2,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(task?.assignedTo).toBeUndefined();
    expect(task?.metadata.updatedAt).toBe("2026-05-13T12:12:00.000Z");
    expect(assignEvent).toEqual({
      id: "event_sync_task_assign",
      target: {
        targetKind: "task",
        targetId: "task_sync_assign",
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Assigned task to Worker One",
      metadata: {
        createdAt: "2026-05-13T12:11:00.000Z",
        updatedAt: "2026-05-13T12:11:00.000Z",
      },
    });
    expect(clearEvent).toEqual({
      id: "event_sync_task_clear_assignee",
      target: {
        targetKind: "task",
        targetId: "task_sync_assign",
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      summaryMarkdown: "Cleared task assignee",
      metadata: {
        createdAt: "2026-05-13T12:12:00.000Z",
        updatedAt: "2026-05-13T12:12:00.000Z",
      },
    });
    expect(countRows({ database, tableName: "projects" })).toBe(1);
    expect(countRows({ database, tableName: "tasks" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(2);
    expect(countRows({ database, tableName: "comments" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(1);
    expect(notification?.id.startsWith("notification_")).toBe(true);
    expect(notification).toEqual({
      id: notification?.id,
      recipient: {
        recipientId: "worker-1",
        displayName: "Worker One",
      },
      target: {
        targetKind: "task",
        targetId: "task_sync_assign",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: undefined,
      },
      summaryMarkdown: "Assigned task: Experiment Parent Task",
      bodyMarkdown: undefined,
      readAt: undefined,
      dismissedAt: undefined,
      metadata: {
        createdAt: "2026-05-13T12:11:00.000Z",
        updatedAt: "2026-05-13T12:11:00.000Z",
      },
    });
    expect(countRows({ database, tableName: "reports" })).toBe(0);
    expect(countRows({ database, tableName: "experiments" })).toBe(0);
    expect(countRows({ database, tableName: "measurements" })).toBe(0);
    expect(countRows({ database, tableName: "artifacts" })).toBe(0);
    expect(countRows({ database, tableName: "reviews" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("processes comments.create without events and advances client state", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "comments.create",
            args: {
              id: "comment_sync_1",
              target: {
                targetKind: "task",
                targetId: "task_sync_target",
              },
              bodyMarkdown: "Ready for review.",
              author: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:03:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });
    const comment = createAppActionContext({ database }).repositories.comments.getById({
      id: "comment_sync_1" as SituId<"comment">,
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(comment?.bodyMarkdown).toBe("Ready for review.");
    expect(comment?.target).toEqual({
      targetKind: "task",
      targetId: "task_sync_target",
    });
    expect(countRows({ database, tableName: "comments" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("processes notification create, read, and dismiss mutations in order without events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "notifications.create",
            args: {
              id: "notification_sync_1",
              recipient: {
                recipientId: "scott",
              },
              target: {
                targetKind: "task",
                targetId: "task_sync_target",
              },
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Worker handed off a task.",
              bodyMarkdown: "Please inspect the target task.",
              now: "2026-05-13T12:04:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "notifications.read",
            args: {
              id: "notification_sync_1",
              now: "2026-05-13T12:05:00.000Z",
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "notifications.dismiss",
            args: {
              id: "notification_sync_1",
              now: "2026-05-13T12:06:00.000Z",
            },
            timestamp: 3,
          },
        ],
      }),
    });
    const notification = createAppActionContext({ database }).repositories.notifications.getById({
      id: "notification_sync_1" as SituId<"notification">,
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 3,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(notification?.summaryMarkdown).toBe("Worker handed off a task.");
    expect(notification?.bodyMarkdown).toBe("Please inspect the target task.");
    expect(notification?.readAt).toBe("2026-05-13T12:05:00.000Z");
    expect(notification?.dismissedAt).toBe("2026-05-13T12:06:00.000Z");
    expect(notification?.metadata.updatedAt).toBe("2026-05-13T12:06:00.000Z");
    expect(countRows({ database, tableName: "notifications" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(3);
  } finally {
    database.close();
  }
});

test("processes events.create without side effects and advances client state", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {
              id: "event_sync_1",
              target: {
                targetKind: "task",
                targetId: "task_sync_missing_target",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
                displayName: "  Worker 1  ",
              },
              summaryMarkdown: "  Added a visible note.  ",
              bodyMarkdown: "  Details for the timeline.  ",
              now: "2026-05-13T12:07:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });
    const event = createAppActionContext({ database }).repositories.events.getById({
      id: "event_sync_1" as SituId<"event">,
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(event).toEqual({
      id: "event_sync_1",
      target: {
        targetKind: "task",
        targetId: "task_sync_missing_target",
      },
      actor: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      summaryMarkdown: "Added a visible note.",
      bodyMarkdown: "Details for the timeline.",
      metadata: {
        createdAt: "2026-05-13T12:07:00.000Z",
        updatedAt: "2026-05-13T12:07:00.000Z",
      },
    });
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(countRows({ database, tableName: "comments" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(countRows({ database, tableName: "reports" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks malformed event args as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {
              id: "event_sync_malformed",
              target: {
                targetKind: "task",
                targetId: "task_sync_malformed",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "   ",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "events.create",
            args: {
              id: "event_sync_malformed_now",
              target: {
                targetKind: "task",
                targetId: "task_sync_malformed",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Malformed timestamp.",
              now: "not-a-timestamp",
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("makes permanent mutation acknowledgements visible to incremental pulls", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const initialPull = processReplicachePull({
      database,
      pullRequest: {
        pullVersion: 1,
        clientGroupID: "client-group-1",
        cookie: null,
        profileID: "profile-1",
        schemaVersion: "schema-1",
      },
    });
    const pushResult = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {
              id: "event_sync_permanent_ack",
              target: {
                targetKind: "task",
                targetId: "task_sync_permanent_ack",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "   ",
            },
            timestamp: 1,
          },
        ],
      }),
    });
    const incrementalPull = processReplicachePull({
      database,
      pullRequest: {
        pullVersion: 1,
        clientGroupID: "client-group-1",
        cookie: initialPull.cookie,
        profileID: "profile-1",
        schemaVersion: "schema-1",
      },
    });

    expect(pushResult.permanentErrorCount).toBe(1);
    expect(incrementalPull.lastMutationIDChanges).toEqual({
      "client-1": 1,
    });
    expect(incrementalPull.patch).toEqual([]);
  } finally {
    database.close();
  }
});

test("marks blank optional event bodyMarkdown as a permanent validation error", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {
              id: "event_sync_blank_body",
              target: {
                targetKind: "task",
                targetId: "task_sync_blank_body",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Visible note.",
              bodyMarkdown: "   ",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Validation);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks duplicate event ids as permanent conflict errors without duplicate rows", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {
              id: "event_sync_duplicate_create",
              target: {
                targetKind: "task",
                targetId: "task_sync_duplicate_event",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Original event.",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 2,
            name: "events.create",
            args: {
              id: "event_sync_duplicate_create",
              target: {
                targetKind: "task",
                targetId: "task_sync_duplicate_event",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-2",
              },
              summaryMarkdown: "Duplicate event.",
            },
            timestamp: 2,
          },
        ],
      }),
    });
    const event = createAppActionContext({ database }).repositories.events.getById({
      id: "event_sync_duplicate_create" as SituId<"event">,
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Conflict);
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(event?.summaryMarkdown).toBe("Original event.");
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("skips old and future event mutations without validation or state changes", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {
              id: "event_sync_skip",
              target: {
                targetKind: "task",
                targetId: "task_sync_skip_event",
              },
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Created event.",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "events.create",
            args: {},
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "events.create",
            args: {
              id: "event_sync_future",
              target: {
                targetKind: "task",
                targetId: "task_sync_future_event",
              },
              actor: {
                actorKind: "invalid",
                actorId: "worker-1",
              },
              summaryMarkdown: "This future event should be skipped.",
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("processes experiment create, move, assign, and revise mutations in order", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectAndTask({
      database,
      projectId: "project_sync_experiment_1" as SituId<"project">,
      taskId: "task_sync_experiment_1" as SituId<"task">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.create",
            args: {
              id: "experiment_sync_1",
              eventId: "event_sync_experiment_create_1",
              projectId: "project_sync_experiment_1",
              taskId: "task_sync_experiment_1",
              title: "Try a sync experiment",
              summaryMarkdown: "Initial plan.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              assignedTo: {
                actorKind: "local_agent",
                actorId: "worker-1",
                displayName: "Worker 1",
              },
              status: "planned",
              baseRef: "main",
              branchName: "sync-experiment",
              worktreePath: "/tmp/sync-experiment",
              now: "2026-05-13T12:10:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "experiments.move",
            args: {
              id: "experiment_sync_1",
              eventId: "event_sync_experiment_move_1",
              status: "running",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:11:00.000Z",
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "experiments.assign",
            args: {
              id: "experiment_sync_1",
              eventId: "event_sync_experiment_assign_1",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:12:00.000Z",
            },
            timestamp: 3,
          },
          {
            clientID: "client-1",
            id: 4,
            name: "experiments.revise",
            args: {
              id: "experiment_sync_1",
              eventId: "event_sync_experiment_revise_1",
              summaryMarkdown: "Updated plan.",
              status: "ready_for_review",
              clearBaseRef: true,
              clearBranchName: true,
              clearWorktreePath: true,
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:13:00.000Z",
            },
            timestamp: 4,
          },
        ],
      }),
    });
    const context = createAppActionContext({ database });
    const experiment = context.repositories.experiments.getById({
      id: "experiment_sync_1" as SituId<"experiment">,
    });
    const events = context.repositories.events.listForTarget({
      target: {
        targetKind: "experiment",
        targetId: "experiment_sync_1",
      },
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 4,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(experiment).toMatchObject({
      id: "experiment_sync_1",
      status: "ready_for_review",
      revisionNumber: 2,
      summaryMarkdown: "Updated plan.",
      assignedTo: undefined,
      baseRef: undefined,
      branchName: undefined,
      worktreePath: undefined,
    });
    expect(events.map((event) => event.summaryMarkdown)).toEqual([
      "Created experiment",
      "Moved experiment to running",
      "Cleared experiment assignee",
      "Revised experiment to revision 2",
    ]);
    expect(countRows({ database, tableName: "experiments" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(4);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(4);
  } finally {
    database.close();
  }
});

test("marks malformed experiment args as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.create",
            args: {
              projectId: "project_sync_experiment_missing_id",
              taskId: "task_sync_experiment_missing_id",
              title: "Missing id",
              summaryMarkdown: "Missing id.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "experiments.move",
            args: {
              id: "experiment_sync_malformed",
              status: "unknown",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "experiments.assign",
            args: {
              id: "experiment_sync_malformed",
              actor: {
                actorKind: "bot",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
          {
            clientID: "client-1",
            id: 4,
            name: "experiments.revise",
            args: {
              id: "experiment_sync_malformed",
              clearBaseRef: "yes",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 4,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(4);
    expect(result.permanentErrorCount).toBe(4);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "experiments" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(4);
  } finally {
    database.close();
  }
});

test("rolls back experiment create when parent rows are missing", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.create",
            args: {
              id: "experiment_sync_missing_parent",
              eventId: "event_sync_missing_parent",
              projectId: "project_sync_missing_parent",
              taskId: "task_sync_missing_parent",
              title: "Missing parent experiment",
              summaryMarkdown: "This should not persist.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Conflict);
    expect(countRows({ database, tableName: "experiments" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks nonexistent experiment updates as permanent not-found errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.move",
            args: {
              id: "experiment_sync_missing",
              status: "running",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "experiments.assign",
            args: {
              id: "experiment_sync_missing",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "experiments.revise",
            args: {
              id: "experiment_sync_missing",
              summaryMarkdown: "Missing experiment.",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(3);
    expect(result.permanentErrorCount).toBe(3);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.NotFound,
      ErrorKind.NotFound,
      ErrorKind.NotFound,
    ]);
    expect(countRows({ database, tableName: "experiments" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(3);
  } finally {
    database.close();
  }
});

test("invalid experiment revise combinations do not change the experiment", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectAndTask({
      database,
      projectId: "project_sync_invalid_revise" as SituId<"project">,
      taskId: "task_sync_invalid_revise" as SituId<"task">,
    });
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.create",
            args: {
              id: "experiment_sync_invalid_revise",
              projectId: "project_sync_invalid_revise",
              taskId: "task_sync_invalid_revise",
              title: "Invalid revise experiment",
              summaryMarkdown: "Initial summary.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              baseRef: "main",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 2,
            name: "experiments.revise",
            args: {
              id: "experiment_sync_invalid_revise",
              baseRef: "next",
              clearBaseRef: true,
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "experiments.revise",
            args: {
              id: "experiment_sync_invalid_revise",
              clearBaseRef: false,
              clearBranchName: false,
              clearWorktreePath: false,
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
        ],
      }),
    });
    const experiment = createAppActionContext({ database }).repositories.experiments.getById({
      id: "experiment_sync_invalid_revise" as SituId<"experiment">,
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(experiment?.revisionNumber).toBe(1);
    expect(experiment?.baseRef).toBe("main");
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(3);
  } finally {
    database.close();
  }
});

test("skips old and future experiment mutations", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectAndTask({
      database,
      projectId: "project_sync_experiment_skip" as SituId<"project">,
      taskId: "task_sync_experiment_skip" as SituId<"task">,
    });
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.create",
            args: {
              id: "experiment_sync_skip",
              projectId: "project_sync_experiment_skip",
              taskId: "task_sync_experiment_skip",
              title: "Skipped experiment",
              summaryMarkdown: "This experiment should be created.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "experiments.move",
            args: {},
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "experiments.move",
            args: {
              id: "experiment_sync_skip",
              status: "running",
              actor: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
        ],
      }),
    });
    const experiment = createAppActionContext({ database }).repositories.experiments.getById({
      id: "experiment_sync_skip" as SituId<"experiment">,
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(experiment?.status).toBe("planned");
    expect(countRows({ database, tableName: "experiments" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("processes evidence create mutations and advances client state without events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectTaskAndExperiment({
      database,
      experimentId: "experiment_sync_evidence_1" as SituId<"experiment">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {
              id: "measurement_sync_1",
              experimentId: "experiment_sync_evidence_1",
              revisionNumber: 1,
              metricName: "duration",
              numericValue: 12.5,
              unit: "seconds",
              summaryMarkdown: "Command completed quickly.",
              detailsMarkdown: "Ran once against fixture input.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:20:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "artifacts.create",
            args: {
              id: "artifact_sync_1",
              target: {
                targetKind: "experiment",
                targetId: "experiment_sync_evidence_1",
              },
              title: "Run log",
              summaryMarkdown: "Captured command output.",
              uri: "file:///tmp/situ/run.log",
              mediaType: "text/plain",
              byteSize: 42,
              sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:21:00.000Z",
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "reviews.create",
            args: {
              id: "review_sync_1",
              experimentId: "experiment_sync_evidence_1",
              revisionNumber: 1,
              decision: "approved",
              bodyMarkdown: "Evidence looks good.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:22:00.000Z",
            },
            timestamp: 3,
          },
        ],
      }),
    });
    const context = createAppActionContext({ database });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 3,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(
      context.repositories.measurements.getById({
        id: "measurement_sync_1" as SituId<"measurement">,
      })?.numericValue,
    ).toBe(12.5);
    expect(
      context.repositories.artifacts.getById({
        id: "artifact_sync_1" as SituId<"artifact">,
      })?.target,
    ).toEqual({
      targetKind: "experiment",
      targetId: "experiment_sync_evidence_1",
    });
    expect(
      context.repositories.reviews.getById({
        id: "review_sync_1" as SituId<"review">,
      })?.decision,
    ).toBe("approved");
    expect(countRows({ database, tableName: "measurements" })).toBe(1);
    expect(countRows({ database, tableName: "artifacts" })).toBe(1);
    expect(countRows({ database, tableName: "reviews" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(3);
  } finally {
    database.close();
  }
});

test("processes baseline create and move mutations with events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_baseline_parent" as SituId<"project">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "baselines.create",
            args: {
              id: "baseline_sync_1",
              eventId: "event_baseline_sync_created",
              projectId: "project_sync_baseline_parent",
              title: "Native baseline",
              summaryMarkdown: "Unmodified harness output.",
              createdBy: {
                actorKind: "local_agent",
                actorId: "baseline-manager",
              },
              now: "2026-05-13T12:20:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "baselines.move",
            args: {
              id: "baseline_sync_1",
              eventId: "event_baseline_sync_moved",
              status: "superseded",
              actor: {
                actorKind: "local_agent",
                actorId: "baseline-manager",
              },
              now: "2026-05-13T12:21:00.000Z",
            },
            timestamp: 2,
          },
        ],
      }),
    });
    const context = createAppActionContext({ database });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 2,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(
      context.repositories.baselines.getById({
        id: "baseline_sync_1" as SituId<"baseline">,
      })?.status,
    ).toBe("superseded");
    expect(countRows({ database, tableName: "baselines" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(2);
  } finally {
    database.close();
  }
});

test("processes baseline measurement mutations", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    createProject({
      database,
      projectId: "project_sync_baseline_measurement_parent" as SituId<"project">,
    });
    context.repositories.baselines.create({
      id: "baseline_sync_measurement_parent" as SituId<"baseline">,
      projectId: "project_sync_baseline_measurement_parent" as SituId<"project">,
      title: "Native baseline",
      summaryMarkdown: "Unmodified harness output.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {
              id: "measurement_sync_baseline_1",
              baselineId: "baseline_sync_measurement_parent",
              metricName: "dev_accuracy",
              numericValue: 0.74,
              summaryMarkdown: "Baseline dev accuracy.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "baseline-manager",
              },
              now: "2026-05-13T12:20:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(
      context.repositories.measurements.getById({
        id: "measurement_sync_baseline_1" as SituId<"measurement">,
      })?.baselineId,
    ).toBe("baseline_sync_measurement_parent");
    expect(countRows({ database, tableName: "measurements" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(0);
  } finally {
    database.close();
  }
});

test("marks malformed evidence args as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {
              experimentId: "experiment_sync_evidence_missing",
              revisionNumber: 1,
              metricName: "duration",
              numericValue: 1,
              summaryMarkdown: "Missing measurement id.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "measurements.create",
            args: {
              id: "measurement_sync_malformed",
              experimentId: "experiment_sync_evidence_missing",
              revisionNumber: 0,
              metricName: "duration",
              numericValue: 1,
              summaryMarkdown: "Invalid revision.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "artifacts.create",
            args: {
              target: {
                targetKind: "experiment",
                targetId: "experiment_sync_evidence_missing",
              },
              title: "Missing id",
              summaryMarkdown: "Missing artifact id.",
              uri: "file:///tmp/situ/missing-id.log",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
          {
            clientID: "client-1",
            id: 4,
            name: "artifacts.create",
            args: {
              id: "artifact_sync_malformed",
              target: {
                targetKind: "experiment",
                targetId: "experiment_sync_evidence_missing",
              },
              title: "Bad digest",
              summaryMarkdown: "Invalid hash.",
              uri: "file:///tmp/situ/bad.log",
              sha256: "ABC",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 4,
          },
          {
            clientID: "client-1",
            id: 5,
            name: "reviews.create",
            args: {
              experimentId: "experiment_sync_evidence_missing",
              revisionNumber: 1,
              decision: "commented",
              bodyMarkdown: "Missing review id.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 5,
          },
          {
            clientID: "client-1",
            id: 6,
            name: "reviews.create",
            args: {
              id: "review_sync_malformed",
              experimentId: "experiment_sync_evidence_missing",
              revisionNumber: 1,
              decision: "needs_work",
              bodyMarkdown: "Invalid decision.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 6,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(6);
    expect(result.permanentErrorCount).toBe(6);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "measurements" })).toBe(0);
    expect(countRows({ database, tableName: "artifacts" })).toBe(0);
    expect(countRows({ database, tableName: "reviews" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(6);
  } finally {
    database.close();
  }
});

test("marks missing evidence experiment parents as permanent conflict errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {
              id: "measurement_sync_missing_parent",
              experimentId: "experiment_sync_missing_parent",
              revisionNumber: 1,
              metricName: "duration",
              numericValue: 1,
              summaryMarkdown: "Missing parent.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "reviews.create",
            args: {
              id: "review_sync_missing_parent",
              experimentId: "experiment_sync_missing_parent",
              revisionNumber: 1,
              decision: "commented",
              bodyMarkdown: "Missing parent.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Conflict,
      ErrorKind.Conflict,
    ]);
    expect(countRows({ database, tableName: "measurements" })).toBe(0);
    expect(countRows({ database, tableName: "reviews" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("marks duplicate evidence ids as permanent conflict errors without duplicate records", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectTaskAndExperiment({
      database,
      experimentId: "experiment_sync_evidence_duplicate" as SituId<"experiment">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {
              id: "measurement_sync_duplicate",
              experimentId: "experiment_sync_evidence_duplicate",
              revisionNumber: 1,
              metricName: "duration",
              numericValue: 1,
              summaryMarkdown: "First measurement.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "measurements.create",
            args: {
              id: "measurement_sync_duplicate",
              experimentId: "experiment_sync_evidence_duplicate",
              revisionNumber: 1,
              metricName: "duration",
              numericValue: 2,
              summaryMarkdown: "Duplicate measurement.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "artifacts.create",
            args: {
              id: "artifact_sync_duplicate",
              target: {
                targetKind: "experiment",
                targetId: "experiment_sync_evidence_duplicate",
              },
              title: "First artifact",
              summaryMarkdown: "First artifact.",
              uri: "file:///tmp/situ/first.log",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
          {
            clientID: "client-1",
            id: 4,
            name: "artifacts.create",
            args: {
              id: "artifact_sync_duplicate",
              target: {
                targetKind: "experiment",
                targetId: "experiment_sync_evidence_duplicate",
              },
              title: "Duplicate artifact",
              summaryMarkdown: "Duplicate artifact.",
              uri: "file:///tmp/situ/duplicate.log",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 4,
          },
          {
            clientID: "client-1",
            id: 5,
            name: "reviews.create",
            args: {
              id: "review_sync_duplicate",
              experimentId: "experiment_sync_evidence_duplicate",
              revisionNumber: 1,
              decision: "commented",
              bodyMarkdown: "First review.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 5,
          },
          {
            clientID: "client-1",
            id: 6,
            name: "reviews.create",
            args: {
              id: "review_sync_duplicate",
              experimentId: "experiment_sync_evidence_duplicate",
              revisionNumber: 1,
              decision: "rejected",
              bodyMarkdown: "Duplicate review.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 6,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(6);
    expect(result.permanentErrorCount).toBe(3);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Conflict,
      ErrorKind.Conflict,
      ErrorKind.Conflict,
    ]);
    expect(countRows({ database, tableName: "measurements" })).toBe(1);
    expect(countRows({ database, tableName: "artifacts" })).toBe(1);
    expect(countRows({ database, tableName: "reviews" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(6);
  } finally {
    database.close();
  }
});

test("preserves artifact target refs without requiring target existence", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "artifacts.create",
            args: {
              id: "artifact_sync_missing_target",
              target: {
                targetKind: "review",
                targetId: "review_sync_missing_target",
              },
              title: "External note",
              summaryMarkdown: "Preserve caller-supplied target.",
              uri: "https://example.test/evidence",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });
    const artifact = createAppActionContext({ database }).repositories.artifacts.getById({
      id: "artifact_sync_missing_target" as SituId<"artifact">,
    });

    expect(result.permanentErrorCount).toBe(0);
    expect(artifact?.target).toEqual({
      targetKind: "review",
      targetId: "review_sync_missing_target",
    });
    expect(countRows({ database, tableName: "artifacts" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("skips old and future evidence mutations", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectTaskAndExperiment({
      database,
      experimentId: "experiment_sync_evidence_skip" as SituId<"experiment">,
    });
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {
              id: "measurement_sync_skip",
              experimentId: "experiment_sync_evidence_skip",
              revisionNumber: 1,
              metricName: "duration",
              numericValue: 1,
              summaryMarkdown: "This measurement should be created.",
              measuredBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "measurements.create",
            args: {},
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "reviews.create",
            args: {
              id: "review_sync_future",
              experimentId: "experiment_sync_evidence_skip",
              revisionNumber: 1,
              decision: "commented",
              bodyMarkdown: "This future review should be skipped.",
              reviewer: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "measurements" })).toBe(1);
    expect(countRows({ database, tableName: "reviews" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("processes report create mutations without comments, events, or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_report_1" as SituId<"project">,
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "reports.create",
            args: {
              id: "report_sync_1",
              projectId: "project_sync_report_1",
              target: {
                targetKind: "artifact",
                targetId: "artifact_sync_report_missing",
              },
              title: "Sync Report",
              bodyMarkdown: "# Report\n\nStored by sync.",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
                displayName: "Worker 1",
              },
              now: "2026-05-13T12:30:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });
    const report = createAppActionContext({ database }).repositories.reports.getById({
      id: "report_sync_1" as SituId<"report">,
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(report).toEqual({
      id: "report_sync_1",
      projectId: "project_sync_report_1",
      target: {
        targetKind: "artifact",
        targetId: "artifact_sync_report_missing",
      },
      title: "Sync Report",
      bodyMarkdown: "# Report\n\nStored by sync.",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      metadata: {
        createdAt: "2026-05-13T12:30:00.000Z",
        updatedAt: "2026-05-13T12:30:00.000Z",
      },
    });
    expect(countRows({ database, tableName: "reports" })).toBe(1);
    expect(countRows({ database, tableName: "comments" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks malformed report args as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "reports.create",
            args: {
              id: "report_sync_malformed",
              projectId: "project_sync_report_missing",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_missing",
              },
              title: "   ",
              bodyMarkdown: "Body",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "reports.create",
            args: {
              id: "report_sync_malformed_now",
              projectId: "project_sync_report_missing",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_missing",
              },
              title: "Malformed Timestamp Report",
              bodyMarkdown: "Body",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "not-a-timestamp",
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "reports" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("marks report missing project parents as permanent conflict errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "reports.create",
            args: {
              id: "report_sync_missing_project",
              projectId: "project_sync_report_missing",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_missing",
              },
              title: "Missing Project Report",
              bodyMarkdown: "This should not persist.",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Conflict);
    expect(countRows({ database, tableName: "reports" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks duplicate report ids as permanent conflict errors without duplicate rows", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_report_duplicate" as SituId<"project">,
    });
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "reports.create",
            args: {
              id: "report_sync_duplicate",
              projectId: "project_sync_report_duplicate",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_duplicate",
              },
              title: "Original Report",
              bodyMarkdown: "Original body.",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 2,
            name: "reports.create",
            args: {
              id: "report_sync_duplicate",
              projectId: "project_sync_report_duplicate",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_duplicate",
              },
              title: "Duplicate Report",
              bodyMarkdown: "Duplicate body.",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-2",
              },
            },
            timestamp: 2,
          },
        ],
      }),
    });
    const report = createAppActionContext({ database }).repositories.reports.getById({
      id: "report_sync_duplicate" as SituId<"report">,
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Conflict);
    expect(countRows({ database, tableName: "reports" })).toBe(1);
    expect(report?.title).toBe("Original Report");
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("skips old and future report mutations without validation or state changes", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_report_skip" as SituId<"project">,
    });
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "reports.create",
            args: {
              id: "report_sync_skip",
              projectId: "project_sync_report_skip",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_skip",
              },
              title: "Created Report",
              bodyMarkdown: "This report should be created.",
              generatedBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "reports.create",
            args: {},
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "reports.create",
            args: {
              id: "report_sync_future",
              projectId: "project_sync_report_skip",
              target: {
                targetKind: "project",
                targetId: "project_sync_report_skip",
              },
              title: "Future Report",
              bodyMarkdown: "This future report should be skipped.",
              generatedBy: {
                actorKind: "invalid",
                actorId: "worker-1",
              },
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "reports" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("models a handoff with a comment and notification without hidden workflow effects", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "comments.create",
            args: {
              id: "comment_sync_handoff",
              target: {
                targetKind: "task",
                targetId: "task_sync_handoff",
              },
              bodyMarkdown: "The branch is ready for human review.",
              author: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "notifications.create",
            args: {
              id: "notification_sync_handoff",
              recipient: {
                recipientId: "scott",
              },
              target: {
                targetKind: "comment",
                targetId: "comment_sync_handoff",
              },
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Review handoff comment.",
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(0);
    expect(countRows({ database, tableName: "comments" })).toBe(1);
    expect(countRows({ database, tableName: "notifications" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(listRuntimeOrSchedulerTables({ database })).toEqual([]);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("skips old and future mutations without advancing client state", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {
              id: "project_sync_skip",
              name: "Sync Skip Project",
              repositoryPath: "/tmp/sync-skip-project",
              goalMarkdown: "Exercise sync skipping",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {},
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "projects.create",
            args: {},
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
    expect(countRows({ database, tableName: "projects" })).toBe(1);
  } finally {
    database.close();
  }
});

test("marks permanent errors processed and continues in-order mutations", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "missing.mutator",
            args: {},
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "projects.create",
            args: {
              id: "project_sync_after_error",
              name: "Sync After Error",
              repositoryPath: "/tmp/sync-after-error",
              goalMarkdown: "Continue after permanent errors",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.skippedMutationCount).toBe(0);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors).toEqual([
      {
        clientID: "client-1",
        mutationID: 1,
        mutationName: "missing.mutator",
        error: {
          kind: ErrorKind.Validation,
          message: "Unsupported Replicache mutator.",
          details: { name: "missing.mutator" },
        },
      },
    ]);
    expect(countRows({ database, tableName: "projects" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("marks malformed supported mutator args as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {
              id: "project_sync_malformed",
              name: 42,
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Validation);
    expect(countRows({ database, tableName: "projects" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks malformed comment and notification args as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "comments.create",
            args: {
              id: "comment_sync_malformed",
              target: {
                targetKind: "unknown",
                targetId: "task_sync_target",
              },
              bodyMarkdown: "Invalid target kind.",
              author: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "notifications.create",
            args: {
              id: "notification_sync_malformed",
              recipient: {
                recipientId: "scott",
              },
              target: {
                targetKind: "task",
                targetId: "task_sync_target",
              },
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "   ",
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "notifications.read",
            args: {
              id: "",
            },
            timestamp: 3,
          },
          {
            clientID: "client-1",
            id: 4,
            name: "notifications.dismiss",
            args: {
              now: "2026-05-13T12:07:00.000Z",
            },
            timestamp: 4,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(4);
    expect(result.permanentErrorCount).toBe(4);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "comments" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(4);
  } finally {
    database.close();
  }
});

test("marks missing required create ids as permanent validation errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "comments.create",
            args: {
              target: {
                targetKind: "task",
                targetId: "task_sync_missing_id",
              },
              bodyMarkdown: "Missing comment id.",
              author: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "notifications.create",
            args: {
              recipient: {
                recipientId: "scott",
              },
              target: {
                targetKind: "task",
                targetId: "task_sync_missing_id",
              },
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "Missing notification id.",
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "comments" })).toBe(0);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("marks nonexistent notification records for read and dismiss as permanent errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "notifications.read",
            args: {
              id: "notification_sync_missing",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "notifications.dismiss",
            args: {
              id: "notification_sync_missing",
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.NotFound,
      ErrorKind.NotFound,
    ]);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("skips old and future comment and notification mutations", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "comments.create",
            args: {
              id: "comment_sync_skip",
              target: {
                targetKind: "task",
                targetId: "task_sync_skip",
              },
              bodyMarkdown: "This comment should be created.",
              author: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "comments.create",
            args: {},
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "notifications.create",
            args: {
              id: "notification_sync_future",
              recipient: {
                recipientId: "scott",
              },
              target: {
                targetKind: "comment",
                targetId: "comment_sync_skip",
              },
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              summaryMarkdown: "This future mutation should be skipped.",
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "comments" })).toBe(1);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("rolls back product effects when product writes become permanent errors", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "tasks.create",
            args: {
              id: "task_sync_missing_project",
              eventId: "event_sync_missing_project",
              projectId: "project_missing",
              title: "Missing Project Task",
              bodyMarkdown: "This should not persist.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Conflict);
    expect(countRows({ database, tableName: "tasks" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("does not keep partial product writes after a BaseError", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createAppActionContext({ database }).repositories.events.create({
      id: "event_sync_duplicate" as SituId<"event">,
      target: {
        targetKind: "project",
        targetId: "project_existing" as SituId<"project">,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:00:00.000Z",
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {
              id: "project_sync_rolled_back",
              eventId: "event_sync_duplicate",
              name: "Rolled Back Project",
              repositoryPath: "/tmp/sync-rolled-back",
              goalMarkdown: "The project insert should roll back.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(1);
    expect(result.permanentErrorCount).toBe(1);
    expect(result.permanentErrors[0]?.error.kind).toBe(ErrorKind.Conflict);
    expect(countRows({ database, tableName: "projects" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("marks malformed lifecycle args as permanent validation errors without product effects", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.archive",
            args: {
              id: "",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "tasks.assign",
            args: {
              id: "task_sync_malformed_assign",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              assignedTo: null,
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "tasks.assign",
            args: {
              id: "task_sync_malformed_assign",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "not a timestamp",
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(3);
    expect(result.permanentErrorCount).toBe(3);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Validation,
      ErrorKind.Validation,
      ErrorKind.Validation,
    ]);
    expect(countRows({ database, tableName: "projects" })).toBe(0);
    expect(countRows({ database, tableName: "tasks" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(3);
  } finally {
    database.close();
  }
});

test("marks missing lifecycle targets as permanent not-found errors without events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.archive",
            args: {
              id: "project_sync_missing_archive",
              eventId: "event_sync_missing_archive",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "tasks.assign",
            args: {
              id: "task_sync_missing_assign",
              eventId: "event_sync_missing_assign",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              assignedTo: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
            },
            timestamp: 2,
          },
        ],
      }),
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.NotFound,
      ErrorKind.NotFound,
    ]);
    expect(countRows({ database, tableName: "projects" })).toBe(0);
    expect(countRows({ database, tableName: "tasks" })).toBe(0);
    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("rolls back lifecycle product writes for duplicate event ids", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProjectAndTask({
      database,
      projectId: "project_sync_lifecycle_conflict" as SituId<"project">,
      taskId: "task_sync_lifecycle_conflict" as SituId<"task">,
    });
    createAppActionContext({ database }).repositories.events.create({
      id: "event_sync_lifecycle_conflict" as SituId<"event">,
      target: {
        targetKind: "project",
        targetId: "project_sync_lifecycle_conflict",
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:00:00.000Z",
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.archive",
            args: {
              id: "project_sync_lifecycle_conflict",
              eventId: "event_sync_lifecycle_conflict",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:13:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "tasks.assign",
            args: {
              id: "task_sync_lifecycle_conflict",
              eventId: "event_sync_lifecycle_conflict",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
              assignedTo: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:14:00.000Z",
            },
            timestamp: 2,
          },
        ],
      }),
    });
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.getById({
      id: "project_sync_lifecycle_conflict" as SituId<"project">,
    });
    const task = context.repositories.tasks.getById({
      id: "task_sync_lifecycle_conflict" as SituId<"task">,
    });

    expect(result.processedMutationCount).toBe(2);
    expect(result.permanentErrorCount).toBe(2);
    expect(result.permanentErrors.map((error) => error.error.kind)).toEqual([
      ErrorKind.Conflict,
      ErrorKind.Conflict,
    ]);
    expect(project?.status).toBe("active");
    expect(task?.assignedTo).toBeUndefined();
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(2);
  } finally {
    database.close();
  }
});

test("skips old and future lifecycle mutations without validation or client advancement", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    createProject({
      database,
      projectId: "project_sync_lifecycle_skip" as SituId<"project">,
    });
    processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.archive",
            args: {
              id: "project_sync_lifecycle_skip",
              actor: {
                actorKind: "human",
                actorId: "scott",
              },
            },
            timestamp: 1,
          },
        ],
      }),
    });

    const result = processReplicachePush({
      database,
      pushRequest: push({
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "tasks.assign",
            args: {
              assignedTo: null,
            },
            timestamp: 2,
          },
          {
            clientID: "client-1",
            id: 3,
            name: "projects.archive",
            args: {
              id: "",
            },
            timestamp: 3,
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      processedMutationCount: 0,
      skippedMutationCount: 2,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(
      getLastMutationId({
        database,
        clientGroupID: "client-group-1",
        clientID: "client-1",
      }),
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("validates push request envelopes before processing", () => {
  expect(() =>
    parseReplicachePushRequest({
      pushVersion: 2,
      clientGroupID: "client-group-1",
      mutations: [],
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toThrow(ValidationError);

  expect(() =>
    parseReplicachePushRequest({
      pushVersion: 1,
      clientGroupID: "client-group-1",
      mutations: [
        {
          clientID: "",
          id: 0,
          name: "projects.create",
          args: {},
          timestamp: Number.NaN,
        },
      ],
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toThrow(ValidationError);
});

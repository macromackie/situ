import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { createAppActionContext } from "../actions/index.js";
import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { getSituStatus } from "./index.js";

test("summarizes scoped project work without mutating records", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_status" as SituId<"project">,
      name: "Status Project",
      repositoryPath: "/tmp/status",
      goalMarkdown: "Exercise status summaries.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    context.repositories.tasks.create({
      id: "task_status" as SituId<"task">,
      projectId: project.id,
      title: "Pending task",
      bodyMarkdown: "Pending task body.",
      status: "backlog",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.notifications.create({
      id: "notification_status" as SituId<"notification">,
      recipient: {
        recipientId: "manager",
      },
      target: {
        targetKind: "project",
        targetId: project.id,
      },
      summaryMarkdown: "Project needs attention.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      getSituStatus({
        database,
        projectId: project.id,
        generatedAt: "2026-05-13T13:00:00.000Z",
      }),
    ).toMatchObject({
      generatedAt: "2026-05-13T13:00:00.000Z",
      projectIds: [project.id],
      projects: {
        active: 1,
        archived: 0,
      },
      work: {
        pending: 1,
        attention: 1,
      },
      tasks: {
        backlog: 1,
      },
      notifications: {
        unread: 1,
      },
      isIdle: false,
    });
  } finally {
    database.close();
  }
});

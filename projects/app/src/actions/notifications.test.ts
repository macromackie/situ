import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createNotificationAction,
  dismissNotificationAction,
  getNotificationAction,
  listNotificationsAction,
  markNotificationReadAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countEvents(input: { readonly database: ReturnType<typeof openAppDatabase> }): number {
  return (
    input.database.query<CountRow, []>("SELECT COUNT(*) AS count FROM events").get()?.count ?? 0
  );
}

test("creates a notification through the app action without emitting events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const result = createNotificationAction({
      context,
      id: "notification_action_create" as SituId<"notification">,
      recipient: {
        recipientId: "verifier-1",
        displayName: "Verifier 1",
      },
      target: {
        targetKind: "task",
        targetId: "task_notification_target" as SituId<"task">,
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Review task",
      bodyMarkdown: "Please inspect the task.",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(result.notification).toMatchObject({
      id: "notification_action_create",
      recipient: {
        recipientId: "verifier-1",
        displayName: "Verifier 1",
      },
      target: {
        targetKind: "task",
        targetId: "task_notification_target",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Review task",
      bodyMarkdown: "Please inspect the task.",
      metadata: {
        createdAt: "2026-05-13T12:00:00.000Z",
        updatedAt: "2026-05-13T12:00:00.000Z",
      },
    });
    expect(context.repositories.notifications.getById({ id: result.notification.id })).toEqual(
      result.notification,
    );
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("gets an existing and missing notification without emitting events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const notification = context.repositories.notifications.create({
      id: "notification_action_get" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: {
        targetKind: "project",
        targetId: "project_notification_target" as SituId<"project">,
      },
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Project needs attention",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(getNotificationAction({ context, id: notification.id })).toEqual(notification);
    expect(
      getNotificationAction({
        context,
        id: "notification_missing" as SituId<"notification">,
      }),
    ).toBeUndefined();
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("lists active notifications for a recipient", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const active = context.repositories.notifications.create({
      id: "notification_action_list_active" as SituId<"notification">,
      recipient: {
        recipientId: "verifier-1",
      },
      target: {
        targetKind: "task",
        targetId: "task_active_target" as SituId<"task">,
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Active notification",
      now: "2026-05-13T12:01:00.000Z",
    });
    const dismissed = context.repositories.notifications.create({
      id: "notification_action_list_dismissed" as SituId<"notification">,
      recipient: {
        recipientId: "verifier-1",
      },
      target: {
        targetKind: "task",
        targetId: "task_dismissed_target" as SituId<"task">,
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Dismissed notification",
      now: "2026-05-13T12:00:00.000Z",
    });
    context.repositories.notifications.dismiss({
      id: dismissed.id,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      listNotificationsAction({
        context,
        recipientId: "verifier-1",
      }),
    ).toEqual([active]);
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("marks a notification read", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const notification = context.repositories.notifications.create({
      id: "notification_action_read" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: {
        targetKind: "review",
        targetId: "review_notification_target" as SituId<"review">,
      },
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Read me",
      now: "2026-05-13T12:00:00.000Z",
    });
    const result = markNotificationReadAction({
      context,
      id: notification.id,
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(result.notification.readAt).toBe("2026-05-13T12:03:00.000Z");
    expect(result.notification.dismissedAt).toBeUndefined();
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("dismisses a notification without marking it read", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const notification = context.repositories.notifications.create({
      id: "notification_action_dismiss" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: {
        targetKind: "report",
        targetId: "report_notification_target" as SituId<"report">,
      },
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Dismiss me",
      now: "2026-05-13T12:00:00.000Z",
    });
    const result = dismissNotificationAction({
      context,
      id: notification.id,
      now: "2026-05-13T12:04:00.000Z",
    });

    expect(result.notification.dismissedAt).toBe("2026-05-13T12:04:00.000Z");
    expect(result.notification.readAt).toBeUndefined();
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

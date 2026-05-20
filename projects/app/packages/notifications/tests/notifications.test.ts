import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  createNotificationRecord,
  createNotificationRepository,
  dismissNotificationRecord,
  markNotificationReadRecord,
  notificationsSchemaFragment,
} from "../src/index.js";

const taskTarget: TargetRef<"task"> = {
  targetKind: "task",
  targetId: "task_1" as SituId<"task">,
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  for (const statement of notificationsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports notification schema statements", () => {
  const expectedPackageName: "notifications" = notificationsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("notifications");
  expect(notificationsSchemaFragment.statements).toHaveLength(3);
});

test("creates notification records with normalized fields", () => {
  const notification = createNotificationRecord({
    id: "notification_1" as SituId<"notification">,
    recipient: {
      recipientId: "  verifier-1  ",
      displayName: "  Verifier 1  ",
    },
    target: taskTarget,
    createdBy: {
      actorKind: "human",
      actorId: "  scott  ",
      displayName: "  Scott  ",
    },
    summaryMarkdown: "  Review requested  ",
    bodyMarkdown: "  Please inspect the task.  ",
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(notification).toEqual({
    id: "notification_1",
    recipient: {
      recipientId: "verifier-1",
      displayName: "Verifier 1",
    },
    target: taskTarget,
    createdBy: {
      actorKind: "human",
      actorId: "scott",
      displayName: "Scott",
    },
    summaryMarkdown: "Review requested",
    bodyMarkdown: "Please inspect the task.",
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:00:00.000Z",
    },
  });
});

test("rejects invalid notification records", () => {
  expect(() =>
    createNotificationRecord({
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "",
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createNotificationRecord({
      recipient: {
        recipientId: " ",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Review requested",
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createNotificationRecord({
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Review requested",
      bodyMarkdown: " ",
    }),
  ).toThrow(ValidationError);
});

test("marks notification records as read idempotently", () => {
  const notification = createNotificationRecord({
    id: "notification_1" as SituId<"notification">,
    recipient: {
      recipientId: "scott",
    },
    target: taskTarget,
    createdBy: {
      actorKind: "system",
      actorId: "situ",
    },
    summaryMarkdown: "Review requested",
    now: "2026-05-13T12:00:00.000Z",
  });

  const readNotification = markNotificationReadRecord({
    notification,
    now: "2026-05-13T12:05:00.000Z",
  });

  expect(readNotification.readAt).toBe("2026-05-13T12:05:00.000Z");
  expect(readNotification.metadata.updatedAt).toBe("2026-05-13T12:05:00.000Z");
  expect(
    markNotificationReadRecord({
      notification: readNotification,
      now: "not-a-timestamp",
    }),
  ).toBe(readNotification);
});

test("dismisses notification records without marking them read", () => {
  const notification = createNotificationRecord({
    id: "notification_1" as SituId<"notification">,
    recipient: {
      recipientId: "scott",
    },
    target: taskTarget,
    createdBy: {
      actorKind: "system",
      actorId: "situ",
    },
    summaryMarkdown: "Review requested",
    now: "2026-05-13T12:00:00.000Z",
  });

  const dismissedNotification = dismissNotificationRecord({
    notification,
    now: "2026-05-13T12:10:00.000Z",
  });

  expect(dismissedNotification.readAt).toBeUndefined();
  expect(dismissedNotification.dismissedAt).toBe("2026-05-13T12:10:00.000Z");
  expect(dismissedNotification.metadata.updatedAt).toBe("2026-05-13T12:10:00.000Z");
  expect(
    dismissNotificationRecord({
      notification: dismissedNotification,
      now: "not-a-timestamp",
    }),
  ).toBe(dismissedNotification);
});

test("creates and reads persisted notifications", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });

  try {
    const notification = repository.create({
      id: "notification_1" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Review requested",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: notification.id })).toEqual(notification);
    expect(
      repository.getById({ id: "notification_missing" as SituId<"notification"> }),
    ).toBeUndefined();
    expect(notification.recipient.displayName).toBeUndefined();
    expect(notification.bodyMarkdown).toBeUndefined();
    expect(notification.readAt).toBeUndefined();
    expect(notification.dismissedAt).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists active notifications for a recipient newest first", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });

  try {
    const olderNotification = repository.create({
      id: "notification_a" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Older",
      now: "2026-05-13T12:00:00.000Z",
    });
    const newerNotification = repository.create({
      id: "notification_b" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Newer",
      now: "2026-05-13T12:01:00.000Z",
    });
    const tieBreakerNotification = repository.create({
      id: "notification_c" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Tie breaker",
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "notification_other_recipient" as SituId<"notification">,
      recipient: {
        recipientId: "avery",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Other recipient",
      now: "2026-05-13T12:02:00.000Z",
    });
    repository.dismiss({
      id: newerNotification.id,
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(
      repository
        .listForRecipient({
          recipientId: "  scott  ",
        })
        .map((notification) => notification.id),
    ).toEqual([tieBreakerNotification.id, olderNotification.id]);
    expect(
      repository
        .listForRecipient({
          recipientId: "scott",
          includeDismissed: true,
        })
        .map((notification) => notification.id),
    ).toEqual([tieBreakerNotification.id, newerNotification.id, olderNotification.id]);
    expect(
      repository
        .listForRecipient({
          recipientId: "scott",
          includeDismissed: true,
          limit: 2,
        })
        .map((notification) => notification.id),
    ).toEqual([tieBreakerNotification.id, newerNotification.id]);
  } finally {
    database.close();
  }
});

test("lists all notifications in creation order including read and dismissed records", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });

  try {
    const unreadNotification = repository.create({
      id: "notification_b" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Unread notification",
      now: "2026-05-13T12:00:00.000Z",
    });
    const readNotification = repository.create({
      id: "notification_a" as SituId<"notification">,
      recipient: {
        recipientId: "verifier-1",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Read notification",
      now: "2026-05-13T12:00:00.000Z",
    });
    const dismissedNotification = repository.create({
      id: "notification_c" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Dismissed notification",
      now: "2026-05-13T12:01:00.000Z",
    });

    repository.markRead({
      id: readNotification.id,
      now: "2026-05-13T12:02:00.000Z",
    });
    repository.dismiss({
      id: dismissedNotification.id,
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(repository.listAll().map((notification) => notification.id)).toEqual([
      readNotification.id,
      unreadNotification.id,
      dismissedNotification.id,
    ]);
    expect(repository.listAll().map((notification) => notification.readAt)).toEqual([
      "2026-05-13T12:02:00.000Z",
      undefined,
      undefined,
    ]);
    expect(repository.listAll().map((notification) => notification.dismissedAt)).toEqual([
      undefined,
      undefined,
      "2026-05-13T12:03:00.000Z",
    ]);
  } finally {
    database.close();
  }
});

test("rejects invalid list inputs", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });

  try {
    expect(() =>
      repository.listForRecipient({
        recipientId: " ",
      }),
    ).toThrow(ValidationError);

    expect(() =>
      repository.listForRecipient({
        recipientId: "scott",
        limit: 0,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      repository.listForRecipient({
        recipientId: "scott",
        limit: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      repository.listForRecipient({
        recipientId: "scott",
        limit: 1.5,
      }),
    ).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("applies default and capped list limits", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });

  try {
    for (let index = 0; index < 501; index += 1) {
      repository.create({
        id: `notification_${index.toString().padStart(3, "0")}` as SituId<"notification">,
        recipient: {
          recipientId: "scott",
        },
        target: taskTarget,
        createdBy: {
          actorKind: "system",
          actorId: "situ",
        },
        summaryMarkdown: `Notification ${index}`,
        now: "2026-05-13T12:00:00.000Z",
      });
    }

    expect(
      repository.listForRecipient({
        recipientId: "scott",
      }),
    ).toHaveLength(50);
    expect(
      repository.listForRecipient({
        recipientId: "scott",
        limit: 501,
      }),
    ).toHaveLength(500);
  } finally {
    database.close();
  }
});

test("marks and dismisses persisted notifications idempotently", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });

  try {
    const notification = repository.create({
      id: "notification_1" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: taskTarget,
      createdBy: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Review requested",
      now: "2026-05-13T12:00:00.000Z",
    });
    const readNotification = repository.markRead({
      id: notification.id,
      now: "2026-05-13T12:05:00.000Z",
    });
    const dismissedNotification = repository.dismiss({
      id: notification.id,
      now: "2026-05-13T12:10:00.000Z",
    });

    expect(readNotification.readAt).toBe("2026-05-13T12:05:00.000Z");
    expect(dismissedNotification.readAt).toBe("2026-05-13T12:05:00.000Z");
    expect(dismissedNotification.dismissedAt).toBe("2026-05-13T12:10:00.000Z");

    expect(
      repository.markRead({
        id: notification.id,
        now: "not-a-timestamp",
      }),
    ).toEqual(dismissedNotification);
    expect(
      repository.dismiss({
        id: notification.id,
        now: "not-a-timestamp",
      }),
    ).toEqual(dismissedNotification);
  } finally {
    database.close();
  }
});

test("throws not found before timestamp validation for missing updates", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });
  const id = "notification_missing" as SituId<"notification">;

  try {
    expect(() =>
      repository.markRead({
        id,
        now: "not-a-timestamp",
      }),
    ).toThrow(NotFoundError);

    expect(() =>
      repository.dismiss({
        id,
        now: "not-a-timestamp",
      }),
    ).toThrow(NotFoundError);
  } finally {
    database.close();
  }
});

test("reports duplicate notifications as conflicts", () => {
  const database = createTestDatabase();
  const repository = createNotificationRepository({ database });
  const input = {
    id: "notification_1" as SituId<"notification">,
    recipient: {
      recipientId: "scott",
    },
    target: taskTarget,
    createdBy: {
      actorKind: "system" as const,
      actorId: "situ",
    },
    summaryMarkdown: "Review requested",
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
  } finally {
    database.close();
  }
});

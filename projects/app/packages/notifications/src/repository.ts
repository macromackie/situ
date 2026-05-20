import type { Database } from "bun:sqlite";

import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  type CreateNotificationRecordInput,
  createNotificationRecord,
  dismissNotificationRecord,
  markNotificationReadRecord,
} from "./mutations.js";
import type { NotificationRecord } from "./types.js";

export type CreateNotificationRepositoryInput = {
  readonly database: Database;
};

export type CreateNotificationInput = Omit<CreateNotificationRecordInput, "id"> & {
  readonly id?: SituId<"notification">;
};

export type ListNotificationsForRecipientInput = {
  readonly recipientId: string;
  readonly includeDismissed?: boolean;
  readonly limit?: number;
};

export type MarkNotificationReadInput = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};

export type DismissNotificationInput = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};

export type NotificationRepository = {
  readonly create: (input: CreateNotificationInput) => NotificationRecord;
  readonly getById: (input: {
    readonly id: SituId<"notification">;
  }) => NotificationRecord | undefined;
  readonly listForRecipient: (
    input: ListNotificationsForRecipientInput,
  ) => readonly NotificationRecord[];
  readonly listAll: () => readonly NotificationRecord[];
  readonly markRead: (input: MarkNotificationReadInput) => NotificationRecord;
  readonly dismiss: (input: DismissNotificationInput) => NotificationRecord;
};

type NotificationRow = {
  readonly id: string;
  readonly recipient_id: string;
  readonly recipient_display_name: string | null;
  readonly target_kind: TargetRef["targetKind"];
  readonly target_id: string;
  readonly created_by_kind: ActorRef["actorKind"];
  readonly created_by_id: string;
  readonly created_by_display_name: string | null;
  readonly summary_markdown: string;
  readonly body_markdown: string | null;
  readonly read_at: IsoTimestamp | null;
  readonly dismissed_at: IsoTimestamp | null;
  readonly created_at: IsoTimestamp;
  readonly updated_at: IsoTimestamp;
};

/**
 * Creates a SQLite-backed notification repository.
 */
export function createNotificationRepository(
  input: CreateNotificationRepositoryInput,
): NotificationRepository {
  return {
    create: (createInput) => createNotification({ database: input.database, input: createInput }),
    getById: (getInput) => getNotificationById({ database: input.database, id: getInput.id }),
    listForRecipient: (listInput) =>
      listNotificationsForRecipient({ database: input.database, input: listInput }),
    listAll: () => listAllNotifications({ database: input.database }),
    markRead: (markReadInput) =>
      markNotificationRead({ database: input.database, input: markReadInput }),
    dismiss: (dismissInput) =>
      dismissNotification({ database: input.database, input: dismissInput }),
  };
}

type CreateNotificationRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateNotificationInput;
};

function createNotification(input: CreateNotificationRepositoryMethodInput): NotificationRecord {
  const notification = createNotificationRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO notifications (
  id,
  recipient_id,
  recipient_display_name,
  target_kind,
  target_id,
  created_by_kind,
  created_by_id,
  created_by_display_name,
  summary_markdown,
  body_markdown,
  read_at,
  dismissed_at,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        notification.id,
        notification.recipient.recipientId,
        notification.recipient.displayName ?? null,
        notification.target.targetKind,
        notification.target.targetId,
        notification.createdBy.actorKind,
        notification.createdBy.actorId,
        notification.createdBy.displayName ?? null,
        notification.summaryMarkdown,
        notification.bodyMarkdown ?? null,
        notification.readAt ?? null,
        notification.dismissedAt ?? null,
        notification.metadata.createdAt,
        notification.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqlitePrimaryKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Notification already exists.",
        details: { id: notification.id },
      });
    }

    throw error;
  }

  return getPersistedNotification({
    database: input.database,
    id: notification.id,
  });
}

type GetNotificationByIdInput = {
  readonly database: Database;
  readonly id: SituId<"notification">;
};

function getNotificationById(input: GetNotificationByIdInput): NotificationRecord | undefined {
  const row = input.database
    .query<NotificationRow, [string]>("SELECT * FROM notifications WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return notificationFromRow({ row });
}

type ListNotificationsForRecipientRepositoryInput = {
  readonly database: Database;
  readonly input: ListNotificationsForRecipientInput;
};

function listNotificationsForRecipient(
  input: ListNotificationsForRecipientRepositoryInput,
): readonly NotificationRecord[] {
  const recipientId = normalizeRecipientId({
    recipientId: input.input.recipientId,
  });
  const limit = normalizeLimit({
    limit: input.input.limit,
  });
  const dismissedClause = input.input.includeDismissed === true ? "" : " AND dismissed_at IS NULL";
  const rows = input.database
    .query<NotificationRow, [string, number]>(
      `
SELECT *
FROM notifications
WHERE recipient_id = ?${dismissedClause}
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(recipientId, limit);

  return rows.map((row) => notificationFromRow({ row }));
}

type ListAllNotificationsRepositoryInput = {
  readonly database: Database;
};

function listAllNotifications(
  input: ListAllNotificationsRepositoryInput,
): readonly NotificationRecord[] {
  const rows = input.database
    .query<NotificationRow, []>(
      `
SELECT *
FROM notifications
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => notificationFromRow({ row }));
}

type NormalizeLimitInput = {
  readonly limit?: number;
};

type NormalizeRecipientIdInput = {
  readonly recipientId: string;
};

function normalizeRecipientId(input: NormalizeRecipientIdInput): string {
  return requireNonEmptyString({
    field: "recipientId",
    value: input.recipientId,
  });
}

function normalizeLimit(input: NormalizeLimitInput): number {
  if (input.limit === undefined) {
    return 50;
  }

  if (
    typeof input.limit !== "number" ||
    !Number.isFinite(input.limit) ||
    !Number.isInteger(input.limit) ||
    input.limit <= 0
  ) {
    throw new ValidationError({
      message: "Expected a positive integer limit.",
      details: { field: "limit" },
    });
  }

  return Math.min(input.limit, 500);
}

type RequireNonEmptyStringInput = {
  readonly field: string;
  readonly value: string;
};

function requireNonEmptyString(input: RequireNonEmptyStringInput): string {
  const value = input.value.trim();

  if (value.length > 0) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

type MarkNotificationReadRepositoryInput = {
  readonly database: Database;
  readonly input: MarkNotificationReadInput;
};

function markNotificationRead(input: MarkNotificationReadRepositoryInput): NotificationRecord {
  const existingNotification = requireExistingNotification({
    database: input.database,
    id: input.input.id,
  });
  const readNotification = markNotificationReadRecord({
    notification: existingNotification,
    now: input.input.now,
  });

  if (readNotification !== existingNotification) {
    input.database
      .query(
        `
UPDATE notifications
SET
  read_at = ?,
  updated_at = ?
WHERE id = ? AND read_at IS NULL
`,
      )
      .run(
        readNotification.readAt ?? null,
        readNotification.metadata.updatedAt,
        readNotification.id,
      );
  }

  return getPersistedNotification({
    database: input.database,
    id: existingNotification.id,
  });
}

type DismissNotificationRepositoryInput = {
  readonly database: Database;
  readonly input: DismissNotificationInput;
};

function dismissNotification(input: DismissNotificationRepositoryInput): NotificationRecord {
  const existingNotification = requireExistingNotification({
    database: input.database,
    id: input.input.id,
  });
  const dismissedNotification = dismissNotificationRecord({
    notification: existingNotification,
    now: input.input.now,
  });

  if (dismissedNotification !== existingNotification) {
    input.database
      .query(
        `
UPDATE notifications
SET
  dismissed_at = ?,
  updated_at = ?
WHERE id = ? AND dismissed_at IS NULL
`,
      )
      .run(
        dismissedNotification.dismissedAt ?? null,
        dismissedNotification.metadata.updatedAt,
        dismissedNotification.id,
      );
  }

  return getPersistedNotification({
    database: input.database,
    id: existingNotification.id,
  });
}

type RequireExistingNotificationInput = {
  readonly database: Database;
  readonly id: SituId<"notification">;
};

function requireExistingNotification(input: RequireExistingNotificationInput): NotificationRecord {
  const notification = getNotificationById(input);

  if (notification !== undefined) {
    return notification;
  }

  throw new NotFoundError({
    message: "Notification was not found.",
    details: { id: input.id },
  });
}

type GetPersistedNotificationInput = {
  readonly database: Database;
  readonly id: SituId<"notification">;
};

function getPersistedNotification(input: GetPersistedNotificationInput): NotificationRecord {
  return requireExistingNotification(input);
}

type NotificationFromRowInput = {
  readonly row: NotificationRow;
};

function notificationFromRow(input: NotificationFromRowInput): NotificationRecord {
  return {
    id: input.row.id as SituId<"notification">,
    recipient: {
      recipientId: input.row.recipient_id,
      displayName: input.row.recipient_display_name ?? undefined,
    },
    target: {
      targetKind: input.row.target_kind,
      targetId: input.row.target_id as TargetRef["targetId"],
    },
    createdBy: {
      actorKind: input.row.created_by_kind,
      actorId: input.row.created_by_id,
      displayName: input.row.created_by_display_name ?? undefined,
    },
    summaryMarkdown: input.row.summary_markdown,
    bodyMarkdown: input.row.body_markdown ?? undefined,
    readAt: input.row.read_at ?? undefined,
    dismissedAt: input.row.dismissed_at ?? undefined,
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function isSqlitePrimaryKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message.includes("notifications.id")
  );
}

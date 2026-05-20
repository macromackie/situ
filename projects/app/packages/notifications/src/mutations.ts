import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetRef,
  createId,
  createSyncMetadata,
  touchSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { NotificationRecipient, NotificationRecord } from "./types.js";

export type CreateNotificationRecordInput = {
  readonly id?: SituId<"notification">;
  readonly recipient: NotificationRecipient;
  readonly target: TargetRef;
  readonly createdBy: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};

export type MarkNotificationReadRecordInput = {
  readonly notification: NotificationRecord;
  readonly now?: IsoTimestamp;
};

export type DismissNotificationRecordInput = {
  readonly notification: NotificationRecord;
  readonly now?: IsoTimestamp;
};

/**
 * Creates a notification record.
 */
export function createNotificationRecord(input: CreateNotificationRecordInput): NotificationRecord {
  return {
    id: input.id ?? createId({ prefix: "notification" }),
    recipient: normalizeRecipient({ recipient: input.recipient }),
    target: input.target,
    createdBy: normalizeActorRef({
      actor: input.createdBy,
      field: "createdBy",
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "summaryMarkdown",
      value: input.summaryMarkdown,
    }),
    bodyMarkdown: optionalNonEmptyString({
      field: "bodyMarkdown",
      value: input.bodyMarkdown,
    }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

/**
 * Returns a notification record marked as read.
 */
export function markNotificationReadRecord(
  input: MarkNotificationReadRecordInput,
): NotificationRecord {
  if (input.notification.readAt !== undefined) {
    return input.notification;
  }

  const metadata = touchSyncMetadata({
    metadata: input.notification.metadata,
    now: input.now,
  });

  return {
    ...input.notification,
    readAt: metadata.updatedAt,
    metadata,
  };
}

/**
 * Returns a notification record dismissed from the active inbox.
 */
export function dismissNotificationRecord(
  input: DismissNotificationRecordInput,
): NotificationRecord {
  if (input.notification.dismissedAt !== undefined) {
    return input.notification;
  }

  const metadata = touchSyncMetadata({
    metadata: input.notification.metadata,
    now: input.now,
  });

  return {
    ...input.notification,
    dismissedAt: metadata.updatedAt,
    metadata,
  };
}

type NormalizeRecipientInput = {
  readonly recipient: NotificationRecipient;
};

function normalizeRecipient(input: NormalizeRecipientInput): NotificationRecipient {
  return {
    recipientId: requireNonEmptyString({
      field: "recipient.recipientId",
      value: input.recipient.recipientId,
    }),
    displayName: optionalNonEmptyString({
      field: "recipient.displayName",
      value: input.recipient.displayName,
    }),
  };
}

type NormalizeActorRefInput = {
  readonly actor: ActorRef;
  readonly field: string;
};

function normalizeActorRef(input: NormalizeActorRefInput): ActorRef {
  const displayName = optionalNonEmptyString({
    field: `${input.field}.displayName`,
    value: input.actor.displayName,
  });

  return {
    actorKind: requireNonEmptyString({
      field: `${input.field}.actorKind`,
      value: input.actor.actorKind,
    }) as ActorRef["actorKind"],
    actorId: requireNonEmptyString({
      field: `${input.field}.actorId`,
      value: input.actor.actorId,
    }),
    displayName,
  };
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

type OptionalNonEmptyStringInput = {
  readonly field: string;
  readonly value?: string;
};

function optionalNonEmptyString(input: OptionalNonEmptyStringInput): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString({
    field: input.field,
    value: input.value,
  });
}

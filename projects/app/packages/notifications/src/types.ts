import type { ActorRef, IsoTimestamp, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const notificationsPackageName = "notifications" as const;
export type NotificationsPackageName = typeof notificationsPackageName;

/**
 * Notification inbox owner.
 */
export type NotificationRecipient = {
  readonly recipientId: string;
  readonly displayName?: string;
};

/**
 * Inbox attention record for a local recipient.
 */
export type NotificationRecord = {
  readonly id: SituId<"notification">;
  readonly recipient: NotificationRecipient;
  readonly target: TargetRef;
  readonly createdBy: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly readAt?: IsoTimestamp;
  readonly dismissedAt?: IsoTimestamp;
  readonly metadata: SyncMetadata;
};

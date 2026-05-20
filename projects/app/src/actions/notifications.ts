import type { SituId } from "@situ/common";
import type {
  CreateNotificationInput,
  DismissNotificationInput,
  ListNotificationsForRecipientInput,
  MarkNotificationReadInput,
  NotificationRecord,
} from "@situ/notifications";

import type { AppActionContext } from "./context.js";

export type CreateNotificationActionInput = CreateNotificationInput & {
  readonly context: AppActionContext;
};

export type CreateNotificationActionResult = {
  readonly notification: NotificationRecord;
};

export function createNotificationAction(
  input: CreateNotificationActionInput,
): CreateNotificationActionResult {
  const notification = input.context.repositories.notifications.create({
    id: input.id,
    recipient: input.recipient,
    target: input.target,
    createdBy: input.createdBy,
    summaryMarkdown: input.summaryMarkdown,
    bodyMarkdown: input.bodyMarkdown,
    now: input.now,
  });

  return { notification };
}

export type GetNotificationActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"notification">;
};

export function getNotificationAction(
  input: GetNotificationActionInput,
): NotificationRecord | undefined {
  return input.context.repositories.notifications.getById({
    id: input.id,
  });
}

export type ListNotificationsActionInput = ListNotificationsForRecipientInput & {
  readonly context: AppActionContext;
};

export function listNotificationsAction(
  input: ListNotificationsActionInput,
): readonly NotificationRecord[] {
  return input.context.repositories.notifications.listForRecipient({
    recipientId: input.recipientId,
    includeDismissed: input.includeDismissed,
    limit: input.limit,
  });
}

export type MarkNotificationReadActionInput = MarkNotificationReadInput & {
  readonly context: AppActionContext;
};

export type MarkNotificationReadActionResult = {
  readonly notification: NotificationRecord;
};

export function markNotificationReadAction(
  input: MarkNotificationReadActionInput,
): MarkNotificationReadActionResult {
  const notification = input.context.repositories.notifications.markRead({
    id: input.id,
    now: input.now,
  });

  return { notification };
}

export type DismissNotificationActionInput = DismissNotificationInput & {
  readonly context: AppActionContext;
};

export type DismissNotificationActionResult = {
  readonly notification: NotificationRecord;
};

export function dismissNotificationAction(
  input: DismissNotificationActionInput,
): DismissNotificationActionResult {
  const notification = input.context.repositories.notifications.dismiss({
    id: input.id,
    now: input.now,
  });

  return { notification };
}

import type { ActorRef, SituId } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type { NotificationRecipient, NotificationRecord } from "@situ/notifications";
import type {
  AssignTaskInput,
  CreateTaskInput,
  ListTasksInput,
  MoveTaskInput,
  TaskRecord,
} from "@situ/tasks";

import type { AppActionContext } from "./context.js";
import { runAppTransaction } from "./context.js";

export type CreateTaskActionInput = CreateTaskInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};

export type CreateTaskInContextInput = Omit<CreateTaskActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Creates a task and event inside the caller's context.
 */
export function createTaskInContext(input: CreateTaskInContextInput): CreateTaskActionResult {
  const task = input.context.repositories.tasks.create({
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    bodyMarkdown: input.bodyMarkdown,
    createdBy: input.createdBy,
    assignedTo: input.assignedTo,
    status: input.status,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "task",
      targetId: task.id,
    },
    actor: task.createdBy,
    summaryMarkdown: "Created task",
    now: input.now,
  });
  let notification: NotificationRecord | undefined;

  if (input.assignedTo !== undefined) {
    notification = input.context.repositories.notifications.create({
      recipient: notificationRecipientFromActor({ actor: input.assignedTo }),
      target: {
        targetKind: "task",
        targetId: task.id,
      },
      createdBy: task.createdBy,
      summaryMarkdown: assignmentNotificationSummary({ task }),
      now: input.now,
    });
  }

  if (notification === undefined) {
    return {
      task,
      event,
    };
  }

  return {
    task,
    event,
    notification,
  };
}

/**
 * Creates a task and event in one app transaction.
 */
export function createTaskAction(input: CreateTaskActionInput): CreateTaskActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      createTaskInContext({
        ...input,
        context,
      }),
  });
}

export type GetTaskActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"task">;
};

export function getTaskAction(input: GetTaskActionInput): TaskRecord | undefined {
  return input.context.repositories.tasks.getById({
    id: input.id,
  });
}

export type ListTasksActionInput = ListTasksInput & {
  readonly context: AppActionContext;
};

export function listTasksAction(input: ListTasksActionInput): readonly TaskRecord[] {
  return input.context.repositories.tasks.list({
    projectId: input.projectId,
    projectIds: input.projectIds,
    status: input.status,
    assignedTo: input.assignedTo,
  });
}

export type MoveTaskActionInput = MoveTaskInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type MoveTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
};

export type MoveTaskInContextInput = Omit<MoveTaskActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Moves a task and creates an event inside the caller's context.
 */
export function moveTaskInContext(input: MoveTaskInContextInput): MoveTaskActionResult {
  const task = input.context.repositories.tasks.move({
    id: input.id,
    status: input.status,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "task",
      targetId: task.id,
    },
    actor: input.actor,
    summaryMarkdown: `Moved task to ${input.status}`,
    now: input.now,
  });

  return {
    task,
    event,
  };
}

/**
 * Moves a task and creates an event in one app transaction.
 */
export function moveTaskAction(input: MoveTaskActionInput): MoveTaskActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      moveTaskInContext({
        ...input,
        context,
      }),
  });
}

export type AssignTaskActionInput = AssignTaskInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type AssignTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};

export type AssignTaskInContextInput = Omit<AssignTaskActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Assigns a task and creates an event inside the caller's context.
 */
export function assignTaskInContext(input: AssignTaskInContextInput): AssignTaskActionResult {
  const task = input.context.repositories.tasks.assign({
    id: input.id,
    assignedTo: input.assignedTo,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "task",
      targetId: task.id,
    },
    actor: input.actor,
    summaryMarkdown: assignmentSummary({
      assignedTo: input.assignedTo,
    }),
    now: input.now,
  });
  let notification: NotificationRecord | undefined;

  if (input.assignedTo !== undefined) {
    notification = input.context.repositories.notifications.create({
      recipient: notificationRecipientFromActor({ actor: input.assignedTo }),
      target: {
        targetKind: "task",
        targetId: task.id,
      },
      createdBy: input.actor,
      summaryMarkdown: assignmentNotificationSummary({ task }),
      now: input.now,
    });
  }

  if (notification === undefined) {
    return {
      task,
      event,
    };
  }

  return {
    task,
    event,
    notification,
  };
}

/**
 * Assigns a task and creates an event in one app transaction.
 */
export function assignTaskAction(input: AssignTaskActionInput): AssignTaskActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      assignTaskInContext({
        ...input,
        context,
      }),
  });
}

type AssignmentSummaryInput = {
  readonly assignedTo?: ActorRef;
};

function assignmentSummary(input: AssignmentSummaryInput): string {
  if (input.assignedTo === undefined) {
    return "Cleared task assignee";
  }

  return `Assigned task to ${input.assignedTo.displayName ?? input.assignedTo.actorId}`;
}

function assignmentNotificationSummary(input: { readonly task: TaskRecord }): string {
  return `Assigned task: ${input.task.title}`;
}

function notificationRecipientFromActor(input: {
  readonly actor: ActorRef;
}): NotificationRecipient {
  return {
    recipientId: input.actor.actorId,
    displayName: input.actor.displayName,
  };
}

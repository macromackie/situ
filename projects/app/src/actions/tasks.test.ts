import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ValidationError } from "@situ/errors";
import type { NotificationRecord } from "@situ/notifications";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  assignTaskAction,
  createAppActionContext,
  createTaskAction,
  getTaskAction,
  listTasksAction,
  moveTaskAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countEvents(input: { readonly database: ReturnType<typeof openAppDatabase> }): number {
  return (
    input.database.query<CountRow, []>("SELECT COUNT(*) AS count FROM events").get()?.count ?? 0
  );
}

function countNotifications(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
}): number {
  return (
    input.database.query<CountRow, []>("SELECT COUNT(*) AS count FROM notifications").get()
      ?.count ?? 0
  );
}

function requireNotification(notification: NotificationRecord | undefined): NotificationRecord {
  if (notification === undefined) {
    throw new Error("Expected task action to return a notification.");
  }

  return notification;
}

function createProject(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly id?: SituId<"project">;
}): SituId<"project"> {
  const project = input.context.repositories.projects.create({
    id: input.id ?? ("project_task_actions" as SituId<"project">),
    name: "Task Actions Project",
    repositoryPath: "/tmp/task-actions-project",
    goalMarkdown: "Exercise task actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return project.id;
}

test("creates an assigned task with one exact event and notification", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const result = createTaskAction({
      context,
      id: "task_action_create" as SituId<"task">,
      eventId: "event_task_created" as SituId<"event">,
      projectId,
      title: "Create task action",
      bodyMarkdown: "Create the task",
      status: "backlog",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const notification = requireNotification(result.notification);

    expect(result.task.id).toBe("task_action_create");
    expect(result.event).toEqual({
      id: "event_task_created",
      target: {
        targetKind: "task",
        targetId: result.task.id,
      },
      actor: result.task.createdBy,
      summaryMarkdown: "Created task",
      bodyMarkdown: undefined,
      metadata: {
        createdAt: "2026-05-13T12:01:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(notification.id.startsWith("notification_")).toBe(true);
    expect(notification).toEqual({
      id: notification.id,
      recipient: {
        recipientId: "worker-1",
        displayName: undefined,
      },
      target: {
        targetKind: "task",
        targetId: result.task.id,
      },
      createdBy: result.task.createdBy,
      summaryMarkdown: "Assigned task: Create task action",
      bodyMarkdown: undefined,
      readAt: undefined,
      dismissedAt: undefined,
      metadata: {
        createdAt: "2026-05-13T12:01:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(context.repositories.tasks.getById({ id: result.task.id })).toEqual(result.task);
    expect(context.repositories.notifications.getById({ id: notification.id })).toEqual(
      notification,
    );
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("creates an unassigned task with one event and no notification", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const result = createTaskAction({
      context,
      id: "task_action_create_unassigned" as SituId<"task">,
      eventId: "event_task_created_unassigned" as SituId<"event">,
      projectId,
      title: "Create unassigned task action",
      bodyMarkdown: "Create the unassigned task",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(result.task.assignedTo).toBeUndefined();
    expect("notification" in result).toBe(false);
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("moves a task and uses the raw status in the event summary", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_action_move" as SituId<"task">,
      projectId,
      title: "Move task action",
      bodyMarkdown: "Move the task",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const actor = {
      actorKind: "local_agent" as const,
      actorId: "mover-1",
    };
    const result = moveTaskAction({
      context,
      id: task.id,
      status: "in_review",
      actor,
      eventId: "event_task_moved" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.task.status).toBe("in_review");
    expect(result.event.summaryMarkdown).toBe("Moved task to in_review");
    expect(result.event.target).toEqual({
      targetKind: "task",
      targetId: task.id,
    });
    expect(result.event.actor).toEqual(actor);
    expect(result.event.id).toBe("event_task_moved");
    expect(result.event.metadata.createdAt).toBe("2026-05-13T12:02:00.000Z");
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("assigns a task using the assigned actor display name in the event summary", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_action_assign" as SituId<"task">,
      projectId,
      title: "Assign task action",
      bodyMarkdown: "Assign the task",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const result = assignTaskAction({
      context,
      id: task.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_assigned" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });
    const notification = requireNotification(result.notification);

    expect(result.task.assignedTo?.actorId).toBe("worker-1");
    expect(result.event.summaryMarkdown).toBe("Assigned task to Worker 1");
    expect(result.event.id).toBe("event_task_assigned");
    expect(notification.id.startsWith("notification_")).toBe(true);
    expect(notification).toEqual({
      id: notification.id,
      recipient: {
        recipientId: "worker-1",
        displayName: "Worker 1",
      },
      target: {
        targetKind: "task",
        targetId: task.id,
      },
      createdBy: {
        actorKind: "human",
        actorId: "assigner",
        displayName: undefined,
      },
      summaryMarkdown: "Assigned task: Assign task action",
      bodyMarkdown: undefined,
      readAt: undefined,
      dismissedAt: undefined,
      metadata: {
        createdAt: "2026-05-13T12:02:00.000Z",
        updatedAt: "2026-05-13T12:02:00.000Z",
      },
    });
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("assigns a task using the assigned actor id when display name is absent", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_action_assign_id" as SituId<"task">,
      projectId,
      title: "Assign task action by id",
      bodyMarkdown: "Assign the task by id",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const result = assignTaskAction({
      context,
      id: task.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_assigned_id" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.event.summaryMarkdown).toBe("Assigned task to worker-1");
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("assigning a task to the same actor again creates another event and notification", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_action_assign_repeat" as SituId<"task">,
      projectId,
      title: "Repeat assignment",
      bodyMarkdown: "Assign the task repeatedly",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const assignedTo = {
      actorKind: "local_agent" as const,
      actorId: "worker-1",
    };

    assignTaskAction({
      context,
      id: task.id,
      assignedTo,
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_assigned_repeat_1" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });
    assignTaskAction({
      context,
      id: task.id,
      assignedTo,
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_assigned_repeat_2" as SituId<"event">,
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(countEvents({ database })).toBe(2);
    expect(countNotifications({ database })).toBe(2);
    expect(
      context.repositories.notifications
        .listAll()
        .map((notification) => notification.recipient.recipientId),
    ).toEqual(["worker-1", "worker-1"]);
  } finally {
    database.close();
  }
});

test("reassigning a task leaves prior notifications unchanged and notifies the new assignee", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_action_reassign" as SituId<"task">,
      projectId,
      title: "Reassign task action",
      bodyMarkdown: "Reassign the task",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const first = assignTaskAction({
      context,
      id: task.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_reassigned_1" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });
    const firstNotification = requireNotification(first.notification);
    const second = assignTaskAction({
      context,
      id: task.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-2",
      },
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_reassigned_2" as SituId<"event">,
      now: "2026-05-13T12:03:00.000Z",
    });
    const secondNotification = requireNotification(second.notification);

    expect(context.repositories.notifications.getById({ id: firstNotification.id })).toEqual(
      firstNotification,
    );
    expect(secondNotification.recipient.recipientId).toBe("worker-2");
    expect(secondNotification.dismissedAt).toBeUndefined();
    expect(secondNotification.readAt).toBeUndefined();
    expect(countEvents({ database })).toBe(2);
    expect(countNotifications({ database })).toBe(2);
  } finally {
    database.close();
  }
});

test("clears a task assignee with the exact event summary", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_action_clear" as SituId<"task">,
      projectId,
      title: "Clear task action",
      bodyMarkdown: "Clear the task assignee",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const result = assignTaskAction({
      context,
      id: task.id,
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_task_cleared" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.task.assignedTo).toBeUndefined();
    expect(result.event.summaryMarkdown).toBe("Cleared task assignee");
    expect("notification" in result).toBe(false);
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("rolls back task creation when event creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    context.repositories.events.create({
      id: "event_duplicate" as SituId<"event">,
      target: {
        targetKind: "task",
        targetId: "task_existing" as SituId<"task">,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(() =>
      createTaskAction({
        context,
        id: "task_rolled_back" as SituId<"task">,
        eventId: "event_duplicate" as SituId<"event">,
        projectId,
        title: "Rolled back",
        bodyMarkdown: "Rollback",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:01:00.000Z",
      }),
    ).toThrow();

    expect(
      context.repositories.tasks.getById({
        id: "task_rolled_back" as SituId<"task">,
      }),
    ).toBeUndefined();
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("rolls back task movement when event creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_move_rolled_back" as SituId<"task">,
      projectId,
      title: "Move rolled back",
      bodyMarkdown: "Rollback movement",
      status: "backlog",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.events.create({
      id: "event_duplicate_move" as SituId<"event">,
      target: {
        targetKind: "task",
        targetId: task.id,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(() =>
      moveTaskAction({
        context,
        id: task.id,
        status: "done",
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_duplicate_move" as SituId<"event">,
        now: "2026-05-13T12:02:00.000Z",
      }),
    ).toThrow();

    expect(context.repositories.tasks.getById({ id: task.id })?.status).toBe("backlog");
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("rolls back task assignment when event creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_assign_rolled_back" as SituId<"task">,
      projectId,
      title: "Assign rolled back",
      bodyMarkdown: "Rollback assignment",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "original-worker",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.events.create({
      id: "event_duplicate_assign" as SituId<"event">,
      target: {
        targetKind: "task",
        targetId: task.id,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(() =>
      assignTaskAction({
        context,
        id: task.id,
        assignedTo: {
          actorKind: "local_agent",
          actorId: "new-worker",
        },
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_duplicate_assign" as SituId<"event">,
        now: "2026-05-13T12:02:00.000Z",
      }),
    ).toThrow();

    expect(context.repositories.tasks.getById({ id: task.id })?.assignedTo?.actorId).toBe(
      "original-worker",
    );
    expect(countEvents({ database })).toBe(1);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("rolls back task creation when assignment notification creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    database.exec(`
CREATE TRIGGER fail_task_create_assignment_notification
BEFORE INSERT ON notifications
BEGIN
  SELECT RAISE(FAIL, 'notification insert failed');
END;
`);

    expect(() =>
      createTaskAction({
        context,
        id: "task_notification_rolled_back" as SituId<"task">,
        eventId: "event_task_notification_rolled_back" as SituId<"event">,
        projectId,
        title: "Notification rolled back",
        bodyMarkdown: "Rollback notification failure",
        assignedTo: {
          actorKind: "local_agent",
          actorId: "worker-1",
        },
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:01:00.000Z",
      }),
    ).toThrow();

    expect(
      context.repositories.tasks.getById({
        id: "task_notification_rolled_back" as SituId<"task">,
      }),
    ).toBeUndefined();
    expect(
      context.repositories.events.getById({
        id: "event_task_notification_rolled_back" as SituId<"event">,
      }),
    ).toBeUndefined();
    expect(countEvents({ database })).toBe(0);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("rolls back task assignment when assignment notification creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_assign_notification_rolled_back" as SituId<"task">,
      projectId,
      title: "Assign notification rolled back",
      bodyMarkdown: "Rollback assignment notification failure",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    database.exec(`
CREATE TRIGGER fail_task_assign_assignment_notification
BEFORE INSERT ON notifications
BEGIN
  SELECT RAISE(FAIL, 'notification insert failed');
END;
`);

    expect(() =>
      assignTaskAction({
        context,
        id: task.id,
        assignedTo: {
          actorKind: "local_agent",
          actorId: "worker-1",
        },
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_task_assign_notification_rolled_back" as SituId<"event">,
        now: "2026-05-13T12:02:00.000Z",
      }),
    ).toThrow();

    expect(context.repositories.tasks.getById({ id: task.id })?.assignedTo).toBeUndefined();
    expect(context.repositories.tasks.getById({ id: task.id })?.metadata.updatedAt).toBe(
      "2026-05-13T12:01:00.000Z",
    );
    expect(
      context.repositories.events.getById({
        id: "event_task_assign_notification_rolled_back" as SituId<"event">,
      }),
    ).toBeUndefined();
    expect(countEvents({ database })).toBe(0);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("does not create a task event when the primary write fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    expect(() =>
      createTaskAction({
        context,
        id: "task_missing_project" as SituId<"task">,
        eventId: "event_not_created" as SituId<"event">,
        projectId: "project_missing" as SituId<"project">,
        title: "Missing project",
        bodyMarkdown: "Primary write should fail",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:00:00.000Z",
      }),
    ).toThrow();

    expect(countEvents({ database })).toBe(0);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("task read actions return repository results without creating events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const task = context.repositories.tasks.create({
      id: "task_read_action" as SituId<"task">,
      projectId,
      title: "Task Read Action",
      bodyMarkdown: "Read the task",
      status: "backlog",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(getTaskAction({ context, id: task.id })).toEqual(task);
    expect(listTasksAction({ context, projectId, status: "backlog" })).toEqual([task]);
    expect(countEvents({ database })).toBe(0);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("list task action forwards multiple project ids", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectIdA = createProject({
      context,
      id: "project_task_actions_a" as SituId<"project">,
    });
    const projectIdB = createProject({
      context,
      id: "project_task_actions_b" as SituId<"project">,
    });
    const projectIdC = createProject({
      context,
      id: "project_task_actions_c" as SituId<"project">,
    });
    const taskA = context.repositories.tasks.create({
      id: "task_action_list_a" as SituId<"task">,
      projectId: projectIdA,
      title: "Task A",
      bodyMarkdown: "Read task A",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const taskB = context.repositories.tasks.create({
      id: "task_action_list_b" as SituId<"task">,
      projectId: projectIdB,
      title: "Task B",
      bodyMarkdown: "Read task B",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.tasks.create({
      id: "task_action_list_c" as SituId<"task">,
      projectId: projectIdC,
      title: "Task C",
      bodyMarkdown: "Read task C",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(
      listTasksAction({
        context,
        projectIds: [projectIdA, projectIdB],
      }),
    ).toEqual([taskA, taskB]);
    expect(countEvents({ database })).toBe(0);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("list task action propagates mutually exclusive project filter validation", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    try {
      listTasksAction({
        context,
        projectId: "project_task_actions" as SituId<"project">,
        projectIds: [],
      });
      throw new Error("Expected listTasksAction to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe(
        "Task list accepts either projectId or projectIds, not both.",
      );
      expect((error as ValidationError).details).toEqual({
        projectId: "project_task_actions",
        projectIds: [],
      });
    }

    expect(countEvents({ database })).toBe(0);
    expect(countNotifications({ database })).toBe(0);
  } finally {
    database.close();
  }
});

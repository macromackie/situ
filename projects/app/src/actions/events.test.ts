import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createEventAction,
  getEventAction,
  listEventsAction,
  listRecentEventsAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName: "events" | "notifications";
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

test("creates an event through the app action without emitting notifications or extra events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const result = createEventAction({
      context,
      id: "event_action_create" as SituId<"event">,
      target: {
        targetKind: "task",
        targetId: "task_event_target" as SituId<"task">,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      summaryMarkdown: "Corrected task status.",
      bodyMarkdown: "The task was already in progress.",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(result.event).toMatchObject({
      id: "event_action_create",
      target: {
        targetKind: "task",
        targetId: "task_event_target",
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      summaryMarkdown: "Corrected task status.",
      bodyMarkdown: "The task was already in progress.",
      metadata: {
        createdAt: "2026-05-13T12:00:00.000Z",
        updatedAt: "2026-05-13T12:00:00.000Z",
      },
    });
    expect(context.repositories.events.getById({ id: result.event.id })).toEqual(result.event);
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
  } finally {
    database.close();
  }
});

test("gets an existing and missing event without emitting additional records", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const event = context.repositories.events.create({
      id: "event_action_get" as SituId<"event">,
      target: {
        targetKind: "project",
        targetId: "project_event_target" as SituId<"project">,
      },
      actor: {
        actorKind: "local_agent",
        actorId: "agent-1",
      },
      summaryMarkdown: "Inspected project.",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(getEventAction({ context, id: event.id })).toEqual(event);
    expect(
      getEventAction({
        context,
        id: "event_missing" as SituId<"event">,
      }),
    ).toBeUndefined();
    expect(countRows({ database, tableName: "events" })).toBe(1);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
  } finally {
    database.close();
  }
});

test("lists events for a target", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const target = {
      targetKind: "task",
      targetId: "task_event_list" as SituId<"task">,
    } as const;
    const first = context.repositories.events.create({
      id: "event_action_list_first" as SituId<"event">,
      target,
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "First event.",
      now: "2026-05-13T12:00:00.000Z",
    });
    const second = context.repositories.events.create({
      id: "event_action_list_second" as SituId<"event">,
      target,
      actor: {
        actorKind: "local_agent",
        actorId: "agent-1",
      },
      summaryMarkdown: "Second event.",
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.events.create({
      id: "event_action_list_other" as SituId<"event">,
      target: {
        targetKind: "experiment",
        targetId: "experiment_event_list" as SituId<"experiment">,
      },
      actor: {
        actorKind: "system",
        actorId: "situ",
      },
      summaryMarkdown: "Other event.",
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      listEventsAction({
        context,
        target,
      }),
    ).toEqual([first, second]);
    expect(countRows({ database, tableName: "events" })).toBe(3);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
  } finally {
    database.close();
  }
});

test("lists recent events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const first = context.repositories.events.create({
      id: "event_action_recent_first" as SituId<"event">,
      target: {
        targetKind: "task",
        targetId: "task_event_recent" as SituId<"task">,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "First event.",
      now: "2026-05-13T12:00:00.000Z",
    });
    const second = context.repositories.events.create({
      id: "event_action_recent_second" as SituId<"event">,
      target: {
        targetKind: "task",
        targetId: "task_event_recent" as SituId<"task">,
      },
      actor: {
        actorKind: "local_agent",
        actorId: "agent-1",
      },
      summaryMarkdown: "Second event.",
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(listRecentEventsAction({ context, limit: 1 })).toEqual([second]);
    expect(listRecentEventsAction({ context })).toEqual([second, first]);
    expect(countRows({ database, tableName: "events" })).toBe(2);
    expect(countRows({ database, tableName: "notifications" })).toBe(0);
  } finally {
    database.close();
  }
});

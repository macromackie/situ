import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { createEventRecord, createEventRepository, eventsSchemaFragment } from "../src/index.js";

const taskTarget: TargetRef<"task"> = {
  targetKind: "task",
  targetId: "task_1" as SituId<"task">,
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  for (const statement of eventsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports event schema statements", () => {
  const expectedPackageName: "events" = eventsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("events");
  expect(eventsSchemaFragment.statements).toHaveLength(4);
});

test("creates event records with normalized fields", () => {
  const event = createEventRecord({
    id: "event_1" as SituId<"event">,
    target: taskTarget,
    summaryMarkdown: "  Moved to review  ",
    bodyMarkdown: "  Verification requested  ",
    actor: {
      actorKind: "local_agent",
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(event).toEqual({
    id: "event_1",
    target: taskTarget,
    actor: {
      actorKind: "local_agent",
      actorId: "scientist-1",
      displayName: "Scientist 1",
    },
    summaryMarkdown: "Moved to review",
    bodyMarkdown: "Verification requested",
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:00:00.000Z",
    },
  });
});

test("rejects invalid event records", () => {
  expect(() =>
    createEventRecord({
      target: taskTarget,
      summaryMarkdown: "",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createEventRecord({
      target: taskTarget,
      summaryMarkdown: "summary",
      bodyMarkdown: " ",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted events", () => {
  const database = createTestDatabase();
  const repository = createEventRepository({ database });

  try {
    const event = repository.create({
      id: "event_1" as SituId<"event">,
      target: taskTarget,
      summaryMarkdown: "Moved to review",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: event.id })).toEqual(event);
    expect(repository.getById({ id: "event_missing" as SituId<"event"> })).toBeUndefined();
    expect(event.bodyMarkdown).toBeUndefined();
    expect(event.actor.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists events for a target in creation order", () => {
  const database = createTestDatabase();
  const repository = createEventRepository({ database });
  const projectTarget: TargetRef<"project"> = {
    targetKind: "project",
    targetId: "project_1" as SituId<"project">,
  };

  try {
    const secondEvent = repository.create({
      id: "event_b" as SituId<"event">,
      target: taskTarget,
      summaryMarkdown: "Second",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstEvent = repository.create({
      id: "event_a" as SituId<"event">,
      target: taskTarget,
      summaryMarkdown: "First",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "event_c" as SituId<"event">,
      target: projectTarget,
      summaryMarkdown: "Other target",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listForTarget({ target: taskTarget }).map((event) => event.id)).toEqual([
      firstEvent.id,
      secondEvent.id,
    ]);
    expect(repository.listForTarget({ target: projectTarget }).map((event) => event.id)).toEqual([
      "event_c",
    ]);
  } finally {
    database.close();
  }
});

test("lists all events in creation order", () => {
  const database = createTestDatabase();
  const repository = createEventRepository({ database });
  const projectTarget: TargetRef<"project"> = {
    targetKind: "project",
    targetId: "project_1" as SituId<"project">,
  };

  try {
    repository.create({
      id: "event_b" as SituId<"event">,
      target: taskTarget,
      summaryMarkdown: "Same timestamp second by id",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "event_a" as SituId<"event">,
      target: projectTarget,
      summaryMarkdown: "Same timestamp first by id",
      actor: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "event_c" as SituId<"event">,
      target: taskTarget,
      summaryMarkdown: "Later timestamp",
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(repository.listAll().map((event) => event.id)).toEqual([
      "event_a",
      "event_b",
      "event_c",
    ]);
  } finally {
    database.close();
  }
});

test("lists recent events in reverse creation order", () => {
  const database = createTestDatabase();
  const repository = createEventRepository({ database });

  try {
    for (const id of ["event_a", "event_b", "event_c"]) {
      repository.create({
        id: id as SituId<"event">,
        target: taskTarget,
        summaryMarkdown: id,
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:00:00.000Z",
      });
    }

    expect(repository.listRecent({ limit: 2 }).map((event) => event.id)).toEqual([
      "event_c",
      "event_b",
    ]);
    expect(repository.listRecent({ limit: 999 })).toHaveLength(3);
    expect(() => repository.listRecent({ limit: 0 })).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("applies default and capped recent event limits", () => {
  const database = createTestDatabase();
  const repository = createEventRepository({ database });

  try {
    for (let index = 0; index < 510; index += 1) {
      const eventNumber = index + 1;

      repository.create({
        id: `event_${eventNumber.toString().padStart(3, "0")}` as SituId<"event">,
        target: taskTarget,
        summaryMarkdown: `Event ${eventNumber}`,
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        now: new Date(Date.UTC(2026, 4, 13, 12, 0, index)).toISOString(),
      });
    }

    expect(repository.listRecent()).toHaveLength(50);
    expect(repository.listRecent({ limit: 999 })).toHaveLength(500);
  } finally {
    database.close();
  }
});

test("reports duplicate events as conflicts", () => {
  const database = createTestDatabase();
  const repository = createEventRepository({ database });
  const input = {
    id: "event_1" as SituId<"event">,
    target: taskTarget,
    summaryMarkdown: "Moved to review",
    actor: {
      actorKind: "human" as const,
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
  } finally {
    database.close();
  }
});

import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { ActorRef, SituId } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  type BaselineStatus,
  baselinesSchemaFragment,
  createBaselineRecord,
  createBaselineRepository,
  createBaselinesProjectIdIndexStatement,
  createBaselinesProjectStatusIndexStatement,
  createBaselinesStatusIndexStatement,
  createBaselinesTableStatement,
  createBaselinesTaskIdIndexStatement,
} from "../src/index.js";

const projectId = "project_1" as SituId<"project">;
const taskId = "task_1" as SituId<"task">;

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("CREATE TABLE projects (id TEXT PRIMARY KEY);");
  database.exec(
    "CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id));",
  );

  for (const statement of baselinesSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

function insertProject(database: Database, id: SituId<"project"> = projectId): void {
  database.query("INSERT INTO projects (id) VALUES (?)").run(id);
}

function insertTask(
  database: Database,
  input: {
    readonly id?: SituId<"task">;
    readonly projectId?: SituId<"project">;
  } = {},
): void {
  database
    .query("INSERT INTO tasks (id, project_id) VALUES (?, ?)")
    .run(input.id ?? taskId, input.projectId ?? projectId);
}

test("exports baseline schema statements", () => {
  const expectedPackageName: "baselines" = baselinesSchemaFragment.packageName;

  expect(expectedPackageName).toBe("baselines");
  expect(baselinesSchemaFragment.statements).toEqual([
    createBaselinesTableStatement,
    createBaselinesProjectIdIndexStatement,
    createBaselinesTaskIdIndexStatement,
    createBaselinesStatusIndexStatement,
    createBaselinesProjectStatusIndexStatement,
  ]);
});

test("creates baseline records with normalized fields", () => {
  const baseline = createBaselineRecord({
    id: "baseline_1" as SituId<"baseline">,
    projectId,
    taskId,
    title: "  Native baseline  ",
    summaryMarkdown: "  Run the native benchmark before candidate fan-out.  ",
    status: "active",
    createdBy: {
      actorKind: " local_agent " as ActorRef["actorKind"],
      actorId: "  manager  ",
      displayName: "  Manager  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(baseline).toEqual({
    id: "baseline_1",
    projectId,
    taskId,
    title: "Native baseline",
    summaryMarkdown: "Run the native benchmark before candidate fan-out.",
    status: "active",
    createdBy: {
      actorKind: "local_agent",
      actorId: "manager",
      displayName: "Manager",
    },
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:00:00.000Z",
    },
  });
});

test("rejects invalid baseline records", () => {
  const validInput = {
    projectId,
    title: "Native baseline",
    summaryMarkdown: "Run the native benchmark.",
    createdBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
  };

  expect(() =>
    createBaselineRecord({
      ...validInput,
      title: " ",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createBaselineRecord({
      ...validInput,
      summaryMarkdown: "",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createBaselineRecord({
      ...validInput,
      status: "done" as BaselineStatus,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createBaselineRecord({
      ...validInput,
      createdBy: {
        actorKind: "human",
        actorId: "",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates, reads, lists, and moves persisted baselines", () => {
  const database = createTestDatabase();
  const repository = createBaselineRepository({ database });

  try {
    insertProject(database);
    insertTask(database);

    const baseline = repository.create({
      id: "baseline_1" as SituId<"baseline">,
      projectId,
      taskId,
      title: "Native baseline",
      summaryMarkdown: "Run the native benchmark.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: baseline.id })).toEqual(baseline);
    expect(repository.list({ projectId })).toEqual([baseline]);
    expect(repository.list({ taskId })).toEqual([baseline]);
    expect(repository.list({ status: "active" })).toEqual([baseline]);
    expect(repository.list({ status: "superseded" })).toEqual([]);

    const moved = repository.move({
      id: baseline.id,
      status: "superseded",
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(moved).toMatchObject({
      id: baseline.id,
      status: "superseded",
      metadata: {
        createdAt: "2026-05-13T12:00:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(repository.getById({ id: "baseline_missing" as SituId<"baseline"> })).toBeUndefined();
  } finally {
    database.close();
  }
});

test("reports duplicate, missing-parent, and missing-move errors", () => {
  const database = createTestDatabase();
  const repository = createBaselineRepository({ database });
  const input = {
    id: "baseline_1" as SituId<"baseline">,
    projectId,
    title: "Native baseline",
    summaryMarkdown: "Run the native benchmark.",
    createdBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    insertProject(database);
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
    expect(() =>
      repository.create({
        ...input,
        id: "baseline_2" as SituId<"baseline">,
        projectId: "project_missing" as SituId<"project">,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      repository.move({
        id: "baseline_missing" as SituId<"baseline">,
        status: "abandoned",
      }),
    ).toThrow(NotFoundError);
  } finally {
    database.close();
  }
});

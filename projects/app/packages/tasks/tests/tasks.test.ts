import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  assignTaskRecord,
  createTaskRecord,
  createTaskRepository,
  moveTaskRecord,
  tasksSchemaFragment,
} from "../src/index.js";

function createTestDatabase(): Database {
  const database = new Database(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE projects (id TEXT PRIMARY KEY)");
  database.query("INSERT INTO projects (id) VALUES (?)").run("project_1");
  database.query("INSERT INTO projects (id) VALUES (?)").run("project_2");
  database.query("INSERT INTO projects (id) VALUES (?)").run("project_3");

  for (const statement of tasksSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports task schema statements", () => {
  const expectedPackageName: "tasks" = tasksSchemaFragment.packageName;

  expect(expectedPackageName).toBe("tasks");
  expect(tasksSchemaFragment.statements).toHaveLength(5);
});

test("creates triage task records with normalized fields", () => {
  const task = createTaskRecord({
    id: "task_1" as SituId<"task">,
    projectId: "project_1" as SituId<"project">,
    title: "  Fix scorer  ",
    bodyMarkdown: "  Check the latest run  ",
    createdBy: {
      actorKind: "local_agent",
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    assignedTo: {
      actorKind: "local_agent",
      actorId: "  verifier-1  ",
      displayName: "  Verifier 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(task).toEqual({
    id: "task_1",
    projectId: "project_1",
    title: "Fix scorer",
    bodyMarkdown: "Check the latest run",
    status: "triage",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "verifier-1",
      displayName: "Verifier 1",
    },
    createdBy: {
      actorKind: "local_agent",
      actorId: "scientist-1",
      displayName: "Scientist 1",
    },
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:00:00.000Z",
    },
  });
});

test("rejects invalid task records", () => {
  expect(() =>
    createTaskRecord({
      projectId: "project_1" as SituId<"project">,
      title: "",
      bodyMarkdown: "body",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createTaskRecord({
      projectId: "project_1" as SituId<"project">,
      title: "Title",
      bodyMarkdown: "",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createTaskRecord({
      projectId: "project_1" as SituId<"project">,
      title: "Title",
      bodyMarkdown: "body",
      status: "blocked" as never,
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);
});

test("moves and assigns task records", () => {
  const task = createTaskRecord({
    id: "task_1" as SituId<"task">,
    projectId: "project_1" as SituId<"project">,
    title: "Fix scorer",
    bodyMarkdown: "Check the latest run",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });
  const movedTask = moveTaskRecord({
    task,
    status: "in_progress",
    now: "2026-05-13T12:01:00.000Z",
  });
  const assignedTask = assignTaskRecord({
    task: movedTask,
    assignedTo: {
      actorKind: "local_agent",
      actorId: "scientist-1",
    },
    now: "2026-05-13T12:02:00.000Z",
  });

  expect(movedTask.status).toBe("in_progress");
  expect(movedTask.metadata.updatedAt).toBe("2026-05-13T12:01:00.000Z");
  expect(assignedTask.assignedTo).toEqual({
    actorKind: "local_agent",
    actorId: "scientist-1",
    displayName: undefined,
  });
  expect(assignedTask.metadata.updatedAt).toBe("2026-05-13T12:02:00.000Z");
});

test("creates and reads persisted tasks", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    const task = repository.create({
      id: "task_1" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Fix scorer",
      bodyMarkdown: "Check the latest run",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: task.id })).toEqual(task);
    expect(repository.getById({ id: "task_missing" as SituId<"task"> })).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists tasks with combined filters", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    const taskA = repository.create({
      id: "task_a" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Task A",
      bodyMarkdown: "Body A",
      status: "backlog",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      assignedTo: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const taskB = repository.create({
      id: "task_b" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Task B",
      bodyMarkdown: "Body B",
      status: "in_review",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      assignedTo: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(repository.list().map((task) => task.id)).toEqual([taskA.id, taskB.id]);
    expect(repository.list({ status: "backlog" }).map((task) => task.id)).toEqual([taskA.id]);
    expect(
      repository.list({ projectId: "project_1" as SituId<"project"> }).map((task) => task.id),
    ).toEqual([taskA.id, taskB.id]);
    expect(
      repository
        .list({
          assignedTo: {
            actorKind: "local_agent",
            actorId: "scientist-1",
          },
        })
        .map((task) => task.id),
    ).toEqual([taskA.id]);
    expect(
      repository
        .list({
          projectId: "project_1" as SituId<"project">,
          assignedTo: {
            actorKind: "local_agent",
            actorId: "verifier-1",
          },
        })
        .map((task) => task.id),
    ).toEqual([taskB.id]);
  } finally {
    database.close();
  }
});

test("lists tasks by multiple project ids with global ordering", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    repository.create({
      id: "task_project_2_first" as SituId<"task">,
      projectId: "project_2" as SituId<"project">,
      title: "Project 2 first",
      bodyMarkdown: "Body",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "task_project_1_second" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Project 1 second",
      bodyMarkdown: "Body",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "task_project_3_ignored" as SituId<"task">,
      projectId: "project_3" as SituId<"project">,
      title: "Project 3 ignored",
      bodyMarkdown: "Body",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T11:59:00.000Z",
    });
    repository.create({
      id: "task_project_1_tie" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Project 1 tie",
      bodyMarkdown: "Body",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(
      repository
        .list({
          projectIds: [
            "project_1" as SituId<"project">,
            "project_2" as SituId<"project">,
            "project_1" as SituId<"project">,
          ],
        })
        .map((task) => task.id),
    ).toEqual(["task_project_2_first", "task_project_1_second", "task_project_1_tie"]);
  } finally {
    database.close();
  }
});

test("combines multi-project task listing with status and assigned actor filters", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    repository.create({
      id: "task_matching" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Matching",
      bodyMarkdown: "Body",
      status: "in_progress",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "task_wrong_status" as SituId<"task">,
      projectId: "project_2" as SituId<"project">,
      title: "Wrong status",
      bodyMarkdown: "Body",
      status: "backlog",
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
    repository.create({
      id: "task_wrong_assignee" as SituId<"task">,
      projectId: "project_2" as SituId<"project">,
      title: "Wrong assignee",
      bodyMarkdown: "Body",
      status: "in_progress",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-2",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    repository.create({
      id: "task_wrong_project" as SituId<"task">,
      projectId: "project_3" as SituId<"project">,
      title: "Wrong project",
      bodyMarkdown: "Body",
      status: "in_progress",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(
      repository
        .list({
          projectIds: ["project_1" as SituId<"project">, "project_2" as SituId<"project">],
          status: "in_progress",
        })
        .map((task) => task.id),
    ).toEqual(["task_matching", "task_wrong_assignee"]);
    expect(
      repository
        .list({
          projectIds: ["project_1" as SituId<"project">, "project_2" as SituId<"project">],
          assignedTo: {
            actorKind: "local_agent",
            actorId: "worker-1",
          },
        })
        .map((task) => task.id),
    ).toEqual(["task_matching", "task_wrong_status"]);
    expect(
      repository
        .list({
          projectIds: ["project_1" as SituId<"project">, "project_2" as SituId<"project">],
          status: "in_progress",
          assignedTo: {
            actorKind: "local_agent",
            actorId: "worker-1",
          },
        })
        .map((task) => task.id),
    ).toEqual(["task_matching"]);
  } finally {
    database.close();
  }
});

test("returns no tasks for an empty multi-project filter", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    repository.create({
      id: "task_existing" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Existing",
      bodyMarkdown: "Body",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.list({ projectIds: [] })).toEqual([]);
  } finally {
    database.close();
  }
});

test("rejects task list input with both single and multiple project filters", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    expect(() =>
      repository.list({
        projectId: "project_1" as SituId<"project">,
        projectIds: ["project_2" as SituId<"project">],
      }),
    ).toThrow(ValidationError);

    try {
      repository.list({
        projectId: "project_1" as SituId<"project">,
        projectIds: [],
      });
      throw new Error("Expected repository.list to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe(
        "Task list accepts either projectId or projectIds, not both.",
      );
      expect((error as ValidationError).details).toEqual({
        projectId: "project_1",
        projectIds: [],
      });
    }
  } finally {
    database.close();
  }
});

test("moves and assigns persisted tasks", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });

  try {
    const task = repository.create({
      id: "task_1" as SituId<"task">,
      projectId: "project_1" as SituId<"project">,
      title: "Fix scorer",
      bodyMarkdown: "Check the latest run",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const movedTask = repository.move({
      id: task.id,
      status: "in_progress",
      now: "2026-05-13T12:01:00.000Z",
    });
    const assignedTask = repository.assign({
      id: task.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const unassignedTask = repository.assign({
      id: task.id,
      assignedTo: undefined,
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(movedTask.status).toBe("in_progress");
    expect(assignedTask.assignedTo).toEqual({
      actorKind: "local_agent",
      actorId: "scientist-1",
      displayName: undefined,
    });
    expect(unassignedTask.assignedTo).toBeUndefined();
  } finally {
    database.close();
  }
});

test("reports repository conflicts and missing tasks", () => {
  const database = createTestDatabase();
  const repository = createTaskRepository({ database });
  const input = {
    id: "task_1" as SituId<"task">,
    projectId: "project_1" as SituId<"project">,
    title: "Task",
    bodyMarkdown: "Body",
    createdBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
    expect(() =>
      repository.create({
        ...input,
        id: "task_2" as SituId<"task">,
        projectId: "project_missing" as SituId<"project">,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      repository.move({
        id: "task_missing" as SituId<"task">,
        status: "done",
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      repository.assign({
        id: "task_missing" as SituId<"task">,
        assignedTo: undefined,
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      repository.list({
        status: "blocked" as never,
      }),
    ).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

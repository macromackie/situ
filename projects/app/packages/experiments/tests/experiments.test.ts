import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  assignExperimentRecord,
  createExperimentRecord,
  createExperimentRepository,
  experimentsSchemaFragment,
  moveExperimentRecord,
  reviseExperimentRecord,
} from "../src/index.js";

function createTestDatabase(): Database {
  const database = new Database(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE projects (id TEXT PRIMARY KEY)");
  database.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY)");
  database.query("INSERT INTO projects (id) VALUES (?)").run("project_1");
  database.query("INSERT INTO projects (id) VALUES (?)").run("project_2");
  database.query("INSERT INTO tasks (id) VALUES (?)").run("task_1");
  database.query("INSERT INTO tasks (id) VALUES (?)").run("task_2");

  for (const statement of experimentsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports experiment schema statements", () => {
  const expectedPackageName: "experiments" = experimentsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("experiments");
  expect(experimentsSchemaFragment.statements).toHaveLength(6);
});

test("creates planned experiment records with normalized fields", () => {
  const experiment = createExperimentRecord({
    id: "experiment_1" as SituId<"experiment">,
    projectId: "project_1" as SituId<"project">,
    taskId: "task_1" as SituId<"task">,
    title: "  Try beam search  ",
    summaryMarkdown: "  Improve the scorer pass  ",
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
    baseRef: "  main  ",
    branchName: "  experiment/beam-search  ",
    worktreePath: "  /tmp/situ/worktrees/beam-search  ",
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(experiment).toEqual({
    id: "experiment_1",
    projectId: "project_1",
    taskId: "task_1",
    title: "Try beam search",
    summaryMarkdown: "Improve the scorer pass",
    status: "planned",
    revisionNumber: 1,
    baseRef: "main",
    branchName: "experiment/beam-search",
    worktreePath: "/tmp/situ/worktrees/beam-search",
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

test("rejects invalid experiment records", () => {
  const validInput = {
    projectId: "project_1" as SituId<"project">,
    taskId: "task_1" as SituId<"task">,
    title: "Experiment",
    summaryMarkdown: "Summary",
    createdBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
  };

  expect(() =>
    createExperimentRecord({
      ...validInput,
      title: "",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createExperimentRecord({
      ...validInput,
      summaryMarkdown: "",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createExperimentRecord({
      ...validInput,
      status: "blocked" as never,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createExperimentRecord({
      ...validInput,
      baseRef: " ",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createExperimentRecord({
      ...validInput,
      createdBy: {
        actorKind: "human",
        actorId: " ",
      },
    }),
  ).toThrow(ValidationError);
});

test("moves, assigns, and revises experiment records", () => {
  const experiment = createExperimentRecord({
    id: "experiment_1" as SituId<"experiment">,
    projectId: "project_1" as SituId<"project">,
    taskId: "task_1" as SituId<"task">,
    title: "Try beam search",
    summaryMarkdown: "Initial approach",
    baseRef: "main",
    branchName: "experiment/beam-search",
    worktreePath: "/tmp/worktree",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });
  const movedExperiment = moveExperimentRecord({
    experiment,
    status: "running",
    now: "2026-05-13T12:01:00.000Z",
  });
  const assignedExperiment = assignExperimentRecord({
    experiment: movedExperiment,
    assignedTo: {
      actorKind: "local_agent",
      actorId: "scientist-1",
    },
    now: "2026-05-13T12:02:00.000Z",
  });
  const revisedExperiment = reviseExperimentRecord({
    experiment: assignedExperiment,
    summaryMarkdown: "  Revised approach  ",
    status: "ready_for_review",
    clearBaseRef: true,
    branchName: "  experiment/revised  ",
    clearWorktreePath: true,
    now: "2026-05-13T12:03:00.000Z",
  });

  expect(movedExperiment.status).toBe("running");
  expect(movedExperiment.metadata.updatedAt).toBe("2026-05-13T12:01:00.000Z");
  expect(assignedExperiment.assignedTo).toEqual({
    actorKind: "local_agent",
    actorId: "scientist-1",
    displayName: undefined,
  });
  expect(revisedExperiment).toEqual({
    ...assignedExperiment,
    summaryMarkdown: "Revised approach",
    status: "ready_for_review",
    revisionNumber: 2,
    baseRef: undefined,
    branchName: "experiment/revised",
    worktreePath: undefined,
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:03:00.000Z",
    },
  });
});

test("rejects invalid experiment revisions", () => {
  const experiment = createExperimentRecord({
    id: "experiment_1" as SituId<"experiment">,
    projectId: "project_1" as SituId<"project">,
    taskId: "task_1" as SituId<"task">,
    title: "Try beam search",
    summaryMarkdown: "Initial approach",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
  });

  expect(() =>
    reviseExperimentRecord({
      experiment,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    reviseExperimentRecord({
      experiment,
      summaryMarkdown: " ",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    reviseExperimentRecord({
      experiment,
      status: "blocked" as never,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    reviseExperimentRecord({
      experiment,
      baseRef: "main",
      clearBaseRef: true,
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted experiments", () => {
  const database = createTestDatabase();
  const repository = createExperimentRepository({ database });

  try {
    const experiment = repository.create({
      id: "experiment_1" as SituId<"experiment">,
      projectId: "project_1" as SituId<"project">,
      taskId: "task_1" as SituId<"task">,
      title: "Try beam search",
      summaryMarkdown: "Initial approach",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: experiment.id })).toEqual(experiment);
    expect(
      repository.getById({ id: "experiment_missing" as SituId<"experiment"> }),
    ).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists experiments with combined filters", () => {
  const database = createTestDatabase();
  const repository = createExperimentRepository({ database });

  try {
    const experimentB = repository.create({
      id: "experiment_b" as SituId<"experiment">,
      projectId: "project_1" as SituId<"project">,
      taskId: "task_1" as SituId<"task">,
      title: "Experiment B",
      summaryMarkdown: "Body B",
      status: "running",
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
    const experimentA = repository.create({
      id: "experiment_a" as SituId<"experiment">,
      projectId: "project_1" as SituId<"project">,
      taskId: "task_1" as SituId<"task">,
      title: "Experiment A",
      summaryMarkdown: "Body A",
      status: "ready_for_review",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      assignedTo: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const experimentC = repository.create({
      id: "experiment_c" as SituId<"experiment">,
      projectId: "project_2" as SituId<"project">,
      taskId: "task_2" as SituId<"task">,
      title: "Experiment C",
      summaryMarkdown: "Body C",
      status: "ready_for_review",
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

    expect(repository.list().map((experiment) => experiment.id)).toEqual([
      experimentA.id,
      experimentB.id,
      experimentC.id,
    ]);
    expect(repository.list({ status: "running" }).map((experiment) => experiment.id)).toEqual([
      experimentB.id,
    ]);
    expect(
      repository
        .list({
          projectId: "project_1" as SituId<"project">,
          taskId: "task_1" as SituId<"task">,
          status: "ready_for_review",
          assignedTo: {
            actorKind: "local_agent",
            actorId: "verifier-1",
          },
        })
        .map((experiment) => experiment.id),
    ).toEqual([experimentA.id]);
  } finally {
    database.close();
  }
});

test("moves, assigns, and revises persisted experiments", () => {
  const database = createTestDatabase();
  const repository = createExperimentRepository({ database });

  try {
    const experiment = repository.create({
      id: "experiment_1" as SituId<"experiment">,
      projectId: "project_1" as SituId<"project">,
      taskId: "task_1" as SituId<"task">,
      title: "Try beam search",
      summaryMarkdown: "Initial approach",
      baseRef: "main",
      branchName: "experiment/beam-search",
      worktreePath: "/tmp/worktree",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const movedExperiment = repository.move({
      id: experiment.id,
      status: "running",
      now: "2026-05-13T12:01:00.000Z",
    });
    const assignedExperiment = repository.assign({
      id: experiment.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const revisedExperiment = repository.revise({
      id: experiment.id,
      summaryMarkdown: "Ready for review",
      status: "ready_for_review",
      clearBaseRef: true,
      clearBranchName: true,
      clearWorktreePath: true,
      now: "2026-05-13T12:03:00.000Z",
    });
    const unassignedExperiment = repository.assign({
      id: experiment.id,
      assignedTo: undefined,
      now: "2026-05-13T12:04:00.000Z",
    });

    expect(movedExperiment.status).toBe("running");
    expect(assignedExperiment.assignedTo).toEqual({
      actorKind: "local_agent",
      actorId: "scientist-1",
      displayName: undefined,
    });
    expect(revisedExperiment).toEqual({
      ...assignedExperiment,
      summaryMarkdown: "Ready for review",
      status: "ready_for_review",
      revisionNumber: 2,
      baseRef: undefined,
      branchName: undefined,
      worktreePath: undefined,
      metadata: {
        createdAt: "2026-05-13T12:00:00.000Z",
        updatedAt: "2026-05-13T12:03:00.000Z",
      },
    });
    expect(unassignedExperiment.assignedTo).toBeUndefined();
  } finally {
    database.close();
  }
});

test("reports repository conflicts, missing experiments, and validation errors", () => {
  const database = createTestDatabase();
  const repository = createExperimentRepository({ database });
  const input = {
    id: "experiment_1" as SituId<"experiment">,
    projectId: "project_1" as SituId<"project">,
    taskId: "task_1" as SituId<"task">,
    title: "Experiment",
    summaryMarkdown: "Summary",
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
        id: "experiment_2" as SituId<"experiment">,
        projectId: "project_missing" as SituId<"project">,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      repository.create({
        ...input,
        id: "experiment_3" as SituId<"experiment">,
        taskId: "task_missing" as SituId<"task">,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      repository.move({
        id: "experiment_missing" as SituId<"experiment">,
        status: "accepted",
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      repository.assign({
        id: "experiment_missing" as SituId<"experiment">,
        assignedTo: undefined,
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      repository.revise({
        id: "experiment_missing" as SituId<"experiment">,
        status: "accepted",
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      repository.list({
        status: "blocked" as never,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      repository.revise({
        id: "experiment_1" as SituId<"experiment">,
      }),
    ).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("does not translate unexpected create constraints to conflicts", () => {
  const database = createTestDatabase();
  const repository = createExperimentRepository({ database });

  try {
    database.exec(`
CREATE TRIGGER experiments_reject_insert
BEFORE INSERT ON experiments
BEGIN
  SELECT RAISE(ABORT, 'unexpected experiment constraint');
END;
`);

    let thrownError: unknown;

    try {
      repository.create({
        id: "experiment_1" as SituId<"experiment">,
        projectId: "project_1" as SituId<"project">,
        taskId: "task_1" as SituId<"task">,
        title: "Experiment",
        summaryMarkdown: "Summary",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError).not.toBeInstanceOf(ConflictError);
  } finally {
    database.close();
  }
});

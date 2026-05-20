import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  assignExperimentAction,
  createAppActionContext,
  createExperimentAction,
  getExperimentAction,
  listExperimentsAction,
  moveExperimentAction,
  reviseExperimentAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName: "events" | "experiments";
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function createProject(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly id?: SituId<"project">;
}): SituId<"project"> {
  const project = input.context.repositories.projects.create({
    id: input.id ?? ("project_experiment_actions" as SituId<"project">),
    name: "Experiment Actions Project",
    repositoryPath: "/tmp/experiment-actions-project",
    goalMarkdown: "Exercise experiment actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return project.id;
}

function createTask(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly projectId: SituId<"project">;
  readonly id?: SituId<"task">;
}): SituId<"task"> {
  const task = input.context.repositories.tasks.create({
    id: input.id ?? ("task_experiment_actions" as SituId<"task">),
    projectId: input.projectId,
    title: "Experiment Actions Task",
    bodyMarkdown: "Exercise experiment actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return task.id;
}

function createExperiment(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly id?: SituId<"experiment">;
  readonly assignedToActorId?: string;
}) {
  return input.context.repositories.experiments.create({
    id: input.id ?? ("experiment_action_fixture" as SituId<"experiment">),
    projectId: input.projectId,
    taskId: input.taskId,
    title: "Experiment Action",
    summaryMarkdown: "Initial summary",
    status: "planned",
    baseRef: "main",
    branchName: "experiment/action",
    worktreePath: "/tmp/experiment-action",
    assignedTo:
      input.assignedToActorId === undefined
        ? undefined
        : {
            actorKind: "local_agent",
            actorId: input.assignedToActorId,
          },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:01:00.000Z",
  });
}

function createDuplicateEvent(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly id: SituId<"event">;
  readonly targetId: SituId<"experiment">;
}): void {
  input.context.repositories.events.create({
    id: input.id,
    target: {
      targetKind: "experiment",
      targetId: input.targetId,
    },
    actor: {
      actorKind: "human",
      actorId: "scott",
    },
    summaryMarkdown: "Existing event",
    now: "2026-05-13T12:00:00.000Z",
  });
}

test("creates an experiment through the app action and creates exactly one event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const result = createExperimentAction({
      context,
      id: "experiment_action_create" as SituId<"experiment">,
      eventId: "event_experiment_created" as SituId<"event">,
      projectId,
      taskId,
      title: "Create experiment action",
      summaryMarkdown: "Create the experiment",
      status: "running",
      baseRef: "main",
      branchName: "experiment/create-action",
      worktreePath: "/tmp/create-action",
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

    expect(result.experiment.id).toBe("experiment_action_create");
    expect(result.experiment.revisionNumber).toBe(1);
    expect(result.event).toEqual({
      id: "event_experiment_created",
      target: {
        targetKind: "experiment",
        targetId: result.experiment.id,
      },
      actor: result.experiment.createdBy,
      summaryMarkdown: "Created experiment",
      bodyMarkdown: undefined,
      metadata: {
        createdAt: "2026-05-13T12:01:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(context.repositories.experiments.getById({ id: result.experiment.id })).toEqual(
      result.experiment,
    );
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("moves an experiment and creates exactly one event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const experiment = createExperiment({ context, projectId, taskId });
    const actor = {
      actorKind: "local_agent" as const,
      actorId: "mover-1",
    };
    const result = moveExperimentAction({
      context,
      id: experiment.id,
      status: "ready_for_review",
      actor,
      eventId: "event_experiment_moved" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.experiment.status).toBe("ready_for_review");
    expect(result.event.summaryMarkdown).toBe("Moved experiment to ready_for_review");
    expect(result.event.target).toEqual({
      targetKind: "experiment",
      targetId: experiment.id,
    });
    expect(result.event.actor).toEqual(actor);
    expect(result.event.id).toBe("event_experiment_moved");
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("assigns an experiment with display name in the event summary", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const experiment = createExperiment({ context, projectId, taskId });
    const result = assignExperimentAction({
      context,
      id: experiment.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_experiment_assigned" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.experiment.assignedTo?.actorId).toBe("worker-1");
    expect(result.event.summaryMarkdown).toBe("Assigned experiment to Worker 1");
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("assigns an experiment with actor id in the event summary when display name is absent", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const experiment = createExperiment({ context, projectId, taskId });
    const result = assignExperimentAction({
      context,
      id: experiment.id,
      assignedTo: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_experiment_assigned_id" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.event.summaryMarkdown).toBe("Assigned experiment to worker-1");
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("clears an experiment assignee with the exact event summary", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const experiment = createExperiment({
      context,
      projectId,
      taskId,
      assignedToActorId: "worker-1",
    });
    const result = assignExperimentAction({
      context,
      id: experiment.id,
      actor: {
        actorKind: "human",
        actorId: "assigner",
      },
      eventId: "event_experiment_cleared" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.experiment.assignedTo).toBeUndefined();
    expect(result.event.summaryMarkdown).toBe("Cleared experiment assignee");
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("revises an experiment and uses the returned revision number in the event summary", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const experiment = createExperiment({ context, projectId, taskId });
    const result = reviseExperimentAction({
      context,
      id: experiment.id,
      summaryMarkdown: "Ready for review",
      status: "ready_for_review",
      clearBaseRef: true,
      branchName: "experiment/revised",
      clearWorktreePath: true,
      actor: {
        actorKind: "local_agent",
        actorId: "reviser-1",
      },
      eventId: "event_experiment_revised" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.experiment.revisionNumber).toBe(2);
    expect(result.experiment.summaryMarkdown).toBe("Ready for review");
    expect(result.event.summaryMarkdown).toBe("Revised experiment to revision 2");
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("event creation failure rolls back create, move, assign, and revise writes", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    createDuplicateEvent({
      context,
      id: "event_duplicate_create" as SituId<"event">,
      targetId: "experiment_rolled_back" as SituId<"experiment">,
    });

    expect(() =>
      createExperimentAction({
        context,
        id: "experiment_rolled_back" as SituId<"experiment">,
        eventId: "event_duplicate_create" as SituId<"event">,
        projectId,
        taskId,
        title: "Rolled back",
        summaryMarkdown: "Rollback",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:01:00.000Z",
      }),
    ).toThrow();

    expect(
      context.repositories.experiments.getById({
        id: "experiment_rolled_back" as SituId<"experiment">,
      }),
    ).toBeUndefined();

    const experiment = createExperiment({
      context,
      projectId,
      taskId,
      id: "experiment_write_rollback" as SituId<"experiment">,
      assignedToActorId: "original-worker",
    });

    createDuplicateEvent({
      context,
      id: "event_duplicate_move" as SituId<"event">,
      targetId: experiment.id,
    });
    expect(() =>
      moveExperimentAction({
        context,
        id: experiment.id,
        status: "accepted",
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_duplicate_move" as SituId<"event">,
        now: "2026-05-13T12:02:00.000Z",
      }),
    ).toThrow();
    expect(context.repositories.experiments.getById({ id: experiment.id })?.status).toBe("planned");

    createDuplicateEvent({
      context,
      id: "event_duplicate_assign" as SituId<"event">,
      targetId: experiment.id,
    });
    expect(() =>
      assignExperimentAction({
        context,
        id: experiment.id,
        assignedTo: {
          actorKind: "local_agent",
          actorId: "new-worker",
        },
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_duplicate_assign" as SituId<"event">,
        now: "2026-05-13T12:03:00.000Z",
      }),
    ).toThrow();
    expect(
      context.repositories.experiments.getById({ id: experiment.id })?.assignedTo?.actorId,
    ).toBe("original-worker");

    createDuplicateEvent({
      context,
      id: "event_duplicate_revise" as SituId<"event">,
      targetId: experiment.id,
    });
    expect(() =>
      reviseExperimentAction({
        context,
        id: experiment.id,
        summaryMarkdown: "Should roll back",
        clearBaseRef: true,
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_duplicate_revise" as SituId<"event">,
        now: "2026-05-13T12:04:00.000Z",
      }),
    ).toThrow();
    expect(context.repositories.experiments.getById({ id: experiment.id })).toMatchObject({
      revisionNumber: 1,
      summaryMarkdown: "Initial summary",
      baseRef: "main",
    });
    expect(countRows({ database, tableName: "events" })).toBe(4);
  } finally {
    database.close();
  }
});

test("primary experiment write failure creates no event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });

    expect(() =>
      createExperimentAction({
        context,
        id: "experiment_missing_task" as SituId<"experiment">,
        eventId: "event_not_created" as SituId<"event">,
        projectId,
        taskId: "task_missing" as SituId<"task">,
        title: "Missing task",
        summaryMarkdown: "Primary write should fail",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:00:00.000Z",
      }),
    ).toThrow();

    expect(countRows({ database, tableName: "events" })).toBe(0);
    expect(countRows({ database, tableName: "experiments" })).toBe(0);
  } finally {
    database.close();
  }
});

test("gets an existing and missing experiment", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const experiment = createExperiment({ context, projectId, taskId });

    expect(getExperimentAction({ context, id: experiment.id })).toEqual(experiment);
    expect(
      getExperimentAction({
        context,
        id: "experiment_missing" as SituId<"experiment">,
      }),
    ).toBeUndefined();
    expect(countRows({ database, tableName: "events" })).toBe(0);
  } finally {
    database.close();
  }
});

test("lists experiments with combined filters", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({
      context,
      id: "project_experiment_list" as SituId<"project">,
    });
    const otherProjectId = createProject({
      context,
      id: "project_experiment_list_other" as SituId<"project">,
    });
    const taskId = createTask({
      context,
      projectId,
      id: "task_experiment_list" as SituId<"task">,
    });
    const otherTaskId = createTask({
      context,
      projectId: otherProjectId,
      id: "task_experiment_list_other" as SituId<"task">,
    });
    const matching = context.repositories.experiments.create({
      id: "experiment_list_match" as SituId<"experiment">,
      projectId,
      taskId,
      title: "Match",
      summaryMarkdown: "Matches filters",
      status: "ready_for_review",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    context.repositories.experiments.create({
      id: "experiment_list_status_miss" as SituId<"experiment">,
      projectId,
      taskId,
      title: "Status miss",
      summaryMarkdown: "Wrong status",
      status: "running",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.experiments.create({
      id: "experiment_list_project_miss" as SituId<"experiment">,
      projectId: otherProjectId,
      taskId: otherTaskId,
      title: "Project miss",
      summaryMarkdown: "Wrong project",
      status: "ready_for_review",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      listExperimentsAction({
        context,
        projectId,
        taskId,
        status: "ready_for_review",
        assignedTo: {
          actorKind: "local_agent",
          actorId: "verifier-1",
        },
      }),
    ).toEqual([matching]);
    expect(countRows({ database, tableName: "events" })).toBe(0);
  } finally {
    database.close();
  }
});

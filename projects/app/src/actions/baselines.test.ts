import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createBaselineAction,
  getBaselineAction,
  listBaselinesAction,
  moveBaselineAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName: "events" | "baselines";
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function createProject(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
}): SituId<"project"> {
  const project = input.context.repositories.projects.create({
    id: "project_baseline_actions" as SituId<"project">,
    name: "Baseline Actions Project",
    repositoryPath: "/tmp/baseline-actions-project",
    goalMarkdown: "Exercise baseline actions",
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
}): SituId<"task"> {
  const task = input.context.repositories.tasks.create({
    id: "task_baseline_actions" as SituId<"task">,
    projectId: input.projectId,
    title: "Baseline Actions Task",
    bodyMarkdown: "Exercise baseline actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return task.id;
}

test("creates a baseline through the app action and creates exactly one event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const taskId = createTask({ context, projectId });
    const result = createBaselineAction({
      context,
      id: "baseline_action_create" as SituId<"baseline">,
      eventId: "event_baseline_created" as SituId<"event">,
      projectId,
      taskId,
      title: "Native baseline",
      summaryMarkdown: "Unmodified harness output.",
      status: "active",
      createdBy: {
        actorKind: "local_agent",
        actorId: "manager",
        displayName: "Manager",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(result.baseline.id).toBe("baseline_action_create");
    expect(result.event).toEqual({
      id: "event_baseline_created",
      target: {
        targetKind: "baseline",
        targetId: result.baseline.id,
      },
      actor: result.baseline.createdBy,
      summaryMarkdown: "Created baseline",
      bodyMarkdown: undefined,
      metadata: {
        createdAt: "2026-05-13T12:01:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(getBaselineAction({ context, id: result.baseline.id })).toEqual(result.baseline);
    expect(listBaselinesAction({ context, projectId })).toEqual([result.baseline]);
    expect(countRows({ database, tableName: "baselines" })).toBe(1);
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

test("moves a baseline and creates exactly one event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const baseline = context.repositories.baselines.create({
      id: "baseline_action_move" as SituId<"baseline">,
      projectId,
      title: "Native baseline",
      summaryMarkdown: "Unmodified harness output.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const actor = {
      actorKind: "local_agent" as const,
      actorId: "manager",
    };
    const result = moveBaselineAction({
      context,
      id: baseline.id,
      status: "superseded",
      actor,
      eventId: "event_baseline_moved" as SituId<"event">,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.baseline.status).toBe("superseded");
    expect(result.event.summaryMarkdown).toBe("Moved baseline to superseded");
    expect(result.event.target).toEqual({
      targetKind: "baseline",
      targetId: baseline.id,
    });
    expect(result.event.actor).toEqual(actor);
    expect(result.event.id).toBe("event_baseline_moved");
    expect(countRows({ database, tableName: "events" })).toBe(1);
  } finally {
    database.close();
  }
});

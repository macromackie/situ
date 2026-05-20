import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createMeasurementAction,
  getMeasurementAction,
  listBaselineMeasurementsAction,
  listMeasurementsAction,
  listRecentMeasurementsAction,
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

function expectNoEventsOrNotifications(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
}): void {
  expect(countRows({ database: input.database, tableName: "events" })).toBe(0);
  expect(countRows({ database: input.database, tableName: "notifications" })).toBe(0);
}

function createProject(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly id?: SituId<"project">;
}): SituId<"project"> {
  const project = input.context.repositories.projects.create({
    id: input.id ?? ("project_measurement_actions" as SituId<"project">),
    name: "Measurement Actions Project",
    repositoryPath: "/tmp/measurement-actions-project",
    goalMarkdown: "Exercise measurement actions",
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
    id: input.id ?? ("task_measurement_actions" as SituId<"task">),
    projectId: input.projectId,
    title: "Measurement Actions Task",
    bodyMarkdown: "Exercise measurement actions",
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
}): SituId<"experiment"> {
  const experiment = input.context.repositories.experiments.create({
    id: input.id ?? ("experiment_measurement_actions" as SituId<"experiment">),
    projectId: input.projectId,
    taskId: input.taskId,
    title: "Measurement Action",
    summaryMarkdown: "Initial summary",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:01:00.000Z",
  });

  return experiment.id;
}

function createExperimentFixture(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly experimentId?: SituId<"experiment">;
}): SituId<"experiment"> {
  const projectId = createProject({
    context: input.context,
    id:
      input.experimentId === undefined
        ? undefined
        : (`project_${input.experimentId}` as SituId<"project">),
  });
  const taskId = createTask({
    context: input.context,
    projectId,
    id:
      input.experimentId === undefined
        ? undefined
        : (`task_${input.experimentId}` as SituId<"task">),
  });

  return createExperiment({
    context: input.context,
    projectId,
    taskId,
    id: input.experimentId,
  });
}

function createBaseline(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly projectId: SituId<"project">;
}): SituId<"baseline"> {
  const baseline = input.context.repositories.baselines.create({
    id: "baseline_measurement_actions" as SituId<"baseline">,
    projectId: input.projectId,
    title: "Native baseline",
    summaryMarkdown: "Unmodified harness output.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:01:00.000Z",
  });

  return baseline.id;
}

test("creates a measurement through the app action without emitting events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const result = createMeasurementAction({
      context,
      id: "measurement_action_create" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "latency_ms",
      numericValue: 42.5,
      unit: "ms",
      summaryMarkdown: "Latency improved.",
      detailsMarkdown: "Measured from the local benchmark.",
      measuredBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
        displayName: "Verifier 1",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.measurement).toMatchObject({
      id: "measurement_action_create",
      experimentId,
      revisionNumber: 1,
      metricName: "latency_ms",
      numericValue: 42.5,
      unit: "ms",
      summaryMarkdown: "Latency improved.",
      detailsMarkdown: "Measured from the local benchmark.",
      measuredBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
        displayName: "Verifier 1",
      },
      metadata: {
        createdAt: "2026-05-13T12:02:00.000Z",
        updatedAt: "2026-05-13T12:02:00.000Z",
      },
    });
    expect(context.repositories.measurements.getById({ id: result.measurement.id })).toEqual(
      result.measurement,
    );
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("creates and lists measurements for a baseline", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const baselineId = createBaseline({ context, projectId });
    const matching = createMeasurementAction({
      context,
      id: "measurement_action_baseline" as SituId<"measurement">,
      baselineId,
      metricName: "dev_accuracy",
      numericValue: 0.74,
      summaryMarkdown: "Baseline dev accuracy.",
      measuredBy: {
        actorKind: "local_agent",
        actorId: "manager",
      },
      now: "2026-05-13T12:02:00.000Z",
    }).measurement;

    expect(
      listBaselineMeasurementsAction({
        context,
        baselineId,
        metricName: "dev_accuracy",
      }),
    ).toEqual([matching]);
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("gets an existing and missing measurement without emitting events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const measurement = context.repositories.measurements.create({
      id: "measurement_action_get" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "score",
      numericValue: 0.9,
      summaryMarkdown: "Score measurement.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(getMeasurementAction({ context, id: measurement.id })).toEqual(measurement);
    expect(
      getMeasurementAction({
        context,
        id: "measurement_missing" as SituId<"measurement">,
      }),
    ).toBeUndefined();
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists measurements for an experiment with combined revision and metric filters", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const otherExperimentId = createExperimentFixture({
      context,
      experimentId: "experiment_measurement_other" as SituId<"experiment">,
    });
    const matching = context.repositories.measurements.create({
      id: "measurement_action_list_match" as SituId<"measurement">,
      experimentId,
      revisionNumber: 2,
      metricName: "latency_ms",
      numericValue: 42,
      summaryMarkdown: "Matching measurement.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.measurements.create({
      id: "measurement_action_list_revision_miss" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "latency_ms",
      numericValue: 50,
      summaryMarkdown: "Wrong revision.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });
    context.repositories.measurements.create({
      id: "measurement_action_list_metric_miss" as SituId<"measurement">,
      experimentId,
      revisionNumber: 2,
      metricName: "score",
      numericValue: 0.8,
      summaryMarkdown: "Wrong metric.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:04:00.000Z",
    });
    context.repositories.measurements.create({
      id: "measurement_action_list_experiment_miss" as SituId<"measurement">,
      experimentId: otherExperimentId,
      revisionNumber: 2,
      metricName: "latency_ms",
      numericValue: 40,
      summaryMarkdown: "Wrong experiment.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:05:00.000Z",
    });

    expect(
      listMeasurementsAction({
        context,
        experimentId,
        revisionNumber: 2,
        metricName: "latency_ms",
      }),
    ).toEqual([matching]);
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists recent measurements", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const first = context.repositories.measurements.create({
      id: "measurement_action_recent_first" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "score",
      numericValue: 0.7,
      summaryMarkdown: "First measurement.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const second = context.repositories.measurements.create({
      id: "measurement_action_recent_second" as SituId<"measurement">,
      experimentId,
      revisionNumber: 2,
      metricName: "score",
      numericValue: 0.9,
      summaryMarkdown: "Second measurement.",
      measuredBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(listRecentMeasurementsAction({ context, limit: 1 })).toEqual([second]);
    expect(listRecentMeasurementsAction({ context })).toEqual([second, first]);
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("repository errors propagate from the measurement app action", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    createMeasurementAction({
      context,
      id: "measurement_action_duplicate" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "score",
      numericValue: 0.7,
      summaryMarkdown: "First measurement.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(() =>
      createMeasurementAction({
        context,
        id: "measurement_action_duplicate" as SituId<"measurement">,
        experimentId,
        revisionNumber: 1,
        metricName: "score",
        numericValue: 0.8,
        summaryMarkdown: "Duplicate measurement.",
        measuredBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:03:00.000Z",
      }),
    ).toThrow("Measurement could not be created because it conflicts with existing state.");
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

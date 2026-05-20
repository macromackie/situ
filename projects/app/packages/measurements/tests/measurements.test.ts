import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { ActorRef, SituId } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  createMeasurementRecord,
  createMeasurementRepository,
  createMeasurementsBaselineIdIndexStatement,
  createMeasurementsCreatedAtIndexStatement,
  createMeasurementsExperimentIdIndexStatement,
  createMeasurementsExperimentRevisionIndexStatement,
  createMeasurementsMetricNameIndexStatement,
  createMeasurementsTableStatement,
  measurementsSchemaFragment,
} from "../src/index.js";

const experimentId = "experiment_1" as SituId<"experiment">;
const baselineId = "baseline_1" as SituId<"baseline">;

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("CREATE TABLE baselines (id TEXT PRIMARY KEY);");
  database.exec("CREATE TABLE experiments (id TEXT PRIMARY KEY);");

  for (const statement of measurementsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

function insertExperiment(database: Database, id: SituId<"experiment"> = experimentId): void {
  database.query("INSERT INTO experiments (id) VALUES (?)").run(id);
}

function insertBaseline(database: Database, id: SituId<"baseline"> = baselineId): void {
  database.query("INSERT INTO baselines (id) VALUES (?)").run(id);
}

test("exports measurement schema statements", () => {
  const expectedPackageName: "measurements" = measurementsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("measurements");
  expect(measurementsSchemaFragment.statements).toEqual([
    createMeasurementsTableStatement,
    createMeasurementsBaselineIdIndexStatement,
    createMeasurementsExperimentIdIndexStatement,
    createMeasurementsExperimentRevisionIndexStatement,
    createMeasurementsMetricNameIndexStatement,
    createMeasurementsCreatedAtIndexStatement,
  ]);
});

test("creates measurement records with normalized fields", () => {
  const measurement = createMeasurementRecord({
    id: "measurement_1" as SituId<"measurement">,
    experimentId,
    revisionNumber: 1,
    metricName: "  goal score  ",
    numericValue: 0.83,
    unit: "  points  ",
    summaryMarkdown: "  Strong result  ",
    detailsMarkdown: "  `bun test` passed  ",
    measuredBy: {
      actorKind: " local_agent " as ActorRef["actorKind"],
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(measurement).toEqual({
    id: "measurement_1",
    baselineId: undefined,
    experimentId,
    revisionNumber: 1,
    metricName: "goal score",
    numericValue: 0.83,
    unit: "points",
    summaryMarkdown: "Strong result",
    detailsMarkdown: "`bun test` passed",
    measuredBy: {
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

test("rejects invalid measurement records", () => {
  const validInput = {
    experimentId,
    revisionNumber: 1,
    metricName: "goal score",
    numericValue: 0.83,
    summaryMarkdown: "Strong result",
    measuredBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
  };

  expect(() =>
    createMeasurementRecord({
      ...validInput,
      baselineId,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      experimentId: undefined,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      baselineId,
      experimentId: undefined,
      revisionNumber: undefined,
    }),
  ).not.toThrow();
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      revisionNumber: 0,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      metricName: " ",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      numericValue: Number.NaN,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      unit: " ",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      summaryMarkdown: "",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      detailsMarkdown: " ",
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      measuredBy: {
        actorKind: "human",
        actorId: "",
      },
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createMeasurementRecord({
      ...validInput,
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: " ",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted measurements", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });

  try {
    insertExperiment(database);

    const measurement = repository.create({
      id: "measurement_1" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "tests passed",
      numericValue: 42,
      summaryMarkdown: "All tests passed",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: measurement.id })).toEqual(measurement);
    expect(
      repository.getById({ id: "measurement_missing" as SituId<"measurement"> }),
    ).toBeUndefined();
    expect(measurement.unit).toBeUndefined();
    expect(measurement.detailsMarkdown).toBeUndefined();
    expect(measurement.measuredBy.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("creates and lists measurements for a baseline", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });

  try {
    insertBaseline(database);

    const measurement = repository.create({
      id: "measurement_baseline" as SituId<"measurement">,
      baselineId,
      metricName: "tests passed",
      numericValue: 40,
      summaryMarkdown: "Baseline test pass count",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(measurement).toMatchObject({
      id: "measurement_baseline",
      baselineId,
      experimentId: undefined,
      revisionNumber: undefined,
      metricName: "tests passed",
    });
    expect(repository.listForBaseline({ baselineId })).toEqual([measurement]);
    expect(repository.listForBaseline({ baselineId, metricName: "tests passed" })).toEqual([
      measurement,
    ]);
    expect(repository.listForBaseline({ baselineId, metricName: "missing" })).toEqual([]);
  } finally {
    database.close();
  }
});

test("lists measurements for an experiment in creation order", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });
  const otherExperimentId = "experiment_2" as SituId<"experiment">;

  try {
    insertExperiment(database);
    insertExperiment(database, otherExperimentId);

    const secondMeasurement = repository.create({
      id: "measurement_b" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 0.9,
      summaryMarkdown: "Second result",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const firstMeasurement = repository.create({
      id: "measurement_a" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 0.8,
      summaryMarkdown: "First result",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const revisedMeasurement = repository.create({
      id: "measurement_c" as SituId<"measurement">,
      experimentId,
      revisionNumber: 2,
      metricName: "latency ms",
      numericValue: 120,
      unit: "ms",
      summaryMarkdown: "Revision latency",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "measurement_d" as SituId<"measurement">,
      experimentId: otherExperimentId,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 1,
      summaryMarkdown: "Other experiment",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(
      repository.listForExperiment({ experimentId }).map((measurement) => measurement.id),
    ).toEqual([firstMeasurement.id, secondMeasurement.id, revisedMeasurement.id]);
    expect(
      repository
        .listForExperiment({
          experimentId,
          revisionNumber: 1,
          metricName: " goal score ",
        })
        .map((measurement) => measurement.id),
    ).toEqual([firstMeasurement.id, secondMeasurement.id]);
    expect(
      repository
        .listForExperiment({
          experimentId,
          metricName: "Goal Score",
        })
        .map((measurement) => measurement.id),
    ).toEqual([]);
    expect(
      repository
        .listForExperiment({
          experimentId,
          revisionNumber: 2,
        })
        .map((measurement) => measurement.id),
    ).toEqual([revisedMeasurement.id]);
  } finally {
    database.close();
  }
});

test("lists all measurements in creation order across experiments", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });
  const otherExperimentId = "experiment_2" as SituId<"experiment">;

  try {
    insertExperiment(database);
    insertExperiment(database, otherExperimentId);

    repository.create({
      id: "measurement_c" as SituId<"measurement">,
      experimentId: otherExperimentId,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 3,
      summaryMarkdown: "Third",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "measurement_b" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 2,
      summaryMarkdown: "Second by id",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "measurement_a" as SituId<"measurement">,
      experimentId,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 1,
      summaryMarkdown: "First by id",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listAll().map((measurement) => measurement.id)).toEqual([
      "measurement_a",
      "measurement_b",
      "measurement_c",
    ]);
  } finally {
    database.close();
  }
});

test("lists recent measurements in reverse creation order with default and capped limits", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });

  try {
    insertExperiment(database);

    for (let index = 0; index < 510; index += 1) {
      const measurementNumber = index + 1;

      repository.create({
        id: `measurement_${measurementNumber.toString().padStart(3, "0")}` as SituId<"measurement">,
        experimentId,
        revisionNumber: 1,
        metricName: "goal score",
        numericValue: measurementNumber,
        summaryMarkdown: `Measurement ${measurementNumber}`,
        measuredBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: new Date(Date.UTC(2026, 4, 13, 12, 0, index)).toISOString(),
      });
    }

    expect(repository.listRecent()).toHaveLength(50);
    expect(repository.listRecent({ limit: 2 }).map((measurement) => measurement.id)).toEqual([
      "measurement_510",
      "measurement_509",
    ]);
    expect(repository.listRecent({ limit: 999 })).toHaveLength(500);
  } finally {
    database.close();
  }
});

test("rejects invalid repository filters", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });

  try {
    expect(() =>
      repository.listForExperiment({
        experimentId,
        revisionNumber: 0,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      repository.listForExperiment({
        experimentId,
        metricName: " ",
      }),
    ).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: 0 })).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: Infinity })).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("schema rejects non-integer revision numbers", () => {
  const database = createTestDatabase();

  try {
    insertExperiment(database);

    expect(() =>
      database
        .query(
          `
INSERT INTO measurements (
  id,
  experiment_id,
  revision_number,
  metric_name,
  numeric_value,
  summary_markdown,
  measured_by_kind,
  measured_by_id,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          "measurement_1",
          experimentId,
          1.5,
          "goal score",
          0.83,
          "Strong result",
          "human",
          "scott",
          "2026-05-13T12:00:00.000Z",
          "2026-05-13T12:00:00.000Z",
        ),
    ).toThrow(Error);
  } finally {
    database.close();
  }
});

test("reports duplicate and missing-parent measurements as conflicts", () => {
  const database = createTestDatabase();
  const repository = createMeasurementRepository({ database });
  const input = {
    id: "measurement_1" as SituId<"measurement">,
    experimentId,
    revisionNumber: 1,
    metricName: "goal score",
    numericValue: 0.83,
    summaryMarkdown: "Strong result",
    measuredBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    insertExperiment(database);
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
    expect(() =>
      repository.create({
        ...input,
        id: "measurement_2" as SituId<"measurement">,
        experimentId: "experiment_missing" as SituId<"experiment">,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      repository.create({
        id: "measurement_3" as SituId<"measurement">,
        baselineId: "baseline_missing" as SituId<"baseline">,
        metricName: "goal score",
        numericValue: 0.83,
        summaryMarkdown: "Missing baseline",
        measuredBy: {
          actorKind: "human",
          actorId: "scott",
        },
      }),
    ).toThrow(ConflictError);
  } finally {
    database.close();
  }
});

import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  createReportRecord,
  createReportRepository,
  createReportsCreatedAtIndexStatement,
  createReportsGeneratedByIndexStatement,
  createReportsProjectIdIndexStatement,
  createReportsTableStatement,
  createReportsTargetIndexStatement,
  reportsSchemaFragment,
} from "../src/index.js";

const projectId = "project_1" as SituId<"project">;
const otherProjectId = "project_2" as SituId<"project">;
const taskTarget: TargetRef<"task"> = {
  targetKind: "task",
  targetId: "task_1" as SituId<"task">,
};
const experimentTarget: TargetRef<"experiment"> = {
  targetKind: "experiment",
  targetId: "experiment_1" as SituId<"experiment">,
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE projects (id TEXT PRIMARY KEY);");
  database.exec(`INSERT INTO projects (id) VALUES ('${projectId}'), ('${otherProjectId}');`);

  for (const statement of reportsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports report schema statements", () => {
  const expectedPackageName: "reports" = reportsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("reports");
  expect(reportsSchemaFragment.statements).toEqual([
    createReportsTableStatement,
    createReportsProjectIdIndexStatement,
    createReportsTargetIndexStatement,
    createReportsGeneratedByIndexStatement,
    createReportsCreatedAtIndexStatement,
  ]);
});

test("creates report records with normalized fields", () => {
  const report = createReportRecord({
    id: "report_1" as SituId<"report">,
    projectId,
    target: taskTarget,
    title: "  Findings summary  ",
    bodyMarkdown: "  ## Findings\n\nReady for review.  ",
    generatedBy: {
      actorKind: "local_agent",
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(report).toEqual({
    id: "report_1",
    projectId,
    target: taskTarget,
    title: "Findings summary",
    bodyMarkdown: "## Findings\n\nReady for review.",
    generatedBy: {
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

test("rejects invalid report records", () => {
  expect(() =>
    createReportRecord({
      projectId,
      target: taskTarget,
      title: "",
      bodyMarkdown: "Body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createReportRecord({
      projectId,
      target: taskTarget,
      title: "Title",
      bodyMarkdown: " ",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createReportRecord({
      projectId,
      target: taskTarget,
      title: "Title",
      bodyMarkdown: "Body",
      generatedBy: {
        actorKind: "human",
        actorId: " ",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createReportRecord({
      projectId,
      target: taskTarget,
      title: "Title",
      bodyMarkdown: "Body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: " ",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted reports", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });

  try {
    const report = repository.create({
      id: "report_1" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Findings",
      bodyMarkdown: "Ready for review",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: report.id })).toEqual(report);
    expect(repository.getById({ id: "report_missing" as SituId<"report"> })).toBeUndefined();
    expect(report.generatedBy.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists all reports in creation order", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });

  try {
    const secondReport = repository.create({
      id: "report_b" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Second",
      bodyMarkdown: "Second body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstReportB = repository.create({
      id: "report_b_first" as SituId<"report">,
      projectId: otherProjectId,
      target: experimentTarget,
      title: "First B",
      bodyMarkdown: "First B body",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const firstReportA = repository.create({
      id: "report_a_first" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "First A",
      bodyMarkdown: "First A body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listAll().map((report) => report.id)).toEqual([
      firstReportA.id,
      firstReportB.id,
      secondReport.id,
    ]);
  } finally {
    database.close();
  }
});

test("lists reports for a project in creation order", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });

  try {
    const secondReport = repository.create({
      id: "report_b" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Second",
      bodyMarkdown: "Second body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstReport = repository.create({
      id: "report_a" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "First",
      bodyMarkdown: "First body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "report_c" as SituId<"report">,
      projectId: otherProjectId,
      target: taskTarget,
      title: "Other project",
      bodyMarkdown: "Other body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listForProject({ projectId }).map((report) => report.id)).toEqual([
      firstReport.id,
      secondReport.id,
    ]);
    expect(
      repository.listForProject({ projectId: otherProjectId }).map((report) => report.id),
    ).toEqual(["report_c"]);
  } finally {
    database.close();
  }
});

test("lists reports for a target in creation order", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });

  try {
    const secondReport = repository.create({
      id: "report_b" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Second",
      bodyMarkdown: "Second body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstReport = repository.create({
      id: "report_a" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "First",
      bodyMarkdown: "First body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "report_c" as SituId<"report">,
      projectId,
      target: experimentTarget,
      title: "Other target",
      bodyMarkdown: "Other body",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listForTarget({ target: taskTarget }).map((report) => report.id)).toEqual([
      firstReport.id,
      secondReport.id,
    ]);
    expect(
      repository.listForTarget({ target: experimentTarget }).map((report) => report.id),
    ).toEqual(["report_c"]);
  } finally {
    database.close();
  }
});

test("lists recent reports with default, validated, and capped limits", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });

  try {
    for (let index = 1; index <= 55; index += 1) {
      repository.create({
        id: `report_${String(index).padStart(2, "0")}` as SituId<"report">,
        projectId,
        target: taskTarget,
        title: `Report ${index}`,
        bodyMarkdown: `Body ${index}`,
        generatedBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: `2026-05-13T12:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }

    expect(repository.listRecent().map((report) => report.id)).toHaveLength(50);
    expect(repository.listRecent({ limit: 2 }).map((report) => report.id)).toEqual([
      "report_55",
      "report_54",
    ]);
    expect(repository.listRecent({ limit: 501 }).map((report) => report.id)).toHaveLength(55);
    expect(() => repository.listRecent({ limit: 0 })).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: 1.5 })).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: Number.POSITIVE_INFINITY })).toThrow(
      ValidationError,
    );
    expect(() => repository.listRecent({ limit: null as unknown as number })).toThrow(
      ValidationError,
    );
  } finally {
    database.close();
  }
});

test("reports duplicate report ids as conflicts", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });
  const input = {
    id: "report_1" as SituId<"report">,
    projectId,
    target: taskTarget,
    title: "Findings",
    bodyMarkdown: "Ready for review",
    generatedBy: {
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

test("reports missing parent projects as conflicts", () => {
  const database = createTestDatabase();
  const repository = createReportRepository({ database });

  try {
    expect(() =>
      repository.create({
        id: "report_1" as SituId<"report">,
        projectId: "project_missing" as SituId<"project">,
        target: taskTarget,
        title: "Findings",
        bodyMarkdown: "Ready for review",
        generatedBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:00:00.000Z",
      }),
    ).toThrow(ConflictError);
  } finally {
    database.close();
  }
});

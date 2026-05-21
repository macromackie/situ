import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  briefingsSchemaFragment,
  createBriefingRecord,
  createBriefingRepository,
  createBriefingsAuthoredByIndexStatement,
  createBriefingsCreatedAtIndexStatement,
  createBriefingsProjectIdIndexStatement,
  createBriefingsTableStatement,
} from "../src/index.js";

const projectId = "project_1" as SituId<"project">;
const otherProjectId = "project_2" as SituId<"project">;
const taskTarget: TargetRef<"task"> = {
  targetKind: "task",
  targetId: "task_1" as SituId<"task">,
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE projects (id TEXT PRIMARY KEY);");
  database.exec(`INSERT INTO projects (id) VALUES ('${projectId}'), ('${otherProjectId}');`);

  for (const statement of briefingsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports briefing schema statements", () => {
  const expectedPackageName: "briefings" = briefingsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("briefings");
  expect(briefingsSchemaFragment.statements).toEqual([
    createBriefingsTableStatement,
    createBriefingsProjectIdIndexStatement,
    createBriefingsAuthoredByIndexStatement,
    createBriefingsCreatedAtIndexStatement,
  ]);
});

test("creates briefing records with normalized fields", () => {
  const briefing = createBriefingRecord({
    id: "briefing_1" as SituId<"briefing">,
    projectId,
    title: "  Current path  ",
    stage: "evaluating",
    assessment: "on_track",
    headlineMarkdown: "  The strongest candidate is holding up.  ",
    blocks: [
      {
        type: "status",
        summaryMarkdown: "  The run is still improving.  ",
        reasons: ["  accepted candidate has evidence  "],
        refs: [taskTarget],
      },
      {
        type: "next_steps",
        items: [{ text: "  Run verifier.  ", refs: [taskTarget] }],
      },
    ],
    evidenceRefs: [taskTarget],
    authoredBy: {
      actorKind: "local_agent",
      actorId: "  manager  ",
      displayName: "  Manager  ",
    },
    now: "2026-05-20T08:00:00.000-04:00",
  });

  expect(briefing).toEqual({
    id: "briefing_1",
    projectId,
    title: "Current path",
    stage: "evaluating",
    assessment: "on_track",
    headlineMarkdown: "The strongest candidate is holding up.",
    blocks: [
      {
        type: "status",
        summaryMarkdown: "The run is still improving.",
        reasons: ["accepted candidate has evidence"],
        refs: [taskTarget],
      },
      {
        type: "next_steps",
        items: [{ text: "Run verifier.", refs: [taskTarget] }],
      },
    ],
    evidenceRefs: [taskTarget],
    authoredBy: {
      actorKind: "local_agent",
      actorId: "manager",
      displayName: "Manager",
    },
    metadata: {
      createdAt: "2026-05-20T12:00:00.000Z",
      updatedAt: "2026-05-20T12:00:00.000Z",
    },
  });
});

test("rejects invalid briefing records", () => {
  const baseInput = {
    projectId,
    title: "Briefing",
    stage: "evaluating" as const,
    assessment: "on_track" as const,
    headlineMarkdown: "Current story.",
    authoredBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
  };

  expect(() => createBriefingRecord({ ...baseInput, title: "" })).toThrow(ValidationError);
  expect(() => createBriefingRecord({ ...baseInput, stage: "bogus" as never })).toThrow(
    ValidationError,
  );
  expect(() => createBriefingRecord({ ...baseInput, assessment: "bogus" as never })).toThrow(
    ValidationError,
  );
  expect(() => createBriefingRecord({ ...baseInput, headlineMarkdown: " " })).toThrow(
    ValidationError,
  );
  expect(() =>
    createBriefingRecord({
      ...baseInput,
      blocks: [{ type: "callout", tone: "bogus", bodyMarkdown: "Body" } as never],
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createBriefingRecord({
      ...baseInput,
      blocks: [{ type: "evidence", experimentIds: "experiment_1" } as never],
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createBriefingRecord({
      ...baseInput,
      evidenceRefs: [{ targetKind: "bogus", targetId: "task_1" } as never],
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted briefings", () => {
  const database = createTestDatabase();
  const repository = createBriefingRepository({ database });

  try {
    const briefing = repository.create({
      id: "briefing_1" as SituId<"briefing">,
      projectId,
      title: "Current",
      stage: "evaluating",
      assessment: "watch",
      headlineMarkdown: "Verifier is still checking the strongest path.",
      blocks: [{ type: "callout", tone: "warning", bodyMarkdown: "Watch the edge case." }],
      authoredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-20T12:00:00.000Z",
    });

    expect(repository.getById({ id: briefing.id })).toEqual(briefing);
    expect(repository.getById({ id: "briefing_missing" as SituId<"briefing"> })).toBeUndefined();
    expect(briefing.authoredBy.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists briefings for a project in creation order", () => {
  const database = createTestDatabase();
  const repository = createBriefingRepository({ database });

  try {
    const second = repository.create({
      id: "briefing_b" as SituId<"briefing">,
      projectId,
      title: "Second",
      stage: "synthesizing",
      assessment: "on_track",
      headlineMarkdown: "Second headline.",
      authoredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-20T12:01:00.000Z",
    });
    const first = repository.create({
      id: "briefing_a" as SituId<"briefing">,
      projectId,
      title: "First",
      stage: "evaluating",
      assessment: "watch",
      headlineMarkdown: "First headline.",
      authoredBy: {
        actorKind: "local_agent",
        actorId: "manager",
      },
      now: "2026-05-20T12:00:00.000Z",
    });
    repository.create({
      id: "briefing_c" as SituId<"briefing">,
      projectId: otherProjectId,
      title: "Other project",
      stage: "orienting",
      assessment: "on_track",
      headlineMarkdown: "Other headline.",
      authoredBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-20T12:00:00.000Z",
    });

    expect(repository.listAll().map((briefing) => briefing.id)).toEqual([
      first.id,
      "briefing_c",
      second.id,
    ]);
    expect(repository.listForProject({ projectId }).map((briefing) => briefing.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(
      repository.listForProject({ projectId: otherProjectId }).map((briefing) => briefing.id),
    ).toEqual(["briefing_c"]);
  } finally {
    database.close();
  }
});

test("lists recent briefings with default, validated, and capped limits", () => {
  const database = createTestDatabase();
  const repository = createBriefingRepository({ database });

  try {
    for (let index = 1; index <= 55; index += 1) {
      repository.create({
        id: `briefing_${String(index).padStart(2, "0")}` as SituId<"briefing">,
        projectId,
        title: `Briefing ${index}`,
        stage: "evaluating",
        assessment: "on_track",
        headlineMarkdown: `Headline ${index}`,
        authoredBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: `2026-05-20T12:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }

    expect(repository.listRecent().map((briefing) => briefing.id)).toHaveLength(50);
    expect(repository.listRecent({ limit: 2 }).map((briefing) => briefing.id)).toEqual([
      "briefing_55",
      "briefing_54",
    ]);
    expect(repository.listRecent({ limit: 501 }).map((briefing) => briefing.id)).toHaveLength(55);
    expect(() => repository.listRecent({ limit: 0 })).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("reports duplicate ids and missing parent projects as conflicts", () => {
  const database = createTestDatabase();
  const repository = createBriefingRepository({ database });
  const input = {
    id: "briefing_1" as SituId<"briefing">,
    projectId,
    title: "Current",
    stage: "evaluating" as const,
    assessment: "on_track" as const,
    headlineMarkdown: "Current headline.",
    authoredBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
    now: "2026-05-20T12:00:00.000Z",
  };

  try {
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
    expect(() =>
      repository.create({
        ...input,
        id: "briefing_missing_parent" as SituId<"briefing">,
        projectId: "project_missing" as SituId<"project">,
      }),
    ).toThrow(ConflictError);
  } finally {
    database.close();
  }
});

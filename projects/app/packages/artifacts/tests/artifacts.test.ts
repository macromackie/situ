import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  artifactsSchemaFragment,
  createArtifactRecord,
  createArtifactsCreatedAtIndexStatement,
  createArtifactsCreatedByIndexStatement,
  createArtifactsTableStatement,
  createArtifactsTargetIndexStatement,
  createArtifactRepository,
} from "../src/index.js";

const taskTarget: TargetRef<"task"> = {
  targetKind: "task",
  targetId: "task_1" as SituId<"task">,
};

const validSha256 = "a".repeat(64);

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  for (const statement of artifactsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports artifact schema statements", () => {
  const expectedPackageName: "artifacts" = artifactsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("artifacts");
  expect(artifactsSchemaFragment.statements).toEqual([
    createArtifactsTableStatement,
    createArtifactsTargetIndexStatement,
    createArtifactsCreatedByIndexStatement,
    createArtifactsCreatedAtIndexStatement,
  ]);
});

test("creates artifact records with normalized fields", () => {
  const artifact = createArtifactRecord({
    id: "artifact_1" as SituId<"artifact">,
    target: taskTarget,
    title: "  Test log  ",
    summaryMarkdown: "  Captured stdout.  ",
    uri: "  file:///tmp/test.log  ",
    mediaType: "  text/plain  ",
    byteSize: 42,
    sha256: `  ${validSha256}  `,
    createdBy: {
      actorKind: "local_agent",
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(artifact).toEqual({
    id: "artifact_1",
    target: taskTarget,
    title: "Test log",
    summaryMarkdown: "Captured stdout.",
    uri: "file:///tmp/test.log",
    mediaType: "text/plain",
    byteSize: 42,
    sha256: validSha256,
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

test("rejects invalid artifact records", () => {
  expect(() =>
    createArtifactRecord({
      target: taskTarget,
      title: "",
      summaryMarkdown: "summary",
      uri: "file:///tmp/test.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createArtifactRecord({
      target: taskTarget,
      title: "Test log",
      summaryMarkdown: "summary",
      uri: " ",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createArtifactRecord({
      target: taskTarget,
      title: "Test log",
      summaryMarkdown: "summary",
      uri: "file:///tmp/test.log",
      byteSize: Number.MAX_SAFE_INTEGER + 1,
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createArtifactRecord({
      target: taskTarget,
      title: "Test log",
      summaryMarkdown: "summary",
      uri: "file:///tmp/test.log",
      byteSize: -1,
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createArtifactRecord({
      target: taskTarget,
      title: "Test log",
      summaryMarkdown: "summary",
      uri: "file:///tmp/test.log",
      sha256: "ABC",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createArtifactRecord({
      target: taskTarget,
      title: "Test log",
      summaryMarkdown: "summary",
      uri: "file:///tmp/test.log",
      createdBy: {
        actorKind: "human",
        actorId: " ",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted artifacts", () => {
  const database = createTestDatabase();
  const repository = createArtifactRepository({ database });

  try {
    const artifact = repository.create({
      id: "artifact_1" as SituId<"artifact">,
      target: taskTarget,
      title: "Test log",
      summaryMarkdown: "Captured stdout.",
      uri: "file:///tmp/test.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: artifact.id })).toEqual(artifact);
    expect(repository.getById({ id: "artifact_missing" as SituId<"artifact"> })).toBeUndefined();
    expect(artifact.mediaType).toBeUndefined();
    expect(artifact.byteSize).toBeUndefined();
    expect(artifact.sha256).toBeUndefined();
    expect(artifact.createdBy.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists artifacts for a target in creation order", () => {
  const database = createTestDatabase();
  const repository = createArtifactRepository({ database });
  const reviewTarget: TargetRef<"review"> = {
    targetKind: "review",
    targetId: "review_1" as SituId<"review">,
  };

  try {
    const secondArtifact = repository.create({
      id: "artifact_b" as SituId<"artifact">,
      target: taskTarget,
      title: "Second",
      summaryMarkdown: "Second artifact",
      uri: "file:///tmp/second.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstArtifact = repository.create({
      id: "artifact_a" as SituId<"artifact">,
      target: taskTarget,
      title: "First",
      summaryMarkdown: "First artifact",
      uri: "file:///tmp/first.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "artifact_c" as SituId<"artifact">,
      target: reviewTarget,
      title: "Other target",
      summaryMarkdown: "Review artifact",
      uri: "file:///tmp/review.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listForTarget({ target: taskTarget }).map((artifact) => artifact.id)).toEqual(
      [firstArtifact.id, secondArtifact.id],
    );
    expect(
      repository.listForTarget({ target: reviewTarget }).map((artifact) => artifact.id),
    ).toEqual(["artifact_c"]);
  } finally {
    database.close();
  }
});

test("lists all artifacts in creation order across targets", () => {
  const database = createTestDatabase();
  const repository = createArtifactRepository({ database });
  const reviewTarget: TargetRef<"review"> = {
    targetKind: "review",
    targetId: "review_1" as SituId<"review">,
  };

  try {
    repository.create({
      id: "artifact_c" as SituId<"artifact">,
      target: reviewTarget,
      title: "Third",
      summaryMarkdown: "Third artifact",
      uri: "file:///tmp/third.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "artifact_b" as SituId<"artifact">,
      target: taskTarget,
      title: "Second by id",
      summaryMarkdown: "Second artifact",
      uri: "file:///tmp/second.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "artifact_a" as SituId<"artifact">,
      target: taskTarget,
      title: "First by id",
      summaryMarkdown: "First artifact",
      uri: "file:///tmp/first.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listAll().map((artifact) => artifact.id)).toEqual([
      "artifact_a",
      "artifact_b",
      "artifact_c",
    ]);
  } finally {
    database.close();
  }
});

test("lists recent artifacts in reverse creation order", () => {
  const database = createTestDatabase();
  const repository = createArtifactRepository({ database });

  try {
    for (const id of ["artifact_a", "artifact_b", "artifact_c"]) {
      repository.create({
        id: id as SituId<"artifact">,
        target: taskTarget,
        title: id,
        summaryMarkdown: id,
        uri: `file:///tmp/${id}.log`,
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:00:00.000Z",
      });
    }

    expect(repository.listRecent({ limit: 2 }).map((artifact) => artifact.id)).toEqual([
      "artifact_c",
      "artifact_b",
    ]);
    expect(repository.listRecent({ limit: 999 })).toHaveLength(3);
    expect(() => repository.listRecent({ limit: 0 })).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: Infinity })).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("applies default and capped recent artifact limits", () => {
  const database = createTestDatabase();
  const repository = createArtifactRepository({ database });

  try {
    for (let index = 0; index < 510; index += 1) {
      const artifactNumber = index + 1;

      repository.create({
        id: `artifact_${artifactNumber.toString().padStart(3, "0")}` as SituId<"artifact">,
        target: taskTarget,
        title: `Artifact ${artifactNumber}`,
        summaryMarkdown: `Artifact ${artifactNumber}`,
        uri: `file:///tmp/artifact-${artifactNumber}.log`,
        createdBy: {
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

test("schema rejects non-integer byte sizes", () => {
  const database = createTestDatabase();

  try {
    expect(() =>
      database
        .query(
          `
INSERT INTO artifacts (
  id,
  target_kind,
  target_id,
  title,
  summary_markdown,
  uri,
  byte_size,
  created_by_kind,
  created_by_id,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          "artifact_1",
          taskTarget.targetKind,
          taskTarget.targetId,
          "Test log",
          "Captured stdout.",
          "file:///tmp/test.log",
          1.5,
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

test("reports duplicate artifacts as conflicts", () => {
  const database = createTestDatabase();
  const repository = createArtifactRepository({ database });
  const input = {
    id: "artifact_1" as SituId<"artifact">,
    target: taskTarget,
    title: "Test log",
    summaryMarkdown: "Captured stdout.",
    uri: "file:///tmp/test.log",
    createdBy: {
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

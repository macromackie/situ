import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  commentsSchemaFragment,
  createCommentRecord,
  createCommentRepository,
} from "../src/index.js";

const taskTarget: TargetRef<"task"> = {
  targetKind: "task",
  targetId: "task_1" as SituId<"task">,
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  for (const statement of commentsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports comment schema statements", () => {
  const expectedPackageName: "comments" = commentsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("comments");
  expect(commentsSchemaFragment.statements).toHaveLength(3);
});

test("creates comment records with normalized fields", () => {
  const comment = createCommentRecord({
    id: "comment_1" as SituId<"comment">,
    target: taskTarget,
    bodyMarkdown: "  Ready for review  ",
    author: {
      actorKind: "local_agent",
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(comment).toEqual({
    id: "comment_1",
    target: taskTarget,
    bodyMarkdown: "Ready for review",
    author: {
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

test("rejects invalid comment records", () => {
  expect(() =>
    createCommentRecord({
      target: taskTarget,
      bodyMarkdown: "",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createCommentRecord({
      target: taskTarget,
      bodyMarkdown: "body",
      author: {
        actorKind: "human",
        actorId: " ",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted comments", () => {
  const database = createTestDatabase();
  const repository = createCommentRepository({ database });

  try {
    const comment = repository.create({
      id: "comment_1" as SituId<"comment">,
      target: taskTarget,
      bodyMarkdown: "Ready for review",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: comment.id })).toEqual(comment);
    expect(repository.getById({ id: "comment_missing" as SituId<"comment"> })).toBeUndefined();
    expect(comment.author.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists comments for a target in creation order", () => {
  const database = createTestDatabase();
  const repository = createCommentRepository({ database });
  const experimentTarget: TargetRef<"experiment"> = {
    targetKind: "experiment",
    targetId: "experiment_1" as SituId<"experiment">,
  };

  try {
    const secondComment = repository.create({
      id: "comment_b" as SituId<"comment">,
      target: taskTarget,
      bodyMarkdown: "Second",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstComment = repository.create({
      id: "comment_a" as SituId<"comment">,
      target: taskTarget,
      bodyMarkdown: "First",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "comment_c" as SituId<"comment">,
      target: experimentTarget,
      bodyMarkdown: "Other target",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listForTarget({ target: taskTarget }).map((comment) => comment.id)).toEqual([
      firstComment.id,
      secondComment.id,
    ]);
    expect(
      repository.listForTarget({ target: experimentTarget }).map((comment) => comment.id),
    ).toEqual(["comment_c"]);
  } finally {
    database.close();
  }
});

test("lists all comments in creation order", () => {
  const database = createTestDatabase();
  const repository = createCommentRepository({ database });
  const experimentTarget: TargetRef<"experiment"> = {
    targetKind: "experiment",
    targetId: "experiment_1" as SituId<"experiment">,
  };

  try {
    repository.create({
      id: "comment_b" as SituId<"comment">,
      target: taskTarget,
      bodyMarkdown: "Same timestamp, second by id",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "comment_a" as SituId<"comment">,
      target: experimentTarget,
      bodyMarkdown: "Same timestamp, first by id",
      author: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "comment_c" as SituId<"comment">,
      target: taskTarget,
      bodyMarkdown: "Later comment",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(repository.listAll().map((comment) => comment.id)).toEqual([
      "comment_a",
      "comment_b",
      "comment_c",
    ]);
  } finally {
    database.close();
  }
});

test("reports duplicate comments as conflicts", () => {
  const database = createTestDatabase();
  const repository = createCommentRepository({ database });
  const input = {
    id: "comment_1" as SituId<"comment">,
    target: taskTarget,
    bodyMarkdown: "Ready for review",
    author: {
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

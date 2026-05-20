import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { ActorRef, SituId } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  createReviewsCreatedAtIndexStatement,
  createReviewsDecisionIndexStatement,
  createReviewsExperimentIdIndexStatement,
  createReviewsExperimentRevisionIndexStatement,
  createReviewsReviewerIndexStatement,
  createReviewsTableStatement,
  createReviewRecord,
  createReviewRepository,
  reviewsSchemaFragment,
} from "../src/index.js";

const experimentId = "experiment_1" as SituId<"experiment">;
const otherExperimentId = "experiment_2" as SituId<"experiment">;
const reviewer: ActorRef = {
  actorKind: "human",
  actorId: "scott",
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE experiments (id TEXT PRIMARY KEY)");
  database.exec("INSERT INTO experiments (id) VALUES ('experiment_1'), ('experiment_2')");

  for (const statement of reviewsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports review schema statements", () => {
  const expectedPackageName: "reviews" = reviewsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("reviews");
  expect(reviewsSchemaFragment.statements).toEqual([
    createReviewsTableStatement,
    createReviewsExperimentIdIndexStatement,
    createReviewsExperimentRevisionIndexStatement,
    createReviewsDecisionIndexStatement,
    createReviewsReviewerIndexStatement,
    createReviewsCreatedAtIndexStatement,
  ]);
});

test("creates review records with normalized fields", () => {
  const review = createReviewRecord({
    id: "review_1" as SituId<"review">,
    experimentId,
    revisionNumber: 2,
    decision: "changes_requested",
    bodyMarkdown: "  Please adjust the acceptance criteria.  ",
    reviewer: {
      actorKind: "local_agent",
      actorId: "  reviewer-1  ",
      displayName: "  Reviewer 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(review).toEqual({
    id: "review_1",
    experimentId,
    revisionNumber: 2,
    decision: "changes_requested",
    bodyMarkdown: "Please adjust the acceptance criteria.",
    reviewer: {
      actorKind: "local_agent",
      actorId: "reviewer-1",
      displayName: "Reviewer 1",
    },
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:00:00.000Z",
    },
  });
});

test("rejects invalid review records", () => {
  expect(() =>
    createReviewRecord({
      experimentId,
      revisionNumber: 0,
      decision: "approved",
      bodyMarkdown: "body",
      reviewer,
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createReviewRecord({
      experimentId,
      revisionNumber: 1,
      decision: "invalid" as "approved",
      bodyMarkdown: "body",
      reviewer,
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createReviewRecord({
      experimentId,
      revisionNumber: 1,
      decision: "approved",
      bodyMarkdown: " ",
      reviewer,
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createReviewRecord({
      experimentId,
      revisionNumber: 1,
      decision: "approved",
      bodyMarkdown: "body",
      reviewer: {
        actorKind: "human",
        actorId: " ",
      },
    }),
  ).toThrow(ValidationError);
});

test("creates and reads persisted reviews", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });

  try {
    const review = repository.create({
      id: "review_1" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "approved",
      bodyMarkdown: "Looks ready",
      reviewer,
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: review.id })).toEqual(review);
    expect(repository.getById({ id: "review_missing" as SituId<"review"> })).toBeUndefined();
    expect(review.reviewer.displayName).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists reviews for an experiment in creation order with filters", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });

  try {
    const secondReview = repository.create({
      id: "review_b" as SituId<"review">,
      experimentId,
      revisionNumber: 2,
      decision: "approved",
      bodyMarkdown: "Second",
      reviewer,
      now: "2026-05-13T12:01:00.000Z",
    });
    const firstReview = repository.create({
      id: "review_a" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "changes_requested",
      bodyMarkdown: "First",
      reviewer,
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "review_c" as SituId<"review">,
      experimentId: otherExperimentId,
      revisionNumber: 1,
      decision: "rejected",
      bodyMarkdown: "Other experiment",
      reviewer,
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(
      repository.listForExperiment({ experimentId }).map((reviewRecord) => reviewRecord.id),
    ).toEqual([firstReview.id, secondReview.id]);
    expect(
      repository
        .listForExperiment({ experimentId, revisionNumber: 1 })
        .map((reviewRecord) => reviewRecord.id),
    ).toEqual([firstReview.id]);
    expect(
      repository
        .listForExperiment({ experimentId, decision: "approved" })
        .map((reviewRecord) => reviewRecord.id),
    ).toEqual([secondReview.id]);
    expect(
      repository
        .listForExperiment({ experimentId: otherExperimentId })
        .map((reviewRecord) => reviewRecord.id),
    ).toEqual(["review_c"]);
  } finally {
    database.close();
  }
});

test("lists all reviews in creation order across experiments", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });

  try {
    repository.create({
      id: "review_c" as SituId<"review">,
      experimentId: otherExperimentId,
      revisionNumber: 1,
      decision: "commented",
      bodyMarkdown: "Third",
      reviewer,
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "review_b" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "approved",
      bodyMarkdown: "Second by id",
      reviewer,
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "review_a" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "changes_requested",
      bodyMarkdown: "First by id",
      reviewer,
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.listAll().map((reviewRecord) => reviewRecord.id)).toEqual([
      "review_a",
      "review_b",
      "review_c",
    ]);
  } finally {
    database.close();
  }
});

test("rejects invalid list filters", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });

  try {
    expect(() => repository.listForExperiment({ experimentId, revisionNumber: 0 })).toThrow(
      ValidationError,
    );
    expect(() =>
      repository.listForExperiment({ experimentId, decision: "invalid" as "approved" }),
    ).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("lists recent reviews with default, explicit, and capped limits", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });

  try {
    for (let index = 0; index < 55; index += 1) {
      repository.create({
        id: `review_${index.toString().padStart(2, "0")}` as SituId<"review">,
        experimentId,
        revisionNumber: 1,
        decision: "commented",
        bodyMarkdown: `Review ${index}`,
        reviewer,
        now: `2026-05-13T12:${index.toString().padStart(2, "0")}:00.000Z`,
      });
    }

    expect(repository.listRecent()).toHaveLength(50);
    expect(repository.listRecent({ limit: 2 }).map((reviewRecord) => reviewRecord.id)).toEqual([
      "review_54",
      "review_53",
    ]);
    expect(repository.listRecent({ limit: 1_000 })).toHaveLength(55);
  } finally {
    database.close();
  }
});

test("rejects invalid recent review limits", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });

  try {
    expect(() => repository.listRecent({ limit: 0 })).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: 1.5 })).toThrow(ValidationError);
    expect(() => repository.listRecent({ limit: Number.POSITIVE_INFINITY })).toThrow(
      ValidationError,
    );
  } finally {
    database.close();
  }
});

test("schema rejects invalid revision numbers and decisions", () => {
  const database = createTestDatabase();

  try {
    expect(() =>
      database
        .query(
          `
INSERT INTO reviews (
  id,
  experiment_id,
  revision_number,
  decision,
  body_markdown,
  reviewer_kind,
  reviewer_id,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          "review_1",
          experimentId,
          1.5,
          "approved",
          "Looks ready",
          "human",
          "scott",
          "2026-05-13T12:00:00.000Z",
          "2026-05-13T12:00:00.000Z",
        ),
    ).toThrow(Error);

    expect(() =>
      database
        .query(
          `
INSERT INTO reviews (
  id,
  experiment_id,
  revision_number,
  decision,
  body_markdown,
  reviewer_kind,
  reviewer_id,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          "review_2",
          experimentId,
          1,
          "invalid",
          "Looks ready",
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

test("reports duplicate reviews and missing parent experiments as conflicts", () => {
  const database = createTestDatabase();
  const repository = createReviewRepository({ database });
  const input = {
    id: "review_1" as SituId<"review">,
    experimentId,
    revisionNumber: 1,
    decision: "approved" as const,
    bodyMarkdown: "Looks ready",
    reviewer,
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
    expect(() =>
      repository.create({
        ...input,
        id: "review_2" as SituId<"review">,
        experimentId: "experiment_missing" as SituId<"experiment">,
      }),
    ).toThrow(ConflictError);
  } finally {
    database.close();
  }
});

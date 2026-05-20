import type { Database } from "bun:sqlite";

import type { ActorRef, SituId } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { type CreateReviewRecordInput, createReviewRecord } from "./mutations.js";
import type { ReviewDecision, ReviewRecord } from "./types.js";

const defaultRecentReviewsLimit = 50;
const maxRecentReviewsLimit = 500;
const reviewDecisions = ["approved", "changes_requested", "rejected", "commented"] as const;

export type CreateReviewRepositoryInput = {
  readonly database: Database;
};

export type CreateReviewInput = Omit<CreateReviewRecordInput, "id"> & {
  readonly id?: SituId<"review">;
};

export type ListReviewsForExperimentInput = {
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly decision?: ReviewDecision;
};

export type ListRecentReviewsInput = {
  readonly limit?: number;
};

export type ReviewRepository = {
  readonly create: (input: CreateReviewInput) => ReviewRecord;
  readonly getById: (input: { readonly id: SituId<"review"> }) => ReviewRecord | undefined;
  readonly listForExperiment: (input: ListReviewsForExperimentInput) => readonly ReviewRecord[];
  readonly listAll: () => readonly ReviewRecord[];
  readonly listRecent: (input?: ListRecentReviewsInput) => readonly ReviewRecord[];
};

type ReviewRow = {
  readonly id: string;
  readonly experiment_id: string;
  readonly revision_number: number;
  readonly decision: ReviewDecision;
  readonly body_markdown: string;
  readonly reviewer_kind: ActorRef["actorKind"];
  readonly reviewer_id: string;
  readonly reviewer_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed review repository.
 */
export function createReviewRepository(input: CreateReviewRepositoryInput): ReviewRepository {
  return {
    create: (createInput) =>
      createReview({
        database: input.database,
        input: createInput,
      }),
    getById: (getInput) =>
      getReviewById({
        database: input.database,
        id: getInput.id,
      }),
    listForExperiment: (listInput) =>
      listReviewsForExperiment({
        database: input.database,
        input: listInput,
      }),
    listAll: () =>
      listAllReviews({
        database: input.database,
      }),
    listRecent: (listInput) =>
      listRecentReviews({
        database: input.database,
        input: listInput,
      }),
  };
}

type CreateReviewRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateReviewInput;
};

function createReview(input: CreateReviewRepositoryMethodInput): ReviewRecord {
  const review = createReviewRecord(input.input);

  try {
    input.database
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
  reviewer_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        review.id,
        review.experimentId,
        review.revisionNumber,
        review.decision,
        review.bodyMarkdown,
        review.reviewer.actorKind,
        review.reviewer.actorId,
        review.reviewer.displayName ?? null,
        review.metadata.createdAt,
        review.metadata.updatedAt,
      );
  } catch (error) {
    if (isCreateConflictError(error)) {
      throw new ConflictError({
        message: "Review could not be created because it conflicts with existing state.",
        details: {
          id: review.id,
          experimentId: review.experimentId,
        },
      });
    }

    throw error;
  }

  return getPersistedReview({
    database: input.database,
    id: review.id,
  });
}

type GetReviewByIdInput = {
  readonly database: Database;
  readonly id: SituId<"review">;
};

function getReviewById(input: GetReviewByIdInput): ReviewRecord | undefined {
  const row = input.database
    .query<ReviewRow, [string]>("SELECT * FROM reviews WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return reviewFromRow({ row });
}

type ListReviewsForExperimentRepositoryInput = {
  readonly database: Database;
  readonly input: ListReviewsForExperimentInput;
};

function listReviewsForExperiment(
  input: ListReviewsForExperimentRepositoryInput,
): readonly ReviewRecord[] {
  const query = buildListReviewsForExperimentQuery({ input: input.input });
  const rows = input.database.query<ReviewRow, QueryArg[]>(query.sql).all(...query.args);

  return rows.map((row) => reviewFromRow({ row }));
}

type ListAllReviewsRepositoryInput = {
  readonly database: Database;
};

function listAllReviews(input: ListAllReviewsRepositoryInput): readonly ReviewRecord[] {
  const rows = input.database
    .query<ReviewRow, []>(
      `
SELECT *
FROM reviews
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => reviewFromRow({ row }));
}

type QueryArg = string | number;

type ListReviewsForExperimentQuery = {
  readonly sql: string;
  readonly args: QueryArg[];
};

type BuildListReviewsForExperimentQueryInput = {
  readonly input: ListReviewsForExperimentInput;
};

function buildListReviewsForExperimentQuery(
  input: BuildListReviewsForExperimentQueryInput,
): ListReviewsForExperimentQuery {
  const clauses = ["experiment_id = ?"];
  const args: QueryArg[] = [input.input.experimentId];

  if (input.input.revisionNumber !== undefined) {
    clauses.push("revision_number = ?");
    args.push(
      normalizeRevisionNumberFilter({
        revisionNumber: input.input.revisionNumber,
      }),
    );
  }

  if (input.input.decision !== undefined) {
    clauses.push("decision = ?");
    args.push(
      normalizeReviewDecisionFilter({
        decision: input.input.decision,
      }),
    );
  }

  return {
    sql: `
SELECT *
FROM reviews
WHERE ${clauses.join(" AND ")}
ORDER BY created_at ASC, id ASC
`,
    args,
  };
}

type ListRecentReviewsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListRecentReviewsInput;
};

function listRecentReviews(input: ListRecentReviewsRepositoryInput): readonly ReviewRecord[] {
  const limit = normalizeRecentReviewsLimit({
    limit: input.input?.limit,
  });
  const rows = input.database
    .query<ReviewRow, [number]>(
      `
SELECT *
FROM reviews
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(limit);

  return rows.map((row) => reviewFromRow({ row }));
}

type NormalizeRevisionNumberFilterInput = {
  readonly revisionNumber: number;
};

function normalizeRevisionNumberFilter(input: NormalizeRevisionNumberFilterInput): number {
  if (Number.isInteger(input.revisionNumber) && input.revisionNumber > 0) {
    return input.revisionNumber;
  }

  throw new ValidationError({
    message: "Expected a positive integer revision number.",
    details: { field: "revisionNumber" },
  });
}

type NormalizeReviewDecisionFilterInput = {
  readonly decision: ReviewDecision;
};

function normalizeReviewDecisionFilter(input: NormalizeReviewDecisionFilterInput): ReviewDecision {
  if (reviewDecisions.includes(input.decision)) {
    return input.decision;
  }

  throw new ValidationError({
    message: "Expected a valid review decision.",
    details: { field: "decision" },
  });
}

type NormalizeRecentReviewsLimitInput = {
  readonly limit?: number;
};

function normalizeRecentReviewsLimit(input: NormalizeRecentReviewsLimitInput): number {
  if (input.limit === undefined) {
    return defaultRecentReviewsLimit;
  }

  if (!Number.isFinite(input.limit) || !Number.isInteger(input.limit) || input.limit <= 0) {
    throw new ValidationError({
      message: "Expected a positive integer review limit.",
      details: { field: "limit" },
    });
  }

  return Math.min(input.limit, maxRecentReviewsLimit);
}

type GetPersistedReviewInput = {
  readonly database: Database;
  readonly id: SituId<"review">;
};

function getPersistedReview(input: GetPersistedReviewInput): ReviewRecord {
  const review = getReviewById(input);

  if (review !== undefined) {
    return review;
  }

  throw new Error("Review was not found after persistence.");
}

type ReviewFromRowInput = {
  readonly row: ReviewRow;
};

function reviewFromRow(input: ReviewFromRowInput): ReviewRecord {
  return {
    id: input.row.id as SituId<"review">,
    experimentId: input.row.experiment_id as SituId<"experiment">,
    revisionNumber: input.row.revision_number,
    decision: input.row.decision,
    bodyMarkdown: input.row.body_markdown,
    reviewer: {
      actorKind: input.row.reviewer_kind,
      actorId: input.row.reviewer_id,
      displayName: input.row.reviewer_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function isCreateConflictError(error: unknown): boolean {
  return isDuplicateReviewIdError(error) || isForeignKeyConstraintError(error);
}

function isDuplicateReviewIdError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message.includes("reviews.id")
  );
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}

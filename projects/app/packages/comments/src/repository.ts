import type { Database } from "bun:sqlite";

import type { ActorRef, SituId, TargetKind, TargetRef } from "@situ/common";
import { ConflictError } from "@situ/errors";

import { type CreateCommentRecordInput, createCommentRecord } from "./mutations.js";
import type { CommentRecord } from "./types.js";

export type CreateCommentRepositoryInput = {
  readonly database: Database;
};

export type CreateCommentInput = Omit<CreateCommentRecordInput, "id"> & {
  readonly id?: SituId<"comment">;
};

export type ListCommentsForTargetInput = {
  readonly target: TargetRef;
};

export type CommentRepository = {
  readonly create: (input: CreateCommentInput) => CommentRecord;
  readonly getById: (input: { readonly id: SituId<"comment"> }) => CommentRecord | undefined;
  readonly listForTarget: (input: ListCommentsForTargetInput) => readonly CommentRecord[];
  readonly listAll: () => readonly CommentRecord[];
};

type CommentRow = {
  readonly id: string;
  readonly target_kind: TargetKind;
  readonly target_id: string;
  readonly body_markdown: string;
  readonly author_kind: ActorRef["actorKind"];
  readonly author_id: string;
  readonly author_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed comment repository.
 */
export function createCommentRepository(input: CreateCommentRepositoryInput): CommentRepository {
  return {
    create: (createInput) => createComment({ database: input.database, input: createInput }),
    getById: (getInput) => getCommentById({ database: input.database, id: getInput.id }),
    listForTarget: (listInput) =>
      listCommentsForTarget({ database: input.database, input: listInput }),
    listAll: () => listAllComments({ database: input.database }),
  };
}

type CreateCommentRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateCommentInput;
};

function createComment(input: CreateCommentRepositoryMethodInput): CommentRecord {
  const comment = createCommentRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO comments (
  id,
  target_kind,
  target_id,
  body_markdown,
  author_kind,
  author_id,
  author_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        comment.id,
        comment.target.targetKind,
        comment.target.targetId,
        comment.bodyMarkdown,
        comment.author.actorKind,
        comment.author.actorId,
        comment.author.displayName ?? null,
        comment.metadata.createdAt,
        comment.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqlitePrimaryKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Comment already exists.",
        details: { id: comment.id },
      });
    }

    throw error;
  }

  return getPersistedComment({
    database: input.database,
    id: comment.id,
  });
}

type GetCommentByIdInput = {
  readonly database: Database;
  readonly id: SituId<"comment">;
};

function getCommentById(input: GetCommentByIdInput): CommentRecord | undefined {
  const row = input.database
    .query<CommentRow, [string]>("SELECT * FROM comments WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return commentFromRow({ row });
}

type ListCommentsForTargetRepositoryInput = {
  readonly database: Database;
  readonly input: ListCommentsForTargetInput;
};

function listCommentsForTarget(
  input: ListCommentsForTargetRepositoryInput,
): readonly CommentRecord[] {
  const rows = input.database
    .query<CommentRow, [string, string]>(
      `
SELECT *
FROM comments
WHERE target_kind = ? AND target_id = ?
ORDER BY created_at ASC, id ASC
`,
    )
    .all(input.input.target.targetKind, input.input.target.targetId);

  return rows.map((row) => commentFromRow({ row }));
}

type ListAllCommentsRepositoryInput = {
  readonly database: Database;
};

function listAllComments(input: ListAllCommentsRepositoryInput): readonly CommentRecord[] {
  const rows = input.database
    .query<CommentRow, []>(
      `
SELECT *
FROM comments
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => commentFromRow({ row }));
}

type GetPersistedCommentInput = {
  readonly database: Database;
  readonly id: SituId<"comment">;
};

function getPersistedComment(input: GetPersistedCommentInput): CommentRecord {
  const comment = getCommentById(input);

  if (comment !== undefined) {
    return comment;
  }

  throw new Error("Comment was not found after persistence.");
}

type CommentFromRowInput = {
  readonly row: CommentRow;
};

function commentFromRow(input: CommentFromRowInput): CommentRecord {
  return {
    id: input.row.id as SituId<"comment">,
    target: {
      targetKind: input.row.target_kind,
      targetId: input.row.target_id as TargetRef["targetId"],
    },
    bodyMarkdown: input.row.body_markdown,
    author: {
      actorKind: input.row.author_kind,
      actorId: input.row.author_id,
      displayName: input.row.author_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function isSqlitePrimaryKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message.includes("comments.id")
  );
}

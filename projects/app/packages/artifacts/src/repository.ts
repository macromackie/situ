import type { Database } from "bun:sqlite";

import type { ActorRef, SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { type CreateArtifactRecordInput, createArtifactRecord } from "./mutations.js";
import type { ArtifactRecord } from "./types.js";

const defaultRecentArtifactsLimit = 50;
const maxRecentArtifactsLimit = 500;

export type CreateArtifactRepositoryInput = {
  readonly database: Database;
};

export type CreateArtifactInput = Omit<CreateArtifactRecordInput, "id"> & {
  readonly id?: SituId<"artifact">;
};

export type ListArtifactsForTargetInput = {
  readonly target: TargetRef;
};

export type ListRecentArtifactsInput = {
  readonly limit?: number;
};

export type ArtifactRepository = {
  readonly create: (input: CreateArtifactInput) => ArtifactRecord;
  readonly getById: (input: { readonly id: SituId<"artifact"> }) => ArtifactRecord | undefined;
  readonly listForTarget: (input: ListArtifactsForTargetInput) => readonly ArtifactRecord[];
  readonly listAll: () => readonly ArtifactRecord[];
  readonly listRecent: (input?: ListRecentArtifactsInput) => readonly ArtifactRecord[];
};

type ArtifactRow = {
  readonly id: string;
  readonly target_kind: TargetRef["targetKind"];
  readonly target_id: string;
  readonly title: string;
  readonly summary_markdown: string;
  readonly uri: string;
  readonly media_type: string | null;
  readonly byte_size: number | null;
  readonly sha256: string | null;
  readonly created_by_kind: ActorRef["actorKind"];
  readonly created_by_id: string;
  readonly created_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed artifact repository.
 */
export function createArtifactRepository(input: CreateArtifactRepositoryInput): ArtifactRepository {
  return {
    create: (createInput) =>
      createArtifact({
        database: input.database,
        input: createInput,
      }),
    getById: (getInput) =>
      getArtifactById({
        database: input.database,
        id: getInput.id,
      }),
    listForTarget: (listInput) =>
      listArtifactsForTarget({
        database: input.database,
        input: listInput,
      }),
    listAll: () =>
      listAllArtifacts({
        database: input.database,
      }),
    listRecent: (listInput) =>
      listRecentArtifacts({
        database: input.database,
        input: listInput,
      }),
  };
}

type CreateArtifactRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateArtifactInput;
};

function createArtifact(input: CreateArtifactRepositoryMethodInput): ArtifactRecord {
  const artifact = createArtifactRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO artifacts (
  id,
  target_kind,
  target_id,
  title,
  summary_markdown,
  uri,
  media_type,
  byte_size,
  sha256,
  created_by_kind,
  created_by_id,
  created_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        artifact.id,
        artifact.target.targetKind,
        artifact.target.targetId,
        artifact.title,
        artifact.summaryMarkdown,
        artifact.uri,
        artifact.mediaType ?? null,
        artifact.byteSize ?? null,
        artifact.sha256 ?? null,
        artifact.createdBy.actorKind,
        artifact.createdBy.actorId,
        artifact.createdBy.displayName ?? null,
        artifact.metadata.createdAt,
        artifact.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqlitePrimaryKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Artifact already exists.",
        details: { id: artifact.id },
      });
    }

    throw error;
  }

  return getPersistedArtifact({
    database: input.database,
    id: artifact.id,
  });
}

type GetArtifactByIdInput = {
  readonly database: Database;
  readonly id: SituId<"artifact">;
};

function getArtifactById(input: GetArtifactByIdInput): ArtifactRecord | undefined {
  const row = input.database
    .query<ArtifactRow, [string]>("SELECT * FROM artifacts WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return artifactFromRow({ row });
}

type ListArtifactsForTargetRepositoryInput = {
  readonly database: Database;
  readonly input: ListArtifactsForTargetInput;
};

function listArtifactsForTarget(
  input: ListArtifactsForTargetRepositoryInput,
): readonly ArtifactRecord[] {
  const rows = input.database
    .query<ArtifactRow, [string, string]>(
      `
SELECT *
FROM artifacts
WHERE target_kind = ? AND target_id = ?
ORDER BY created_at ASC, id ASC
`,
    )
    .all(input.input.target.targetKind, input.input.target.targetId);

  return rows.map((row) => artifactFromRow({ row }));
}

type ListAllArtifactsRepositoryInput = {
  readonly database: Database;
};

function listAllArtifacts(input: ListAllArtifactsRepositoryInput): readonly ArtifactRecord[] {
  const rows = input.database
    .query<ArtifactRow, []>(
      `
SELECT *
FROM artifacts
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => artifactFromRow({ row }));
}

type ListRecentArtifactsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListRecentArtifactsInput;
};

function listRecentArtifacts(input: ListRecentArtifactsRepositoryInput): readonly ArtifactRecord[] {
  const limit = normalizeRecentArtifactsLimit({
    limit: input.input?.limit,
  });
  const rows = input.database
    .query<ArtifactRow, [number]>(
      `
SELECT *
FROM artifacts
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(limit);

  return rows.map((row) => artifactFromRow({ row }));
}

type NormalizeRecentArtifactsLimitInput = {
  readonly limit?: number;
};

function normalizeRecentArtifactsLimit(input: NormalizeRecentArtifactsLimitInput): number {
  if (input.limit === undefined) {
    return defaultRecentArtifactsLimit;
  }

  if (
    typeof input.limit !== "number" ||
    !Number.isFinite(input.limit) ||
    !Number.isInteger(input.limit) ||
    input.limit <= 0
  ) {
    throw new ValidationError({
      message: "Expected a positive integer artifact limit.",
      details: { field: "limit" },
    });
  }

  return Math.min(input.limit, maxRecentArtifactsLimit);
}

type GetPersistedArtifactInput = {
  readonly database: Database;
  readonly id: SituId<"artifact">;
};

function getPersistedArtifact(input: GetPersistedArtifactInput): ArtifactRecord {
  const artifact = getArtifactById(input);

  if (artifact !== undefined) {
    return artifact;
  }

  throw new Error("Artifact was not found after persistence.");
}

type ArtifactFromRowInput = {
  readonly row: ArtifactRow;
};

function artifactFromRow(input: ArtifactFromRowInput): ArtifactRecord {
  return {
    id: input.row.id as SituId<"artifact">,
    target: {
      targetKind: input.row.target_kind,
      targetId: input.row.target_id as TargetRef["targetId"],
    },
    title: input.row.title,
    summaryMarkdown: input.row.summary_markdown,
    uri: input.row.uri,
    mediaType: input.row.media_type ?? undefined,
    byteSize: input.row.byte_size ?? undefined,
    sha256: input.row.sha256 ?? undefined,
    createdBy: {
      actorKind: input.row.created_by_kind,
      actorId: input.row.created_by_id,
      displayName: input.row.created_by_display_name ?? undefined,
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
    error.message.includes("artifacts.id")
  );
}

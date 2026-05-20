import type { Database } from "bun:sqlite";

import type { ActorRef, SituId, TargetKind, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { type CreateEventRecordInput, createEventRecord } from "./mutations.js";
import type { EventRecord } from "./types.js";

const defaultRecentEventsLimit = 50;
const maxRecentEventsLimit = 500;

export type CreateEventRepositoryInput = {
  readonly database: Database;
};

export type CreateEventInput = Omit<CreateEventRecordInput, "id"> & {
  readonly id?: SituId<"event">;
};

export type ListEventsForTargetInput = {
  readonly target: TargetRef;
};

export type ListRecentEventsInput = {
  readonly limit?: number;
};

export type EventRepository = {
  readonly create: (input: CreateEventInput) => EventRecord;
  readonly getById: (input: { readonly id: SituId<"event"> }) => EventRecord | undefined;
  readonly listAll: () => readonly EventRecord[];
  readonly listForTarget: (input: ListEventsForTargetInput) => readonly EventRecord[];
  readonly listRecent: (input?: ListRecentEventsInput) => readonly EventRecord[];
};

type EventRow = {
  readonly id: string;
  readonly target_kind: TargetKind;
  readonly target_id: string;
  readonly actor_kind: ActorRef["actorKind"];
  readonly actor_id: string;
  readonly actor_display_name: string | null;
  readonly summary_markdown: string;
  readonly body_markdown: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed event repository.
 */
export function createEventRepository(input: CreateEventRepositoryInput): EventRepository {
  return {
    create: (createInput) => createEvent({ database: input.database, input: createInput }),
    getById: (getInput) => getEventById({ database: input.database, id: getInput.id }),
    listAll: () => listAllEvents({ database: input.database }),
    listForTarget: (listInput) =>
      listEventsForTarget({ database: input.database, input: listInput }),
    listRecent: (listInput) => listRecentEvents({ database: input.database, input: listInput }),
  };
}

type CreateEventRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateEventInput;
};

function createEvent(input: CreateEventRepositoryMethodInput): EventRecord {
  const event = createEventRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO events (
  id,
  target_kind,
  target_id,
  actor_kind,
  actor_id,
  actor_display_name,
  summary_markdown,
  body_markdown,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        event.id,
        event.target.targetKind,
        event.target.targetId,
        event.actor.actorKind,
        event.actor.actorId,
        event.actor.displayName ?? null,
        event.summaryMarkdown,
        event.bodyMarkdown ?? null,
        event.metadata.createdAt,
        event.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqlitePrimaryKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Event already exists.",
        details: { id: event.id },
      });
    }

    throw error;
  }

  return getPersistedEvent({
    database: input.database,
    id: event.id,
  });
}

type GetEventByIdInput = {
  readonly database: Database;
  readonly id: SituId<"event">;
};

function getEventById(input: GetEventByIdInput): EventRecord | undefined {
  const row = input.database
    .query<EventRow, [string]>("SELECT * FROM events WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return eventFromRow({ row });
}

type ListAllEventsRepositoryInput = {
  readonly database: Database;
};

function listAllEvents(input: ListAllEventsRepositoryInput): readonly EventRecord[] {
  const rows = input.database
    .query<EventRow, []>(
      `
SELECT *
FROM events
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => eventFromRow({ row }));
}

type ListEventsForTargetRepositoryInput = {
  readonly database: Database;
  readonly input: ListEventsForTargetInput;
};

function listEventsForTarget(input: ListEventsForTargetRepositoryInput): readonly EventRecord[] {
  const rows = input.database
    .query<EventRow, [string, string]>(
      `
SELECT *
FROM events
WHERE target_kind = ? AND target_id = ?
ORDER BY created_at ASC, id ASC
`,
    )
    .all(input.input.target.targetKind, input.input.target.targetId);

  return rows.map((row) => eventFromRow({ row }));
}

type ListRecentEventsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListRecentEventsInput;
};

function listRecentEvents(input: ListRecentEventsRepositoryInput): readonly EventRecord[] {
  const limit = normalizeRecentEventsLimit({
    limit: input.input?.limit,
  });
  const rows = input.database
    .query<EventRow, [number]>(
      `
SELECT *
FROM events
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(limit);

  return rows.map((row) => eventFromRow({ row }));
}

type NormalizeRecentEventsLimitInput = {
  readonly limit?: number;
};

function normalizeRecentEventsLimit(input: NormalizeRecentEventsLimitInput): number {
  if (input.limit === undefined) {
    return defaultRecentEventsLimit;
  }

  if (!Number.isFinite(input.limit) || !Number.isInteger(input.limit) || input.limit <= 0) {
    throw new ValidationError({
      message: "Expected a positive integer event limit.",
      details: { field: "limit" },
    });
  }

  return Math.min(input.limit, maxRecentEventsLimit);
}

type GetPersistedEventInput = {
  readonly database: Database;
  readonly id: SituId<"event">;
};

function getPersistedEvent(input: GetPersistedEventInput): EventRecord {
  const event = getEventById(input);

  if (event !== undefined) {
    return event;
  }

  throw new Error("Event was not found after persistence.");
}

type EventFromRowInput = {
  readonly row: EventRow;
};

function eventFromRow(input: EventFromRowInput): EventRecord {
  return {
    id: input.row.id as SituId<"event">,
    target: {
      targetKind: input.row.target_kind,
      targetId: input.row.target_id as TargetRef["targetId"],
    },
    actor: {
      actorKind: input.row.actor_kind,
      actorId: input.row.actor_id,
      displayName: input.row.actor_display_name ?? undefined,
    },
    summaryMarkdown: input.row.summary_markdown,
    bodyMarkdown: input.row.body_markdown ?? undefined,
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
    error.message.includes("events.id")
  );
}

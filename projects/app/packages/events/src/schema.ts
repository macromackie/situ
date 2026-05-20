export const createEventsTableStatement = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_display_name TEXT,
  summary_markdown TEXT NOT NULL,
  body_markdown TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createEventsTargetIndexStatement = `
CREATE INDEX IF NOT EXISTS events_target_idx
  ON events (target_kind, target_id);
`;

export const createEventsActorIdIndexStatement = `
CREATE INDEX IF NOT EXISTS events_actor_id_idx
  ON events (actor_id);
`;

export const createEventsCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS events_created_at_idx
  ON events (created_at);
`;

export const eventsSchemaFragment = {
  packageName: "events",
  statements: [
    createEventsTableStatement,
    createEventsTargetIndexStatement,
    createEventsActorIdIndexStatement,
    createEventsCreatedAtIndexStatement,
  ],
} as const;

export type EventsSchemaFragment = typeof eventsSchemaFragment;

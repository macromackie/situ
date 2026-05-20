export const createNotificationsTableStatement = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  recipient_display_name TEXT,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  summary_markdown TEXT NOT NULL,
  body_markdown TEXT,
  read_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createNotificationsRecipientInboxIndexStatement = `
CREATE INDEX IF NOT EXISTS notifications_recipient_inbox_idx
  ON notifications (recipient_id, dismissed_at, created_at, id);
`;

export const createNotificationsTargetIndexStatement = `
CREATE INDEX IF NOT EXISTS notifications_target_idx
  ON notifications (target_kind, target_id);
`;

export const notificationsSchemaFragment = {
  packageName: "notifications",
  statements: [
    createNotificationsTableStatement,
    createNotificationsRecipientInboxIndexStatement,
    createNotificationsTargetIndexStatement,
  ],
} as const;

export type NotificationsSchemaFragment = typeof notificationsSchemaFragment;

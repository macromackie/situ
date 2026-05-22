import type { Database } from "bun:sqlite";

export type ReplicacheEntityTable = {
  readonly tableName: string;
  readonly keyPrefix: string;
};

export const replicacheEntityTables = [
  { tableName: "projects", keyPrefix: "projects/" },
  { tableName: "tasks", keyPrefix: "tasks/" },
  { tableName: "baselines", keyPrefix: "baselines/" },
  { tableName: "experiments", keyPrefix: "experiments/" },
  { tableName: "measurements", keyPrefix: "measurements/" },
  { tableName: "reviews", keyPrefix: "reviews/" },
  { tableName: "artifacts", keyPrefix: "artifacts/" },
  { tableName: "reports", keyPrefix: "reports/" },
  { tableName: "briefings", keyPrefix: "briefings/" },
  { tableName: "live_signals", keyPrefix: "live-signals/" },
  { tableName: "live_map_nodes", keyPrefix: "live-map-nodes/" },
  { tableName: "live_map_edges", keyPrefix: "live-map-edges/" },
  { tableName: "live_focuses", keyPrefix: "live-focuses/" },
  { tableName: "live_node_details", keyPrefix: "live-node-details/" },
  { tableName: "comments", keyPrefix: "comments/" },
  { tableName: "events", keyPrefix: "events/" },
  { tableName: "notifications", keyPrefix: "notifications/" },
] as const satisfies readonly ReplicacheEntityTable[];

export const createReplicacheSpaceTableStatement = `
CREATE TABLE IF NOT EXISTS replicache_space (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  version INTEGER NOT NULL CHECK (version >= 0)
);
`;

export const createReplicacheEntitiesTableStatement = `
CREATE TABLE IF NOT EXISTS replicache_entities (
  key TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 0),
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1))
);
`;

export const createReplicacheEntitiesVersionIndexStatement = `
CREATE INDEX IF NOT EXISTS replicache_entities_version_idx
  ON replicache_entities (version, key);
`;

export const createReplicacheClientMutationsVersionIndexStatement = `
CREATE INDEX IF NOT EXISTS replicache_client_mutations_group_version_idx
  ON replicache_client_mutations (client_group_id, last_modified_version, client_id);
`;

export function applyReplicacheGlobalVersionSyncMigration(input: {
  readonly database: Database;
}): void {
  input.database.exec(createReplicacheSpaceTableStatement);
  input.database.exec(createReplicacheEntitiesTableStatement);
  input.database.exec(createReplicacheEntitiesVersionIndexStatement);
  input.database.exec(`
INSERT OR IGNORE INTO replicache_space (id, version)
VALUES ('default', 0)
`);

  if (
    !tableHasColumn({
      database: input.database,
      tableName: "replicache_client_mutations",
      columnName: "last_modified_version",
    })
  ) {
    input.database.exec(`
ALTER TABLE replicache_client_mutations
ADD COLUMN last_modified_version INTEGER NOT NULL DEFAULT 0 CHECK (last_modified_version >= 0)
`);
  }

  const backfillVersion = hasReplicacheVisibleState({ database: input.database }) ? 1 : 0;

  if (backfillVersion > 0) {
    input.database
      .query("UPDATE replicache_space SET version = ? WHERE id = 'default'")
      .run(backfillVersion);
  }

  for (const entityTable of replicacheEntityTables) {
    input.database.exec(`
INSERT INTO replicache_entities (key, version, deleted)
SELECT '${entityTable.keyPrefix}' || id, ${backfillVersion}, 0
FROM ${entityTable.tableName}
WHERE true
ON CONFLICT(key) DO UPDATE SET
  version = excluded.version,
  deleted = excluded.deleted
`);
  }

  input.database
    .query("UPDATE replicache_client_mutations SET last_modified_version = ?")
    .run(backfillVersion);
  input.database.exec(createReplicacheClientMutationsVersionIndexStatement);

  for (const statement of createReplicacheEntityTriggerStatements()) {
    input.database.exec(statement);
  }
}

export function getReplicacheVersion(input: { readonly database: Database }): number {
  const row = input.database
    .query<{ readonly version: number }, []>(
      "SELECT version FROM replicache_space WHERE id = 'default'",
    )
    .get();

  return row?.version ?? 0;
}

export function advanceReplicacheVersion(input: { readonly database: Database }): number {
  input.database.exec("UPDATE replicache_space SET version = version + 1 WHERE id = 'default'");

  return getReplicacheVersion(input);
}

function createReplicacheEntityTriggerStatements(): readonly string[] {
  return replicacheEntityTables.flatMap((entityTable) => [
    createReplicacheEntityTriggerStatement({
      entityTable,
      operation: "insert",
      rowAlias: "NEW",
      deleted: 0,
    }),
    createReplicacheEntityTriggerStatement({
      entityTable,
      operation: "update",
      rowAlias: "NEW",
      deleted: 0,
    }),
    createReplicacheEntityTriggerStatement({
      entityTable,
      operation: "delete",
      rowAlias: "OLD",
      deleted: 1,
    }),
  ]);
}

function createReplicacheEntityTriggerStatement(input: {
  readonly entityTable: ReplicacheEntityTable;
  readonly operation: "insert" | "update" | "delete";
  readonly rowAlias: "NEW" | "OLD";
  readonly deleted: 0 | 1;
}): string {
  const triggerOperation = input.operation.toUpperCase();

  return `
CREATE TRIGGER IF NOT EXISTS replicache_sync_${input.entityTable.tableName}_${input.operation}
AFTER ${triggerOperation} ON ${input.entityTable.tableName}
BEGIN
  UPDATE replicache_space
    SET version = version + 1
    WHERE id = 'default';

  INSERT INTO replicache_entities (key, version, deleted)
  VALUES (
    '${input.entityTable.keyPrefix}' || ${input.rowAlias}.id,
    (SELECT version FROM replicache_space WHERE id = 'default'),
    ${input.deleted}
  )
  ON CONFLICT(key) DO UPDATE SET
    version = excluded.version,
    deleted = excluded.deleted;
END;
`;
}

function hasReplicacheVisibleState(input: { readonly database: Database }): boolean {
  for (const entityTable of replicacheEntityTables) {
    if (countRows({ database: input.database, tableName: entityTable.tableName }) > 0) {
      return true;
    }
  }

  return countRows({ database: input.database, tableName: "replicache_client_mutations" }) > 0;
}

function countRows(input: { readonly database: Database; readonly tableName: string }): number {
  const row = input.database
    .query<{ readonly count: number }, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`)
    .get();

  return row?.count ?? 0;
}

function tableHasColumn(input: {
  readonly database: Database;
  readonly tableName: string;
  readonly columnName: string;
}): boolean {
  const rows = input.database
    .query<{ readonly name: string }, []>(`PRAGMA table_info(${input.tableName})`)
    .all();

  return rows.some((row) => row.name === input.columnName);
}

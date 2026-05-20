import type { Database } from "bun:sqlite";

import { nowTimestamp } from "@situ/common";
import { baselinesSchemaFragment } from "@situ/baselines";
import { createMeasurementsTableStatement, measurementsSchemaFragment } from "@situ/measurements";

import { appSchemaFragments, schemaStatementsFromFragments } from "./schema.js";
import { withTransaction } from "./transactions.js";

/**
 * App-level SQLite migration definition.
 */
export type SchemaMigration = {
  readonly id: string;
  readonly statements?: readonly string[];
  readonly apply?: (input: ApplySchemaMigrationInput) => void;
};

export type ApplySchemaMigrationInput = {
  readonly database: Database;
};

export const migrationsTableStatement = `
CREATE TABLE IF NOT EXISTS _situ_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

export const createReplicacheClientMutationsTableStatement = `
CREATE TABLE IF NOT EXISTS replicache_client_mutations (
  client_group_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  last_mutation_id INTEGER NOT NULL CHECK (last_mutation_id >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (client_group_id, client_id)
);
`;

export const appSchemaMigrations = [
  {
    id: "0001-initial-package-schema",
    statements: schemaStatementsFromFragments({
      fragments: appSchemaFragments,
    }),
  },
  {
    id: "0002-replicache-client-mutations",
    statements: [createReplicacheClientMutationsTableStatement],
  },
  {
    id: "0003-baselines-and-measurement-targets",
    apply: applyBaselinesAndMeasurementTargetsMigration,
  },
] as const satisfies readonly SchemaMigration[];

export type MigrateDatabaseInput = {
  readonly database: Database;
};

type MigrationRow = {
  readonly id: string;
};

/**
 * Applies app schema migrations.
 */
export function migrateDatabase(input: MigrateDatabaseInput): void {
  input.database.exec(migrationsTableStatement);

  for (const migration of appSchemaMigrations) {
    if (
      migrationAlreadyApplied({
        database: input.database,
        id: migration.id,
      })
    ) {
      continue;
    }

    applyMigration({
      database: input.database,
      migration,
    });
  }
}

type MigrationAlreadyAppliedInput = {
  readonly database: Database;
  readonly id: string;
};

function migrationAlreadyApplied(input: MigrationAlreadyAppliedInput): boolean {
  const row = input.database
    .query<MigrationRow, [string]>("SELECT id FROM _situ_migrations WHERE id = ?")
    .get(input.id);

  return row !== null;
}

type ApplyMigrationInput = {
  readonly database: Database;
  readonly migration: SchemaMigration;
};

function applyMigration(input: ApplyMigrationInput): void {
  withTransaction({
    database: input.database,
    run: (database) => {
      if (input.migration.apply !== undefined) {
        input.migration.apply({ database });
      } else {
        for (const statement of input.migration.statements ?? []) {
          database.exec(statement);
        }
      }

      database
        .query("INSERT INTO _situ_migrations (id, applied_at) VALUES (?, ?)")
        .run(input.migration.id, nowTimestamp());
    },
  });
}

function applyBaselinesAndMeasurementTargetsMigration(input: ApplySchemaMigrationInput): void {
  for (const statement of baselinesSchemaFragment.statements) {
    input.database.exec(statement);
  }

  if (!tableExists({ database: input.database, tableName: "measurements" })) {
    for (const statement of measurementsSchemaFragment.statements) {
      input.database.exec(statement);
    }

    return;
  }

  if (
    tableHasColumn({
      database: input.database,
      tableName: "measurements",
      columnName: "baseline_id",
    })
  ) {
    for (const statement of measurementsSchemaFragment.statements) {
      input.database.exec(statement);
    }

    return;
  }

  rebuildMeasurementsTableWithBaselineTarget({ database: input.database });
}

function rebuildMeasurementsTableWithBaselineTarget(input: ApplySchemaMigrationInput): void {
  input.database.exec("ALTER TABLE measurements RENAME TO measurements_0003_old");
  input.database.exec(createMeasurementsTableStatement);
  input.database.exec(`
INSERT INTO measurements (
  id,
  baseline_id,
  experiment_id,
  revision_number,
  metric_name,
  numeric_value,
  unit,
  summary_markdown,
  details_markdown,
  measured_by_kind,
  measured_by_id,
  measured_by_display_name,
  created_at,
  updated_at
)
SELECT
  id,
  NULL,
  experiment_id,
  revision_number,
  metric_name,
  numeric_value,
  unit,
  summary_markdown,
  details_markdown,
  measured_by_kind,
  measured_by_id,
  measured_by_display_name,
  created_at,
  updated_at
FROM measurements_0003_old
`);
  input.database.exec("DROP TABLE measurements_0003_old");

  for (const statement of measurementsSchemaFragment.statements) {
    if (statement === createMeasurementsTableStatement) {
      continue;
    }

    input.database.exec(statement);
  }
}

function tableExists(input: { readonly database: Database; readonly tableName: string }): boolean {
  const row = input.database
    .query<{ readonly name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(input.tableName);

  return row !== null;
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

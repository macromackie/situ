import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { ValidationError } from "@situ/errors";

import {
  appSchemaFragments,
  appSchemaMigrations,
  memoryDatabasePath,
  migrateDatabase,
  openAppDatabase,
  resolveDatabasePath,
  resolveStateHome,
  withTransaction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

type JournalModeRow = {
  readonly journal_mode: string;
};

type ForeignKeysRow = {
  readonly foreign_keys: number;
};

test("resolves state home from SITU_HOME or HOME", () => {
  expect(
    resolveStateHome({
      environment: { SITU_HOME: "/tmp/situ-state", HOME: "/tmp/home" },
    }),
  ).toBe("/tmp/situ-state");

  expect(
    resolveStateHome({
      environment: { SITU_HOME: "", HOME: "/tmp/home" },
    }),
  ).toBe("/tmp/home/.situ");

  expect(() =>
    resolveStateHome({
      environment: {},
    }),
  ).toThrow(ValidationError);

  expect(() =>
    resolveStateHome({
      environment: { SITU_HOME: "relative/path" },
    }),
  ).toThrow(ValidationError);
});

test("resolves database paths", () => {
  expect(
    resolveDatabasePath({
      environment: { HOME: "/tmp/home" },
    }),
  ).toBe("/tmp/home/.situ/situ.db");

  expect(
    resolveDatabasePath({
      stateHomePath: "/tmp/situ-state",
    }),
  ).toBe("/tmp/situ-state/situ.db");

  expect(
    resolveDatabasePath({
      databasePath: "/tmp/custom/situ.db",
    }),
  ).toBe("/tmp/custom/situ.db");

  expect(
    resolveDatabasePath({
      databasePath: memoryDatabasePath,
    }),
  ).toBe(memoryDatabasePath);

  expect(() =>
    resolveDatabasePath({
      databasePath: "relative.db",
    }),
  ).toThrow(ValidationError);
});

test("opens an in-memory database with foreign keys and migrations", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const foreignKeys = database.query<ForeignKeysRow, []>("PRAGMA foreign_keys").get();
    const migrationCount = database
      .query<CountRow, []>(
        `
SELECT COUNT(*) AS count
FROM _situ_migrations
WHERE id IN (
  '0001-initial-package-schema',
  '0002-replicache-client-mutations',
  '0003-baselines-and-measurement-targets',
  '0004-briefings',
  '0005-live-presentation-records'
)
`,
      )
      .get();

    expect(foreignKeys?.foreign_keys).toBe(1);
    expect(migrationCount?.count).toBe(5);
    expect(
      database
        .query<CountRow, []>("SELECT COUNT(*) AS count FROM replicache_client_mutations")
        .get()?.count,
    ).toBe(0);
  } finally {
    database.close();
  }
});

test("opens a file-backed database with WAL and creates the state home", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "situ-db-"));
  const stateHome = join(tempRoot, "state");
  const databasePath = join(stateHome, "situ.db");
  const database = openAppDatabase({
    environment: { SITU_HOME: stateHome },
  });

  try {
    const journalMode = database.query<JournalModeRow, []>("PRAGMA journal_mode").get();

    expect(existsSync(databasePath)).toBe(true);
    expect(journalMode?.journal_mode).toBe("wal");
  } finally {
    database.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("applies app migrations idempotently", () => {
  const database = openAppDatabase({
    databasePath: memoryDatabasePath,
    migrate: false,
  });

  try {
    migrateDatabase({ database });
    migrateDatabase({ database });

    const migrationCount = database
      .query<CountRow, []>("SELECT COUNT(*) AS count FROM _situ_migrations")
      .get();

    expect(migrationCount?.count).toBe(5);
  } finally {
    database.close();
  }
});

test("runs callback results inside transactions", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  database.exec("CREATE TABLE transaction_records (id TEXT PRIMARY KEY)");

  try {
    const result = withTransaction({
      database,
      run: (transaction) => {
        transaction.exec("INSERT INTO transaction_records (id) VALUES ('record-1')");

        return "created";
      },
    });
    const recordCount = database
      .query<CountRow, []>("SELECT COUNT(*) AS count FROM transaction_records")
      .get();

    expect(result).toBe("created");
    expect(recordCount?.count).toBe(1);
  } finally {
    database.close();
  }
});

test("rolls back failed transactions", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  database.exec("CREATE TABLE transaction_records (id TEXT PRIMARY KEY)");

  try {
    expect(() =>
      withTransaction({
        database,
        run: (transaction) => {
          transaction.exec("INSERT INTO transaction_records (id) VALUES ('record-1')");
          throw new Error("fail");
        },
      }),
    ).toThrow("fail");

    const recordCount = database
      .query<CountRow, []>("SELECT COUNT(*) AS count FROM transaction_records")
      .get();

    expect(recordCount?.count).toBe(0);
  } finally {
    database.close();
  }
});

test("rejects nested transactions", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    expect(() =>
      withTransaction({
        database,
        run: () =>
          withTransaction({
            database,
            run: () => "nested",
          }),
      }),
    ).toThrow(ValidationError);
  } finally {
    database.close();
  }
});

test("keeps app schema fragments in primitive order", () => {
  expect(appSchemaFragments.map((fragment) => fragment.packageName)).toEqual([
    "projects",
    "tasks",
    "comments",
    "events",
    "notifications",
    "baselines",
    "experiments",
    "measurements",
    "artifacts",
    "reports",
    "briefings",
    "live",
    "reviews",
  ]);
  expect(appSchemaMigrations.map((migration) => migration.id)).toEqual([
    "0001-initial-package-schema",
    "0002-replicache-client-mutations",
    "0003-baselines-and-measurement-targets",
    "0004-briefings",
    "0005-live-presentation-records",
  ]);
});

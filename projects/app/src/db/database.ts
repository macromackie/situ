import { Database } from "bun:sqlite";

import { ExternalError } from "@situ/errors";

import { migrateDatabase } from "./migrations.js";
import { ensureDatabaseDirectory, memoryDatabasePath, resolveDatabasePath } from "./paths.js";

export type OpenAppDatabaseInput = {
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly migrate?: boolean;
};

type JournalModeRow = {
  readonly journal_mode: string;
};

/**
 * Opens the local Situ app database.
 */
export function openAppDatabase(input: OpenAppDatabaseInput = {}): Database {
  const databasePath = resolveDatabasePath({
    databasePath: input.databasePath,
    environment: input.environment,
  });

  ensureDatabaseDirectory({ databasePath });

  const database = new Database(databasePath);
  enableSqlitePragmas({
    database,
    databasePath,
  });

  if (input.migrate ?? true) {
    migrateDatabase({ database });
  }

  return database;
}

type EnableSqlitePragmasInput = {
  readonly database: Database;
  readonly databasePath: string;
};

function enableSqlitePragmas(input: EnableSqlitePragmasInput): void {
  input.database.exec("PRAGMA foreign_keys = ON");

  if (input.databasePath === memoryDatabasePath) {
    return;
  }

  const journalMode = input.database.query<JournalModeRow, []>("PRAGMA journal_mode = WAL").get();

  if (journalMode?.journal_mode.toLowerCase() === "wal") {
    return;
  }

  throw new ExternalError({
    message: "Unable to enable SQLite WAL journal mode.",
    details: { databasePath: input.databasePath },
  });
}

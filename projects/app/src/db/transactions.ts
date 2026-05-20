import type { Database } from "bun:sqlite";

import { ValidationError } from "@situ/errors";

export type WithTransactionInput<T> = {
  readonly database: Database;
  readonly run: (database: Database) => T;
};

const activeTransactions = new WeakSet<Database>();

/**
 * Runs a synchronous callback inside one SQLite transaction.
 */
export function withTransaction<T>(input: WithTransactionInput<T>): T {
  if (activeTransactions.has(input.database)) {
    throw new ValidationError({
      message: "Nested database transactions are not supported.",
    });
  }

  input.database.exec("BEGIN");
  activeTransactions.add(input.database);

  try {
    const result = input.run(input.database);

    if (isPromiseLike(result)) {
      throw new ValidationError({
        message: "Database transactions must be synchronous.",
      });
    }

    input.database.exec("COMMIT");

    return result;
  } catch (error) {
    input.database.exec("ROLLBACK");
    throw error;
  } finally {
    activeTransactions.delete(input.database);
  }
}

function isPromiseLike(value: unknown): boolean {
  return typeof value === "object" && value !== null && "then" in value;
}

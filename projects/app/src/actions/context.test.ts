import { expect, test } from "bun:test";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { createAppActionContext, createAppRepositories, runAppTransaction } from "./index.js";

type CountRow = {
  readonly count: number;
};

test("creates the app repository bundle", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const repositories = createAppRepositories({ database });

    expect(Object.keys(repositories)).toEqual([
      "projects",
      "tasks",
      "comments",
      "events",
      "notifications",
      "baselines",
      "experiments",
      "measurements",
      "artifacts",
      "reviews",
      "reports",
    ]);
    expect(repositories.projects.create).toBeFunction();
    expect(repositories.tasks.create).toBeFunction();
    expect(repositories.comments.create).toBeFunction();
    expect(repositories.events.create).toBeFunction();
    expect(repositories.events.listAll).toBeFunction();
    expect(repositories.notifications.create).toBeFunction();
    expect(repositories.baselines.create).toBeFunction();
    expect(repositories.experiments.create).toBeFunction();
    expect(repositories.measurements.create).toBeFunction();
    expect(repositories.artifacts.create).toBeFunction();
    expect(repositories.reviews.create).toBeFunction();
    expect(repositories.reports.create).toBeFunction();
  } finally {
    database.close();
  }
});

test("creates an app action context from a caller-provided database", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    expect(context.database).toBe(database);
    expect(context.repositories.projects.create).toBeFunction();
  } finally {
    database.close();
  }
});

test("runs app transactions with a fresh action context", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  database.exec("CREATE TABLE app_action_transaction_records (id TEXT PRIMARY KEY)");

  try {
    const context = createAppActionContext({ database });
    let transactionContext = context;

    const result = runAppTransaction({
      context,
      run: (currentContext) => {
        transactionContext = currentContext;
        currentContext.database.exec(
          "INSERT INTO app_action_transaction_records (id) VALUES ('record-1')",
        );

        return "created";
      },
    });
    const recordCount = database
      .query<CountRow, []>("SELECT COUNT(*) AS count FROM app_action_transaction_records")
      .get();

    expect(result).toBe("created");
    expect(transactionContext).not.toBe(context);
    expect(transactionContext.database).toBe(database);
    expect(transactionContext.repositories).not.toBe(context.repositories);
    expect(recordCount?.count).toBe(1);
  } finally {
    database.close();
  }
});

test("rolls back failed app transactions", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  database.exec("CREATE TABLE app_action_transaction_records (id TEXT PRIMARY KEY)");

  try {
    const context = createAppActionContext({ database });

    expect(() =>
      runAppTransaction({
        context,
        run: (currentContext) => {
          currentContext.database.exec(
            "INSERT INTO app_action_transaction_records (id) VALUES ('record-1')",
          );
          throw new Error("fail");
        },
      }),
    ).toThrow("fail");

    const recordCount = database
      .query<CountRow, []>("SELECT COUNT(*) AS count FROM app_action_transaction_records")
      .get();

    expect(recordCount?.count).toBe(0);
  } finally {
    database.close();
  }
});

import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { createAppActionContext } from "../actions/index.js";
import { getReplicacheVersion, memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { setLastMutationId } from "./client-mutations.js";

type ReplicacheEntityRow = {
  readonly version: number;
  readonly deleted: number;
};

type ClientMutationRow = {
  readonly last_mutation_id: number;
  readonly last_modified_version: number;
};

function getEntity(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly key: string;
}): ReplicacheEntityRow | null {
  return input.database
    .query<ReplicacheEntityRow, [string]>(
      `
SELECT version, deleted
FROM replicache_entities
WHERE key = ?
`,
    )
    .get(input.key);
}

function getClientMutation(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly clientGroupID: string;
  readonly clientID: string;
}): ClientMutationRow | null {
  return input.database
    .query<ClientMutationRow, [string, string]>(
      `
SELECT last_mutation_id, last_modified_version
FROM replicache_client_mutations
WHERE client_group_id = ? AND client_id = ?
`,
    )
    .get(input.clientGroupID, input.clientID);
}

test("tracks product inserts, updates, and deletes with the global Replicache version", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    expect(getReplicacheVersion({ database })).toBe(0);
    expect(getEntity({ database, key: "projects/project_global_version" })).toBeNull();

    createAppActionContext({ database }).repositories.projects.create({
      id: "project_global_version" as SituId<"project">,
      name: "Global Version",
      repositoryPath: "/tmp/global-version",
      goalMarkdown: "Exercise global version tracking.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-22T00:00:00.000Z",
    });

    expect(getReplicacheVersion({ database })).toBe(1);
    expect(getEntity({ database, key: "projects/project_global_version" })).toEqual({
      version: 1,
      deleted: 0,
    });

    createAppActionContext({ database }).repositories.projects.archive({
      id: "project_global_version" as SituId<"project">,
      now: "2026-05-22T00:01:00.000Z",
    });

    expect(getReplicacheVersion({ database })).toBe(2);
    expect(getEntity({ database, key: "projects/project_global_version" })).toEqual({
      version: 2,
      deleted: 0,
    });

    database.query("DELETE FROM projects WHERE id = ?").run("project_global_version");

    expect(getReplicacheVersion({ database })).toBe(3);
    expect(getEntity({ database, key: "projects/project_global_version" })).toEqual({
      version: 3,
      deleted: 1,
    });
  } finally {
    database.close();
  }
});

test("tracks client mutation acknowledgements with the global Replicache version", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    setLastMutationId({
      database,
      clientGroupID: "client-group-global-version",
      clientID: "client-1",
      lastMutationID: 1,
    });

    expect(getReplicacheVersion({ database })).toBe(1);
    expect(
      getClientMutation({
        database,
        clientGroupID: "client-group-global-version",
        clientID: "client-1",
      }),
    ).toEqual({
      last_mutation_id: 1,
      last_modified_version: 1,
    });

    setLastMutationId({
      database,
      clientGroupID: "client-group-global-version",
      clientID: "client-1",
      lastMutationID: 2,
    });

    expect(getReplicacheVersion({ database })).toBe(2);
    expect(
      getClientMutation({
        database,
        clientGroupID: "client-group-global-version",
        clientID: "client-1",
      }),
    ).toEqual({
      last_mutation_id: 2,
      last_modified_version: 2,
    });
  } finally {
    database.close();
  }
});

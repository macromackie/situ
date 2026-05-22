import type { Database } from "bun:sqlite";

import { createAppActionContext } from "../actions/index.js";
import { getReplicacheVersion, withTransaction } from "../db/index.js";
import { listLastMutationIdChanges } from "./client-mutations.js";
import { buildReplicacheEntitySnapshot, buildResetPatch } from "./entities.js";
import type {
  JsonValue,
  ReplicachePatchOperation,
  ReplicachePullRequest,
  ReplicachePullResponse,
} from "./types.js";

export type ProcessReplicachePullInput = {
  readonly database: Database;
  readonly pullRequest: ReplicachePullRequest;
};

/**
 * Builds a Replicache pull response using a global numeric sync version.
 */
export function processReplicachePull(input: ProcessReplicachePullInput): ReplicachePullResponse {
  return withTransaction({
    database: input.database,
    run: (database) => {
      const context = createAppActionContext({ database });
      const currentVersion = getReplicacheVersion({ database });
      const previousVersion = parsePullCookie(input.pullRequest.cookie);
      const reset = previousVersion === undefined || previousVersion > currentVersion;
      const sinceVersion = reset ? 0 : previousVersion;
      const snapshot = buildReplicacheEntitySnapshot({ context });
      const patch = reset
        ? buildResetPatch({ snapshot })
        : buildIncrementalPatch({
            database,
            sinceVersion,
            snapshot,
          });

      return {
        cookie: currentVersion,
        lastMutationIDChanges: listLastMutationIdChanges({
          database,
          clientGroupID: input.pullRequest.clientGroupID,
          sinceVersion: reset ? undefined : sinceVersion,
        }),
        patch,
      };
    },
  });
}

type ChangedEntityRow = {
  readonly key: string;
  readonly deleted: number;
};

function buildIncrementalPatch(input: {
  readonly database: Database;
  readonly sinceVersion: number;
  readonly snapshot: ReadonlyMap<string, JsonValue>;
}): ReplicachePatchOperation[] {
  const rows = input.database
    .query<ChangedEntityRow, [number]>(
      `
SELECT key, deleted
FROM replicache_entities
WHERE version > ?
ORDER BY version ASC, key ASC
`,
    )
    .all(input.sinceVersion);

  return rows.map((row): ReplicachePatchOperation => {
    const value = input.snapshot.get(row.key);

    if (row.deleted === 1 || value === undefined) {
      return {
        op: "del",
        key: row.key,
      };
    }

    return {
      op: "put",
      key: row.key,
      value,
    };
  });
}

function parsePullCookie(cookie: JsonValue): number | undefined {
  if (typeof cookie !== "number") {
    return undefined;
  }

  if (!Number.isSafeInteger(cookie) || cookie < 0) {
    return undefined;
  }

  return cookie;
}

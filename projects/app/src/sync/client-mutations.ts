import type { Database } from "bun:sqlite";

import { nowTimestamp } from "@situ/common";

import { advanceReplicacheVersion } from "../db/index.js";

export type GetLastMutationIdInput = {
  readonly database: Database;
  readonly clientGroupID: string;
  readonly clientID: string;
};

export type SetLastMutationIdInput = GetLastMutationIdInput & {
  readonly lastMutationID: number;
};

export type ListLastMutationIdChangesInput = {
  readonly database: Database;
  readonly clientGroupID: string;
  readonly sinceVersion?: number;
};

type LastMutationIdRow = {
  readonly last_mutation_id: number;
};

type LastMutationIdChangeRow = {
  readonly client_id: string;
  readonly last_mutation_id: number;
};

/**
 * Returns the last processed mutation id for a Replicache client.
 */
export function getLastMutationId(input: GetLastMutationIdInput): number {
  const row = input.database
    .query<LastMutationIdRow, [string, string]>(
      `
SELECT last_mutation_id
FROM replicache_client_mutations
WHERE client_group_id = ? AND client_id = ?
`,
    )
    .get(input.clientGroupID, input.clientID);

  return row?.last_mutation_id ?? 0;
}

/**
 * Returns every known last mutation id for one Replicache client group.
 */
export function listLastMutationIdChanges(
  input: ListLastMutationIdChangesInput,
): Record<string, number> {
  const rows = input.database
    .query<LastMutationIdChangeRow, [string, number | null, number | null]>(
      `
SELECT client_id, last_mutation_id
FROM replicache_client_mutations
WHERE client_group_id = ?
  AND (? IS NULL OR last_modified_version > ?)
ORDER BY client_id ASC
`,
    )
    .all(input.clientGroupID, input.sinceVersion ?? null, input.sinceVersion ?? null);
  const changes: Record<string, number> = {};

  for (const row of rows) {
    changes[row.client_id] = row.last_mutation_id;
  }

  return changes;
}

/**
 * Stores the last processed mutation id for a Replicache client.
 */
export function setLastMutationId(input: SetLastMutationIdInput): void {
  const lastModifiedVersion = advanceReplicacheVersion({ database: input.database });

  input.database
    .query(
      `
INSERT INTO replicache_client_mutations (
  client_group_id,
  client_id,
  last_mutation_id,
  last_modified_version,
  updated_at
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(client_group_id, client_id)
DO UPDATE SET
  last_mutation_id = excluded.last_mutation_id,
  last_modified_version = excluded.last_modified_version,
  updated_at = excluded.updated_at
`,
    )
    .run(
      input.clientGroupID,
      input.clientID,
      input.lastMutationID,
      lastModifiedVersion,
      nowTimestamp(),
    );
}

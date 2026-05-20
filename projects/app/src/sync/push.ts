import type { Database } from "bun:sqlite";

import { isBaseError, serializeError } from "@situ/errors";

import { createAppActionContext } from "../actions/index.js";
import { withTransaction } from "../db/index.js";
import { getLastMutationId, setLastMutationId } from "./client-mutations.js";
import { prepareReplicacheMutation } from "./mutators.js";
import type {
  ReplicacheMutation,
  ReplicachePermanentMutationError,
  ReplicachePushRequest,
  ReplicachePushResult,
} from "./types.js";
import type { PreparedReplicacheMutation } from "./mutators.js";

export type ProcessReplicachePushInput = {
  readonly database: Database;
  readonly pushRequest: ReplicachePushRequest;
};

export function processReplicachePush(input: ProcessReplicachePushInput): ReplicachePushResult {
  const permanentErrors: ReplicachePermanentMutationError[] = [];
  let processedMutationCount = 0;
  let skippedMutationCount = 0;

  for (const mutation of input.pushRequest.mutations) {
    const lastMutationId = getLastMutationId({
      database: input.database,
      clientGroupID: input.pushRequest.clientGroupID,
      clientID: mutation.clientID,
    });

    if (mutation.id <= lastMutationId || mutation.id > lastMutationId + 1) {
      skippedMutationCount += 1;
      continue;
    }

    try {
      const preparedMutation = prepareReplicacheMutation(mutation);

      processMutationEffects({
        database: input.database,
        clientGroupID: input.pushRequest.clientGroupID,
        mutation,
        preparedMutation,
      });
      processedMutationCount += 1;
    } catch (error) {
      if (!isBaseError(error)) {
        throw error;
      }

      markPermanentMutationError({
        database: input.database,
        clientGroupID: input.pushRequest.clientGroupID,
        mutation,
      });
      processedMutationCount += 1;
      permanentErrors.push({
        clientID: mutation.clientID,
        mutationID: mutation.id,
        mutationName: mutation.name,
        error: serializeError(error),
      });
    }
  }

  return {
    ok: true,
    processedMutationCount,
    skippedMutationCount,
    permanentErrorCount: permanentErrors.length,
    permanentErrors,
  };
}

function processMutationEffects(input: {
  readonly database: Database;
  readonly clientGroupID: string;
  readonly mutation: ReplicacheMutation;
  readonly preparedMutation: PreparedReplicacheMutation;
}): void {
  withTransaction({
    database: input.database,
    run: (database) => {
      const context = createAppActionContext({ database });

      input.preparedMutation.apply(context);
      setLastMutationId({
        database,
        clientGroupID: input.clientGroupID,
        clientID: input.mutation.clientID,
        lastMutationID: input.mutation.id,
      });
    },
  });
}

function markPermanentMutationError(input: {
  readonly database: Database;
  readonly clientGroupID: string;
  readonly mutation: ReplicacheMutation;
}): void {
  withTransaction({
    database: input.database,
    run: (database) => {
      setLastMutationId({
        database,
        clientGroupID: input.clientGroupID,
        clientID: input.mutation.clientID,
        lastMutationID: input.mutation.id,
      });
    },
  });
}

import { createHash } from "node:crypto";

import type { Database } from "bun:sqlite";

import { InternalError } from "@situ/errors";

import { createAppActionContext } from "../actions/index.js";
import { withTransaction } from "../db/index.js";
import { listLastMutationIdChanges } from "./client-mutations.js";
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
 * Builds the full reset-style Replicache pull response.
 */
export function processReplicachePull(input: ProcessReplicachePullInput): ReplicachePullResponse {
  return withTransaction({
    database: input.database,
    run: (database) => {
      const context = createAppActionContext({ database });
      const patch: ReplicachePatchOperation[] = [{ op: "clear" }];

      for (const project of context.repositories.projects.list()) {
        patch.push({
          op: "put",
          key: `projects/${project.id}`,
          value: toJsonValue(project),
        });
      }

      for (const task of context.repositories.tasks.list()) {
        patch.push({
          op: "put",
          key: `tasks/${task.id}`,
          value: toJsonValue(task),
        });
      }

      for (const baseline of context.repositories.baselines.list()) {
        patch.push({
          op: "put",
          key: `baselines/${baseline.id}`,
          value: toJsonValue(baseline),
        });
      }

      for (const experiment of context.repositories.experiments.list()) {
        patch.push({
          op: "put",
          key: `experiments/${experiment.id}`,
          value: toJsonValue(experiment),
        });
      }

      for (const measurement of context.repositories.measurements.listAll()) {
        patch.push({
          op: "put",
          key: `measurements/${measurement.id}`,
          value: toJsonValue(measurement),
        });
      }

      for (const review of context.repositories.reviews.listAll()) {
        patch.push({
          op: "put",
          key: `reviews/${review.id}`,
          value: toJsonValue(review),
        });
      }

      for (const artifact of context.repositories.artifacts.listAll()) {
        patch.push({
          op: "put",
          key: `artifacts/${artifact.id}`,
          value: toJsonValue(artifact),
        });
      }

      for (const report of context.repositories.reports.listAll()) {
        patch.push({
          op: "put",
          key: `reports/${report.id}`,
          value: toJsonValue(report),
        });
      }

      for (const briefing of context.repositories.briefings.listAll()) {
        patch.push({
          op: "put",
          key: `briefings/${briefing.id}`,
          value: toJsonValue(briefing),
        });
      }

      for (const signal of context.repositories.live.listAllSignals()) {
        patch.push({
          op: "put",
          key: `live-signals/${signal.id}`,
          value: toJsonValue(signal),
        });
      }

      for (const node of context.repositories.live.listAllMapNodes()) {
        patch.push({
          op: "put",
          key: `live-map-nodes/${node.id}`,
          value: toJsonValue(node),
        });
      }

      for (const edge of context.repositories.live.listAllMapEdges()) {
        patch.push({
          op: "put",
          key: `live-map-edges/${edge.id}`,
          value: toJsonValue(edge),
        });
      }

      for (const focus of context.repositories.live.listAllFocuses()) {
        patch.push({
          op: "put",
          key: `live-focuses/${focus.id}`,
          value: toJsonValue(focus),
        });
      }

      for (const detail of context.repositories.live.listAllNodeDetails()) {
        patch.push({
          op: "put",
          key: `live-node-details/${detail.id}`,
          value: toJsonValue(detail),
        });
      }

      for (const comment of context.repositories.comments.listAll()) {
        patch.push({
          op: "put",
          key: `comments/${comment.id}`,
          value: toJsonValue(comment),
        });
      }

      for (const event of context.repositories.events.listAll()) {
        patch.push({
          op: "put",
          key: `events/${event.id}`,
          value: toJsonValue(event),
        });
      }

      for (const notification of context.repositories.notifications.listAll()) {
        patch.push({
          op: "put",
          key: `notifications/${notification.id}`,
          value: toJsonValue(notification),
        });
      }

      const cookie = computePullCookie(patch);

      return {
        cookie,
        lastMutationIDChanges: listLastMutationIdChanges({
          database,
          clientGroupID: input.pullRequest.clientGroupID,
        }),
        patch: input.pullRequest.cookie === cookie ? [] : patch,
      };
    },
  });
}

/**
 * Fingerprints the full reset patch so the pull cookie advances whenever any
 * record changes and stays stable otherwise. Replicache discards a pull whose
 * cookie equals the client's current cookie, so a constant cookie (e.g. always
 * `null`) would never deliver records to the browser.
 */
function computePullCookie(patch: readonly ReplicachePatchOperation[]): string {
  const puts = patch.filter((operation) => operation.op === "put");
  const fingerprint = createHash("sha1").update(JSON.stringify(puts)).digest("hex");
  return `${puts.length}:${fingerprint}`;
}

function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new InternalError({
      message: "Expected product record to serialize to JSON.",
    });
  }

  return JSON.parse(serialized) as JsonValue;
}

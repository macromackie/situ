import { InternalError } from "@situ/errors";

import type { AppActionContext } from "../actions/index.js";
import type { JsonValue, ReplicachePatchOperation } from "./types.js";

export function buildReplicacheEntitySnapshot(input: {
  readonly context: AppActionContext;
}): ReadonlyMap<string, JsonValue> {
  const records = new Map<string, JsonValue>();

  addRecords({
    records,
    prefix: "projects/",
    values: input.context.repositories.projects.list(),
  });
  addRecords({
    records,
    prefix: "tasks/",
    values: input.context.repositories.tasks.list(),
  });
  addRecords({
    records,
    prefix: "baselines/",
    values: input.context.repositories.baselines.list(),
  });
  addRecords({
    records,
    prefix: "experiments/",
    values: input.context.repositories.experiments.list(),
  });
  addRecords({
    records,
    prefix: "measurements/",
    values: input.context.repositories.measurements.listAll(),
  });
  addRecords({
    records,
    prefix: "reviews/",
    values: input.context.repositories.reviews.listAll(),
  });
  addRecords({
    records,
    prefix: "artifacts/",
    values: input.context.repositories.artifacts.listAll(),
  });
  addRecords({
    records,
    prefix: "reports/",
    values: input.context.repositories.reports.listAll(),
  });
  addRecords({
    records,
    prefix: "briefings/",
    values: input.context.repositories.briefings.listAll(),
  });
  addRecords({
    records,
    prefix: "live-signals/",
    values: input.context.repositories.live.listAllSignals(),
  });
  addRecords({
    records,
    prefix: "live-map-nodes/",
    values: input.context.repositories.live.listAllMapNodes(),
  });
  addRecords({
    records,
    prefix: "live-map-edges/",
    values: input.context.repositories.live.listAllMapEdges(),
  });
  addRecords({
    records,
    prefix: "live-focuses/",
    values: input.context.repositories.live.listAllFocuses(),
  });
  addRecords({
    records,
    prefix: "live-node-details/",
    values: input.context.repositories.live.listAllNodeDetails(),
  });
  addRecords({
    records,
    prefix: "comments/",
    values: input.context.repositories.comments.listAll(),
  });
  addRecords({
    records,
    prefix: "events/",
    values: input.context.repositories.events.listAll(),
  });
  addRecords({
    records,
    prefix: "notifications/",
    values: input.context.repositories.notifications.listAll(),
  });

  return records;
}

export function buildResetPatch(input: {
  readonly snapshot: ReadonlyMap<string, JsonValue>;
}): ReplicachePatchOperation[] {
  return [
    { op: "clear" },
    ...Array.from(input.snapshot.entries(), ([key, value]) => ({
      op: "put" as const,
      key,
      value,
    })),
  ];
}

function addRecords<TRecord extends { readonly id: string }>(input: {
  readonly records: Map<string, JsonValue>;
  readonly prefix: string;
  readonly values: readonly TRecord[];
}): void {
  for (const value of input.values) {
    input.records.set(`${input.prefix}${value.id}`, toJsonValue(value));
  }
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

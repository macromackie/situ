import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { MeasurementRecord } from "./types.js";

export type CreateMeasurementRecordInput = {
  readonly id?: SituId<"measurement">;
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName: string;
  readonly numericValue: number;
  readonly unit?: string;
  readonly summaryMarkdown: string;
  readonly detailsMarkdown?: string;
  readonly measuredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

/**
 * Creates an append-only measurement record.
 */
export function createMeasurementRecord(input: CreateMeasurementRecordInput): MeasurementRecord {
  validateMeasurementTarget(input);

  return {
    id: input.id ?? createId({ prefix: "measurement" }),
    baselineId: input.baselineId,
    experimentId: input.experimentId,
    revisionNumber: optionalPositiveInteger({
      field: "revisionNumber",
      value: input.revisionNumber,
    }),
    metricName: requireNonEmptyString({
      field: "metricName",
      value: input.metricName,
    }),
    numericValue: requireFiniteNumber({
      field: "numericValue",
      value: input.numericValue,
    }),
    unit: optionalNonEmptyString({
      field: "unit",
      value: input.unit,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "summaryMarkdown",
      value: input.summaryMarkdown,
    }),
    detailsMarkdown: optionalNonEmptyString({
      field: "detailsMarkdown",
      value: input.detailsMarkdown,
    }),
    measuredBy: normalizeActorRef({
      actor: input.measuredBy,
      field: "measuredBy",
    }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

function validateMeasurementTarget(input: CreateMeasurementRecordInput): void {
  if (
    input.baselineId !== undefined &&
    input.experimentId === undefined &&
    input.revisionNumber === undefined
  ) {
    return;
  }

  if (
    input.baselineId === undefined &&
    input.experimentId !== undefined &&
    input.revisionNumber !== undefined
  ) {
    return;
  }

  throw new ValidationError({
    message: "Expected exactly one measurement target.",
    details: {
      baselineId: input.baselineId,
      experimentId: input.experimentId,
      revisionNumber: input.revisionNumber,
    },
  });
}

function optionalPositiveInteger(input: {
  readonly field: string;
  readonly value?: number;
}): number | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requirePositiveInteger({
    field: input.field,
    value: input.value,
  });
}

type RequirePositiveIntegerInput = {
  readonly field: string;
  readonly value: number;
};

function requirePositiveInteger(input: RequirePositiveIntegerInput): number {
  if (Number.isInteger(input.value) && input.value > 0) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a positive integer.",
    details: { field: input.field },
  });
}

type RequireFiniteNumberInput = {
  readonly field: string;
  readonly value: number;
};

function requireFiniteNumber(input: RequireFiniteNumberInput): number {
  if (Number.isFinite(input.value)) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a finite number.",
    details: { field: input.field },
  });
}

type NormalizeActorRefInput = {
  readonly actor: ActorRef;
  readonly field: string;
};

function normalizeActorRef(input: NormalizeActorRefInput): ActorRef {
  const displayName = optionalNonEmptyString({
    field: `${input.field}.displayName`,
    value: input.actor.displayName,
  });

  return {
    actorKind: requireNonEmptyString({
      field: `${input.field}.actorKind`,
      value: input.actor.actorKind,
    }) as ActorRef["actorKind"],
    actorId: requireNonEmptyString({
      field: `${input.field}.actorId`,
      value: input.actor.actorId,
    }),
    displayName,
  };
}

type RequireNonEmptyStringInput = {
  readonly field: string;
  readonly value: string;
};

function requireNonEmptyString(input: RequireNonEmptyStringInput): string {
  const value = input.value.trim();

  if (value.length > 0) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

type OptionalNonEmptyStringInput = {
  readonly field: string;
  readonly value?: string;
};

function optionalNonEmptyString(input: OptionalNonEmptyStringInput): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString({
    field: input.field,
    value: input.value,
  });
}

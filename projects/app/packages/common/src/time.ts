import { ValidationError } from "@situ/errors";
import { DateTime } from "luxon";

/**
 * ISO timestamp string used at package boundaries.
 */
export type IsoTimestamp = string;

/**
 * Shared creation and update timestamps for product records.
 */
export type SyncMetadata = {
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
};

/**
 * Object argument accepted when creating sync metadata.
 */
export type CreateSyncMetadataInput = {
  readonly now?: IsoTimestamp;
};

/**
 * Object argument accepted when updating sync metadata.
 */
export type TouchSyncMetadataInput = {
  readonly metadata: SyncMetadata;
  readonly now?: IsoTimestamp;
};

/**
 * Object argument accepted when comparing ISO timestamps.
 */
export type CompareIsoTimestampsInput = {
  readonly left: IsoTimestamp;
  readonly right: IsoTimestamp;
};

/**
 * Object argument accepted when measuring elapsed timestamp hours.
 */
export type DiffIsoTimestampsInHoursInput = {
  readonly earlier: IsoTimestamp;
  readonly later: IsoTimestamp;
};

/**
 * Returns the current UTC time as an ISO timestamp string.
 */
export function nowTimestamp(): IsoTimestamp {
  return toIsoTimestamp({
    dateTime: DateTime.utc(),
    field: "now",
  });
}

/**
 * Creates initial sync metadata with matching creation and update timestamps.
 */
export function createSyncMetadata(input: CreateSyncMetadataInput = {}): SyncMetadata {
  const timestamp = resolveTimestamp({
    field: "now",
    timestamp: input.now,
  });

  return {
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Returns sync metadata with an updated modification timestamp.
 */
export function touchSyncMetadata(input: TouchSyncMetadataInput): SyncMetadata {
  return {
    ...input.metadata,
    updatedAt: resolveTimestamp({
      field: "now",
      timestamp: input.now,
    }),
  };
}

/**
 * Compares two ISO timestamps.
 */
export function compareIsoTimestamps(input: CompareIsoTimestampsInput): -1 | 0 | 1 {
  const leftMillis = toEpochMillis({
    field: "left",
    timestamp: input.left,
  });

  const rightMillis = toEpochMillis({
    field: "right",
    timestamp: input.right,
  });

  if (leftMillis < rightMillis) {
    return -1;
  }

  if (leftMillis > rightMillis) {
    return 1;
  }

  return 0;
}

/**
 * Returns fractional hours between two ISO timestamps.
 */
export function diffIsoTimestampsInHours(input: DiffIsoTimestampsInHoursInput): number {
  const earlier = parseIsoTimestamp({
    field: "earlier",
    timestamp: input.earlier,
  });
  const later = parseIsoTimestamp({
    field: "later",
    timestamp: input.later,
  });

  return later.diff(earlier, "hours").hours;
}

type ResolveTimestampInput = {
  readonly field: string;
  readonly timestamp?: IsoTimestamp;
};

function resolveTimestamp(input: ResolveTimestampInput): IsoTimestamp {
  if (input.timestamp === undefined) {
    return nowTimestamp();
  }

  const dateTime = parseIsoTimestamp({
    field: input.field,
    timestamp: input.timestamp,
  });

  return toIsoTimestamp({
    dateTime,
    field: input.field,
  });
}

type ParseIsoTimestampInput = {
  readonly field: string;
  readonly timestamp: IsoTimestamp;
};

function parseIsoTimestamp(input: ParseIsoTimestampInput): DateTime {
  const dateTime = DateTime.fromISO(input.timestamp, { setZone: true });

  if (!dateTime.isValid) {
    throw new ValidationError({
      message: "Expected a valid ISO timestamp.",
      details: { field: input.field },
    });
  }

  return dateTime;
}

type ToIsoTimestampInput = {
  readonly dateTime: DateTime;
  readonly field: string;
};

function toIsoTimestamp(input: ToIsoTimestampInput): IsoTimestamp {
  const isoTimestamp = input.dateTime.toUTC().toISO({
    suppressMilliseconds: false,
  });

  if (isoTimestamp === null) {
    throw new ValidationError({
      message: "Expected a valid ISO timestamp.",
      details: { field: input.field },
    });
  }

  return isoTimestamp;
}

type ToEpochMillisInput = {
  readonly field: string;
  readonly timestamp: IsoTimestamp;
};

function toEpochMillis(input: ToEpochMillisInput): number {
  return parseIsoTimestamp(input).toMillis();
}

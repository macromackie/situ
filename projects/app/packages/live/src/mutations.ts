import {
  type ActorKind,
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetKind,
  type TargetRef,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import {
  type LiveEdgeTone,
  type LiveFocusMode,
  type LiveFocusRecord,
  type LiveMapEdgeRecord,
  type LiveMapEdgeRelation,
  type LiveMapNodeKind,
  type LiveMapNodeRecord,
  type LiveNodeDetailRecord,
  type LiveNodeFact,
  type LiveSignalRecord,
  type LiveTone,
  type LiveVisibility,
  liveEdgeTones,
  liveFocusModes,
  liveMapEdgeRelations,
  liveMapNodeKinds,
  liveTones,
  liveVisibilities,
} from "./types.js";

export type CreateLiveSignalRecordInput = {
  readonly id?: SituId<"live_signal">;
  readonly projectId: SituId<"project">;
  readonly slot: string;
  readonly label: string;
  readonly value: string;
  readonly summary?: string;
  readonly tone: LiveTone;
  readonly refs?: readonly TargetRef[];
  readonly visibility?: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateLiveMapNodeRecordInput = {
  readonly id?: SituId<"live_node">;
  readonly projectId: SituId<"project">;
  readonly nodeKey: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly occurredAt?: IsoTimestamp;
  readonly refs?: readonly TargetRef[];
  readonly visibility?: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateLiveMapEdgeRecordInput = {
  readonly id?: SituId<"live_edge">;
  readonly projectId: SituId<"project">;
  readonly edgeKey: string;
  readonly fromNodeKey: string;
  readonly toNodeKey: string;
  readonly relation: LiveMapEdgeRelation;
  readonly tone: LiveEdgeTone;
  readonly visibility?: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateLiveFocusRecordInput = {
  readonly id?: SituId<"live_focus">;
  readonly projectId: SituId<"project">;
  readonly mode: LiveFocusMode;
  readonly primaryNodeKey?: string;
  readonly relatedNodeKeys?: readonly string[];
  readonly summary?: string;
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateLiveNodeDetailRecordInput = {
  readonly id?: SituId<"live_detail">;
  readonly projectId: SituId<"project">;
  readonly nodeKey: string;
  readonly bodyMarkdown: string;
  readonly facts?: readonly LiveNodeFact[];
  readonly refs?: readonly TargetRef[];
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

const actorKinds = ["human", "local_agent", "system"] as const satisfies readonly ActorKind[];
const targetKinds = [
  "project",
  "task",
  "comment",
  "event",
  "notification",
  "baseline",
  "experiment",
  "measurement",
  "artifact",
  "review",
  "report",
  "briefing",
  "live_signal",
  "live_node",
  "live_edge",
  "live_focus",
  "live_detail",
] as const satisfies readonly TargetKind[];

export function createLiveSignalRecord(input: CreateLiveSignalRecordInput): LiveSignalRecord {
  return {
    id: input.id ?? createId({ prefix: "live_signal" }),
    projectId: input.projectId,
    slot: requireNonEmptyString({ field: "slot", value: input.slot }),
    label: requireNonEmptyString({ field: "label", value: input.label }),
    value: requireNonEmptyString({ field: "value", value: input.value }),
    summary: optionalNonEmptyString({ field: "summary", value: input.summary }),
    tone: normalizeTone({ field: "tone", value: input.tone }),
    refs: normalizeTargetRefs({ field: "refs", refs: input.refs ?? [] }),
    visibility: normalizeVisibility({ field: "visibility", value: input.visibility ?? "visible" }),
    authoredBy: normalizeActorRef({ field: "authoredBy", actor: input.authoredBy }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

export function createLiveMapNodeRecord(input: CreateLiveMapNodeRecordInput): LiveMapNodeRecord {
  return withOptional({
    id: input.id ?? createId({ prefix: "live_node" }),
    projectId: input.projectId,
    nodeKey: requireNonEmptyString({ field: "nodeKey", value: input.nodeKey }),
    kind: normalizeNodeKind({ field: "kind", value: input.kind }),
    title: requireNonEmptyString({ field: "title", value: input.title }),
    summary: requireNonEmptyString({ field: "summary", value: input.summary }),
    tone: normalizeTone({ field: "tone", value: input.tone }),
    occurredAt: normalizeOptionalTimestamp({ field: "occurredAt", value: input.occurredAt }),
    refs: normalizeTargetRefs({ field: "refs", refs: input.refs ?? [] }),
    visibility: normalizeVisibility({ field: "visibility", value: input.visibility ?? "visible" }),
    authoredBy: normalizeActorRef({ field: "authoredBy", actor: input.authoredBy }),
    metadata: createSyncMetadata({ now: input.now }),
  });
}

export function createLiveMapEdgeRecord(input: CreateLiveMapEdgeRecordInput): LiveMapEdgeRecord {
  return {
    id: input.id ?? createId({ prefix: "live_edge" }),
    projectId: input.projectId,
    edgeKey: requireNonEmptyString({ field: "edgeKey", value: input.edgeKey }),
    fromNodeKey: requireNonEmptyString({ field: "fromNodeKey", value: input.fromNodeKey }),
    toNodeKey: requireNonEmptyString({ field: "toNodeKey", value: input.toNodeKey }),
    relation: normalizeEdgeRelation({ field: "relation", value: input.relation }),
    tone: normalizeEdgeTone({ field: "tone", value: input.tone }),
    visibility: normalizeVisibility({ field: "visibility", value: input.visibility ?? "visible" }),
    authoredBy: normalizeActorRef({ field: "authoredBy", actor: input.authoredBy }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

export function createLiveFocusRecord(input: CreateLiveFocusRecordInput): LiveFocusRecord {
  return withOptional({
    id: input.id ?? createId({ prefix: "live_focus" }),
    projectId: input.projectId,
    mode: normalizeFocusMode({ field: "mode", value: input.mode }),
    primaryNodeKey: optionalNonEmptyString({
      field: "primaryNodeKey",
      value: input.primaryNodeKey,
    }),
    relatedNodeKeys: normalizeStringArray({
      field: "relatedNodeKeys",
      values: input.relatedNodeKeys ?? [],
    }),
    summary: optionalNonEmptyString({ field: "summary", value: input.summary }),
    authoredBy: normalizeActorRef({ field: "authoredBy", actor: input.authoredBy }),
    metadata: createSyncMetadata({ now: input.now }),
  });
}

export function createLiveNodeDetailRecord(
  input: CreateLiveNodeDetailRecordInput,
): LiveNodeDetailRecord {
  return {
    id: input.id ?? createId({ prefix: "live_detail" }),
    projectId: input.projectId,
    nodeKey: requireNonEmptyString({ field: "nodeKey", value: input.nodeKey }),
    bodyMarkdown: requireNonEmptyString({ field: "bodyMarkdown", value: input.bodyMarkdown }),
    facts: normalizeFacts({ field: "facts", facts: input.facts ?? [] }),
    refs: normalizeTargetRefs({ field: "refs", refs: input.refs ?? [] }),
    authoredBy: normalizeActorRef({ field: "authoredBy", actor: input.authoredBy }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

function normalizeTone(input: { readonly field: string; readonly value: unknown }): LiveTone {
  if (typeof input.value === "string" && (liveTones as readonly string[]).includes(input.value)) {
    return input.value as LiveTone;
  }

  throw new ValidationError({
    message: "Invalid live tone.",
    details: { field: input.field, value: input.value, supported: liveTones },
  });
}

function normalizeEdgeTone(input: {
  readonly field: string;
  readonly value: unknown;
}): LiveEdgeTone {
  if (
    typeof input.value === "string" &&
    (liveEdgeTones as readonly string[]).includes(input.value)
  ) {
    return input.value as LiveEdgeTone;
  }

  throw new ValidationError({
    message: "Invalid live edge tone.",
    details: { field: input.field, value: input.value, supported: liveEdgeTones },
  });
}

function normalizeVisibility(input: {
  readonly field: string;
  readonly value: unknown;
}): LiveVisibility {
  if (
    typeof input.value === "string" &&
    (liveVisibilities as readonly string[]).includes(input.value)
  ) {
    return input.value as LiveVisibility;
  }

  throw new ValidationError({
    message: "Invalid live visibility.",
    details: { field: input.field, value: input.value, supported: liveVisibilities },
  });
}

function normalizeNodeKind(input: {
  readonly field: string;
  readonly value: unknown;
}): LiveMapNodeKind {
  if (
    typeof input.value === "string" &&
    (liveMapNodeKinds as readonly string[]).includes(input.value)
  ) {
    return input.value as LiveMapNodeKind;
  }

  throw new ValidationError({
    message: "Invalid live map node kind.",
    details: { field: input.field, value: input.value, supported: liveMapNodeKinds },
  });
}

function normalizeEdgeRelation(input: {
  readonly field: string;
  readonly value: unknown;
}): LiveMapEdgeRelation {
  if (
    typeof input.value === "string" &&
    (liveMapEdgeRelations as readonly string[]).includes(input.value)
  ) {
    return input.value as LiveMapEdgeRelation;
  }

  throw new ValidationError({
    message: "Invalid live map edge relation.",
    details: { field: input.field, value: input.value, supported: liveMapEdgeRelations },
  });
}

function normalizeFocusMode(input: {
  readonly field: string;
  readonly value: unknown;
}): LiveFocusMode {
  if (
    typeof input.value === "string" &&
    (liveFocusModes as readonly string[]).includes(input.value)
  ) {
    return input.value as LiveFocusMode;
  }

  throw new ValidationError({
    message: "Invalid live focus mode.",
    details: { field: input.field, value: input.value, supported: liveFocusModes },
  });
}

function normalizeFacts(input: {
  readonly field: string;
  readonly facts: unknown;
}): readonly LiveNodeFact[] {
  if (!Array.isArray(input.facts)) {
    throw new ValidationError({
      message: "Expected live node facts to be an array.",
      details: { field: input.field },
    });
  }

  return input.facts.map((fact, index) =>
    normalizeFact({ field: `${input.field}[${index}]`, fact }),
  );
}

function normalizeFact(input: { readonly field: string; readonly fact: unknown }): LiveNodeFact {
  if (typeof input.fact !== "object" || input.fact === null) {
    throw new ValidationError({
      message: "Expected live node fact to be an object.",
      details: { field: input.field },
    });
  }

  const fact = input.fact as Record<string, unknown>;
  return withOptional({
    label: requireNonEmptyString({ field: `${input.field}.label`, value: fact.label }),
    value: requireNonEmptyString({ field: `${input.field}.value`, value: fact.value }),
    tone:
      fact.tone === undefined
        ? undefined
        : normalizeTone({ field: `${input.field}.tone`, value: fact.tone }),
  });
}

function normalizeTargetRefs(input: {
  readonly field: string;
  readonly refs: unknown;
}): readonly TargetRef[] {
  if (!Array.isArray(input.refs)) {
    throw new ValidationError({
      message: "Expected target refs to be an array.",
      details: { field: input.field },
    });
  }

  return input.refs.map((ref, index) =>
    normalizeTargetRef({
      field: `${input.field}[${index}]`,
      ref,
    }),
  );
}

function normalizeTargetRef(input: { readonly field: string; readonly ref: unknown }): TargetRef {
  if (typeof input.ref !== "object" || input.ref === null) {
    throw new ValidationError({
      message: "Expected target ref to be an object.",
      details: { field: input.field },
    });
  }

  const ref = input.ref as Record<string, unknown>;
  const targetKind = requireNonEmptyString({
    field: `${input.field}.targetKind`,
    value: ref.targetKind,
  });

  if (!(targetKinds as readonly string[]).includes(targetKind)) {
    throw new ValidationError({
      message: "Invalid target kind.",
      details: { field: `${input.field}.targetKind`, value: targetKind },
    });
  }

  return {
    targetKind: targetKind as TargetKind,
    targetId: requireNonEmptyString({
      field: `${input.field}.targetId`,
      value: ref.targetId,
    }) as TargetRef["targetId"],
  };
}

function normalizeStringArray(input: {
  readonly field: string;
  readonly values: unknown;
}): readonly string[] {
  if (!Array.isArray(input.values)) {
    throw new ValidationError({
      message: "Expected strings to be an array.",
      details: { field: input.field },
    });
  }

  return input.values.map((value, index) =>
    requireNonEmptyString({
      field: `${input.field}[${index}]`,
      value,
    }),
  );
}

function normalizeActorRef(input: { readonly actor: ActorRef; readonly field: string }): ActorRef {
  const actorKind = requireNonEmptyString({
    field: `${input.field}.actorKind`,
    value: input.actor.actorKind,
  });

  if (!(actorKinds as readonly string[]).includes(actorKind)) {
    throw new ValidationError({
      message: "Invalid actor kind.",
      details: { field: `${input.field}.actorKind`, value: actorKind, supported: actorKinds },
    });
  }

  return withOptional({
    actorKind: actorKind as ActorKind,
    actorId: requireNonEmptyString({
      field: `${input.field}.actorId`,
      value: input.actor.actorId,
    }),
    displayName: optionalNonEmptyString({
      field: `${input.field}.displayName`,
      value: input.actor.displayName,
    }),
  });
}

function normalizeOptionalTimestamp(input: {
  readonly field: string;
  readonly value?: unknown;
}): IsoTimestamp | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  const value = requireNonEmptyString({ field: input.field, value: input.value });
  return createSyncMetadata({ now: value }).createdAt;
}

function requireNonEmptyString(input: { readonly field: string; readonly value: unknown }): string {
  if (typeof input.value !== "string") {
    throw new ValidationError({
      message: "Expected a non-empty string.",
      details: { field: input.field },
    });
  }

  const value = input.value.trim();

  if (value.length > 0) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

function optionalNonEmptyString(input: {
  readonly field: string;
  readonly value?: unknown;
}): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString({ field: input.field, value: input.value });
}

function withOptional<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

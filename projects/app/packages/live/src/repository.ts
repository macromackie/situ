import type { Database } from "bun:sqlite";

import type { ActorRef, SituId, TargetRef } from "@situ/common";
import { ConflictError, InternalError } from "@situ/errors";

import {
  type CreateLiveFocusRecordInput,
  type CreateLiveMapEdgeRecordInput,
  type CreateLiveMapNodeRecordInput,
  type CreateLiveNodeDetailRecordInput,
  type CreateLiveSignalRecordInput,
  createLiveFocusRecord,
  createLiveMapEdgeRecord,
  createLiveMapNodeRecord,
  createLiveNodeDetailRecord,
  createLiveSignalRecord,
} from "./mutations.js";
import type {
  LiveEdgeTone,
  LiveFocusMode,
  LiveFocusRecord,
  LiveMapEdgeRecord,
  LiveMapEdgeRelation,
  LiveMapNodeKind,
  LiveMapNodeRecord,
  LiveNodeDetailRecord,
  LiveNodeFact,
  LiveSignalRecord,
  LiveTone,
  LiveVisibility,
} from "./types.js";

export type CreateLiveRepositoryInput = {
  readonly database: Database;
};

export type CreateLiveSignalInput = Omit<CreateLiveSignalRecordInput, "id"> & {
  readonly id?: SituId<"live_signal">;
};
export type CreateLiveMapNodeInput = Omit<CreateLiveMapNodeRecordInput, "id"> & {
  readonly id?: SituId<"live_node">;
};
export type CreateLiveMapEdgeInput = Omit<CreateLiveMapEdgeRecordInput, "id"> & {
  readonly id?: SituId<"live_edge">;
};
export type CreateLiveFocusInput = Omit<CreateLiveFocusRecordInput, "id"> & {
  readonly id?: SituId<"live_focus">;
};
export type CreateLiveNodeDetailInput = Omit<CreateLiveNodeDetailRecordInput, "id"> & {
  readonly id?: SituId<"live_detail">;
};

export type ListLiveRecordsForProjectInput = {
  readonly projectId: SituId<"project">;
};

export type LiveProjectRecords = {
  readonly signals: readonly LiveSignalRecord[];
  readonly mapNodes: readonly LiveMapNodeRecord[];
  readonly mapEdges: readonly LiveMapEdgeRecord[];
  readonly focuses: readonly LiveFocusRecord[];
  readonly nodeDetails: readonly LiveNodeDetailRecord[];
};

export type LiveRepository = {
  readonly createSignal: (input: CreateLiveSignalInput) => LiveSignalRecord;
  readonly createMapNode: (input: CreateLiveMapNodeInput) => LiveMapNodeRecord;
  readonly createMapEdge: (input: CreateLiveMapEdgeInput) => LiveMapEdgeRecord;
  readonly createFocus: (input: CreateLiveFocusInput) => LiveFocusRecord;
  readonly createNodeDetail: (input: CreateLiveNodeDetailInput) => LiveNodeDetailRecord;
  readonly listAllSignals: () => readonly LiveSignalRecord[];
  readonly listAllMapNodes: () => readonly LiveMapNodeRecord[];
  readonly listAllMapEdges: () => readonly LiveMapEdgeRecord[];
  readonly listAllFocuses: () => readonly LiveFocusRecord[];
  readonly listAllNodeDetails: () => readonly LiveNodeDetailRecord[];
  readonly listForProject: (input: ListLiveRecordsForProjectInput) => LiveProjectRecords;
};

type AuthoredRow = {
  readonly authored_by_kind: ActorRef["actorKind"];
  readonly authored_by_id: string;
  readonly authored_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type LiveSignalRow = AuthoredRow & {
  readonly id: string;
  readonly project_id: string;
  readonly slot: string;
  readonly label: string;
  readonly value: string;
  readonly summary: string | null;
  readonly tone: LiveTone;
  readonly refs_json: string;
  readonly visibility: LiveVisibility;
};

type LiveMapNodeRow = AuthoredRow & {
  readonly id: string;
  readonly project_id: string;
  readonly node_key: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly occurred_at: string | null;
  readonly refs_json: string;
  readonly visibility: LiveVisibility;
};

type LiveMapEdgeRow = AuthoredRow & {
  readonly id: string;
  readonly project_id: string;
  readonly edge_key: string;
  readonly from_node_key: string;
  readonly to_node_key: string;
  readonly relation: LiveMapEdgeRelation;
  readonly tone: LiveEdgeTone;
  readonly visibility: LiveVisibility;
};

type LiveFocusRow = AuthoredRow & {
  readonly id: string;
  readonly project_id: string;
  readonly mode: LiveFocusMode;
  readonly primary_node_key: string | null;
  readonly related_node_keys_json: string;
  readonly summary: string | null;
};

type LiveNodeDetailRow = AuthoredRow & {
  readonly id: string;
  readonly project_id: string;
  readonly node_key: string;
  readonly body_markdown: string;
  readonly facts_json: string;
  readonly refs_json: string;
};

export function createLiveRepository(input: CreateLiveRepositoryInput): LiveRepository {
  return {
    createSignal: (createInput) => createSignal({ database: input.database, input: createInput }),
    createMapNode: (createInput) => createMapNode({ database: input.database, input: createInput }),
    createMapEdge: (createInput) => createMapEdge({ database: input.database, input: createInput }),
    createFocus: (createInput) => createFocus({ database: input.database, input: createInput }),
    createNodeDetail: (createInput) =>
      createNodeDetail({ database: input.database, input: createInput }),
    listAllSignals: () => listAllSignals({ database: input.database }),
    listAllMapNodes: () => listAllMapNodes({ database: input.database }),
    listAllMapEdges: () => listAllMapEdges({ database: input.database }),
    listAllFocuses: () => listAllFocuses({ database: input.database }),
    listAllNodeDetails: () => listAllNodeDetails({ database: input.database }),
    listForProject: (listInput) => listForProject({ database: input.database, input: listInput }),
  };
}

function createSignal(input: {
  readonly database: Database;
  readonly input: CreateLiveSignalInput;
}): LiveSignalRecord {
  const record = createLiveSignalRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO live_signals (
  id, project_id, slot, label, value, summary, tone, refs_json, visibility,
  authored_by_kind, authored_by_id, authored_by_display_name, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        record.id,
        record.projectId,
        record.slot,
        record.label,
        record.value,
        record.summary ?? null,
        record.tone,
        JSON.stringify(record.refs),
        record.visibility,
        record.authoredBy.actorKind,
        record.authoredBy.actorId,
        record.authoredBy.displayName ?? null,
        record.metadata.createdAt,
        record.metadata.updatedAt,
      );
  } catch (error) {
    throwLivePersistenceError({ error, recordKind: "Live signal", id: record.id });
  }

  return record;
}

function createMapNode(input: {
  readonly database: Database;
  readonly input: CreateLiveMapNodeInput;
}): LiveMapNodeRecord {
  const record = createLiveMapNodeRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO live_map_nodes (
  id, project_id, node_key, kind, title, summary, tone, occurred_at, refs_json,
  visibility, authored_by_kind, authored_by_id, authored_by_display_name, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        record.id,
        record.projectId,
        record.nodeKey,
        record.kind,
        record.title,
        record.summary,
        record.tone,
        record.occurredAt ?? null,
        JSON.stringify(record.refs),
        record.visibility,
        record.authoredBy.actorKind,
        record.authoredBy.actorId,
        record.authoredBy.displayName ?? null,
        record.metadata.createdAt,
        record.metadata.updatedAt,
      );
  } catch (error) {
    throwLivePersistenceError({ error, recordKind: "Live map node", id: record.id });
  }

  return record;
}

function createMapEdge(input: {
  readonly database: Database;
  readonly input: CreateLiveMapEdgeInput;
}): LiveMapEdgeRecord {
  const record = createLiveMapEdgeRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO live_map_edges (
  id, project_id, edge_key, from_node_key, to_node_key, relation, tone, visibility,
  authored_by_kind, authored_by_id, authored_by_display_name, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        record.id,
        record.projectId,
        record.edgeKey,
        record.fromNodeKey,
        record.toNodeKey,
        record.relation,
        record.tone,
        record.visibility,
        record.authoredBy.actorKind,
        record.authoredBy.actorId,
        record.authoredBy.displayName ?? null,
        record.metadata.createdAt,
        record.metadata.updatedAt,
      );
  } catch (error) {
    throwLivePersistenceError({ error, recordKind: "Live map edge", id: record.id });
  }

  return record;
}

function createFocus(input: {
  readonly database: Database;
  readonly input: CreateLiveFocusInput;
}): LiveFocusRecord {
  const record = createLiveFocusRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO live_focuses (
  id, project_id, mode, primary_node_key, related_node_keys_json, summary,
  authored_by_kind, authored_by_id, authored_by_display_name, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        record.id,
        record.projectId,
        record.mode,
        record.primaryNodeKey ?? null,
        JSON.stringify(record.relatedNodeKeys),
        record.summary ?? null,
        record.authoredBy.actorKind,
        record.authoredBy.actorId,
        record.authoredBy.displayName ?? null,
        record.metadata.createdAt,
        record.metadata.updatedAt,
      );
  } catch (error) {
    throwLivePersistenceError({ error, recordKind: "Live focus", id: record.id });
  }

  return record;
}

function createNodeDetail(input: {
  readonly database: Database;
  readonly input: CreateLiveNodeDetailInput;
}): LiveNodeDetailRecord {
  const record = createLiveNodeDetailRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO live_node_details (
  id, project_id, node_key, body_markdown, facts_json, refs_json,
  authored_by_kind, authored_by_id, authored_by_display_name, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        record.id,
        record.projectId,
        record.nodeKey,
        record.bodyMarkdown,
        JSON.stringify(record.facts),
        JSON.stringify(record.refs),
        record.authoredBy.actorKind,
        record.authoredBy.actorId,
        record.authoredBy.displayName ?? null,
        record.metadata.createdAt,
        record.metadata.updatedAt,
      );
  } catch (error) {
    throwLivePersistenceError({ error, recordKind: "Live node detail", id: record.id });
  }

  return record;
}

function listAllSignals(input: { readonly database: Database }): readonly LiveSignalRecord[] {
  const rows = input.database
    .query<LiveSignalRow, []>("SELECT * FROM live_signals ORDER BY created_at ASC, id ASC")
    .all();
  return rows.map(signalFromRow);
}

function listAllMapNodes(input: { readonly database: Database }): readonly LiveMapNodeRecord[] {
  const rows = input.database
    .query<LiveMapNodeRow, []>("SELECT * FROM live_map_nodes ORDER BY created_at ASC, id ASC")
    .all();
  return rows.map(mapNodeFromRow);
}

function listAllMapEdges(input: { readonly database: Database }): readonly LiveMapEdgeRecord[] {
  const rows = input.database
    .query<LiveMapEdgeRow, []>("SELECT * FROM live_map_edges ORDER BY created_at ASC, id ASC")
    .all();
  return rows.map(mapEdgeFromRow);
}

function listAllFocuses(input: { readonly database: Database }): readonly LiveFocusRecord[] {
  const rows = input.database
    .query<LiveFocusRow, []>("SELECT * FROM live_focuses ORDER BY created_at ASC, id ASC")
    .all();
  return rows.map(focusFromRow);
}

function listAllNodeDetails(input: {
  readonly database: Database;
}): readonly LiveNodeDetailRecord[] {
  const rows = input.database
    .query<LiveNodeDetailRow, []>("SELECT * FROM live_node_details ORDER BY created_at ASC, id ASC")
    .all();
  return rows.map(nodeDetailFromRow);
}

function listForProject(input: {
  readonly database: Database;
  readonly input: ListLiveRecordsForProjectInput;
}): LiveProjectRecords {
  return {
    signals: input.database
      .query<LiveSignalRow, [string]>(
        "SELECT * FROM live_signals WHERE project_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(input.input.projectId)
      .map(signalFromRow),
    mapNodes: input.database
      .query<LiveMapNodeRow, [string]>(
        "SELECT * FROM live_map_nodes WHERE project_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(input.input.projectId)
      .map(mapNodeFromRow),
    mapEdges: input.database
      .query<LiveMapEdgeRow, [string]>(
        "SELECT * FROM live_map_edges WHERE project_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(input.input.projectId)
      .map(mapEdgeFromRow),
    focuses: input.database
      .query<LiveFocusRow, [string]>(
        "SELECT * FROM live_focuses WHERE project_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(input.input.projectId)
      .map(focusFromRow),
    nodeDetails: input.database
      .query<LiveNodeDetailRow, [string]>(
        "SELECT * FROM live_node_details WHERE project_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(input.input.projectId)
      .map(nodeDetailFromRow),
  };
}

function signalFromRow(row: LiveSignalRow): LiveSignalRecord {
  return {
    id: row.id as SituId<"live_signal">,
    projectId: row.project_id as SituId<"project">,
    slot: row.slot,
    label: row.label,
    value: row.value,
    summary: row.summary ?? undefined,
    tone: row.tone,
    refs: parseJsonField<readonly TargetRef[]>({ field: "refs_json", value: row.refs_json }),
    visibility: row.visibility,
    authoredBy: actorFromRow(row),
    metadata: metadataFromRow(row),
  };
}

function mapNodeFromRow(row: LiveMapNodeRow): LiveMapNodeRecord {
  return {
    id: row.id as SituId<"live_node">,
    projectId: row.project_id as SituId<"project">,
    nodeKey: row.node_key,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    tone: row.tone,
    occurredAt: row.occurred_at ?? undefined,
    refs: parseJsonField<readonly TargetRef[]>({ field: "refs_json", value: row.refs_json }),
    visibility: row.visibility,
    authoredBy: actorFromRow(row),
    metadata: metadataFromRow(row),
  };
}

function mapEdgeFromRow(row: LiveMapEdgeRow): LiveMapEdgeRecord {
  return {
    id: row.id as SituId<"live_edge">,
    projectId: row.project_id as SituId<"project">,
    edgeKey: row.edge_key,
    fromNodeKey: row.from_node_key,
    toNodeKey: row.to_node_key,
    relation: row.relation,
    tone: row.tone,
    visibility: row.visibility,
    authoredBy: actorFromRow(row),
    metadata: metadataFromRow(row),
  };
}

function focusFromRow(row: LiveFocusRow): LiveFocusRecord {
  return {
    id: row.id as SituId<"live_focus">,
    projectId: row.project_id as SituId<"project">,
    mode: row.mode,
    primaryNodeKey: row.primary_node_key ?? undefined,
    relatedNodeKeys: parseJsonField<readonly string[]>({
      field: "related_node_keys_json",
      value: row.related_node_keys_json,
    }),
    summary: row.summary ?? undefined,
    authoredBy: actorFromRow(row),
    metadata: metadataFromRow(row),
  };
}

function nodeDetailFromRow(row: LiveNodeDetailRow): LiveNodeDetailRecord {
  return {
    id: row.id as SituId<"live_detail">,
    projectId: row.project_id as SituId<"project">,
    nodeKey: row.node_key,
    bodyMarkdown: row.body_markdown,
    facts: parseJsonField<readonly LiveNodeFact[]>({
      field: "facts_json",
      value: row.facts_json,
    }),
    refs: parseJsonField<readonly TargetRef[]>({ field: "refs_json", value: row.refs_json }),
    authoredBy: actorFromRow(row),
    metadata: metadataFromRow(row),
  };
}

function actorFromRow(row: AuthoredRow): ActorRef {
  return {
    actorKind: row.authored_by_kind,
    actorId: row.authored_by_id,
    displayName: row.authored_by_display_name ?? undefined,
  };
}

function metadataFromRow(row: AuthoredRow): {
  readonly createdAt: string;
  readonly updatedAt: string;
} {
  return {
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJsonField<TValue>(input: { readonly field: string; readonly value: string }): TValue {
  try {
    return JSON.parse(input.value) as TValue;
  } catch (error) {
    throw new InternalError({
      message: "Persisted live presentation JSON was invalid.",
      details: {
        field: input.field,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function throwLivePersistenceError(input: {
  readonly error: unknown;
  readonly recordKind: string;
  readonly id: string;
}): never {
  if (isSqlitePrimaryKeyConstraintError(input.error)) {
    throw new ConflictError({
      message: `${input.recordKind} already exists.`,
      details: { id: input.id },
    });
  }

  if (isSqliteForeignKeyConstraintError(input.error)) {
    throw new ConflictError({
      message: `${input.recordKind} project does not exist.`,
      details: { id: input.id },
    });
  }

  throw input.error;
}

function isSqlitePrimaryKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

function isSqliteForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}

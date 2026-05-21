export const createLiveSignalsTableStatement = `
CREATE TABLE IF NOT EXISTS live_signals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  summary TEXT,
  tone TEXT NOT NULL,
  refs_json TEXT NOT NULL,
  visibility TEXT NOT NULL,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createLiveMapNodesTableStatement = `
CREATE TABLE IF NOT EXISTS live_map_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  tone TEXT NOT NULL,
  occurred_at TEXT,
  refs_json TEXT NOT NULL,
  visibility TEXT NOT NULL,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createLiveMapEdgesTableStatement = `
CREATE TABLE IF NOT EXISTS live_map_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  edge_key TEXT NOT NULL,
  from_node_key TEXT NOT NULL,
  to_node_key TEXT NOT NULL,
  relation TEXT NOT NULL,
  tone TEXT NOT NULL,
  visibility TEXT NOT NULL,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createLiveFocusesTableStatement = `
CREATE TABLE IF NOT EXISTS live_focuses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  primary_node_key TEXT,
  related_node_keys_json TEXT NOT NULL,
  summary TEXT,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createLiveNodeDetailsTableStatement = `
CREATE TABLE IF NOT EXISTS live_node_details (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  refs_json TEXT NOT NULL,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createLiveSignalsProjectSlotIndexStatement = `
CREATE INDEX IF NOT EXISTS live_signals_project_slot_idx
  ON live_signals (project_id, slot, created_at);
`;

export const createLiveMapNodesProjectNodeKeyIndexStatement = `
CREATE INDEX IF NOT EXISTS live_map_nodes_project_node_key_idx
  ON live_map_nodes (project_id, node_key, created_at);
`;

export const createLiveMapEdgesProjectEdgeKeyIndexStatement = `
CREATE INDEX IF NOT EXISTS live_map_edges_project_edge_key_idx
  ON live_map_edges (project_id, edge_key, created_at);
`;

export const createLiveFocusesProjectCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS live_focuses_project_created_at_idx
  ON live_focuses (project_id, created_at);
`;

export const createLiveNodeDetailsProjectNodeKeyIndexStatement = `
CREATE INDEX IF NOT EXISTS live_node_details_project_node_key_idx
  ON live_node_details (project_id, node_key, created_at);
`;

export const createLiveAuthoredByIndexesStatements = [
  `
CREATE INDEX IF NOT EXISTS live_signals_authored_by_idx
  ON live_signals (authored_by_kind, authored_by_id);
`,
  `
CREATE INDEX IF NOT EXISTS live_map_nodes_authored_by_idx
  ON live_map_nodes (authored_by_kind, authored_by_id);
`,
  `
CREATE INDEX IF NOT EXISTS live_map_edges_authored_by_idx
  ON live_map_edges (authored_by_kind, authored_by_id);
`,
  `
CREATE INDEX IF NOT EXISTS live_focuses_authored_by_idx
  ON live_focuses (authored_by_kind, authored_by_id);
`,
  `
CREATE INDEX IF NOT EXISTS live_node_details_authored_by_idx
  ON live_node_details (authored_by_kind, authored_by_id);
`,
] as const;

export const liveSchemaFragment = {
  packageName: "live",
  statements: [
    createLiveSignalsTableStatement,
    createLiveMapNodesTableStatement,
    createLiveMapEdgesTableStatement,
    createLiveFocusesTableStatement,
    createLiveNodeDetailsTableStatement,
    createLiveSignalsProjectSlotIndexStatement,
    createLiveMapNodesProjectNodeKeyIndexStatement,
    createLiveMapEdgesProjectEdgeKeyIndexStatement,
    createLiveFocusesProjectCreatedAtIndexStatement,
    createLiveNodeDetailsProjectNodeKeyIndexStatement,
    ...createLiveAuthoredByIndexesStatements,
  ],
} as const;

export type LiveSchemaFragment = typeof liveSchemaFragment;

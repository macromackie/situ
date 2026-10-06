import type { Database } from "../database.js";
import type { Context } from "../context.js";
import { requireThat } from "../../protocol/models.js";
import type { SourceSnapshot } from "../../protocol/publication/index.js";

export function visibleRecord(value: any): any {
  if (Array.isArray(value)) return value.map(visibleRecord);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["tokenHash", "runnerHash"].includes(key))
      .map(([key, child]) => [key, visibleRecord(child)]),
  );
}
export function snapshot(
  db: Database,
  id: string,
  project: string,
): SourceSnapshot {
  const row = db.storage.query(
    "SELECT data FROM publication_sources WHERE id=? AND project=?",
    id,
    project,
  )[0];
  requireThat(
    row,
    "missing_source",
    `Source snapshot ${id} is unavailable`,
    404,
  );
  return JSON.parse(row.data);
}
export function latestSequence(db: Database, project: string): number {
  return db.storage.query(
    "SELECT COALESCE(MAX(seq),0) AS seq FROM events WHERE project=?",
    project,
  )[0].seq;
}
export function capture(
  c: Context,
  projectId: string,
  after: number,
  recordIds?: string[],
): SourceSnapshot {
  c.project(projectId);
  const through = latestSequence(c.db, projectId);
  requireThat(
    after <= through,
    "bad_cursor",
    "Cursor is ahead of this project's journal",
  );
  const records: SourceSnapshot["records"] = {};
  const selected = recordIds ? new Set([projectId, ...recordIds]) : null;
  for (const row of c.db.storage.query(
    "SELECT data FROM entities WHERE project=? AND kind IN ('project','topic','work','post','review','job')",
    projectId,
  )) {
    const record = visibleRecord(JSON.parse(row.data));
    if (selected && !selected.has(record.id)) continue;
    records[record.id] = record;
  }
  for (const row of c.db.storage.query(
    "SELECT data FROM assets WHERE project=?",
    projectId,
  )) {
    const asset = JSON.parse(row.data);
    if (selected && !selected.has(asset.id)) continue;
    records[asset.id] = { ...asset, kind: "asset" };
  }
  for (const id of selected ?? [])
    requireThat(
      records[id],
      "missing_record",
      `Record ${id} is not a capturable source in this project`,
      404,
    );
  const result = {
    id: `snap-${crypto.randomUUID()}`,
    projectId,
    through,
    capturedAt: c.now,
    records,
  };
  const data = JSON.stringify(result);
  requireThat(
    new TextEncoder().encode(data).length <= 8 * 1024 * 1024,
    "snapshot_too_large",
    "Capture exceeds 8 MiB. Supply recordIds for the sources you need; earlier pinned snapshots remain usable.",
    413,
  );
  c.db.storage.query(
    "INSERT INTO publication_sources VALUES(?,?,?)",
    result.id,
    projectId,
    data,
  );
  return result;
}
export function changes(
  db: Database,
  project: string,
  after: number,
  limit = 100,
) {
  const predicate =
    "project=? AND seq>? AND (kind LIKE 'work.%' OR kind LIKE 'review.%' OR kind LIKE 'topic.%' OR kind LIKE 'post.%' OR kind LIKE 'project.%' OR kind LIKE 'job.%' OR kind LIKE 'asset.%')";
  const total = db.storage.query(
    `SELECT COUNT(*) AS n FROM events WHERE ${predicate}`,
    project,
    after,
  )[0].n;
  const rows = db.storage.query(
    `SELECT * FROM events WHERE ${predicate} ORDER BY seq LIMIT ?`,
    project,
    after,
    limit,
  );
  return {
    total,
    items: rows.map((row) => ({ ...row, detail: JSON.parse(row.detail) })),
    after: rows.at(-1)?.seq ?? after,
    hasMore: total > rows.length,
  };
}

import type { Database } from "../database.js";
import type {
  Draft,
  PublicationView,
  Release,
  SourceSnapshot,
} from "../../protocol/publication/index.js";
import type { Asset } from "../../protocol/artifacts.js";
import { requireThat } from "../../protocol/models.js";
import { changes, latestSequence, snapshot } from "./snapshots.js";
import { references } from "./validation.js";

export function currentRelease(
  db: Database,
  project: string,
  revision?: number,
): Release | null {
  const rows =
    revision === undefined
      ? db.storage.query(
          "SELECT data FROM publication_releases WHERE project=? ORDER BY revision DESC LIMIT 1",
          project,
        )
      : db.storage.query(
          "SELECT data FROM publication_releases WHERE project=? AND revision=?",
          project,
          revision,
        );
  return rows[0] ? JSON.parse(rows[0].data) : null;
}
export function draft(db: Database, project: string): Draft | null {
  const row = db.storage.query(
    "SELECT data FROM publication_drafts WHERE project=?",
    project,
  )[0];
  return row ? JSON.parse(row.data) : null;
}
export function sourceBundles(
  db: Database,
  project: string,
  value: Draft,
): Record<string, SourceSnapshot> {
  const ids = new Set([
    value.snapshotId,
    ...references(value.document).map((r) => r.snapshotId),
  ]);
  return Object.fromEntries(
    [...ids].map((id) => [id, snapshot(db, id, project)]),
  );
}
export function publicationView(
  db: Database,
  projectId: string,
  now: number,
  revision?: number,
  preview = false,
): PublicationView {
  const project = db.get(projectId, "project");
  let release = currentRelease(db, projectId, revision);
  if (revision !== undefined)
    requireThat(
      release,
      "not_found",
      "Publication revision does not exist",
      404,
    );
  if (preview) {
    const d = draft(db, projectId);
    requireThat(d, "missing_draft", "No publication draft", 404);
    release = {
      ...d,
      publishedAt: 0,
      through: snapshot(db, d.snapshotId, projectId).through,
    };
  }
  const sources = release ? sourceBundles(db, projectId, release) : {};
  const pinned = release ? references(release.document) : [];
  for (const [id, source] of Object.entries(sources)) {
    const needed = new Set(
      pinned.filter((r) => r.snapshotId === id).map((r) => r.recordId),
    );
    source.records = Object.fromEntries(
      Object.entries(source.records).filter(([recordId]) =>
        needed.has(recordId),
      ),
    );
  }
  const assets: Record<string, Asset> = {};
  for (const s of Object.values(sources))
    for (const [id, record] of Object.entries(s.records))
      if (record.kind === "asset") assets[id] = record as unknown as Asset;
  const through = release?.through ?? 0;
  const changedSources = new Set<string>();
  for (const r of release ? references(release.document) : []) {
    const saved = sources[r.snapshotId]?.records[r.recordId];
    if (!saved || saved.kind === "asset") continue;
    const materialChanges = db.storage.query(
      "SELECT seq FROM events WHERE project=? AND entity_id=? AND seq>? LIMIT 1",
      projectId,
      r.recordId,
      sources[r.snapshotId].through,
    );
    if (materialChanges.length) changedSources.add(r.recordId);
  }
  const jobs = db.list(projectId, "job");
  return {
    project: {
      id: project.id,
      title: project.title,
      goal: project.goal,
      focus: project.focus,
    },
    release,
    sources,
    assets,
    freshness: {
      through,
      latest: latestSequence(db, projectId),
      pending: changes(db, projectId, through, 1).total,
      changedSources: [...changedSources],
    },
    live: {
      running: jobs.filter((j) => j.status === "running").length,
      unknown: jobs.filter((j) => j.status === "unknown").length,
      asOf: now,
    },
  };
}

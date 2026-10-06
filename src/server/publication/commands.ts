import type { Command } from "../../protocol/commands.js";
import type { Draft, Release } from "../../protocol/publication/index.js";
import { requireThat, Fault } from "../../protocol/models.js";
import type { Context } from "../context.js";
import { capture, snapshot, changes } from "./snapshots.js";
import { currentRelease, draft, sourceBundles } from "./reads.js";
import { validatePublication } from "./validation.js";

export function publication(c: Context, command: Command) {
  if (!command.type.startsWith("publication.")) return undefined;
  c.role("curator");
  if (command.type === "publication.capture") {
    const source = capture(
      c,
      command.input.projectId,
      command.input.after,
      command.input.recordIds,
    );
    if (!draft(c.db, source.projectId)) {
      const project = c.project(source.projectId);
      const topics = c.db
        .list(project.id, "topic")
        .filter((t) => t.brief && source.records[t.id]);
      if (project.brief || topics.length) {
        const imported = topics.map((t) => ({
          id: `question-${t.id}`,
          template: "question" as const,
          title: t.title,
          summary: {
            text: t.brief,
            sources: [
              {
                snapshotId: source.id,
                recordId: t.id,
                relationship: "context" as const,
              },
            ],
          },
          sections: [],
          archived: false,
        }));
        const d: Draft = {
          projectId: project.id,
          revision: 1,
          baseRelease: currentRelease(c.db, project.id)?.revision ?? 0,
          snapshotId: source.id,
          author: c.actorId,
          updatedAt: c.now,
          document: {
            schemaVersion: 1,
            figures: [],
            updates: [],
            pages: [
              {
                id: `overview-${project.id}`,
                template: "overview",
                title: project.title,
                summary: {
                  text: project.brief || project.goal,
                  sources: [
                    {
                      snapshotId: source.id,
                      recordId: project.id,
                      relationship: "context",
                    },
                  ],
                },
                sections: [],
                archived: false,
              },
              ...imported,
            ],
          },
        };
        c.db.storage.query(
          "INSERT INTO publication_drafts VALUES(?,?)",
          project.id,
          JSON.stringify(d),
        );
      }
    }
    return {
      ...source,
      changes: changes(c.db, source.projectId, command.input.after),
      draftRevision: draft(c.db, source.projectId)?.revision ?? 0,
    };
  }
  if (command.type === "publication.save") {
    const i = command.input;
    c.project(i.projectId);
    snapshot(c.db, i.snapshotId, i.projectId);
    const previous = draft(c.db, i.projectId);
    requireThat(
      (previous?.revision ?? 0) === i.expectedRevision,
      "revision_conflict",
      `Draft revision is ${previous?.revision ?? 0}`,
    );
    requireThat(
      (currentRelease(c.db, i.projectId)?.revision ?? 0) === i.baseRelease,
      "release_conflict",
      "Read the latest release before changing the draft",
    );
    const next: Draft = {
      projectId: i.projectId,
      revision: i.expectedRevision + 1,
      baseRelease: i.baseRelease,
      snapshotId: i.snapshotId,
      document: i.document,
      author: c.actorId,
      updatedAt: c.now,
    };
    sourceBundles(c.db, i.projectId, next);
    c.db.storage.query(
      "INSERT INTO publication_drafts VALUES(?,?) ON CONFLICT(project) DO UPDATE SET data=excluded.data",
      i.projectId,
      JSON.stringify(next),
    );
    return next;
  }
  if (
    command.type === "publication.publish" ||
    command.type === "publication.archive"
  ) {
    const i = command.input;
    c.project(i.projectId);
    const current = currentRelease(c.db, i.projectId);
    const d = draft(c.db, i.projectId);
    requireThat(d, "missing_draft", "Save a draft before publishing", 404);
    requireThat(
      d.revision === i.expectedRevision,
      "revision_conflict",
      `Draft revision is ${d.revision}`,
    );
    requireThat(
      (current?.revision ?? 0) === i.expectedRelease &&
        d.baseRelease === i.expectedRelease,
      "release_conflict",
      "A newer release exists; reconcile the draft",
    );
    if (command.type === "publication.archive") {
      const page = d.document.pages.find((p) => p.id === command.input.pageId);
      requireThat(
        page && page.template !== "overview",
        "invalid_archive",
        "Archive a question page; the overview must remain available",
      );
      page.archived = true;
      d.document.updates.push({
        id: `update-${crypto.randomUUID()}`,
        pageIds: [page.id],
        kind: "decision",
        headline: `Archived: ${page.title}`,
        body: command.input.reason,
        occurredAt: c.now,
        sources: page.summary.sources,
      });
    }
    const sources = sourceBundles(c.db, i.projectId, d);
    const issues = validatePublication(
      c.db,
      d,
      sources,
      c.now,
      current?.document,
    );
    if (issues.length)
      throw new Fault(
        "invalid_publication",
        "Repair the draft before publishing",
        422,
        issues,
      );
    const release: Release = {
      ...d,
      revision: i.expectedRelease + 1,
      author: c.actorId,
      publishedAt: c.now,
      through: sources[d.snapshotId].through,
    };
    requireThat(
      !current || release.through >= current.through,
      "stale_sources",
      "The publication cannot move its source cursor backwards",
    );
    c.db.storage.query(
      "INSERT INTO publication_releases VALUES(?,?,?)",
      i.projectId,
      release.revision,
      JSON.stringify(release),
    );
    const nextDraft = {
      ...d,
      revision: d.revision + 1,
      baseRelease: release.revision,
      updatedAt: c.now,
    };
    c.db.storage.query(
      "UPDATE publication_drafts SET data=? WHERE project=?",
      JSON.stringify(nextDraft),
      i.projectId,
    );
    for (const row of c.db.storage.query(
      "SELECT id,data FROM inbox WHERE project=? AND kind='curation' AND state='open'",
      i.projectId,
    )) {
      if ((JSON.parse(row.data).through ?? 0) <= release.through)
        c.db.storage.query(
          "UPDATE inbox SET state='resolved' WHERE id=?",
          row.id,
        );
    }
    return release;
  }
}

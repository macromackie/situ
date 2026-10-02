import * as stylex from "@stylexjs/stylex";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Change, ResearchRecord } from "../../core/src/index";
import { useResearch, request } from "./state";
import { styles as s } from "./styles";
import { Badge, Card, Editor, RecordLink, time } from "./ui";
import { RelatedRecords } from "./dashboard";
import { Comparison } from "./charts";
import { ArtifactTable } from "./artifact-table";
import { ExperimentFlow, RunOutcome } from "./experiment-flow";

export function Detail() {
  const { projectId, recordId } = useParams({ strict: false });
  const { snapshot } = useResearch();
  const [editor, setEditor] = useState<"edit" | "note" | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [error, setError] = useState("");
  const record = snapshot?.records.find(
    (item) => item.id === recordId && item.projectId === projectId,
  );
  useEffect(() => {
    let current = true;
    setHistory([]);
    setError("");
    async function loadHistory() {
      const history: Change[] = [];
      let more = true;
      while (more && current) {
        const result = await request<{ changes: Change[] }>(
          `/api/changes?record=${encodeURIComponent(recordId ?? "")}&after=${history.at(-1)?.cursor ?? 0}`,
        );
        history.push(...result.changes);
        more = result.changes.length === 100;
      }
      if (current) setHistory(history);
    }
    loadHistory().catch((failure) => {
      if (current) setError(String(failure));
    });
    return () => {
      current = false;
    };
  }, [recordId, record?.revision]);
  if (!snapshot) return <div {...stylex.props(s.empty)}>Loading research…</div>;
  if (!record) return <div {...stylex.props(s.empty)}>Record not found.</div>;
  const project = snapshot.projects.find((item) => item.id === projectId)!;
  const linkedIds = new Set(record.links.map((link) => link.target));
  const related = snapshot.records.filter(
    (item) =>
      item.projectId === projectId &&
      item.id !== record.id &&
      (linkedIds.has(item.id) ||
        item.links.some((link) => link.target === record.id)),
  );
  const linkedRuns = related.filter((item) => item.kind === "run");
  const comments = related.filter((item) => item.kind === "note");
  const parents: ResearchRecord[] = [];
  let node: ResearchRecord | undefined = record;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    parents.unshift(node);
    const parentId: string | undefined = node.links.find(
      (link) => link.relation === "derived_from",
    )?.target;
    node = snapshot.records.find((item) => item.id === parentId);
  }
  return (
    <>
      <header {...stylex.props(s.heading)}>
        <div>
          <Link
            {...stylex.props(s.link, s.muted)}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
          >
            ← {project.title}
          </Link>
          <h1 {...stylex.props(s.title)}>{record.title}</h1>
          <div {...stylex.props(s.row)}>
            <span {...stylex.props(s.badge)}>{record.kind}</span>
            <Badge state={record.state} />
            {record.assessment && <Badge state={record.assessment} />}
            <RunOutcome record={record} />
            <span {...stylex.props(s.muted)}>
              {record.actor} · {time(record.updatedAt)}
            </span>
          </div>
        </div>
        <button {...stylex.props(s.button)} onClick={() => setEditor("edit")}>
          Edit record
        </button>
      </header>
      {parents.length > 1 && (
        <section {...stylex.props(s.section)}>
          <div {...stylex.props(s.eyebrow)}>Primary lineage</div>
          <div {...stylex.props(s.row)} style={{ marginTop: 10 }}>
            {parents.map((parent, index) => (
              <span key={parent.id}>
                {index > 0 && <span {...stylex.props(s.muted)}> → </span>}
                <RecordLink record={parent} />
              </span>
            ))}
          </div>
        </section>
      )}
      {record.artifacts
        .filter((artifact) => artifact.format === "table/v1")
        .map((artifact) => (
          <ArtifactTable
            key={`${artifact.uri}-${artifact.sha256}`}
            artifact={artifact}
          />
        ))}
      <ExperimentFlow
        records={[record, ...linkedRuns]}
        context={snapshot.records}
      />
      <div {...stylex.props(s.grid)}>
        <div>
          <section {...stylex.props(s.section)}>
            <Card
              title={
                record.kind === "question"
                  ? "Current understanding"
                  : "Research notes"
              }
            >
              <div {...stylex.props(s.cardBody, s.prose)}>
                {record.body || "No notes yet."}
              </div>
              {record.tags.length > 0 && (
                <div {...stylex.props(s.cardBody, s.row)}>
                  {record.tags.map((tag) => (
                    <Badge key={tag} state={tag} />
                  ))}
                </div>
              )}
            </Card>
          </section>
          {(record.kind === "run" ||
            linkedRuns.length > 0 ||
            snapshot.samples.some(
              (sample) => sample.recordId === record.id,
            )) && (
            <section {...stylex.props(s.section)}>
              <Comparison
                records={[record, ...linkedRuns]}
                samples={snapshot.samples}
              />
            </section>
          )}
          <Card
            title="Notes & discussion"
            aside={
              <button
                {...stylex.props(s.button)}
                onClick={() => setEditor("note")}
              >
                + Add note
              </button>
            }
          >
            {!comments.length && (
              <div {...stylex.props(s.empty)}>
                Leave a question, observation, or next step for the people and
                agents following this work.
              </div>
            )}
            {comments.map((note) => (
              <article key={note.id} {...stylex.props(s.item)}>
                <div {...stylex.props(s.itemTitle)}>
                  <RecordLink record={note} />
                </div>
                <div {...stylex.props(s.prose)}>{note.body}</div>
                <div {...stylex.props(s.muted)}>
                  {note.actor} · {time(note.createdAt)}
                </div>
              </article>
            ))}
          </Card>
        </div>
        <div>
          <section {...stylex.props(s.section)}>
            <RelatedRecords
              title="Connected research"
              records={related.filter((item) => item.kind !== "note")}
            />
          </section>
          <section {...stylex.props(s.section)}>
            <Card title="Evidence & artifacts">
              {!record.artifacts.length && !record.links.length && (
                <div {...stylex.props(s.empty)}>
                  Attach sources and link supporting or conflicting evidence
                  through the API.
                </div>
              )}
              {record.links.map((link) => {
                const target = snapshot.records.find(
                  (item) => item.id === link.target,
                );
                return (
                  target && (
                    <div
                      key={`${link.relation}-${link.target}`}
                      {...stylex.props(s.item)}
                    >
                      <div {...stylex.props(s.eyebrow)}>
                        {
                          {
                            related: "Related",
                            derived_from: "Derived from",
                            supports: "Supporting evidence",
                            contradicts: "Counterevidence",
                          }[link.relation]
                        }
                      </div>
                      <RecordLink record={target} />
                      {link.revision && (
                        <div>
                          <a
                            {...stylex.props(s.link, s.mono)}
                            href={`/api/records/${encodeURIComponent(target.id)}?revision=${link.revision}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Saved revision {link.revision} ↗
                          </a>
                        </div>
                      )}
                    </div>
                  )
                );
              })}
              {record.artifacts.map((artifact) => (
                <div key={artifact.uri} {...stylex.props(s.item)}>
                  {artifact.uri.startsWith("file:") ? (
                    <span>
                      {artifact.name}
                      <div {...stylex.props(s.mono)}>{artifact.uri}</div>
                    </span>
                  ) : (
                    <a
                      {...stylex.props(s.link)}
                      href={artifact.uri}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {artifact.name} ↗
                    </a>
                  )}
                  <div {...stylex.props(s.muted)}>{artifact.description}</div>
                  {artifact.sha256 && (
                    <details>
                      <summary>SHA-256</summary>
                      <p
                        {...stylex.props(s.mono)}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {artifact.sha256}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </Card>
          </section>
          <Card title="History">
            {error && <div {...stylex.props(s.error)}>{error}</div>}
            {history
              .slice(-5)
              .reverse()
              .map((change) => (
                <div key={change.cursor} {...stylex.props(s.item)}>
                  <div {...stylex.props(s.itemTitle)}>
                    {change.actor} ·{" "}
                    {change.type === "record.create" ? "created" : "updated"}
                  </div>
                  <div {...stylex.props(s.muted)}>
                    {time(change.at)} · revision {change.record?.revision}
                  </div>
                  <details>
                    <summary>Saved record</summary>
                    <pre>{JSON.stringify(change.record, null, 2)}</pre>
                  </details>
                </div>
              ))}
          </Card>
        </div>
      </div>
      <details>
        <summary>Record metadata</summary>
        <pre>
          {JSON.stringify(
            {
              id: record.id,
              revision: record.revision,
              metadata: record.metadata,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {editor && (
        <Editor
          projectId={project.id}
          record={editor === "edit" ? record : undefined}
          related={editor === "note" ? record.id : undefined}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

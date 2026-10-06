import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, GitBranch, Radio, X } from "lucide-react";
import type {
  PublicationView,
  SourceRef,
} from "../../protocol/publication/index.js";
import { useResource } from "../api.js";
import { CompactTime, IconButton, NavigationRow } from "../components/index.js";
import { PublicationContext, Sources } from "./context.js";
import { PublishedPage } from "./renderer.js";
import { Figure } from "../figures/index.js";

export function ProjectSummary({ id }: { id: string }) {
  const { data, error } = useResource<PublicationView>(
    `/v1/publication/projects/${id}`,
  );
  const page = data?.release?.document.pages.find(
    (p) => p.template === "overview" && !p.archived,
  );
  return (
    <NavigationRow
      href={`#/projects/${id}`}
      title={data?.project.title ?? id}
      detail={
        error ??
        page?.summary.text ??
        (data ? "Waiting for the first published account." : "Loading…")
      }
      icon={<GitBranch size={16} />}
      meta={data?.release && <CompactTime at={data.release.publishedAt} />}
    />
  );
}
export function Updates({
  view,
  pageId,
}: {
  view: PublicationView;
  pageId?: string;
}) {
  const updates = (view.release?.document.updates ?? [])
    .filter((u) => !pageId || u.pageIds.includes(pageId))
    .slice()
    .sort((a, b) => b.occurredAt - a.occurredAt);
  if (!updates.length)
    return <p className="empty">No published developments yet.</p>;
  return (
    <div className="updates-feed">
      {updates.map((u) => (
        <article
          className={`update update-${u.kind}`}
          id={`update-${u.id}`}
          key={u.id}
        >
          <div className="update-rail">
            <span />
          </div>
          <div className="update-content">
            <header>
              <span className="eyebrow">{u.kind}</span>
              <CompactTime at={u.occurredAt} />
            </header>
            <h2>{u.headline}</h2>
            <p>{u.body}</p>
            <footer>
              <Sources refs={u.sources} />
              {u.pageIds.map((id) => {
                const p = view.release?.document.pages.find((p) => p.id === id);
                return p ? (
                  <a
                    key={id}
                    href={`#/projects/${view.project.id}/pages/${id}`}
                  >
                    {p.title} <ArrowUpRight size={11} />
                  </a>
                ) : null;
              })}
              {u.corrects && (
                <a
                  href={`#update-${u.corrects}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(`update-${u.corrects}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  Corrects an earlier update
                </a>
              )}
            </footer>
          </div>
        </article>
      ))}
    </div>
  );
}
function SourceRail({
  view,
  refs,
  close,
}: {
  view: PublicationView;
  refs: SourceRef[];
  close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [refs]);
  return (
    <aside
      className="source-rail"
      aria-label="Publication sources"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <header>
        <h2 ref={heading} tabIndex={-1}>
          Sources
        </h2>
        <IconButton label="Close sources" onClick={close}>
          <X size={14} />
        </IconButton>
      </header>
      <p className="source-explanation">
        Saved with this account. Open Inspect to see the current research
        record.
      </p>
      {refs.map((r, i) => {
        const snapshot = view.sources[r.snapshotId],
          record = snapshot?.records[r.recordId];
        const kind = record?.kind;
        const route =
          kind === "work"
            ? `work/${r.recordId}`
            : kind === "topic"
              ? `topics/${r.recordId}`
              : kind === "project"
                ? `projects/${r.recordId}`
                : record?.workId
                  ? `work/${record.workId}`
                  : record?.topicId
                    ? `topics/${record.topicId}`
                    : `projects/${view.project.id}`;
        return (
          <section
            key={`${r.snapshotId}-${r.recordId}-${i}`}
            className="source-record"
          >
            <span className="eyebrow">
              {r.relationship} · {kind ?? "unavailable"}
            </span>
            <h3>{record?.title ?? record?.conclusion ?? r.recordId}</h3>
            {snapshot && (
              <p>
                Captured <CompactTime at={snapshot.capturedAt} />
              </p>
            )}
            {view.freshness.changedSources.includes(r.recordId) && (
              <p className="warning">This source has changed since capture.</p>
            )}
            {record ? (
              <>
                <p className="source-excerpt">
                  {record.summary ??
                    record.outcome ??
                    record.body ??
                    record.goal ??
                    record.note ??
                    ""}
                </p>
                <a
                  href={
                    kind === "asset"
                      ? `/v1/assets/${r.recordId}`
                      : `#/inspect/${route}`
                  }
                  target={kind === "asset" ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {kind === "asset"
                    ? "Open artifact"
                    : "Inspect current record"}{" "}
                  ↗
                </a>
                <details>
                  <summary>Saved record</summary>
                  <pre>{JSON.stringify(record, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p role="alert">The saved source is unavailable.</p>
            )}
          </section>
        );
      })}
    </aside>
  );
}
export function Publication({
  projectId,
  section,
  pageId,
  query,
}: {
  projectId: string;
  section?: string;
  pageId?: string;
  query: string;
}) {
  const resource = useResource<PublicationView>(
    `/v1/publication/projects/${projectId}${query}`,
  );
  const [accepted, setAccepted] = useState<PublicationView>();
  const [refs, setRefs] = useState<SourceRef[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const newer = resource.data;
  const behind =
    accepted?.release &&
    newer?.release &&
    accepted.release.revision !== newer.release.revision;
  const historical = useResource<PublicationView>(
    behind
      ? `/v1/publication/projects/${projectId}?revision=${accepted.release!.revision}`
      : null,
  );
  useEffect(() => {
    if (!accepted && newer) setAccepted(newer);
  }, [newer, accepted]);
  // Keep the account stable while someone is reading; live freshness can still update.
  const view =
    accepted && newer
      ? {
          ...accepted,
          live: newer.live,
          freshness: behind
            ? (historical.data?.freshness ?? accepted.freshness)
            : newer.freshness,
        }
      : accepted;
  if (!view)
    return (
      <div className="reading publication-content">
        <p className={resource.error ? "notice" : "empty"}>
          {resource.error ?? "Loading the published account…"}
        </p>
      </div>
    );
  const document = view.release?.document;
  const page = pageId
    ? document?.pages.find((p) => p.id === pageId)
    : document?.pages.find((p) => p.template === "overview" && !p.archived);
  const timeline = document?.figures.filter((f) => f.kind === "timeline") ?? [];
  const draft = new URLSearchParams(query).get("draft") === "1";
  const inspect = (sources: SourceRef[]) => {
    returnFocus.current = window.document.activeElement as HTMLElement;
    setRefs(sources);
  };
  const close = () => {
    setRefs([]);
    requestAnimationFrame(
      () => returnFocus.current?.isConnected && returnFocus.current.focus(),
    );
  };
  return (
    <PublicationContext.Provider value={{ view, inspect }}>
      <div
        className={`publication-layout ${refs.length ? "with-sources" : ""}`}
      >
        <div
          className={`publication-content ${section === "timeline" ? "wide-content" : "reading"}`}
        >
          <div className="publication-status">
            <span>
              {draft ? (
                "UNPUBLISHED DRAFT"
              ) : view.release ? (
                <>
                  Account {view.release.revision} ·{" "}
                  <CompactTime at={view.release.publishedAt} />
                </>
              ) : (
                "NO PUBLISHED ACCOUNT"
              )}
            </span>
            <span className="live-status">
              {view.live.running > 0 && (
                <>
                  <Radio size={12} />
                  {view.live.running} running
                </>
              )}
              {view.live.unknown > 0 && (
                <span className="warning">
                  {view.live.unknown} need a status check
                </span>
              )}
            </span>
          </div>
          {resource.error && (
            <p className="notice" role="status">
              Connection interrupted. Showing the last loaded account.{" "}
              {resource.error}
            </p>
          )}
          {newer?.release?.revision !== view.release?.revision && (
            <button
              className="refresh-account"
              onClick={() => {
                setAccepted(newer);
                setRefs([]);
              }}
            >
              A new account is available · Read account{" "}
              {newer?.release?.revision} →
            </button>
          )}
          {view.freshness.pending > 0 && (
            <p className="freshness-note">
              <span className="freshness-dot" />
              Research has changed since this account.
              {view.freshness.changedSources.length > 0
                ? ` ${view.freshness.changedSources.length} cited ${view.freshness.changedSources.length === 1 ? "source has" : "sources have"} changed.`
                : behind
                  ? " A newer account is available above."
                  : " A curator has new material to reconcile."}
            </p>
          )}
          {!document ? (
            <header className="publication-heading">
              <div className="eyebrow">{view.project.title}</div>
              <h1>Waiting for the first account</h1>
              <p>{view.project.goal}</p>
              <p>
                A curator will turn the research into a concise overview,
                figures, and linked updates.
              </p>
              <a href={`#/inspect/projects/${projectId}`}>
                Inspect the research →
              </a>
            </header>
          ) : section === "updates" ? (
            <>
              <header className="publication-heading">
                <div className="eyebrow">{view.project.title}</div>
                <h1>Developments</h1>
                <p>Results, decisions, and changes to our understanding.</p>
              </header>
              <Updates view={view} />
            </>
          ) : section === "timeline" ? (
            <>
              <header className="publication-heading">
                <div className="eyebrow">{view.project.title}</div>
                <h1>Research over time</h1>
              </header>
              {timeline.length ? (
                timeline.map((f) => <Figure key={f.id} value={f} />)
              ) : (
                <p className="empty">No timeline has been published yet.</p>
              )}
            </>
          ) : page ? (
            <>
              <PublishedPage page={page} />
              {page.template === "question" && (
                <section className="publication-section">
                  <h2>Developments</h2>
                  <Updates view={view} pageId={page.id} />
                </section>
              )}
            </>
          ) : (
            <p className="notice">
              This page is not part of this account.{" "}
              <a href={`#/projects/${projectId}`}>Return to Now →</a>
            </p>
          )}
          {view.release && !draft && !view.freshness.pending && (
            <div className="account-footer">
              <Check size={12} />
              Current through the last recorded research change.
            </div>
          )}
        </div>
        {refs.length > 0 && (
          <SourceRail view={view} refs={refs} close={close} />
        )}
      </div>
    </PublicationContext.Provider>
  );
}

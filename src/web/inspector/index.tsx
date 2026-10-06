import React, { useEffect, useState } from "react";
type Item = Record<string, any>;
async function get(path: string) {
  const r = await fetch(path);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message ?? "Cannot connect");
  return body;
}
async function collection(path: string) {
  const items: Item[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await get(`${path}?${query}`);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
const stateIcon: Record<string, string> = {
  active: "◷",
  running: "◷",
  finished: "✓",
  succeeded: "✓",
  accepted: "✓",
  failed: "×",
  cancelled: "×",
  challenged: "!",
  unknown: "?",
  pending: "◇",
  ready: "○",
  proposed: "·",
};
function State({ value }: { value: string }) {
  return (
    <span className={`state state-${value}`}>
      <span aria-hidden>{stateIcon[value] ?? "○"}</span>
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Time({ at }: { at: number }) {
  const d = new Date(at);
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()}>
      {d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" })}
    </time>
  );
}
function Frame({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="frame">
      <header>
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
function Row({
  href,
  title,
  sub,
  right,
  state,
}: {
  href: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  state?: string;
}) {
  return (
    <a className="row" href={href}>
      <span className="row-icon" aria-hidden>
        {stateIcon[state ?? ""] ?? "↗"}
      </span>
      <span className="row-main">
        <strong>{title}</strong>
        {sub && <span className="secondary clamp">{sub}</span>}
      </span>
      <span className="row-meta">
        {state && <State value={state} />} {right}
      </span>
    </a>
  );
}
function Evidence({ items }: { items: Item[] }) {
  return (
    <div className="evidence">
      {items.map((e, i) => (
        <div className="artifact" key={i}>
          <span>↳ {e.title}</span>
          <code title={e.sha256}>{e.sha256.slice(0, 12)}</code>
          <button
            aria-label={`Copy location of ${e.title}`}
            onClick={() => navigator.clipboard.writeText(e.uri)}
          >
            Copy path
          </button>
          <small>{e.uri}</small>
          {/^https?:/.test(e.uri) && e.mediaType.startsWith("image/") && (
            <a href={e.uri} target="_blank" rel="noreferrer">
              Open image ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
const eventLabels: Record<string, string> = {
  "project.update": "Project overview updated",
  "topic.create": "Research question opened",
  "topic.update": "Topic brief updated",
  "post.create": "Observation posted",
  "work.propose": "Work proposed",
  "work.admit": "Work admitted",
  "work.start": "Work started",
  "work.checkpoint": "Checkpoint recorded",
  "work.finish": "Result recorded",
  "work.handoff": "Work handed off",
  "work.cancel": "Work cancelled",
  "review.submit": "Conclusion submitted",
  "review.decide": "Review decision",
  "review.challenge": "Conclusion challenged",
  "session.join": "Agent joined",
  "session.leave": "Agent left",
  "session.replace": "Agent replaced",
  "request.create": "Input requested",
};
function Activity({ events }: { events: Item[] }) {
  return (
    <Frame
      title="Recent changes"
      aside={<span className="secondary">Recorded events</span>}
    >
      {events.length ? (
        events
          .slice(-12)
          .reverse()
          .map((e) => (
            <Row
              key={e.seq}
              href={routeFor(
                e.detail.workId ?? e.detail.topicId ?? e.entity_id,
                e.project,
              )}
              title={e.detail.title}
              sub={eventLabels[e.kind] ?? e.kind.replaceAll(".", " · ")}
              right={<Time at={e.at} />}
            />
          ))
      ) : (
        <p className="empty">No recorded changes yet.</p>
      )}
    </Frame>
  );
}
function routeFor(id: string, project: string) {
  const prefix = id.split("-")[0];
  return prefix === "w"
    ? `#/inspect/work/${id}`
    : prefix === "t"
      ? `#/inspect/topics/${id}`
      : `#/inspect/projects/${project}`;
}
function WorkRows({ items }: { items: Item[] }) {
  return items.length ? (
    <>
      {items.map((w) => (
        <Row
          key={w.id}
          href={`#/inspect/work/${w.id}`}
          title={w.title}
          sub={w.next}
          state={w.state}
          right={<Time at={w.updatedAt} />}
        />
      ))}
    </>
  ) : (
    <p className="empty">No work here yet.</p>
  );
}
function Progress({ work }: { work: Item[] }) {
  const states = ["proposed", "ready", "active", "finished", "cancelled"];
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="img"
        aria-label={states
          .map((s) => `${work.filter((w) => w.state === s).length} ${s}`)
          .join(", ")}
      >
        {states.map((s) => (
          <span
            key={s}
            className={"segment " + s}
            style={{
              flex: work.filter((w) => w.state === s).length || "0 0 0",
            }}
          />
        ))}
      </div>
      <div className="legend">
        {states.map((s) => {
          const n = work.filter((w) => w.state === s).length;
          return n ? (
            <span key={s}>
              <b>{n}</b> {s}
            </span>
          ) : null;
        })}
        {!work.length && "No work proposed yet"}
      </div>
    </div>
  );
}
function Branches({ topics, work }: { topics: Item[]; work: Item[] }) {
  const ordered: Item[] = [];
  const remaining = new Map(topics.map((t) => [t.id, t]));
  function append(t: Item) {
    if (!remaining.delete(t.id)) return;
    ordered.push(t);
    for (const child of topics.filter((p) => p.parentId === t.id))
      append(child);
  }
  topics.filter((t) => !t.parentId).forEach(append);
  [...remaining.values()].forEach(append);
  return (
    <Frame
      title="Research branches"
      aside={<span className="secondary">Saved ancestry</span>}
    >
      <div className="branches">
        {ordered.map((t) => (
          <div className="branch" key={t.id}>
            <a className="branch-title" href={`#/inspect/topics/${t.id}`}>
              <span aria-hidden>⑂</span> {t.title}
            </a>
            {t.parentId && (
              <a className="parent" href={`#/inspect/topics/${t.parentId}`}>
                from{" "}
                {topics.find((p) => p.id === t.parentId)?.title ?? t.parentId}
              </a>
            )}
            <div className="branch-work">
              {work
                .filter((w) => w.topicId === t.id)
                .slice(0, 6)
                .map((w) => (
                  <a href={`#/inspect/work/${w.id}`} key={w.id}>
                    <span aria-hidden>{stateIcon[w.state]}</span>
                    <span>{w.title}</span>
                    <State value={w.state} />
                  </a>
                ))}
              {work.filter((w) => w.topicId === t.id).length > 6 && (
                <a href={`#/inspect/topics/${t.id}`}>View all work →</a>
              )}
              {!work.some((w) => w.topicId === t.id) && (
                <span className="secondary">No work proposed</span>
              )}
            </div>
          </div>
        ))}
        {!topics.length && (
          <p className="empty">
            Start with one question and a small test. Topics appear here when an
            agent proposes them.
          </p>
        )}
      </div>
    </Frame>
  );
}
function Project({ data, events }: { data: Item; events: Item[] }) {
  const { project: p, work, topics, reviews, sessions, jobs } = data;
  return (
    <>
      <div className="heading">
        <div className="eyebrow">PROJECT</div>
        <h1>{p.title}</h1>
        <p>{p.goal}</p>
      </div>
      <div className="detail-grid">
        <div className="main-column">
          <Frame title="Current focus">
            <div className="prose">
              <h3>{p.focus}</h3>
              <p>
                {p.brief ||
                  "A project curator has not published an overview yet."}
              </p>
              {p.sources?.length > 0 && (
                <div className="sources">
                  Sources:{" "}
                  {p.sources.map((id: string) => (
                    <a key={id} href={routeFor(id, p.id)}>
                      {[...work, ...topics].find((item: Item) => item.id === id)
                        ?.title ?? id.slice(0, 14)}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <Progress work={work} />
          </Frame>
          {work.some(
            (w: Item) => w.state === "active" && w.leaseUntil <= Date.now(),
          ) && (
            <Frame title="Needs an owner">
              {work
                .filter(
                  (w: Item) =>
                    w.state === "active" && w.leaseUntil <= Date.now(),
                )
                .map((w: Item) => (
                  <Row
                    key={w.id}
                    href={`#/inspect/work/${w.id}`}
                    title={w.title}
                    sub="Owner stopped reporting. Inspect the job before relaunching."
                    state="unknown"
                  />
                ))}
            </Frame>
          )}
          <Branches topics={topics} work={work} />
          <Frame
            title="Results and review"
            aside={<span className="secondary">Completion ≠ validation</span>}
          >
            {reviews.length ? (
              reviews.map((r: Item) => (
                <Row
                  key={r.id}
                  href={`#/inspect/work/${r.workId}`}
                  title={r.claim}
                  state={r.state}
                  right={<Time at={r.updatedAt} />}
                />
              ))
            ) : (
              <p className="empty">
                No conclusions submitted. Finished work stays provisional until
                independently reviewed.
              </p>
            )}
          </Frame>
          <Activity events={events} />
        </div>
        <aside className="properties">
          <Frame title="Now">
            <dl>
              <dt>Active work</dt>
              <dd>
                {work.filter((w: Item) => w.state === "active").length} /{" "}
                {p.policy.maxActiveWork}
              </dd>
              <dt>Running jobs</dt>
              <dd>{jobs.filter((j: Item) => j.status === "running").length}</dd>
              <dt>Unknown jobs</dt>
              <dd>{jobs.filter((j: Item) => j.status === "unknown").length}</dd>
              <dt>Awaiting review</dt>
              <dd>
                {reviews.filter((r: Item) => r.state === "pending").length}
              </dd>
              <dt>Open requests</dt>
              <dd>{data.counts.openRequests ?? 0}</dd>
              <dt>Check-ins due</dt>
              <dd>{data.counts.overdueCheckins ?? 0}</dd>
              <dt>Topic capacity</dt>
              <dd>{p.policy.maxActiveTopics}</dd>
            </dl>
          </Frame>
          <Frame title="People and agents">
            {sessions.length ? (
              sessions.map((s: Item) => (
                <div className="person" key={s.id}>
                  <span className={"dot " + s.presence} />
                  <div>
                    {s.name}
                    <small>
                      {s.roles.join(" · ")} · {s.presence}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">No agents have joined.</p>
            )}
          </Frame>
          <div className="note">
            Presence shows whether a session is reporting. It does not measure
            research progress.
          </div>
        </aside>
      </div>
    </>
  );
}
function Topic({ data, posts }: { data: Item; posts: Item[] }) {
  const t = data.topic;
  const chronological = [...posts].sort((a, b) => a.createdAt - b.createdAt);
  const discussion = chronological
    .filter((p) => !p.replyTo)
    .flatMap((p) => [
      p,
      ...chronological.filter((reply) => reply.replyTo === p.id),
    ]);
  return (
    <>
      <div className="heading">
        <a href={`#/inspect/projects/${t.projectId}`}>← Project</a>
        <h1>{t.title}</h1>
      </div>
      <div className="reading">
        <Frame title="Research question">
          <div className="prose">
            <p>{t.brief}</p>
          </div>
        </Frame>
        <Frame title="Work">
          <WorkRows items={data.work} />
        </Frame>
        <Frame title="Discussion">
          {posts.length ? (
            discussion.map((p) => (
              <article
                className={"post " + (p.replyTo ? "reply" : "")}
                key={p.id}
              >
                <header>
                  <strong>{p.requestTo ? "Request" : "Observation"}</strong>
                  <Time at={p.createdAt} />
                </header>
                <p>{p.body}</p>
                {p.replyTo && <small>Reply to {p.replyTo.slice(0, 14)}</small>}
                <Evidence items={p.evidence ?? []} />
              </article>
            ))
          ) : (
            <p className="empty">
              Observations, requests, and counterexamples belong here.
            </p>
          )}
        </Frame>
      </div>
    </>
  );
}
function Work({ data }: { data: Item }) {
  const w = data.work;
  return (
    <>
      <div className="heading">
        <a href={`#/inspect/topics/${w.topicId}`}>← Topic</a>
        <h1>{w.title}</h1>
        <State value={w.state} />
      </div>
      <div className="detail-grid">
        <div className="main-column">
          <Frame
            title="Plan"
            aside={<span className="secondary">Revision {w.planRevision}</span>}
          >
            <dl className="plan">
              {Object.entries(w.plan).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </React.Fragment>
              ))}
            </dl>
          </Frame>
          {w.summary && (
            <Frame title="Outcome" aside={<State value={w.outcome} />}>
              <div className="prose">
                <p>{w.summary}</p>
              </div>
            </Frame>
          )}
          <Frame title="Progress and handoff">
            {w.checkpoints?.length ? (
              w.checkpoints.map((v: Item, i: number) => (
                <article className="post" key={i}>
                  <header>
                    <strong>Checkpoint {i + 1}</strong>
                    <Time at={v.at} />
                  </header>
                  <p>{v.observed}</p>
                  <p className="secondary">Next: {v.next}</p>
                  <Evidence items={v.evidence} />
                </article>
              ))
            ) : (
              <p className="empty">No checkpoint yet.</p>
            )}
            <div className="prose">
              <strong>Next step</strong>
              <p>{w.next}</p>
              {w.blockers && <p>Blocked: {w.blockers}</p>}
            </div>
          </Frame>
          <Frame title="Executions">
            {data.jobs.length ? (
              data.jobs.map((j: Item) => (
                <div className="job" key={j.id}>
                  <header>
                    <State value={j.status} />
                    <Time at={j.updatedAt} />
                  </header>
                  <code>{j.command.join(" ")}</code>
                  <p className="secondary">{j.note}</p>
                  <Evidence items={j.evidence} />
                </div>
              ))
            ) : (
              <p className="empty">No execution registered.</p>
            )}
          </Frame>
          <Frame title="Review">
            {data.reviews.length ? (
              data.reviews.map((r: Item) => (
                <article className="post" key={r.id}>
                  <header>
                    <State value={r.state} />
                    <span className="secondary">
                      Plan {r.planRevision} · policy {r.policyRevision}
                    </span>
                  </header>
                  <p>{r.claim}</p>
                  {r.decisions.map((d: Item, i: number) => (
                    <p key={i}>{d.rationale}</p>
                  ))}
                  {r.challenges.map((d: Item, i: number) => (
                    <p key={i} className="warning">
                      Challenge: {d.reason}
                    </p>
                  ))}
                  <Evidence items={r.evidence} />
                </article>
              ))
            ) : (
              <p className="empty">No independent review submitted.</p>
            )}
          </Frame>
        </div>
        <aside className="properties">
          <Frame title="Ownership">
            <dl>
              <dt>Claim</dt>
              <dd>Generation {w.generation}</dd>
              <dt>Owner</dt>
              <dd>{w.owner?.slice(0, 14) ?? "Unclaimed"}</dd>
              <dt>Lease</dt>
              <dd>
                {w.state === "active"
                  ? w.leaseUntil > Date.now()
                    ? "Current"
                    : "Expired"
                  : "—"}
              </dd>
              <dt>Updated</dt>
              <dd>
                <Time at={w.updatedAt} />
              </dd>
            </dl>
          </Frame>
          <Frame title="Evidence">
            <Evidence items={w.evidence} />
            {!w.evidence.length && (
              <p className="empty">No artifacts recorded.</p>
            )}
          </Frame>
          {w.planHistory?.length > 0 && (
            <Frame title="Earlier predictions">
              {w.planHistory.map((p: Item, i: number) => (
                <details key={i}>
                  <summary>Plan {p.revision}</summary>
                  <p>{p.plan.prediction}</p>
                  <p>{p.reason}</p>
                </details>
              ))}
            </Frame>
          )}
        </aside>
      </div>
    </>
  );
}

export function Inspector({ route }: { route: string }) {
  const [data, setData] = useState<Item | null>(null);
  const [events, setEvents] = useState<Item[]>([]);
  const [posts, setPosts] = useState<Item[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await get("/v1" + route);
        const project =
          result?.project?.id ??
          result?.work?.projectId ??
          result?.topic?.projectId;
        const ev = project
          ? await get("/v1/events?project=" + project + "&limit=100&tail=1")
          : null;
        const ps = route.startsWith("/topics/")
          ? await collection("/v1" + route + "/posts")
          : [];
        if (active) {
          setData(result);
          setEvents(ev?.items ?? []);
          setPosts(ps);
          setError("");
        }
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [route]);
  return (
    <div className="inspector-page">
      <div className="eyebrow">RESEARCH INSPECTOR · SOURCE RECORDS</div>
      {error && <p role="alert">{error}</p>}
      {data ? (
        route.startsWith("/projects/") ? (
          <Project data={data} events={events} />
        ) : route.startsWith("/topics/") ? (
          <Topic data={data} posts={posts} />
        ) : (
          <Work data={data} />
        )
      ) : (
        <p>Loading source records…</p>
      )}
    </div>
  );
}

import * as stylex from "@stylexjs/stylex";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { kinds, type ResearchRecord } from "../../core/src/index";
import { useResearch } from "./state";
import { styles as s } from "./styles";
import { Badge, Card, Editor, RecordLink, time } from "./ui";
import { ExperimentFlow, RunOutcome } from "./experiment-flow";
import { Comparison } from "./charts";
import { EvaluationOutcomes } from "./evaluation-outcomes";

export function Home() {
  const { snapshot } = useResearch();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <header {...stylex.props(s.heading)}>
        <div>
          <div {...stylex.props(s.eyebrow)}>Workspace</div>
          <h1 {...stylex.props(s.title)}>Research projects</h1>
          <div {...stylex.props(s.muted)}>
            Questions, experiments, and what you learned.
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          {...stylex.props(s.button, s.primary)}
        >
          + New project
        </button>
      </header>
      <Card title="Projects">
        {!snapshot?.projects.length ? (
          <div {...stylex.props(s.empty)}>
            Create a project to start collecting research. Agents can contribute
            through the local API or CLI.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Active</th>
                <th>Findings</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.projects.map((project) => {
                const records = snapshot.records.filter(
                  (record) => record.projectId === project.id,
                );
                return (
                  <tr key={project.id}>
                    <td>
                      <Link
                        {...stylex.props(s.link)}
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                      >
                        {project.title}
                      </Link>
                      <div {...stylex.props(s.muted)}>
                        {project.description.slice(0, 120)}
                      </div>
                    </td>
                    <td>
                      {
                        records.filter((record) => record.state === "active")
                          .length
                      }
                    </td>
                    <td>
                      {
                        records.filter((record) => record.kind === "finding")
                          .length
                      }
                    </td>
                    <td {...stylex.props(s.muted)}>
                      {time(
                        records.reduce(
                          (latest, record) =>
                            record.updatedAt > latest
                              ? record.updatedAt
                              : latest,
                          project.createdAt,
                        ),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {editing && <Editor onClose={() => setEditing(false)} />}
    </>
  );
}

export function Dashboard() {
  const { projectId } = useParams({ strict: false });
  const { snapshot } = useResearch();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  if (!snapshot)
    return (
      <div {...stylex.props(s.empty)}>Connecting to the local workspace…</div>
    );
  const project = snapshot.projects.find((item) => item.id === projectId);
  if (!project) return <div {...stylex.props(s.empty)}>Project not found.</div>;
  const records = snapshot.records.filter(
    (record) => record.projectId === project.id,
  );
  const findings = records
    .filter((record) => record.kind === "finding")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filtered = records.filter(
    (record) =>
      (kind === "all" ||
        (kind === "overview" && record.kind !== "run") ||
        record.kind === kind) &&
      `${record.title} ${record.body} ${record.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const trainingRuns = records.filter(
    (record) => record.metadata.stage === "train",
  );
  const comparison = selected.length
    ? records.filter((record) => selected.includes(record.id))
    : trainingRuns.length
      ? trainingRuns
      : records;
  const stats = [
    [
      "Questions",
      records.filter((record) => record.kind === "question").length,
    ],
    ["Active", records.filter((record) => record.state === "active").length],
    ["Runs", records.filter((record) => record.kind === "run").length],
    ["Findings", findings.length],
  ];
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current.slice(-3), id],
    );
  }
  return (
    <>
      <header {...stylex.props(s.heading)}>
        <div>
          <div {...stylex.props(s.eyebrow)}>Project overview</div>
          <h1 {...stylex.props(s.title)}>{project.title}</h1>
          <div {...stylex.props(s.muted)}>{project.description}</div>
        </div>
        <button
          {...stylex.props(s.button, s.primary)}
          onClick={() => setEditing(true)}
        >
          + New record
        </button>
      </header>
      <div {...stylex.props(s.stats)}>
        {stats.map(([label, value]) => (
          <div key={label} {...stylex.props(s.stat)}>
            <div {...stylex.props(s.muted)}>{label}</div>
            <div {...stylex.props(s.statValue)}>{value}</div>
          </div>
        ))}
      </div>
      <EvaluationOutcomes
        key={project.id}
        records={records}
        samples={snapshot.samples}
      />
      <div {...stylex.props(s.grid)}>
        <Comparison records={comparison} samples={snapshot.samples} />
        <Card
          title="Latest findings"
          aside={<span {...stylex.props(s.muted)}>{findings.length}</span>}
        >
          {!findings.length && (
            <div {...stylex.props(s.empty)}>
              Record what changed your understanding, with links to the
              evidence.
            </div>
          )}
          {findings.slice(0, 4).map((record) => (
            <article key={record.id} {...stylex.props(s.item)}>
              <div {...stylex.props(s.itemTitle)}>
                <RecordLink record={record} />
              </div>
              <div {...stylex.props(s.muted)}>
                {record.body.slice(0, 140)}
                {record.body.length > 140 ? "…" : ""}
              </div>
              <div {...stylex.props(s.row)} style={{ marginTop: 8 }}>
                {record.assessment && <Badge state={record.assessment} />}
                <span {...stylex.props(s.muted)}>
                  {record.actor} · {time(record.updatedAt)}
                </span>
              </div>
            </article>
          ))}
        </Card>
      </div>
      <ExperimentFlow records={records} context={snapshot.records} />
      <Card
        title="Research"
        aside={
          <span {...stylex.props(s.muted)}>
            {selected.length
              ? `${selected.length} selected for comparison`
              : "Select up to four records to compare"}
          </span>
        }
      >
        <div {...stylex.props(s.toolbar)}>
          <input
            aria-label="Search research"
            placeholder="Search research…"
            {...stylex.props(s.input, s.search)}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Record kind"
            {...stylex.props(s.input)}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="overview">Research overview</option>
            <option value="all">All records</option>
            {kinds.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          {selected.length > 0 && (
            <button {...stylex.props(s.button)} onClick={() => setSelected([])}>
              Clear selection
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th aria-label="Compare" />
                <th>Title</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Contributor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Compare ${record.title}`}
                      checked={selected.includes(record.id)}
                      onChange={() => toggle(record.id)}
                    />
                  </td>
                  <td>
                    <RecordLink record={record} />
                    <div {...stylex.props(s.row)} style={{ marginTop: 5 }}>
                      {record.tags.slice(0, 3).map((tag) => (
                        <span {...stylex.props(s.badge)} key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td {...stylex.props(s.muted)}>{record.kind}</td>
                  <td>
                    <Badge state={record.state} />
                    <RunOutcome record={record} />
                  </td>
                  <td {...stylex.props(s.muted)}>{record.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div {...stylex.props(s.empty)}>No matching records.</div>
        )}
      </Card>
      {editing && (
        <Editor projectId={project.id} onClose={() => setEditing(false)} />
      )}
    </>
  );
}

export function RelatedRecords({
  records,
  title,
}: {
  records: ResearchRecord[];
  title: string;
}) {
  return (
    <Card title={title}>
      {!records.length && (
        <div {...stylex.props(s.empty)}>No linked records yet.</div>
      )}
      {records.map((record) => (
        <div key={record.id} {...stylex.props(s.item)}>
          <div {...stylex.props(s.itemTitle)}>
            <RecordLink record={record} />
          </div>
          <div {...stylex.props(s.row)}>
            <span {...stylex.props(s.muted)}>{record.kind}</span>
            <Badge state={record.state} />
            <RunOutcome record={record} />
          </div>
        </div>
      ))}
    </Card>
  );
}

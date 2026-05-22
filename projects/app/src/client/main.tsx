import { Replicache } from "replicache";
import { useSubscribe } from "replicache-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from "@tanstack/react-router";

import type { ArtifactRecord } from "@situ/artifacts";
import type { BaselineRecord } from "@situ/baselines";
import type { BriefingBlock, BriefingRecord } from "@situ/briefings";
import type { CommentRecord } from "@situ/comments";
import type { EventRecord } from "@situ/events";
import type { ExperimentRecord } from "@situ/experiments";
import type {
  LiveFocusRecord,
  LiveMapEdgeRecord,
  LiveMapNodeRecord,
  LiveNodeDetailRecord,
  LiveSignalRecord,
  LiveTone,
} from "@situ/live";
import type { MeasurementRecord } from "@situ/measurements";
import type { NotificationRecord } from "@situ/notifications";
import type { ProjectRecord } from "@situ/projects";
import type { ReportRecord } from "@situ/reports";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";
import {
  AttachmentList,
  BaselineCard,
  EvidenceBlock,
  MetricCard,
  reportBaseCss,
  type AttachmentSummary,
} from "@situ/reports-ui/browser";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts";

import { actorLabel } from "../reports/narratives.js";
import type { ReportTargetAttachments } from "../reports/types.js";
import {
  buildProjectIndexModel,
  buildProjectOverviewModel,
  type ProjectActivityItem,
  type CurrentMapNode,
  type ProjectIndexModel,
  type ProjectOverviewModel,
  type ClientRecords,
} from "./model.js";

const clientSchemaVersion = "situ-v2";
const pullIntervalMs = 1500;
const replicacheName = "situ-v2";

const ReplicacheContext = createContext<Replicache | null>(null);
const SyncContext = createContext(false);

type NavigateToProject = (projectId: string | undefined) => void;

function ReplicacheProvider(props: { readonly children: ReactNode }) {
  const [rep, setRep] = useState<Replicache | null>(null);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let activeRep: Replicache | undefined;

    try {
      const nextRep = new Replicache({
        name: replicacheName,
        schemaVersion: clientSchemaVersion,
        pullURL: "/replicache/pull",
        pushURL: "/replicache/push",
        pullInterval: pullIntervalMs,
        logLevel: "error",
        mutators: {},
      });
      activeRep = nextRep;
      setRep(nextRep);
      void nextRep
        .pull({ now: true })
        .then(() => {
          if (!disposed) {
            setSynced(true);
          }
          return undefined;
        })
        .catch((caught: unknown) => {
          if (!disposed) {
            setError(caught instanceof Error ? caught.message : "Initial pull failed.");
          }
        });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replicache initialization failed.");
    }

    return () => {
      disposed = true;
      void activeRep?.close();
    };
  }, []);

  if (error !== null) {
    return (
      <div className="live-shell">
        <StyleRoot />
        <main className="live-doc">
          <p role="alert" className="live-banner live-banner-error">
            Failed to initialize local sync: {error}
          </p>
        </main>
      </div>
    );
  }

  if (rep === null) {
    return (
      <div className="live-shell">
        <StyleRoot />
        <main className="live-doc">
          <p role="status" className="live-shell-note">
            Connecting to local state…
          </p>
        </main>
      </div>
    );
  }

  return (
    <ReplicacheContext.Provider value={rep}>
      <SyncContext.Provider value={synced}>{props.children}</SyncContext.Provider>
    </ReplicacheContext.Provider>
  );
}

function useReplicache(): Replicache {
  const rep = useContext(ReplicacheContext);
  if (rep === null) {
    throw new Error("useReplicache must be used inside ReplicacheProvider.");
  }
  return rep;
}

function useSynced(): boolean {
  return useContext(SyncContext);
}

function useRecordList<TRecord>(prefix: string): readonly TRecord[] {
  const rep = useReplicache();
  return useSubscribe(
    rep,
    async (transaction) => (await transaction.scan({ prefix }).values().toArray()) as TRecord[],
    {
      default: [] as TRecord[],
      dependencies: [prefix],
    },
  );
}

function useClientRecords(): ClientRecords {
  return {
    projects: useRecordList<ProjectRecord>("projects/"),
    tasks: useRecordList<TaskRecord>("tasks/"),
    baselines: useRecordList<BaselineRecord>("baselines/"),
    experiments: useRecordList<ExperimentRecord>("experiments/"),
    measurements: useRecordList<MeasurementRecord>("measurements/"),
    reviews: useRecordList<ReviewRecord>("reviews/"),
    artifacts: useRecordList<ArtifactRecord>("artifacts/"),
    reports: useRecordList<ReportRecord>("reports/"),
    briefings: useRecordList<BriefingRecord>("briefings/"),
    liveSignals: useRecordList<LiveSignalRecord>("live-signals/"),
    liveMapNodes: useRecordList<LiveMapNodeRecord>("live-map-nodes/"),
    liveMapEdges: useRecordList<LiveMapEdgeRecord>("live-map-edges/"),
    liveFocuses: useRecordList<LiveFocusRecord>("live-focuses/"),
    liveNodeDetails: useRecordList<LiveNodeDetailRecord>("live-node-details/"),
    comments: useRecordList<CommentRecord>("comments/"),
    events: useRecordList<EventRecord>("events/"),
    notifications: useRecordList<NotificationRecord>("notifications/"),
  };
}

function ProjectOverviewApp(props: {
  readonly requestedProjectId?: string;
  readonly navigateToProject: NavigateToProject;
}) {
  const synced = useSynced();
  const records = useClientRecords();
  const model = useMemo(
    () => buildProjectOverviewModel({ records, requestedProjectId: props.requestedProjectId }),
    [records, props.requestedProjectId],
  );

  return (
    <ProjectOverviewSurface
      model={model}
      synced={synced}
      navigateToProject={props.navigateToProject}
    />
  );
}

function ProjectIndexApp(props: { readonly navigateToProject: (projectId: string) => void }) {
  const synced = useSynced();
  const records = useClientRecords();
  const model = useMemo(() => buildProjectIndexModel({ records }), [records]);

  return (
    <ProjectIndexSurface
      model={model}
      synced={synced}
      navigateToProject={props.navigateToProject}
    />
  );
}

export function ProjectIndexSurface(props: {
  readonly model: ProjectIndexModel;
  readonly synced: boolean;
  readonly navigateToProject?: (projectId: string) => void;
}) {
  return (
    <div className="live-shell">
      <StyleRoot />
      <ClientTopbar synced={props.synced} />
      <main className="live-doc">
        <article className="live-article project-index-article">
          <div className="brief-head project-index-head">
            <p className="brief-kicker">situ · projects</p>
            <h1 className="brief-title">Projects</h1>
            <p className="brief-lede">Choose a project to open its overview.</p>
          </div>

          {props.model.allProjects.length === 0 ? (
            <p className="project-index-empty">No projects are available in local state yet.</p>
          ) : (
            <div className="project-index-groups">
              <ProjectIndexGroup
                title="Active"
                projects={props.model.activeProjects}
                navigateToProject={props.navigateToProject}
              />
              <ProjectIndexGroup
                title="Archived"
                projects={props.model.archivedProjects}
                navigateToProject={props.navigateToProject}
              />
            </div>
          )}
        </article>
      </main>
    </div>
  );
}

function ProjectIndexGroup(props: {
  readonly title: string;
  readonly projects: readonly ProjectRecord[];
  readonly navigateToProject?: (projectId: string) => void;
}) {
  if (props.projects.length === 0) {
    return null;
  }

  return (
    <section className="project-index-group" aria-labelledby={`project-group-${props.title}`}>
      <h2 className="project-index-heading" id={`project-group-${props.title}`}>
        {props.title}
      </h2>
      <div className="project-index-list">
        {props.projects.map((project) => (
          <ProjectIndexItem
            key={project.id}
            project={project}
            navigateToProject={props.navigateToProject}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectIndexItem(props: {
  readonly project: ProjectRecord;
  readonly navigateToProject?: (projectId: string) => void;
}) {
  const updatedAt = props.project.metadata.updatedAt;

  return (
    <a
      className="project-index-item"
      href={`/projects/${encodeURIComponent(props.project.id)}`}
      onClick={(event) => {
        if (props.navigateToProject === undefined) {
          return;
        }
        event.preventDefault();
        props.navigateToProject(props.project.id);
      }}
    >
      <span className="project-index-main">
        <span className="project-index-title">{props.project.name}</span>
        <span className="project-index-meta">
          <span>{props.project.repositoryPath}</span>
          <time dateTime={updatedAt}>Updated {formatTimestamp(updatedAt)}</time>
        </span>
      </span>
      <span className="project-index-status">{titleCase(props.project.status)}</span>
    </a>
  );
}

export function ProjectOverviewSurface(props: {
  readonly model: ProjectOverviewModel;
  readonly synced: boolean;
  readonly navigateToProject?: NavigateToProject;
}) {
  return (
    <div className="live-shell">
      <StyleRoot />
      <ClientTopbar
        model={props.model}
        synced={props.synced}
        navigateToProject={props.navigateToProject}
      />
      <main className="live-doc">
        {props.model.kind === "empty" ? (
          <NoProjectView model={props.model} />
        ) : (
          <ProjectOverviewDocument model={props.model} />
        )}
      </main>
    </div>
  );
}

// ── Topbar ───────────────────────────────────────────────────────────────────

export function ClientTopbar(props: {
  readonly model?: ProjectOverviewModel;
  readonly synced: boolean;
  readonly navigateToProject?: NavigateToProject;
}) {
  const projects =
    props.model === undefined
      ? []
      : props.model.activeProjects.length > 0
        ? props.model.activeProjects
        : props.model.allProjects;

  const badge = props.model?.kind === "project" ? deriveAssessmentBadge(props.model) : undefined;

  const projectName = props.model?.kind === "project" ? props.model.project.name : undefined;

  return (
    <header className="live-topbar">
      <div className="topbar-identity">
        <a className="live-wordmark" href="/">
          situ
        </a>
        {badge !== undefined && (
          <span
            className={`topbar-badge tone-${toneClass(badge.tone)}`}
            aria-label={`Assessment: ${badge.label}`}
          >
            <span className="badge-dot" aria-hidden="true" />
            {badge.label}
          </span>
        )}
      </div>
      {projectName !== undefined && (
        <span className="topbar-project-name" aria-label="Project">
          {projectName}
        </span>
      )}
      <nav className="topbar-controls" aria-label="Project controls">
        {projects.length > 1 && (
          <select
            className="live-project-select"
            value={props.model?.kind === "project" ? props.model.project.id : ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              props.navigateToProject?.(value === "" ? undefined : value);
            }}
            aria-label="Project"
          >
            {props.model?.kind !== "project" && <option value="">Choose project</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
        <span
          className={`live-indicator ${props.synced ? "live-on" : "live-off"}`}
          aria-live="polite"
          aria-label={props.synced ? "Synced" : "Syncing"}
        >
          <span className="live-dot" aria-hidden="true" />
          {props.synced ? "Synced" : "Syncing"}
        </span>
      </nav>
    </header>
  );
}

function deriveAssessmentBadge(
  model: Extract<ProjectOverviewModel, { readonly kind: "project" }>,
): {
  label: string;
  tone: LiveTone;
} {
  if (model.latestBriefing !== undefined) {
    return {
      label: formatAssessment(model.latestBriefing.assessment),
      tone: assessmentTone(model.latestBriefing.assessment),
    };
  }
  const signal = model.presentation.signals.find((s) => s.slot === "assessment");
  if (signal !== undefined) {
    return { label: signal.value, tone: signal.tone };
  }
  return { label: model.status.label, tone: "neutral" };
}

function formatAssessment(assessment: BriefingRecord["assessment"]): string {
  switch (assessment) {
    case "on_track":
      return "On Track";
    case "watch":
      return "Watch";
    case "blocked":
      return "Blocked";
    case "complete":
      return "Complete";
  }
}

function assessmentTone(assessment: BriefingRecord["assessment"]): LiveTone {
  switch (assessment) {
    case "on_track":
      return "good";
    case "watch":
      return "watch";
    case "blocked":
      return "blocked";
    case "complete":
      return "done";
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function NoProjectView(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "empty" }>;
}) {
  const title = props.model.missingRequestedProject ? "Project not found" : "No project selected";
  const lede = props.model.missingRequestedProject
    ? "The requested project is not present in the local situ database."
    : "Open a project from the projects list to view its overview.";

  return (
    <article className="live-article">
      <div className="brief-head">
        <p className="brief-kicker">situ · project overview</p>
        <h1 className="brief-title">{title}</h1>
        <p className="brief-lede">{lede}</p>
      </div>
    </article>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

function ProjectOverviewDocument(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const { model } = props;
  return (
    <article className="live-article">
      {model.missingRequestedProject && (
        <p className="live-banner live-banner-warn">Requested project not found.</p>
      )}
      <BriefingHead model={model} />
      <SignalDataline model={model} />
      <EditorialBlocks model={model} />
      <RunMapSection model={model} />
    </article>
  );
}

// ── Briefing head: kicker + title + lede ─────────────────────────────────────

function BriefingHead(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const briefing = props.model.latestBriefing;
  const updatedAt =
    briefing?.metadata.createdAt ??
    props.model.activity[0]?.createdAt ??
    props.model.project.metadata.updatedAt;
  const author = briefing?.authoredBy ?? props.model.project.createdBy;

  return (
    <div className="brief-head">
      <p className="brief-kicker">
        {actorLabel(author)} · {formatTimestamp(updatedAt)}
      </p>
      <h1 className="brief-title">{briefing?.title ?? props.model.project.name}</h1>
      {briefing !== undefined ? (
        <p className="brief-lede">{briefing.headlineMarkdown}</p>
      ) : (
        <p className="brief-lede brief-lede-empty">
          No briefing has been published yet. The agent will update this view as the run progresses.
        </p>
      )}
    </div>
  );
}

// ── Signal dateline ───────────────────────────────────────────────────────────

function SignalDataline(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  // Exclude the assessment signal — it lives in the topbar badge.
  const signals = props.model.presentation.signals
    .filter((s) => s.slot !== "assessment")
    .slice(0, 4);

  if (signals.length === 0) return null;

  return (
    <div className="signal-dateline" aria-label="Run signals">
      {signals.map((signal) => (
        <div key={signal.id} className={`signal-datum tone-${toneClass(signal.tone)}`}>
          <span className="datum-label">{signal.label}</span>
          <span className="datum-value">{signal.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Editorial blocks ──────────────────────────────────────────────────────────

function EditorialBlocks(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const briefing = props.model.latestBriefing;
  if (briefing === undefined) return null;

  const blocks = selectEditorialBlocks(briefing.blocks, briefing.assessment);
  if (blocks.length === 0) return null;

  return (
    <div className="editorial-blocks">
      {blocks.map((block) => (
        <EditorialBlock key={blockKey(block)} block={block} model={props.model} />
      ))}
    </div>
  );
}

function selectEditorialBlocks(
  blocks: readonly BriefingBlock[],
  assessment: BriefingRecord["assessment"],
): readonly BriefingBlock[] {
  const callouts = blocks.filter((b) => b.type === "callout");
  const warnings = callouts.filter(
    (b): b is Extract<BriefingBlock, { type: "callout" }> =>
      b.type === "callout" && b.tone === "warning",
  );
  const findings = callouts.filter(
    (b): b is Extract<BriefingBlock, { type: "callout" }> =>
      b.type === "callout" && b.tone === "finding",
  );
  const statuses = blocks.filter((b) => b.type === "status");
  const nextSteps = blocks.filter((b) => b.type === "next_steps");
  const updates = blocks.filter((b) => b.type === "recent_update");

  switch (assessment) {
    case "blocked":
      return [...warnings, ...nextSteps].slice(0, 3);
    case "watch":
      return [...warnings, ...statuses.slice(0, 1), ...nextSteps.slice(0, 1)].slice(0, 3);
    case "complete":
      return [...findings, ...updates.slice(0, 1)].slice(0, 2);
    case "on_track":
    default:
      return [...statuses.slice(0, 1), ...findings.slice(0, 1), ...nextSteps.slice(0, 1)].slice(
        0,
        2,
      );
  }
}

function EditorialBlock(props: {
  readonly block: BriefingBlock;
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const { block } = props;

  switch (block.type) {
    case "status":
      return (
        <div className="editorial-block editorial-block-status">
          <span className="editorial-label">Status</span>
          <p className="editorial-body">{block.summaryMarkdown}</p>
          {block.reasons !== undefined && block.reasons.length > 0 && (
            <ul className="editorial-list">
              {block.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      );

    case "callout":
      return (
        <div
          className={`editorial-block editorial-block-callout callout-${block.tone ?? "neutral"}`}
        >
          <span className="editorial-label">{block.tone === "warning" ? "Watch" : "Finding"}</span>
          <p className="editorial-body">{block.bodyMarkdown}</p>
        </div>
      );

    case "recent_update":
      return (
        <div className="editorial-block editorial-block-update">
          <span className="editorial-label">Update</span>
          <p className="editorial-body">{block.bodyMarkdown}</p>
        </div>
      );

    case "next_steps":
      return (
        <div className="editorial-block editorial-block-next">
          <span className="editorial-label">Next</span>
          <ol className="editorial-steps">
            {block.items.map((item) => (
              <li key={item.text}>{item.text}</li>
            ))}
          </ol>
        </div>
      );

    default:
      return null;
  }
}

// ── Run map section ───────────────────────────────────────────────────────────

type ChartRowData = {
  index: number;
  y: number | null;
  frontierY: number | null;
  nodeKey: string;
  title: string;
  tone: LiveTone;
};

type ChartMetric = {
  readonly value: number;
  readonly direction: "higher_is_better" | "lower_is_better";
  readonly label: string;
  readonly unit?: string;
};

function extractFirstMetricFact(detail?: LiveNodeDetailRecord): ChartMetric | undefined {
  if (detail === undefined) return undefined;
  for (const fact of detail.facts) {
    const n =
      typeof fact.numericValue === "number" && Number.isFinite(fact.numericValue)
        ? fact.numericValue
        : parseFloat(fact.value);
    if (!isNaN(n) && isFinite(n)) {
      return {
        value: n,
        direction: fact.direction ?? "higher_is_better",
        label: metricDisplayLabel(fact.label || fact.metricName || "Metric"),
        unit: fact.unit,
      };
    }
  }
  return undefined;
}

function metricDisplayLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Metric";
  if (!trimmed.includes("_")) return trimmed;
  return titleCase(trimmed);
}

function metricAxisLabel(input: {
  readonly label: string;
  readonly unit?: string;
  readonly direction: ChartMetric["direction"];
}): string {
  const directionLabel =
    input.direction === "lower_is_better" ? "lower is better" : "higher is better";
  const unit = input.unit?.trim();
  const metricLabel =
    unit !== undefined && unit.length > 0 && !input.label.toLowerCase().includes(unit.toLowerCase())
      ? `${input.label} ${unit}`
      : input.label;

  return `${metricLabel} (${directionLabel})`;
}

function formatAxisValue(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function buildChartData(
  nodes: readonly CurrentMapNode[],
  details: ReadonlyMap<string, LiveNodeDetailRecord>,
): {
  data: ChartRowData[];
  frontierKeys: ReadonlySet<string>;
  metricCount: number;
  metricLabel: string;
} {
  const rawMetrics = nodes.map((n) => extractFirstMetricFact(details.get(n.nodeKey)));
  const rawValues = rawMetrics.map((metric) => metric?.value ?? null);
  const metricCount = rawMetrics.filter(
    (metric): metric is ChartMetric => metric !== undefined,
  ).length;
  const hasMetrics = metricCount > 0;
  const direction =
    rawMetrics.find((metric): metric is ChartMetric => metric !== undefined)?.direction ??
    "higher_is_better";
  const metric = rawMetrics.find((candidate): candidate is ChartMetric => candidate !== undefined);
  const metricLabel = metricAxisLabel({
    label: metric?.label ?? "Metric",
    unit: metric?.unit,
    direction,
  });

  const frontierKeys = new Set<string>();
  if (hasMetrics) {
    let runningBest = direction === "higher_is_better" ? -Infinity : Infinity;
    for (const node of nodes) {
      const v = extractFirstMetricFact(details.get(node.nodeKey))?.value ?? null;
      const improved =
        v !== null && (direction === "higher_is_better" ? v > runningBest : v < runningBest);
      if (improved) {
        frontierKeys.add(node.nodeKey);
        runningBest = v;
      }
    }
  } else {
    for (const node of nodes) {
      if (node.tone === "good") frontierKeys.add(node.nodeKey);
    }
  }

  const data: ChartRowData[] = nodes.map((node, i) => {
    const y = rawValues[i];
    const isFrontier = frontierKeys.has(node.nodeKey);
    return {
      index: i,
      y,
      frontierY: isFrontier && y !== null ? y : null,
      nodeKey: node.nodeKey,
      title: node.title,
      tone: node.tone,
    };
  });

  return { data, frontierKeys, metricCount, metricLabel };
}

type RunMapDotProps = {
  cx: number;
  cy: number;
  payload: ChartRowData;
  frontierKeys: ReadonlySet<string>;
  selectedKey?: string;
  onSelect: (key: string) => void;
};

function RunMapDot({ cx, cy, payload, frontierKeys, selectedKey, onSelect }: RunMapDotProps) {
  const isFrontier = frontierKeys.has(payload.nodeKey);
  const isSelected = payload.nodeKey === selectedKey;

  const r = isFrontier ? 6 : 3.5;
  const fill = isFrontier ? "var(--accent)" : "var(--muted)";
  const opacity = isFrontier ? 0.95 : 0.28;
  const shortTitle = payload.title.length > 36 ? `${payload.title.slice(0, 34)}…` : payload.title;

  return (
    <g
      onClick={() => onSelect(payload.nodeKey)}
      role="button"
      aria-label={payload.title}
      tabIndex={0}
      style={{ cursor: "pointer" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(payload.nodeKey);
      }}
    >
      {/* Invisible hit target — keeps small dots easy to click */}
      <circle cx={cx} cy={cy} r={Math.max(r + 6, 11)} fill="transparent" />
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 4.5}
          fill="none"
          stroke={fill}
          strokeWidth={1.5}
          opacity={0.3}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        opacity={opacity}
        stroke={isFrontier ? "white" : "none"}
        strokeWidth={isFrontier ? 1.25 : 0}
      />
      {isFrontier && (
        <text
          x={cx + 5}
          y={cy - (r + 4)}
          transform={`rotate(-28, ${cx}, ${cy})`}
          fontSize={10}
          fontWeight={500}
          fontFamily="var(--sans)"
          fill={isSelected ? "var(--accent)" : "color-mix(in srgb, var(--accent) 72%, var(--ink))"}
          textAnchor="start"
          style={{ pointerEvents: "none" }}
        >
          {shortTitle}
        </text>
      )}
    </g>
  );
}

// Recharts clips anything a `Line` renders (its `dot` prop) to the plot area, so
// frontier labels get cut off. Rendered as a direct chart child, this layer sits
// outside that clip group and reads the axis scales via Recharts v3 hooks to
// place each dot itself.
function RunMapDotLayer(props: {
  readonly data: readonly ChartRowData[];
  readonly frontierKeys: ReadonlySet<string>;
  readonly selectedKey?: string;
  readonly onSelect: (key: string) => void;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (xScale === undefined || yScale === undefined) return null;

  return (
    <g className="run-map-dot-layer">
      {props.data.map((row) => {
        if (row.y === null) return null;
        const cx = xScale(row.index);
        const cy = yScale(row.y);
        if (cx === undefined || cy === undefined) return null;
        return (
          <RunMapDot
            key={row.nodeKey}
            cx={cx}
            cy={cy}
            payload={row}
            frontierKeys={props.frontierKeys}
            selectedKey={props.selectedKey}
            onSelect={props.onSelect}
          />
        );
      })}
    </g>
  );
}

type TooltipEntry = { dataKey?: string; payload?: ChartRowData };

function RunMapTooltip(props: { active?: boolean; payload?: readonly TooltipEntry[] }) {
  if (!props.active || !props.payload?.[0]) return null;
  const row = props.payload.find((p) => p.dataKey === "y")?.payload;
  if (row === undefined || row.y === null) return null;
  return (
    <div className="map-tooltip">
      <span className="map-tooltip-title">{row.title}</span>
      <span className="map-tooltip-state">
        {row.frontierY !== null ? "Frontier point" : "Other attempt"}
      </span>
      <span className="map-tooltip-metric">{formatAxisValue(row.y)}</span>
    </div>
  );
}

function RunMapSection(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const { nodes, focus, detailsByNodeKey } = props.model.presentation.map;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const activeKey =
    selectedKey !== undefined && nodes.some((n) => n.nodeKey === selectedKey)
      ? selectedKey
      : undefined;

  const selectedNode =
    activeKey !== undefined ? nodes.find((n) => n.nodeKey === activeKey) : undefined;
  const selectedDetail = activeKey !== undefined ? detailsByNodeKey.get(activeKey) : undefined;

  const handleSelect = (key: string) => {
    setSelectedKey((prev) => (prev === key ? undefined : key));
  };

  return (
    <section className="run-map-section" aria-label="Run map">
      <div className="run-map-head">
        <span className="run-map-label">Run map</span>
        {focus?.summary !== undefined && <span className="run-map-summary">{focus.summary}</span>}
      </div>
      {nodes.length === 0 ? (
        <p className="run-map-empty">
          {props.model.latestBriefing !== undefined
            ? "The agent has not published a run map yet."
            : "No map or briefing yet."}
        </p>
      ) : (
        <RunMapChart
          nodes={nodes}
          details={detailsByNodeKey}
          selectedKey={activeKey}
          onSelect={handleSelect}
        />
      )}
      <NodeDetailSidebar
        node={selectedNode}
        detail={selectedDetail}
        onClose={() => setSelectedKey(undefined)}
      />
    </section>
  );
}

function RunMapChart(props: {
  readonly nodes: readonly CurrentMapNode[];
  readonly details: ReadonlyMap<string, LiveNodeDetailRecord>;
  readonly selectedKey?: string;
  readonly onSelect: (key: string) => void;
}) {
  const { data, frontierKeys, metricCount, metricLabel } = buildChartData(
    props.nodes,
    props.details,
  );
  const n = props.nodes.length;
  const attemptLabel = n === 1 ? "Attempt" : "Attempts";
  const frontierLabel = frontierKeys.size === 1 ? "Frontier Point" : "Frontier Points";
  const title = `Live Progress: ${n} ${attemptLabel}, ${frontierKeys.size} ${frontierLabel}`;

  return (
    <div className="run-map-chart-wrap">
      <div className="map-chart-header">
        <span className="map-chart-title">{title}</span>
        <span className="map-chart-legend" aria-hidden="true">
          <span className="map-legend-item">
            <svg width={10} height={10}>
              <circle cx={5} cy={5} r={3.5} fill="var(--muted)" opacity={0.3} />
            </svg>
            Other attempts
          </span>
          <span className="map-legend-item">
            <svg width={10} height={10}>
              <circle cx={5} cy={5} r={5} fill="var(--accent)" opacity={0.9} />
            </svg>
            Frontier
          </span>
          <span className="map-legend-item">
            <svg width={20} height={10}>
              <line
                x1={0}
                y1={5}
                x2={20}
                y2={5}
                stroke="var(--accent)"
                strokeWidth={1.5}
                opacity={0.7}
              />
            </svg>
            Running best
          </span>
        </span>
      </div>
      {metricCount === 0 ? (
        <div className="map-chart-diagnostic">
          <span>No plottable metric facts.</span>
          <span>Publish numeric facts in live details to draw the run map.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={460}>
          <ComposedChart data={data} margin={{ top: 92, right: 44, bottom: 48, left: 22 }}>
            <CartesianGrid stroke="var(--rule-soft)" strokeDasharray="2 4" vertical />
            <XAxis
              dataKey="index"
              type="number"
              domain={[-0.4, n - 0.6]}
              label={{
                value: "Experiment #",
                position: "insideBottom",
                offset: -16,
                style: {
                  fontSize: 10,
                  fill: "var(--muted)",
                  fontFamily: "var(--sans)",
                  letterSpacing: "0",
                },
              }}
              tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--sans)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
              tickCount={Math.min(n + 1, 10)}
              allowDecimals={false}
            />
            <YAxis
              type="number"
              domain={["auto", "auto"]}
              tickFormatter={formatAxisValue}
              tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--mono)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
              width={68}
              tickMargin={10}
              label={{
                value: metricLabel,
                angle: -90,
                position: "insideLeft",
                offset: -2,
                style: {
                  fontSize: 11,
                  fill: "var(--ink-soft)",
                  fontFamily: "var(--sans)",
                  letterSpacing: "0",
                },
              }}
            />
            <Tooltip
              content={(p) => (
                <RunMapTooltip active={p.active} payload={p.payload as readonly TooltipEntry[]} />
              )}
              cursor={{ stroke: "var(--rule)", strokeDasharray: "3 3", strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {/* Step-line connecting the running-best frontier nodes */}
            <Line
              dataKey="frontierY"
              type="stepAfter"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeOpacity={0.75}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
            {/* Invisible line keeps Recharts' tooltip hit-testing on every point */}
            <Line dataKey="y" stroke="transparent" strokeWidth={0} dot={false} activeDot={false} />
            {/* Dots + labels rendered as a direct child (outside the Line clip group) */}
            <RunMapDotLayer
              data={data}
              frontierKeys={frontierKeys}
              selectedKey={props.selectedKey}
              onSelect={props.onSelect}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function NodeDetailSidebar(props: {
  readonly node?: CurrentMapNode;
  readonly detail?: LiveNodeDetailRecord;
  readonly onClose: () => void;
}) {
  const isOpen = props.node !== undefined;
  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={props.onClose} aria-hidden="true" />}
      <aside
        className={`node-sidebar${isOpen ? " node-sidebar-open" : ""}`}
        aria-label="Node detail"
        aria-hidden={!isOpen}
      >
        {props.node !== undefined && (
          <>
            <div className="sidebar-head">
              <span className={`sidebar-kind tone-${toneClass(props.node.tone)}`}>
                {props.node.kind.replaceAll("_", " ")}
              </span>
              <button
                type="button"
                className="sidebar-close"
                onClick={props.onClose}
                aria-label="Close detail"
              >
                ×
              </button>
            </div>
            <h3 className="sidebar-title">{props.node.title}</h3>
            <p className="sidebar-summary">{props.node.summary}</p>
            {props.detail !== undefined && props.detail.bodyMarkdown.trim() !== "" && (
              <p className="sidebar-body">{props.detail.bodyMarkdown}</p>
            )}
            {props.detail !== undefined && props.detail.facts.length > 0 && (
              <dl className="sidebar-facts">
                {props.detail.facts.map((fact) => (
                  <div
                    key={`${fact.label}:${fact.value}`}
                    className={`sidebar-fact${fact.tone !== undefined ? ` tone-${toneClass(fact.tone)}` : ""}`}
                  >
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {props.detail !== undefined && props.detail.refs.length > 0 && (
              <div className="sidebar-refs">
                {props.detail.refs.map((ref) => (
                  <span key={`${ref.targetKind}:${ref.targetId}`} className="sidebar-ref">
                    {ref.targetKind}/{ref.targetId}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

// ── Debug/storybook components (unchanged) ────────────────────────────────────

export function StatusStrip(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const status = props.model.status;
  const verification = props.model.verification;
  const primary = props.model.derived.primaryMetric;
  return (
    <section className={`live-status-strip tone-${status.tone}`} aria-label="Run status">
      <div>
        <span className="status-eyebrow">Run</span>
        <strong>{status.label}</strong>
      </div>
      <div>
        <span className="status-eyebrow">Verify</span>
        <strong>{verification.ok ? "OK" : "Not ready"}</strong>
      </div>
      <div>
        <span className="status-eyebrow">Work</span>
        <strong>
          {status.work.running} running, {status.work.review} review
        </strong>
      </div>
      <div>
        <span className="status-eyebrow">Best</span>
        <strong>{primary?.bestValue === undefined ? "No metric" : primary.metricName}</strong>
      </div>
    </section>
  );
}

export function BriefingPanel(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
  readonly showRecordRefs?: boolean;
}) {
  const briefing = props.model.latestBriefing;

  if (briefing === undefined) {
    return <p className="empty-note">No live briefing has been recorded yet.</p>;
  }
  const visibleBlocks = selectEditorialBlocks(briefing.blocks, briefing.assessment);

  return (
    <article className={`debug-briefing-card assessment-${briefing.assessment}`}>
      <div className="debug-briefing-head">
        <p className="mini-label">Current briefing</p>
        <h3>{briefing.title}</h3>
        <div className="debug-briefing-meta">
          <span>{briefing.stage.replaceAll("_", " ")}</span>
          <span>{briefing.assessment.replaceAll("_", " ")}</span>
          <span>{formatTimestamp(briefing.metadata.createdAt)}</span>
        </div>
      </div>
      <p className="debug-briefing-headline">{briefing.headlineMarkdown}</p>
      {visibleBlocks.length > 0 && (
        <div className="debug-briefing-blocks">
          {visibleBlocks.map((block) => (
            <EditorialBlock key={blockKey(block)} block={block} model={props.model} />
          ))}
        </div>
      )}
      <p className="debug-briefing-byline">
        {actorLabel(briefing.authoredBy)} · {formatTimestamp(briefing.metadata.createdAt)}
      </p>
    </article>
  );
}

export function VerificationPanel(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  const status = props.model.status;
  const primary = props.model.derived.primaryMetric;
  return (
    <>
      <div className="metric-strip">
        <MetricCard
          metric="pending"
          value={status.work.pending}
          source="live-status"
          label="Pending"
        />
        <MetricCard
          metric="running"
          value={status.work.running}
          source="live-status"
          label="Running"
        />
        <MetricCard
          metric="review"
          value={status.work.review}
          source="live-status"
          label="Review"
        />
        <MetricCard
          metric="attention"
          value={status.work.attention}
          source="live-status"
          label="Attention"
        />
        {primary?.bestValue !== undefined && (
          <MetricCard
            metric={primary.metricName}
            value={primary.bestValue}
            unit={primary.unit}
            delta={
              primary.baselineValue === undefined
                ? undefined
                : primary.direction === "higher"
                  ? primary.bestValue - primary.baselineValue
                  : primary.baselineValue - primary.bestValue
            }
            direction={primary.direction}
            source="live-primary"
            label="Best metric"
          />
        )}
      </div>
      <ol className="verify-list">
        {props.model.verification.checks.map((check) => (
          <li key={check.name} className={check.ok ? "verify-ok" : "verify-blocked"}>
            <span className="verify-mark">{check.ok ? "OK" : "WAIT"}</span>
            <div>
              <strong>{check.label}</strong>
              <p>{check.summary}</p>
              {check.blockingRecords.length > 0 && (
                <ul className="blocking-list">
                  {check.blockingRecords.map((record) => (
                    <li key={`${check.name}:${record.targetKind}:${record.targetId}`}>
                      <span className="mono">
                        {record.targetKind}/{record.targetId}
                      </span>{" "}
                      {record.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export function LatestReport(props: { readonly report?: ReportRecord }) {
  if (props.report === undefined) {
    return (
      <p className="prose empty-note">
        No project report or checkpoint has been recorded yet. Manager updates appear here when
        agents create project-targeted report records.
      </p>
    );
  }

  return (
    <article className="latest-report">
      <header>
        <p className="mini-label">Latest report</p>
        <h3>{props.report.title}</h3>
        <p className="meta-sub">
          {actorLabel(props.report.generatedBy)} at{" "}
          {formatTimestamp(props.report.metadata.createdAt)}
        </p>
      </header>
      <MarkdownText text={props.report.bodyMarkdown} />
    </article>
  );
}

export function ActivityTimeline(props: { readonly items: readonly ProjectActivityItem[] }) {
  if (props.items.length === 0) {
    return (
      <p className="prose empty-note">
        No visible activity has been recorded for this project yet.
      </p>
    );
  }

  return (
    <ol className="live-activity-list">
      {props.items.slice(0, 24).map((item) => (
        <li key={`${item.kind}:${item.id}`} className={`activity-item tone-${item.tone}`}>
          <div className="activity-stem">
            <span>{item.kind}</span>
          </div>
          <div className="activity-body">
            <h3>{item.title}</h3>
            <p className="activity-meta">
              {item.actor !== undefined && <>{item.actor} · </>}
              <span className="mono">{item.targetLabel}</span> · {formatTimestamp(item.createdAt)}
            </p>
            {item.body !== undefined && <MarkdownText text={item.body} compact />}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EvidencePanel(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  if (props.model.snapshot.tasks.length === 0) {
    return <p className="prose empty-note">No tasks or experiments have been recorded yet.</p>;
  }

  return (
    <>
      {props.model.snapshot.tasks.map((taskSnapshot) => (
        <article key={taskSnapshot.task.id} className="task-block">
          <header className="task-header">
            <h3 className="task-title">{taskSnapshot.task.title}</h3>
            <p className="task-meta">
              Task <span className="mono">{taskSnapshot.task.id}</span> · status{" "}
              {taskSnapshot.task.status}
            </p>
          </header>
          {taskSnapshot.task.bodyMarkdown.trim() !== "" && (
            <MarkdownText text={taskSnapshot.task.bodyMarkdown} />
          )}
          {taskSnapshot.experiments.map((experimentSnapshot) => (
            <EvidenceBlock
              key={experimentSnapshot.experiment.id}
              experimentId={experimentSnapshot.experiment.id}
              title={experimentSnapshot.experiment.title}
              status={experimentSnapshot.experiment.status}
              actor={actorLabel(
                experimentSnapshot.experiment.assignedTo ?? experimentSnapshot.experiment.createdBy,
              )}
              branchName={experimentSnapshot.experiment.branchName}
              baseRef={experimentSnapshot.experiment.baseRef?.slice(0, 7)}
              worktreePath={experimentSnapshot.experiment.worktreePath}
              summaryMarkdown={experimentSnapshot.experiment.summaryMarkdown}
              measurements={experimentSnapshot.measurements.map((measurementSnapshot) => ({
                metricName: measurementSnapshot.measurement.metricName,
                value: measurementSnapshot.measurement.numericValue,
                unit: measurementSnapshot.measurement.unit,
                revisionNumber: measurementSnapshot.measurement.revisionNumber,
                actor: actorLabel(measurementSnapshot.measurement.measuredBy),
                note: measurementSnapshot.measurement.summaryMarkdown,
              }))}
              reviews={experimentSnapshot.reviews.map((reviewSnapshot) => ({
                decision: reviewSnapshot.review.decision,
                reviewer: actorLabel(reviewSnapshot.review.reviewer),
                body: reviewSnapshot.review.bodyMarkdown,
              }))}
              attachments={attachmentsFromTarget(experimentSnapshot.target)}
            />
          ))}
          <AttachmentList
            title="Task attachments"
            attachments={attachmentsFromTarget(taskSnapshot.target)}
          />
        </article>
      ))}
    </>
  );
}

export function AppendixPanel(props: {
  readonly model: Extract<ProjectOverviewModel, { readonly kind: "project" }>;
}) {
  return (
    <>
      <div className="appendix-block">
        <h3 className="appendix-heading">Baselines</h3>
        {props.model.snapshot.baselines.length === 0 ? (
          <p className="empty-note">No baseline records.</p>
        ) : (
          props.model.snapshot.baselines.map((baselineSnapshot) => (
            <BaselineCard
              key={baselineSnapshot.baseline.id}
              baselineId={baselineSnapshot.baseline.id}
              title={baselineSnapshot.baseline.title}
              status={baselineSnapshot.baseline.status}
              summaryMarkdown={baselineSnapshot.baseline.summaryMarkdown}
              measurements={baselineSnapshot.measurements.map((measurementSnapshot) => ({
                metricName: measurementSnapshot.measurement.metricName,
                value: measurementSnapshot.measurement.numericValue,
                unit: measurementSnapshot.measurement.unit,
                actor: actorLabel(measurementSnapshot.measurement.measuredBy),
              }))}
            />
          ))
        )}
      </div>
      <div className="appendix-block">
        <h3 className="appendix-heading">Project attachments</h3>
        <AttachmentList
          title="Comments, events, artifacts, and reports attached to the project"
          attachments={attachmentsFromTarget(props.model.snapshot.target)}
        />
      </div>
    </>
  );
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function MarkdownText(props: { readonly text: string; readonly compact?: boolean }) {
  const paragraphs = props.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const visible = props.compact ? paragraphs.slice(0, 2) : paragraphs;
  return (
    <div className={props.compact ? "markdown-text markdown-compact" : "markdown-text"}>
      {visible.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function attachmentsFromTarget(target: ReportTargetAttachments): readonly AttachmentSummary[] {
  return [
    ...target.comments.map((comment) => ({
      kind: "comment" as const,
      actor: actorLabel(comment.author),
      body: comment.bodyMarkdown,
    })),
    ...target.events.map((event) => ({
      kind: "event" as const,
      actor: actorLabel(event.actor),
      body: event.summaryMarkdown,
      extra: event.bodyMarkdown,
    })),
    ...target.artifacts.map((artifact) => ({
      kind: "artifact" as const,
      title: artifact.title,
      body: artifact.uri,
    })),
    ...target.reports.map((report) => ({
      kind: "report" as const,
      title: report.title,
      actor: `by ${actorLabel(report.generatedBy)}`,
      body: report.bodyMarkdown.slice(0, 240),
    })),
  ];
}

function blockKey(block: BriefingBlock): string {
  switch (block.type) {
    case "status":
      return `status:${block.summaryMarkdown.slice(0, 40)}`;
    case "callout":
      return `callout:${block.tone ?? ""}:${block.bodyMarkdown.slice(0, 40)}`;
    case "recent_update":
      return `update:${block.bodyMarkdown.slice(0, 40)}`;
    case "next_steps":
      return `next:${block.items[0]?.text.slice(0, 40) ?? ""}`;
    default:
      return block.type;
  }
}

function toneClass(tone?: LiveTone): "neutral" | "good" | "warning" | "bad" | "done" {
  switch (tone) {
    case "good":
      return "good";
    case "watch":
      return "warning";
    case "blocked":
      return "bad";
    case "done":
      return "done";
    case "neutral":
    case undefined:
      return "neutral";
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

// ── Styles ────────────────────────────────────────────────────────────────────

export function StyleRoot() {
  return <style dangerouslySetInnerHTML={{ __html: `${reportBaseCss}\n${liveCss}` }} />;
}

const liveCss = `
/* ── Shell & topbar ─────────────────────────────────────────────────────── */

.live-shell {
  min-height: 100vh;
  background: var(--paper-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

.live-shell ::selection {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

.live-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 10;
  height: 48px;
  padding: 0 28px;
  background: color-mix(in srgb, var(--paper-bg) 92%, white);
  border-bottom: 1px solid var(--rule);
  backdrop-filter: blur(8px);
  font-family: var(--sans);
}

.topbar-identity {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}

.live-wordmark {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-decoration: none;
  color: var(--ink);
  transition: opacity 120ms ease;
}

.live-wordmark:hover {
  opacity: 0.6;
}

.live-wordmark:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 3px;
  border-radius: 3px;
}

.topbar-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px 3px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: var(--rule-soft);
  color: var(--ink-soft);
  white-space: nowrap;
}

.badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}

.topbar-badge.tone-good {
  background: var(--accent-soft);
  color: var(--accent);
}
.topbar-badge.tone-good .badge-dot { background: var(--accent); }

.topbar-badge.tone-warning {
  background: var(--accent-2-soft);
  color: var(--accent-2);
}
.topbar-badge.tone-warning .badge-dot { background: var(--accent-2); }

.topbar-badge.tone-bad {
  background: var(--bad-soft);
  color: var(--bad);
}
.topbar-badge.tone-bad .badge-dot { background: var(--bad); }

.topbar-badge.tone-done {
  background: var(--rule-soft);
  color: var(--muted);
}
.topbar-badge.tone-done .badge-dot { background: var(--muted); }

.topbar-project-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.topbar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: auto;
}

.live-project-select {
  max-width: min(38vw, 240px);
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: white;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  padding: 5px 8px;
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.live-project-select:hover {
  border-color: color-mix(in srgb, var(--ink) 26%, var(--rule));
}

.live-project-select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--muted);
}

.live-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
}

.live-on .live-dot {
  background: var(--accent);
  animation: live-pulse 2.4s ease-in-out infinite;
}

.live-off .live-dot {
  background: var(--accent-2);
  animation: live-blink 1s ease-in-out infinite alternate;
}

.live-on {
  color: var(--accent);
}

@keyframes live-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
  }
  50% {
    box-shadow: 0 0 0 5px transparent;
  }
}

@keyframes live-blink {
  from { opacity: 0.35; }
  to   { opacity: 1; }
}

/* ── Document surface ───────────────────────────────────────────────────── */

.live-doc {
  background: var(--paper-bg);
}

.live-article {
  max-width: 880px;
  margin: 0 auto;
  padding: 52px 40px 96px;
}

.live-shell-note {
  text-align: center;
  padding: 80px 40px;
  font-family: var(--sans);
  font-size: 14px;
  color: var(--muted);
}

.live-banner {
  margin: 0 0 32px;
  padding: 11px 14px;
  font-family: var(--sans);
  font-size: 13px;
  border-radius: 6px;
}

.live-banner-warn {
  border: 1px solid color-mix(in srgb, var(--accent-2) 35%, var(--rule));
  color: var(--accent-2);
  background: var(--accent-2-soft);
}

.live-banner-error {
  border: 1px solid color-mix(in srgb, var(--bad) 35%, var(--rule));
  color: var(--bad);
  background: var(--bad-soft);
}

/* ── Project index ─────────────────────────────────────────────────────── */

.project-index-article {
  max-width: 820px;
}

.project-index-head {
  padding-bottom: 28px;
  border-bottom: 1px solid var(--rule);
}

.project-index-groups {
  display: flex;
  flex-direction: column;
  gap: 34px;
  margin-top: 32px;
}

.project-index-heading {
  margin: 0 0 12px;
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted);
}

.project-index-list {
  display: grid;
  gap: 10px;
}

.project-index-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 76px;
  padding: 16px 18px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: white;
  color: inherit;
  text-decoration: none;
  box-shadow: 0 1px 2px rgba(22, 24, 29, 0.03);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.project-index-item:hover {
  border-color: color-mix(in srgb, var(--ink) 24%, var(--rule));
  box-shadow: 0 6px 16px rgba(22, 24, 29, 0.06);
  transform: translateY(-1px);
}

.project-index-item:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.project-index-main {
  min-width: 0;
}

.project-index-title {
  display: block;
  overflow-wrap: anywhere;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.25;
  color: var(--ink);
}

.project-index-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 7px;
  font-family: var(--sans);
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
}

.project-index-meta span,
.project-index-meta time {
  min-width: 0;
  overflow-wrap: anywhere;
}

.project-index-status {
  justify-self: end;
  padding: 4px 8px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-soft);
  background: var(--paper-bg);
  white-space: nowrap;
}

.project-index-empty {
  margin: 32px 0 0;
  padding: 24px 0;
  border-top: 1px solid var(--rule);
  font-family: var(--sans);
  font-size: 14px;
  color: var(--muted);
}

/* ── Briefing head ──────────────────────────────────────────────────────── */

.brief-head {
  margin-bottom: 0;
}

.brief-kicker {
  margin: 0 0 11px;
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.brief-title {
  margin: 0;
  font-family: var(--serif);
  font-size: 34px;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.08;
  color: var(--ink);
}

.brief-lede {
  margin: 14px 0 0;
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.58;
  color: var(--ink-soft);
  max-width: 620px;
}

.brief-lede-empty {
  color: var(--muted);
  font-style: italic;
}

/* ── Signal dateline ────────────────────────────────────────────────────── */

.signal-dateline {
  display: flex;
  margin: 24px 0 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  font-family: var(--sans);
}

.signal-datum {
  flex: 1;
  min-width: 0;
  padding: 10px 20px 10px 16px;
  border-right: 1px solid var(--rule-soft);
}

.signal-datum:first-child {
  padding-left: 0;
}

.signal-datum:last-child {
  border-right: 0;
}

.datum-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  line-height: 1;
}

.datum-value {
  display: block;
  font-size: 15px;
  font-weight: 600;
  margin-top: 5px;
  color: var(--ink);
  line-height: 1.1;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.signal-datum.tone-good .datum-value  { color: var(--accent); }
.signal-datum.tone-warning .datum-value { color: var(--accent-2); }
.signal-datum.tone-bad .datum-value   { color: var(--bad); }
.signal-datum.tone-done .datum-value  { color: var(--muted); }

.datum-note {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.35;
}

/* ── Editorial blocks ───────────────────────────────────────────────────── */

.editorial-blocks {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 32px;
  max-width: 680px;
}

.editorial-block {
  font-family: var(--sans);
}

.editorial-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
}

.editorial-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.62;
  color: var(--ink-soft);
}

/* Callouts: thin colored left rule, inset like an editorial pull-quote — no
   filled box, so the page reads as one document surface rather than cards. */
.editorial-block-callout {
  padding: 1px 0 1px 17px;
  border-left: 2px solid var(--rule);
}

.editorial-block-callout.callout-warning {
  border-left-color: var(--accent-2);
}

.editorial-block-callout.callout-warning .editorial-label {
  color: var(--accent-2);
}

.editorial-block-callout.callout-finding {
  border-left-color: var(--accent);
}

.editorial-block-callout.callout-finding .editorial-label {
  color: var(--accent);
}

.editorial-block-callout .editorial-body {
  color: var(--ink);
}

/* next steps and status reason lists */
.editorial-steps,
.editorial-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-soft);
}

.editorial-steps li,
.editorial-list li {
  margin-bottom: 5px;
}

/* ── Run map section ────────────────────────────────────────────────────── */

.run-map-section {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--rule);
}

@media (min-width: 1120px) {
  .run-map-section {
    width: min(1240px, calc(100vw - 96px));
    margin-left: 50%;
    transform: translateX(-50%);
  }

  .run-map-head {
    max-width: 880px;
    margin-left: auto;
    margin-right: auto;
  }
}

.run-map-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.run-map-label {
  font-family: var(--sans);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  flex-shrink: 0;
}

.run-map-summary {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink-soft);
}

.run-map-empty {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}

/* ── Run map chart (SVG) ────────────────────────────────────────────────── */

.run-map-chart-wrap {
  background: white;
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 8px 12px 10px;
  box-shadow: none;
}

/* Recharts clips a Line's dots to the plot area; our dot layer renders as a
   direct chart child (outside that group), so let the SVG overflow visibly. */
.run-map-chart-wrap .recharts-wrapper,
.run-map-chart-wrap .recharts-surface {
  overflow: visible;
}

.run-map-dot-layer g {
  outline: none;
}

.run-map-dot-layer g:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 1px;
  border-radius: 4px;
}

.map-chart-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding: 8px 8px 0;
  gap: 12px;
}

.map-chart-title {
  grid-column: 2;
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.map-chart-legend {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.map-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--sans);
  font-size: 9px;
  color: var(--muted);
}

@media (max-width: 760px) {
  .map-chart-header {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .map-chart-title,
  .map-chart-legend {
    grid-column: 1;
    justify-self: start;
    text-align: left;
  }

  .map-chart-title {
    font-size: 14px;
  }

  .map-chart-legend {
    flex-wrap: wrap;
    gap: 8px 12px;
  }
}

.map-chart-diagnostic {
  min-height: 340px;
  display: grid;
  place-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  font-family: var(--sans);
  color: var(--muted);
}

.map-chart-diagnostic span:first-child {
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 600;
}

.map-chart-diagnostic span:last-child {
  max-width: 320px;
  font-size: 12px;
  line-height: 1.45;
}

.map-tooltip {
  background: var(--paper-bg);
  border: 1px solid var(--rule);
  border-radius: 5px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 2px 8px rgba(22, 24, 29, 0.08);
}

.map-tooltip-title {
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 600;
  color: var(--ink);
}

.map-tooltip-state {
  font-family: var(--sans);
  font-size: 9px;
  color: var(--muted);
}

.map-tooltip-metric {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
}

/* ── Node detail sidebar ────────────────────────────────────────────────── */

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}

.node-sidebar {
  position: fixed;
  top: 48px;
  right: 0;
  width: 320px;
  height: calc(100vh - 48px);
  background: var(--paper-bg);
  border-left: 1px solid var(--rule);
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 20;
  padding: 24px;
  font-family: var(--sans);
  box-shadow: -6px 0 24px rgba(22, 24, 29, 0.07);
}

.node-sidebar-open {
  transform: translateX(0);
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.sidebar-kind {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.sidebar-kind.tone-good    { color: var(--accent); }
.sidebar-kind.tone-warning { color: var(--accent-2); }
.sidebar-kind.tone-bad     { color: var(--bad); }

.sidebar-close {
  background: none;
  border: 1px solid var(--rule);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 16px;
  line-height: 1;
  padding: 3px 7px;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}

.sidebar-close:hover {
  border-color: color-mix(in srgb, var(--ink) 40%, var(--rule));
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  color: var(--ink);
}

.sidebar-close:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.sidebar-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.22;
  color: var(--ink);
}

.sidebar-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-soft);
}

.sidebar-body {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-soft);
  border-top: 1px solid var(--rule-soft);
  padding-top: 12px;
}

.sidebar-facts {
  margin: 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--rule-soft);
  padding-top: 16px;
}

.sidebar-fact {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.sidebar-fact dt {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  flex-shrink: 0;
}

.sidebar-fact dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  text-align: right;
}

.sidebar-fact.tone-good dd    { color: var(--accent); }
.sidebar-fact.tone-warning dd { color: var(--accent-2); }
.sidebar-fact.tone-bad dd     { color: var(--bad); }

.sidebar-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--rule-soft);
}

.sidebar-ref {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--muted);
  border: 1px solid var(--rule-soft);
  border-radius: 3px;
  padding: 3px 6px;
  transition: border-color 120ms ease, color 120ms ease;
}

.sidebar-ref:hover {
  border-color: color-mix(in srgb, var(--ink) 22%, var(--rule));
  color: var(--ink-soft);
}

/* ── Debug/storybook components (StatusStrip, VerificationPanel, etc.) ── */

.live-status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0 0 36px;
  border: 1px solid var(--rule);
  background: var(--rule);
  font-family: var(--sans);
}

.live-status-strip > div {
  background: var(--paper-bg);
  padding: 16px;
}

.status-eyebrow {
  display: block;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.debug-briefing-card {
  background: white;
  border: 1px solid var(--rule);
  border-left: 4px solid var(--accent);
  padding: 18px;
  font-family: var(--sans);
}

.debug-briefing-card.assessment-watch  { border-left-color: var(--accent-2); }
.debug-briefing-card.assessment-blocked { border-left-color: var(--bad); }
.debug-briefing-card.assessment-complete { border-left-color: var(--accent); }

.debug-briefing-head h3 {
  margin: 4px 0 0;
  font-size: 18px;
  letter-spacing: 0;
}

.debug-briefing-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.debug-briefing-meta span {
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
  padding: 4px 8px;
  text-transform: capitalize;
}

.debug-briefing-headline {
  margin: 14px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-soft);
}

.debug-briefing-blocks {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.debug-briefing-byline {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--muted);
}

.tone-good strong, .verify-ok .verify-mark  { color: var(--accent); }
.tone-warning strong, .verify-blocked .verify-mark { color: var(--accent-2); }
.tone-bad strong { color: var(--bad); }

.metric-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 24px;
}

.verify-list, .live-activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.verify-list li {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--rule-soft);
  font-family: var(--sans);
}

.verify-list p, .blocking-list {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.blocking-list { padding-left: 18px; }

.verify-mark {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.latest-report {
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  padding: 22px 0;
}

.latest-report h3, .activity-body h3 {
  margin: 0;
  font-family: var(--sans);
  font-size: 17px;
}

.markdown-text p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 12px 0 0;
}

.markdown-compact p {
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-soft);
}

.live-activity-list { border-top: 1px solid var(--rule); }

.activity-item {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 22px;
  padding: 18px 0;
  border-bottom: 1px solid var(--rule-soft);
}

.activity-stem {
  font-family: var(--sans);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.activity-meta {
  margin: 5px 0 0;
  color: var(--muted);
  font-family: var(--sans);
  font-size: 12px;
}

/* ── Mobile ─────────────────────────────────────────────────────────────── */

@media (max-width: 680px) {
  .live-topbar {
    padding: 0 18px;
    gap: 8px;
  }

  .topbar-project-name {
    display: none;
  }

  .live-article {
    padding: 36px 24px 72px;
  }

  .brief-title {
    font-size: 26px;
  }

  .brief-lede {
    font-size: 15px;
  }

  .project-index-item {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 10px;
  }

  .project-index-status {
    justify-self: start;
  }

  .signal-dateline {
    flex-wrap: wrap;
  }

  .signal-datum {
    flex: 1 1 calc(50% - 10px);
    min-width: 120px;
    padding: 10px 12px 10px 12px;
  }

  .signal-datum:first-child {
    padding-left: 0;
  }

  .signal-datum:nth-child(even) {
    border-right: 0;
  }

  .node-sidebar {
    width: 100%;
    top: auto;
    bottom: 0;
    height: 60vh;
    transform: translateY(100%);
    border-left: none;
    border-top: 1px solid var(--rule);
    box-shadow: 0 -6px 24px rgba(22, 24, 29, 0.07);
  }

  .node-sidebar-open {
    transform: translateY(0);
  }

  .activity-item, .verify-list li {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
`;

// ── Router and entry point ────────────────────────────────────────────────────

function ClientRouteRoot() {
  return <Outlet />;
}

function ProjectIndexRoute() {
  const navigate = useNavigate();
  const navigateToProject = useCallback(
    (projectId: string): void => {
      void navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    [navigate],
  );

  return <ProjectIndexApp navigateToProject={navigateToProject} />;
}

function ProjectRoute() {
  const { projectId } = projectRoute.useParams();
  return <ProjectOverviewRoute requestedProjectId={projectId} />;
}

function ProjectOverviewRoute(props: { readonly requestedProjectId?: string }) {
  const navigate = useNavigate();
  const navigateToProject = useCallback(
    (projectId: string | undefined): void => {
      void navigate(
        projectId === undefined
          ? { to: "/" }
          : { to: "/projects/$projectId", params: { projectId } },
      );
    },
    [navigate],
  );

  return (
    <ProjectOverviewApp
      requestedProjectId={props.requestedProjectId}
      navigateToProject={navigateToProject}
    />
  );
}

const rootRoute = createRootRoute({
  component: ClientRouteRoot,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectIndexRoute,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = typeof document === "undefined" ? null : document.getElementById("root");

if (rootElement !== null) {
  createRoot(rootElement).render(
    <ReplicacheProvider>
      <RouterProvider router={router} />
    </ReplicacheProvider>,
  );
}

---
status: active
category: feature
created: 2026-05-20
---

# 0101. Feature: Live Briefings Primitive

## Context

ADR 0100 makes the local web UI an evolving report over ordinary Situ records.
That is useful, but raw timelines, task lists, and every intermediate record can
still force the human to reconstruct the run themselves.

Autonomous research systems such as Sakana AI Scientist-v2 and Karpathy's
autoresearch show a common loop: propose, run, measure, compare, and preserve
evidence. The user-facing problem is different from the agent-facing record
problem. Humans need a compact answer to "is this going well?" as the loop
evolves, not a wall of internal artifacts.

Reports remain durable written outputs. They are appropriate for checkpoints and
final synthesis, but they are too heavyweight as the only mechanism for a live
presentation layer that changes frequently during a run.

## Decision

Situ has a `briefings` product primitive. A briefing is an append-only,
agent-authored presentation record for one project. It is the live UI's primary
story layer.

Agents and humans create briefing records through the CLI or app action layer.
Each new record replaces the previous visible briefing for that project in the
live UI. Older records remain inspectable history.

The browser UI is still read-only. It does not generate, mutate, schedule, or
refresh briefing content by itself. The agent that understands the current run
is responsible for publishing better briefing records as the run evolves.

## Data Contract

The common id and target-kind contracts include `briefing`:

```ts
type IdPrefix = "...existing..." | "briefing";
type TargetKind = IdPrefix;
type BriefingId = SituId<"briefing">;
```

`@situ/briefings` owns the briefing package:

```ts
type BriefingStage =
  | "orienting"
  | "baselining"
  | "exploring"
  | "evaluating"
  | "synthesizing"
  | "finalizing"
  | "complete"
  | "blocked";

type BriefingAssessment = "on_track" | "watch" | "blocked" | "complete";

type BriefingBlock =
  | {
      readonly type: "status";
      readonly summaryMarkdown: string;
      readonly reasons?: readonly string[];
      readonly refs?: readonly TargetRef[];
    }
  | {
      readonly type: "callout";
      readonly tone: "note" | "warning" | "finding";
      readonly bodyMarkdown: string;
      readonly refs?: readonly TargetRef[];
    }
  | {
      readonly type: "progress";
      readonly metricName?: string;
      readonly highlightExperimentIds?: readonly SituId<"experiment">[];
    }
  | {
      readonly type: "outcomes";
      readonly experimentIds?: readonly SituId<"experiment">[];
    }
  | {
      readonly type: "evidence";
      readonly experimentIds?: readonly SituId<"experiment">[];
    }
  | {
      readonly type: "recent_update";
      readonly bodyMarkdown: string;
      readonly refs?: readonly TargetRef[];
    }
  | {
      readonly type: "next_steps";
      readonly items: readonly {
        readonly text: string;
        readonly refs?: readonly TargetRef[];
      }[];
    };

type BriefingRecord = {
  readonly id: SituId<"briefing">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly stage: BriefingStage;
  readonly assessment: BriefingAssessment;
  readonly headlineMarkdown: string;
  readonly blocks: readonly BriefingBlock[];
  readonly evidenceRefs: readonly TargetRef[];
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Briefing content is structured JSON, not raw HTML, JavaScript, or MDX. Markdown
fields are rendered through the same conservative Markdown display path used by
the live report UI.

The SQLite table is:

```sql
CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  assessment TEXT NOT NULL,
  headline_markdown TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

The package exposes repository methods for `create`, `getById`, `listAll`,
`listForProject`, and `listRecent`. There is no update or delete method.

## CLI Contract

The CLI exposes:

```text
situ briefings create [flags]
situ briefings list --project-id <project-id>
situ briefings recent [--limit <n>]
situ briefings get <briefing-id>
```

`create` requires:

```text
--project-id <project-id>
--title <title>
--stage <orienting|baselining|exploring|evaluating|synthesizing|finalizing|complete|blocked>
--assessment <on_track|watch|blocked|complete>
--headline <markdown>
--authored-by-kind <human|local_agent|system>
--authored-by-id <id>
```

Optional flags are:

```text
--id <briefing-id>
--block-json <json>
--blocks-json <json-array>
--evidence-refs-json <json-array>
--authored-by-display-name <name>
--now <iso-timestamp>
```

`--block-json` may be repeated and appends one block each time.
`--blocks-json` accepts the complete block array. The flags cannot be combined.
The evidence refs JSON value is an array of `TargetRef` objects.

## Live UI Contract

Replicache pull includes `briefings/<briefing-id>` records after reports and
before low-level activity records.

The live project model selects the newest briefing for the current project by
`createdAt DESC, id DESC`. If a project has a briefing, the live UI renders it
above the latest report body as the current narrative. If a project has no
briefing, the UI falls back to ADR 0100 behavior.

The briefing area has a stable layout and a visual replacement affordance when
the selected briefing id changes. The old text can fade or slide away and the
new text can fade, stream, or type into place, but this is purely presentation.
The durable state remains the append-only briefing record.

The UI keeps the system-derived status and verification summary visible near the
authored briefing. The briefing tells the story; the derived indicators act as
guardrails against a misleading authored summary.

## Boundaries

This ADR does not add:

- browser writes or Replicache mutators
- agent runtime, subagent ownership, scheduling, heartbeats, or queues
- raw HTML, script execution, MDX editing, or arbitrary component authoring from
  briefing records
- report finalization or report approval
- normal task, session, worker, or project-management pages

Briefings are presentation records. They do not replace tasks, experiments,
measurements, reviews, artifacts, events, comments, notifications, or reports.

## Tests

Expected evidence:

- ADR validation passes
- `@situ/briefings` package tests cover schema exports, record normalization,
  validation, persistence, project filtering, recency ordering, duplicate ids,
  and missing parent projects
- app action-context tests cover the briefing repository bundle
- CLI tests cover create, list, recent, get, and syntax errors
- Replicache pull tests include `briefings/<id>` records in the reset patch
- live UI model tests cover latest briefing selection, project filtering, and
  activity ordering
- browser bundle build still succeeds
- `mise run check` passes before this slice is complete

## Consequences

The live browser experience can feel authored and calm without hiding the
underlying Situ record graph. Agents get a small structured surface for
communicating directly with the human, and reports can remain durable checkpoint
or final outputs instead of carrying every transient UI update.

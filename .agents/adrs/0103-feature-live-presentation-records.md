---
status: active
category: feature
created: 2026-05-20
---

# 0103. Feature: Live Presentation Records

## Context

ADR 0100 makes the local browser UI a read-only live report view. ADR 0101 adds
briefings as the authored story layer. The first live UI proved that simply
rendering every derived report section still makes the human reconstruct too
much of the run from status checks, record ids, activity streams, and appendices.

The normal local UI should be denser and more opinionated. It should answer "is
this going well?" in one screen, while keeping raw records available through
debugging tools and generated reports.

## Decision

Situ has a `live` primitive package for append-only live presentation records.
These records let agents update the normal browser presentation independently
without authoring arbitrary HTML, MDX, React components, or a DOM tree.

The package lives at:

```text
projects/app/packages/live/
```

The normal browser entry points remain:

```text
GET /
GET /projects/<project-id>
GET /projects/<project-id>/
```

There is no `/live` normal route.

The normal live UI renders a compact live surface:

1. project header and sync/project selection chrome
2. a small signal strip
3. the current authored briefing
4. an interactive run map
5. node details on demand through a popover-style selected-node view

The normal view does not render a table of contents, raw activity feed, raw
verification checklist, full outcomes table, evidence section, report section,
or appendix. Those remain appropriate for generated reports, Storybook/debug
stories, or future explicit debug routes.

## Data Contract

The common id and target-kind contracts include:

```ts
type IdPrefix =
  | "...existing..."
  | "live_signal"
  | "live_node"
  | "live_edge"
  | "live_focus"
  | "live_detail";
```

The shared live enums are:

```ts
type LiveTone = "neutral" | "good" | "watch" | "blocked" | "done";
type LiveVisibility = "visible" | "hidden";
```

`LiveSignalRecord` is a top-level fact for the signal strip:

```ts
type LiveSignalRecord = {
  readonly id: SituId<"live_signal">;
  readonly projectId: SituId<"project">;
  readonly slot: string;
  readonly label: string;
  readonly value: string;
  readonly summary?: string;
  readonly tone: LiveTone;
  readonly refs: readonly TargetRef[];
  readonly visibility: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

`LiveMapNodeRecord` is one meaningful story object in the run map:

```ts
type LiveMapNodeKind =
  | "baseline"
  | "branch"
  | "verification"
  | "finding"
  | "blocker"
  | "decision"
  | "result";

type LiveMapNodeRecord = {
  readonly id: SituId<"live_node">;
  readonly projectId: SituId<"project">;
  readonly nodeKey: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly occurredAt?: IsoTimestamp;
  readonly refs: readonly TargetRef[];
  readonly visibility: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

`LiveMapEdgeRecord` connects story nodes:

```ts
type LiveMapEdgeRelation = "led_to" | "depends_on" | "blocked_by" | "supersedes" | "verifies";

type LiveMapEdgeRecord = {
  readonly id: SituId<"live_edge">;
  readonly projectId: SituId<"project">;
  readonly edgeKey: string;
  readonly fromNodeKey: string;
  readonly toNodeKey: string;
  readonly relation: LiveMapEdgeRelation;
  readonly tone: Exclude<LiveTone, "done">;
  readonly visibility: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

`LiveFocusRecord` tells the UI what to emphasize:

```ts
type LiveFocusMode = "overview" | "node" | "comparison" | "blocked";

type LiveFocusRecord = {
  readonly id: SituId<"live_focus">;
  readonly projectId: SituId<"project">;
  readonly mode: LiveFocusMode;
  readonly primaryNodeKey?: string;
  readonly relatedNodeKeys: readonly string[];
  readonly summary?: string;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

`LiveNodeDetailRecord` is the on-demand detail payload for one node:

```ts
type LiveNodeFact = {
  readonly label: string;
  readonly value: string;
  readonly tone?: LiveTone;
};

type LiveNodeDetailRecord = {
  readonly id: SituId<"live_detail">;
  readonly projectId: SituId<"project">;
  readonly nodeKey: string;
  readonly bodyMarkdown: string;
  readonly facts: readonly LiveNodeFact[];
  readonly refs: readonly TargetRef[];
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

All live presentation records are append-only. The current visible state is
derived by taking the newest record for each key:

- signal: newest by `(projectId, slot)`
- node: newest by `(projectId, nodeKey)`
- edge: newest by `(projectId, edgeKey)`
- detail: newest by `(projectId, nodeKey)`
- focus: newest by `projectId`

Records with `visibility: "hidden"` remove that key from the normal current
view. Historical rows remain inspectable through repository and CLI reads.

## Schema

The `@situ/live` package owns five SQLite tables:

```text
live_signals
live_map_nodes
live_map_edges
live_focuses
live_node_details
```

Each table has an `id` primary key, `project_id` foreign key, authored-by
columns, and `created_at` / `updated_at` timestamps. JSON columns store target
refs, node detail facts, and related focus node keys.

## CLI Contract

The CLI exposes:

```text
situ live signals set [flags]
situ live nodes set [flags]
situ live edges set [flags]
situ live focus set [flags]
situ live details set [flags]
situ live list --project-id <project-id>
```

All write-shaped commands create a new append-only live record. They do not
update prior rows.

Every set command requires:

```text
--project-id <project-id>
--authored-by-kind <human|local_agent|system>
--authored-by-id <id>
```

Optional shared flags are:

```text
--id <record-id>
--authored-by-display-name <name>
--now <iso-timestamp>
```

Signals additionally require `--slot`, `--label`, `--value`, and `--tone`.
Nodes additionally require `--node-key`, `--kind`, `--title`, `--summary`, and
`--tone`. Edges additionally require `--edge-key`, `--from-node-key`,
`--to-node-key`, `--relation`, and `--tone`. Focus additionally requires
`--mode`. Details additionally require `--node-key` and `--body`.

Target refs, related node keys, and facts are passed as JSON arrays:

```text
--refs-json <json-array>
--related-node-keys-json <json-array>
--facts-json <json-array>
```

## Replicache Contract

Replicache pull includes live presentation rows after briefings and before
comments/events/notifications:

```text
live-signals/<id>
live-map-nodes/<id>
live-map-edges/<id>
live-focuses/<id>
live-node-details/<id>
```

The pull route remains reset-style: a `clear` operation followed by `put`
operations that rebuild the client view. Pull continues to read records and
client mutation state in one SQLite transaction.

The browser UI keeps an empty mutator set. Agents update the live UI through
CLI/app records, not through browser writes.

## UI Contract

The live UI derives a `LivePresentationModel` from the Replicache records for
the selected project:

```ts
type LivePresentationModel = {
  readonly signals: readonly CurrentLiveSignal[];
  readonly map: {
    readonly nodes: readonly CurrentLiveNode[];
    readonly edges: readonly CurrentLiveEdge[];
    readonly focus?: CurrentLiveFocus;
    readonly detailsByNodeKey: ReadonlyMap<string, LiveNodeDetailRecord>;
  };
};
```

If no live signals exist for a project, the UI may derive a small fallback
signal strip from the latest briefing, primary metric, run status, and
verification summary. If no live map nodes exist, the run map renders an empty
state that asks the agent to publish live nodes.

The UI must not show raw ids, repository paths, full verification rows, or
activity streams in the first-level normal view. Node details may show target
refs because the user explicitly asked for details by selecting a node.

## Boundaries

This ADR does not add:

- browser write mutators
- arbitrary HTML, JavaScript, MDX, or component authoring by agents
- task/session/worker/scheduler runtime state
- a `/live` route
- report editing or approval
- incremental Replicache cookies
- deletion or update APIs for live records

## Tests

Expected evidence:

- ADR validation passes
- `@situ/live` package tests cover schema exports, record normalization,
  validation, persistence, project filtering, recency ordering, duplicate ids,
  and missing parent projects
- app action-context tests cover the live repository bundle
- CLI tests cover each `situ live ... set` command and `situ live list`
- Replicache pull tests include live presentation rows in the reset patch
- live UI model tests cover current-state derivation by key, hidden records,
  fallback signals, and selected focus
- Storybook stories show on-track, watch, blocked, complete, no-live-map, and
  variant states
- app Storybook static build succeeds
- `mise run check` passes before this slice is considered complete

## Consequences

Agents get a small, semantic presentation surface that can evolve live without
turning the UI into a raw record browser. Humans see a concise authored
interpretation with progressive details on demand. Generated reports remain the
place for expansive evidence, outcomes, and final synthesis.

---
status: active
category: feature
created: 2026-05-17
---

# 0097. Feature: MDX-Authored Research Reports

## Context

ADR 0096 introduced a separate "auto-derived" HTML renderer
(`projects/app/src/reports/visual.ts`) that took a snapshot and produced HTML
directly through bespoke string templates and inline SVG. That parallel
renderer is now removed. The HTML report has one rendering layer:
`@situ/reports-ui` components, SSR'd through `react-dom/server`.

The same component layer is driven two ways:

- **Standard report.** When no MDX has been submitted, the system composes
  the React tree directly from the snapshot via
  `composeReportTree(snapshot, generatedAt?)` in
  `projects/app/src/reports/default-report.tsx`.
- **Authored report.** When the manager runs `situ reports submit`, the
  submitted MDX source is stored as the `bodyMarkdown` of a
  `ReportRecord`. The MDX is compiled through `@mdx-js/mdx` + the
  `@situ/reports-ui` component registry, with the validator enforcing that
  every numeric claim, id reference, and required section is grounded in
  the snapshot.

Both paths produce the same single self-contained HTML document with the
same embedded CSS and the same OFL-licensed fonts. There is no auto-derived
versus authored split in the renderer; the only difference is which
function builds the React tree (`composeReportTree` for the standard
path, `compileMdxReport` for the authored path).

## Decision

`@situ/reports-ui` is the single rendering layer for HTML reports.

```text
projects/app/packages/reports-ui/
  src/
    components/       # React components, SSR'd to static HTML
    fonts/            # OFL fonts bundled and base64-embedded at compile time
    styles/           # Shared editorial CSS (single source of truth)
    fixtures/         # Storybook + test data
    index.ts
  .storybook/
  stories/
  tests/

projects/app/src/reports/
  collection.ts       # Snapshot collection (unchanged)
  render.ts           # Markdown rendering (unchanged)
  default-report.tsx  # composeReportTree: snapshot → React tree
  narratives.ts       # Prose composers (lede, abstract, captions)
  mdx/
    compile.ts        # MDX → HTML via @mdx-js/mdx + components
    components.ts     # MDX tag → component registry
    fonts.ts          # Bundles reports-ui fonts as @font-face
    instructions.ts   # snapshot → author brief + MDX scaffold
    validate.ts       # MDX AST → snapshot grounding checks
    submit.ts         # Author flow: validate + compile + record + artifact
  index.ts            # Public entry points: render/generate Markdown + HTML
```

`visual.ts` from ADR 0096 is removed. The CSS, the SVG figure code, and the
section structure all live in `@situ/reports-ui`.

The package name is `@situ/reports-ui` because `@situ/reports` is taken by
the existing primitive package that owns `ReportRecord`. Renaming the
primitive is not part of this ADR.

## Component Library

`@situ/reports-ui` is an adapter package per ADR 0005. It does not own
product truth. It exposes typed React components that render to HTML
strings via `react-dom/server.renderToStaticMarkup`.

Required components:

- `<ResearchReport>` — page shell. Owns `<head>`, embedded `<style>`, font
  declarations, body container, footer.
- `<Hero>` — masthead. Props: `kicker`, `title`, `lede`, `dateline`.
- `<MetaBlock>` and `<MetaColumn>` — hairline-ruled metadata grid.
- `<ActorList>` — list of `{ displayName, role? }` actor labels.
- `<TableOfContents>` — anchored TOC.
- `<Section>` — numbered section wrapper.
- `<Figure>` — captioned figure wrapper with `kind` controlling spacing.
- `<ProgressChart>` — flagship running-best chart.
- `<SmallMultiples>` — secondary metric grid.
- `<LineageTree>` — branch lineage SVG.
- `<Swimlanes>` — actor parallelism Gantt.
- `<OutcomesTable>` — experiment outcomes table.
- `<MetricCard>` — single-number callout (validated against snapshot).
- `<EvidenceBlock>` — collapsible per-experiment details (validated).
- `<BaselineCard>` — baseline summary block (validated).
- `<AttachmentList>` — comments, events, artifacts, reports attached to
  a record.
- `<Callout>` — pull quote / note (kinds: `note`, `warning`, `finding`).
- `<Definition>` — italicized inline term.
- `<ReportAside>` — sidenote.
- `<Colophon>` — muted footer line.

Components must not import code from outside `@situ/reports-ui`. They may
depend on `@situ/common` for shared id and time types.

The rendered HTML contains no client-side JavaScript and no remote asset
requests. Native `<details>` / `<summary>` provides the only interactive
affordance for collapsing experiment evidence; it works without
JavaScript.

## Storybook

`packages/reports-ui` ships a Storybook config. Each component has stories
that exercise the empty state, a small populated state, and a maximally
populated state. Stories use shared fixtures from `src/fixtures/`.

Storybook is a development tool. It is not deployed automatically, not
shipped in the eval output, and is not part of `mise run check`. Run it
with:

```text
cd projects/app/packages/reports-ui && bun run storybook
```

Storybook dependencies live in `devDependencies` of `packages/reports-ui`
only.

## Fonts

`packages/reports-ui/src/fonts/` ships WOFF2 binaries for:

- Source Serif 4 (variable, SIL OFL)
- Inter (variable, SIL OFL)
- JetBrains Mono (variable, SIL OFL)

These OFL fonts permit redistribution.

The compile pipelines (both `composeReportTree` and MDX authoring) read
these binaries at compile time, base64-encode them, and emit a single
`<style>` block with `@font-face` declarations using
`data:font/woff2;base64,...` URIs. The compiled HTML makes zero font
requests at view time.

Bundled fonts add roughly 250–400 KB to each compiled report. That cost is
explicitly accepted in exchange for cross-machine typographic fidelity,
since the report is the durable artifact of a real research run.

## Standard Report Path

`composeReportTree({ snapshot, generatedAt? })` in
`projects/app/src/reports/default-report.tsx` is the only function that
builds the standard React tree from a snapshot.

It owns:

- the section ordering (masthead, flagship figure, metadata, contents,
  abstract, goal, progress, lineage, parallelism, outcomes, evidence,
  appendix, colophon)
- primary-metric selection (delegated to `deriveSnapshotModel` in
  `mdx/snapshot-to-props.ts`)
- lineage detection (delegated to `deriveSnapshotModel`)
- swimlane derivation (delegated to `deriveSnapshotModel`)
- narrative prose composition (delegated to `narratives.ts`)
- empty-state handling (no baseline, no measurements, no synthesis all
  render explicit captions rather than disappearing)

`renderProjectReportHtml({ snapshot, generatedAt? })` in
`projects/app/src/reports/index.ts` is the sync entry: it calls
`composeReportTree` and passes the resulting tree through
`renderReportToHtml` (from `@situ/reports-ui`), returning one self-contained
HTML document.

`generateProjectReportHtml({ context, projectId, generatedAt? })` collects
the snapshot via `collectProjectReportSnapshot` and returns the standard
tree's HTML. It stays synchronous so the existing sync CLI flow continues
to work.

## MDX Compile Pipeline

`projects/app/src/reports/mdx/compile.ts` exposes:

```ts
export type CompileMdxReportInput = {
  readonly mdxSource: string;
  readonly snapshot?: ProjectReportSnapshot;
  readonly generatedAt?: IsoTimestamp;
  readonly embedFonts?: boolean;
};

export type CompileMdxReportResult = {
  readonly html: string;
};

export function compileMdxReport(input: CompileMdxReportInput): Promise<CompileMdxReportResult>;
```

It uses `@mdx-js/mdx`'s `evaluate` to parse and run the MDX with the
component registry from `mdx/components.ts`, then SSRs to a static HTML
string with the same CSS and font block as the standard path.

`compileMdxReport` is async because `@mdx-js/mdx`'s `evaluate` is async.

## Validation

`projects/app/src/reports/mdx/validate.ts` parses the MDX AST via
`unified`/`remark-parse`/`remark-mdx` and checks every component invocation
against the snapshot.

Validation rules:

- Every `<MetricCard value={N} metric="M" source="S" />` must satisfy: a
  measurement with `metricName === "M"` and `numericValue` equal to `N`
  (within 3 decimal places) must exist on either baseline `S` or
  experiment `S`.
- Every `experimentId` prop must refer to an experiment id in the snapshot.
- Every `taskId` prop must refer to a task id in the snapshot.
- Every `baselineId` prop must refer to a baseline id in the snapshot.
- A `<BaselineCard>` for at least one baseline is required when
  `snapshot.baselines.length > 0`.
- An `<EvidenceBlock>` is required for every experiment in `accepted`,
  `rejected`, or `abandoned` status.
- No raw `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, or
  `<style>` elements in MDX source (the compile pipeline owns the
  document-level `<style>` block).
- No HTTP / HTTPS URLs in any string prop.
- `<ResearchReport>` must wrap the document.

Numeric claims that appear in prose (not as component props) are not
validated. The LLM judge catches misclaims in prose; validating prose
numbers would be brittle.

Validation errors are blocking; `reports submit` exits non-zero with a
structured error report. Warnings are non-blocking and surface to stdout.

## CLI Surface

`situ reports` gains three subcommands.

### `situ reports instructions`

```text
situ reports instructions --project-id <project-id> [--out <directory>]
```

Reads the snapshot for the project, writes two files to the output
directory:

- `instructions.md` — Markdown brief for the manager agent. Lists
  available components with their TypeScript prop signatures, snapshot
  summary, what must not be omitted per the validation rules, a worked
  example, and the path the agent should write their draft to.
- `draft.mdx` — starter MDX scaffold that imports the components, places
  the `<ResearchReport>` wrapper, and includes commented placeholders for
  each required section.

Default output directory is `$SITU_REPORT_DRAFT_DIR/<project-id>/`,
falling back to `$SITU_HOME/drafts/<project-id>/` when unset.

JSON output mode returns `{ projectId, instructionsPath, draftPath }`.

### `situ reports preview`

```text
situ reports preview --draft <mdx-path> --project-id <project-id> \
  [--out <html-path>] [--generated-at <iso-timestamp>] [--no-embed-fonts]
```

Compiles the MDX draft against the project snapshot and writes the
resulting HTML next to the draft as `draft.preview.html` (or to the
supplied `--out` path). Validation warnings are surfaced; errors block.
Prints the HTML path on stdout. Creates no records.

### `situ reports submit`

```text
situ reports submit --project-id <project-id> --draft <mdx-path> \
  --title <title> \
  --generated-by-kind <kind> --generated-by-id <id> \
  [--generated-by-display-name <name>] [--out <html>] [--generated-at <iso>]
```

Validates the MDX draft against the snapshot. On failure, prints the
structured error and exits non-zero; no records are written.

On success:

1. Compiles the MDX to HTML.
2. Creates one `ReportRecord` whose `bodyMarkdown` is the MDX source,
   `target` is the project, and `generatedBy` is the submitting actor.
3. Creates one `ArtifactRecord` attached to that report with
   `mediaType: "text/html"` and a `uri` pointing at the compiled HTML on
   disk.

ADR 0024's append-only rule for reports continues to hold: submit creates
exactly one new report and one new artifact, never modifies existing
records.

### `situ reports generate --format html`

Returns the standard report HTML composed from the snapshot. Stays
synchronous so the existing CLI surface continues to work.

Authored reports submitted via `reports submit` are accessed through
their attached artifact's `uri` (a path to the compiled HTML on disk).
Preferring an authored report at the `generate --format html` entry
point is deferred until the CLI surface is refactored to be async — see
Follow-ups below.

## Eval Harness Contract

Terminal autoresearch evals capture a generated report after the root
manager run finishes.

The harness runs:

```text
situ reports generate --project-id <project-id> --format html --generated-at <iso-timestamp>
```

and writes the output to `$SITU_RUN_OUTPUT_DIR/SITU_REPORT.html`. With the
synchronous `generate` entry, this always returns the standard tree HTML.
A manager that authors a custom report via `reports submit` produces its
own HTML artifact alongside the standard report; both are captured as
eval evidence (the standard via `SITU_REPORT.html`, the authored via the
artifact's URI).

## Stable Output Surface

Renderer tests assert on the structural surface that does not change with
visual tweaks:

- one trailing newline and `<!doctype html>` opening
- absence of `<script>`, `javascript:`, `http://`, and `https://`
- presence of section ids (`masthead`, `figure-progress`, `metadata`,
  `abstract`, `goal`, `progress`, `lineage`, `parallelism`, `outcomes`,
  `evidence`, `appendix`, `colophon`)
- presence of stable structural elements: a `<figure class="hero-figure">`
  for the flagship progress chart with a `<figcaption>` starting with
  `Figure 1.`, a `<figure class="lineage-figure">` for the lineage diagram,
  a `<figure class="swimlane-figure">` for the swimlanes, and a
  `<table class="outcomes-table">` for outcomes
- presence of record-derived strings: project name, baseline title, metric
  names, experiment titles, branch names, worktree paths, actor display
  names, generated timestamp when supplied
- HTML escaping of user-supplied strings, including angle brackets and
  script-like content
- empty-project rendering: report still renders, contains masthead and
  colophon, marks empty sections explicitly

These assertions hold across visual tweaks so the visual idiom can keep
improving without churn in test surface.

## Tests

Expected evidence:

- per-component render tests in `packages/reports-ui/tests/` covering
  structural HTML invariants and escape behavior
- per-component stories covering at minimum the empty, small, and full
  populated states
- MDX compile tests in `src/reports/mdx/`: compile a fixture MDX against
  a fixture snapshot, assert HTML contains the expected component output,
  one trailing newline, no remote URLs
- validator tests: each rule has a passing and failing fixture; failing
  fixtures produce the documented error code; warnings vs. errors are
  classified correctly
- instructions tests: brief and scaffold are generated, scaffold compiles
  cleanly against the snapshot, validator passes
- submit tests: a valid draft creates exactly one report record and one
  artifact record; an invalid draft creates nothing and throws
  `ValidationError`
- standard tree tests in `src/reports/index.test.ts`: HTML rendering
  produces the stable section anchors, figure captions, and required
  structural elements; empty projects render the static frame; HTML
  escaping holds; generation does not create product records
- CLI tests for the existing `reports generate` flow keep asserting on
  the structural surface
- eval harness tests assert the post-run visual report is still captured
  as `SITU_REPORT.html`

## Follow-ups

The following items are intentionally not in this ADR:

- **CLI async refactor.** Making `runSituCli` async-aware unblocks two
  things: `reports preview` and `reports submit` working through the CLI
  (their `compileMdxReport` and `submitMdxReport` calls are async), and
  `reports generate --format html` preferring the latest submitted
  authored report when one exists. The current `waitForPromise` shim in
  `cli/commands/reports.ts` does not pump microtasks under `Bun.sleepSync`
  and must be replaced with a real async call chain.
- **Recompile-on-read for authored reports.** Once the CLI is async,
  `generate --format html` recompiles the latest authored MDX rather than
  reading the stored HTML artifact, so component or CSS changes in
  `@situ/reports-ui` automatically flow into the rendered authored
  report.

## Boundaries

This ADR does not add:

- client-side JavaScript in compiled reports
- PDF export, screenshot export, or browser rendering at view time
- a hosted Storybook deployment pipeline
- a web UI for editing MDX drafts
- multi-version draft history (draft files live on disk; submission is
  the versioning mechanism via append-only `ReportRecord`)
- automatic numeric reconciliation between MDX and snapshot (validator
  detects mismatch but does not silently fix it)
- a separate top-level `packages/` directory at the repo root (per ADR
  0005 the workspace lives under `projects/`)
- a rewrite of the existing `@situ/reports` primitive
- interactive widgets, sliders, embedded demos

This ADR does not allow:

- raw HTML elements in MDX that the registry does not own
- imports in MDX from outside the registered component set
- the validator silently coercing numeric mismatches
- a second parallel renderer alongside `composeReportTree` and
  `compileMdxReport`

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
bun test projects/app/packages/reports-ui
bun test projects/app/src/reports
bun test projects/app/src/cli
bun test projects/evals/src/harness
cd projects/app/packages/reports-ui && bun run storybook:build
bun x tsgo --noEmit -p tsconfig.json
mise run check
mise run coverage
```

Storybook build is included to catch story regressions early. It is not
part of `mise run check` because Storybook is a development tool.

## Consequences

There is one rendering layer for HTML reports: `@situ/reports-ui`
components composed by either `composeReportTree` (from a snapshot) or
`compileMdxReport` (from an agent-authored MDX source). The auto-derived
versus authored split has been collapsed; both paths share components,
CSS, fonts, and SSR pipeline.

Manager agents now have a clear authoring path: read the brief from
`reports instructions`, edit MDX with full component access, preview via
`reports preview`, submit via `reports submit`. The validator keeps every
numeric claim and id reference grounded in real records, so authored
reports cannot drift from the data.

Roughly five new runtime dependencies entered the workspace as part of
this work (React, React-DOM, `@mdx-js/mdx`, `remark-mdx`, `remark-parse`,
`unified`, `unist-util-visit`, the `@fontsource-variable/*` font packages).
Storybook adds a dev dependency cluster in one package only. The compiled
report stays one self-contained HTML file with no network requests at
view time.

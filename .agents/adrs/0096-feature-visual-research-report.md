---
status: deprecated
category: feature
created: 2026-05-16
---

# 0096. Feature: Visual Research Report

> **Deprecated.** Superseded by ADR 0097, which makes `@situ/reports-ui`
> components the single rendering layer for HTML reports and removes the
> separate "auto-derived" renderer this ADR introduced. The snapshot
> collection rules, primary-metric selection rule, lineage detection rule,
> and section structure described below remain accurate but are now
> implemented through the component composition path described in ADR 0097
> (see `projects/app/src/reports/default-report.tsx` and the
> `composeReportTree` entry point). Do not implement new renderers against
> this ADR; extend ADR 0097 instead.

## Context

ADR 0039 defines deterministic project report generation over visible situ
records. ADR 0040 exposes that generated Markdown through
`situ reports generate`. ADR 0091 says long-running autoresearch managers should
leave final reports that explain the run to a human.

Autoresearch needs a final artifact that reads like a short research write-up,
not a product status dashboard. A human or LLM judge looking at a finished run
should be able to scan: what was tried, what the headline result is, how the
candidate lineage led to it, and what evidence supports the call. The visual
report is the artifact that answers those questions in one self-contained file.

This ADR retargets the HTML report to a research-paper visual idiom: a quiet
editorial layout, a flagship progress chart as the first figure, a branch
lineage diagram, an actor-parallelism diagram, and a captioned evidence tail.
The previous dashboard treatment (dark hero, summary tile grid, per-measurement
bar lists) is replaced.

## Decision

`projects/app/src/reports/` supports two generated project report formats:

- `markdown`
- `html`

Markdown remains the default format. HTML is a standalone, editorial-style
research report rendered from the same `ProjectReportSnapshot`.

The HTML report is deterministic, static, and self-contained:

- one complete HTML document
- embedded CSS, no external stylesheet
- inline SVG figures, no charting library, no raster images
- no JavaScript
- no remote fonts, images, scripts, stylesheets, or assets
- no database reads inside the renderer
- no report record creation unless the caller separately runs
  `situ reports create`

The visual report must remain useful when the run is partial. It should make
absence visible (no baseline yet, no measurements yet, no synthesis yet, etc.)
instead of hiding missing records or fabricating values. Empty states render
as captioned figures or short prose that explain what is missing, not as
suppressed sections.

## Visual Idiom

The report is single-column, white background, with a transitional serif body
and a sans secondary face. The layout mirrors a research publication: thin
masthead, large display title, italic lede paragraph, a flagship figure with
caption, hairline-separated author/run metadata block, numbered sections, and a
detailed evidence tail.

Required visual constraints:

- single-column body capped at a comfortable reading measure (around 36rem)
- pure white or near-white background
- near-black body text on white
- one transitional serif family used for display headings, lede, and body
  prose; a system sans for nav, captions, tabular metadata, and small labels;
  a monospace family for ids, paths, branch names, commit hashes, and code
- hairline section rules instead of card shadows or filled panels
- captioned figures (`Figure N. ...`) under every SVG and table
- sentence-case headings with leading section numbers
- no card chrome, no rounded panels, no box shadows, no gradients in the
  primary body
- a single small accent hue used to mark the running-best line, accepted
  outcomes, and the synthesis branch; one secondary accent for warnings or
  rejected outcomes; everything else stays in the neutral ink palette

Font selection must use locally available faces only. The CSS lists a
fallback chain (for example `"Source Serif 4", Charter, "Iowan Old Style",
Georgia, Cambria, serif` for the serif and `Inter, "Helvetica Neue",
-apple-system, BlinkMacSystemFont, sans-serif` for the sans) so the report
degrades gracefully on machines without the preferred face. The report does
not embed `@font-face` payloads.

The report uses a fixed light theme. It does not adapt to
`prefers-color-scheme: dark` and does not ship a second theme.

## Report Structure

The HTML report renders these sections in order:

1. **Masthead.** Small kicker reading `Situ research report`, the project
   name as a large serif display headline, an italic lede paragraph composed
   from visible records, and a date/byline line under the lede.
2. **Flagship figure.** A Karpathy-style progress chart over the primary
   metric: experiment ordinal on the X axis, metric value on the Y axis, all
   experiment measurements as scattered points, a stepped "running best" line,
   and inline labels on each kept improvement. The baseline is marked at
   experiment ordinal zero when one exists. The figure is captioned
   `Figure 1.` with a short description of what is plotted, the primary
   metric, the unit, and the "lower is better" or "higher is better"
   direction.
3. **Run metadata block.** Hairline-separated columns describing actors,
   timing, repository, and headline result. Actor entries include role
   markers; an affiliation legend explains the role markers in a smaller
   muted face.
4. **Contents.** A short anchored table of contents listing the named
   sections of the report.
5. **Abstract.** A composed 3 to 5 sentence summary derived from the
   snapshot: baseline value (when present), candidate exploration shape,
   synthesis outcome (when present), protected-data safety signal, and a
   one-line takeaway with the headline delta.
6. **Goal and method.** Project goal Markdown rendered as prose, followed by
   a short note describing the autoresearch shape of the run.
7. **Progress.** A short narrative paragraph plus a small-multiples figure
   for secondary metrics when more than one numeric metric exists. Captioned
   as a numbered figure.
8. **Branch lineage.** A short narrative paragraph plus an SVG lineage
   diagram. The diagram lays out the initial commit, candidate branches as
   siblings, and any follow-up synthesis branch as a child of its selected
   base. Cherry-pick edges are drawn as dashed connectors from the
   synthesis branch back to source candidate branches when the renderer
   detects `cherry picked from commit <sha>` patterns in event,
   measurement, report, or comment summaries attached to the synthesis
   experiment. Captioned as a numbered figure.
9. **Parallel work.** An SVG swimlane diagram with one row per visible
   actor and a normalized time axis. Marks indicate creation, assignment,
   measurement, and review events. Captioned as a numbered figure.
10. **Outcomes.** A compact table of experiments with status, actor, branch,
    baseline-comparable best metric, and delta versus baseline.
11. **Evidence.** Per-task narrative blocks with each experiment's summary,
    measurements, reviews, and attachments. Each experiment block is wrapped
    in a native `<details>` element with `<summary>` showing title and
    status so long reports collapse cleanly without JavaScript.
12. **Appendix.** Baselines in full, project-level attachments, and a
    small record-count table.
13. **Colophon.** A muted single-line footer that names the generator,
    declares the report as static, and (when supplied) prints the
    generation timestamp.

Sections 1 through 13 are stable anchors: their `id` attributes (`masthead`,
`figure-progress`, `metadata`, `contents`, `abstract`, `goal`, `progress`,
`lineage`, `parallelism`, `outcomes`, `evidence`, `appendix`, `colophon`) form
the report's deep-link surface. The contents section links to these anchors.

## Primary Metric Selection

The progress chart picks one numeric metric deterministically:

- candidates are metric names that appear on at least one experiment
  measurement
- when one or more baselines exist, the candidate set is restricted to
  metric names that also appear on at least one baseline measurement
- among candidates, prefer the metric with the most experiment measurements
  in the snapshot
- ties break alphabetically by metric name

When no candidate exists, the flagship figure renders an empty-state caption
that states no comparable metric was recorded yet, while still rendering the
axes and gridlines so the figure footprint stays stable across runs.

Secondary numeric metrics render in a small-multiples figure under the
progress narrative. Non-numeric metrics are not plotted but appear in the
outcomes table when present.

## Lineage Detection

Lineage relationships are derived from the snapshot. The renderer does not
read git or open external files.

- A node exists for the initial commit when at least one experiment has a
  `baseRef`. The initial commit node uses the most common short `baseRef`
  shared across candidate experiments. When candidates do not share a base,
  the initial node label is `Initial state`.
- A node exists for each experiment that has a `branchName`. Nodes carry
  status, actor, and the best baseline-comparable metric when known.
- A parent edge connects each follow-up experiment to the candidate whose
  branch HEAD matches the follow-up's `baseRef`. When no candidate matches,
  the parent edge runs to the initial node.
- Cherry-pick edges are dashed connectors. The renderer extracts commit shas
  from text matching `cherry picked from commit ([0-9a-f]{7,40})` in event
  summaries, measurement summaries, report bodies, and comment bodies
  attached to the synthesis experiment. Each matched sha is attributed to
  the candidate experiment whose attached text mentions the same sha or
  whose branch name appears alongside the sha in the synthesis text. When
  attribution is ambiguous, the cherry-pick edge is omitted rather than
  guessed.

## Parallelism View

The swimlane diagram uses a normalized linear time axis from the earliest
visible record timestamp to the latest visible record timestamp in the
snapshot. One row exists per distinct actor that produced or owns at least
one visible record (project creator, baseline creator, task creator, task
assignee, experiment creator, experiment assignee, measurement actor,
review actor, event actor). Marks are placed at the record timestamp, sized
to suggest event kind (creation, assignment, measurement, review). Rows are
ordered by first-appearance time, then by actor id, so the same actor
ordering is stable for the same snapshot.

## CLI Contract

`situ reports generate` accepts a format flag:

```text
situ reports generate --project-id project_123
situ reports generate --project-id project_123 --format markdown
situ reports generate --project-id project_123 --format html
```

Flags:

```text
--project-id <project-id>
--generated-at <iso-timestamp>
--format <markdown|html>
```

`--format` is optional and defaults to `markdown`.

Text output is the raw generated body:

- Markdown format prints Markdown with one trailing newline.
- HTML format prints a complete HTML document with one trailing newline.

JSON output uses:

```ts
{
  projectId,
  generatedAt,
  format,
  bodyMarkdown, // present only for markdown format
  bodyHtml,     // present only for html format
}
```

`generatedAt` is omitted by `JSON.stringify` when `--generated-at` is absent.

Invalid formats fail command-local validation before opening the database
with:

```text
Unsupported report format: <value>.
```

## Eval Harness Contract

Terminal autoresearch evals capture a generated visual report after the root
manager run finishes.

The harness runs:

```text
situ reports generate --project-id <project-id> --format html --generated-at <iso-timestamp>
```

It writes the output to:

```text
$SITU_RUN_OUTPUT_DIR/SITU_REPORT.html
```

The harness keeps the command result and captured HTML in eval evidence so
LLM judges can inspect whether the run produced a coherent visual summary.
The harness does not create tasks, baselines, experiments, worktrees,
workers, measurements, reviews, or report records while producing this
visual output. Those remain the manager's responsibility.

## Stable Output Surface

Renderer tests should not assert on exact pixel-level CSS values, exact SVG
geometry, or full body snapshots. They may assert on:

- one trailing newline and `<!doctype html>` opening
- absence of `<script>`, `javascript:`, `http://`, and `https://`
- presence of section ids (`masthead`, `abstract`, `progress`, `lineage`,
  `parallelism`, `outcomes`, `evidence`, `appendix`, `colophon`)
- presence of stable structural elements: a `<figure>` for the flagship
  progress chart with a `<figcaption>` starting with `Figure 1.`, a
  `<figure>` for the lineage diagram, a `<figure>` for the swimlane
  diagram, and an `<table>` for outcomes
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

- report rendering tests cover standalone HTML, masthead, progress figure
  presence and caption, lineage figure, swimlane figure, outcomes table,
  evidence blocks, attachments, escaping, missing-baseline empty state,
  missing-measurement empty state, and one trailing newline
- report generation tests prove HTML generation is read-only (record counts
  unchanged) and matches explicit collection plus rendering
- CLI tests cover text HTML output, JSON HTML output, default Markdown
  format, invalid format validation, and no report record creation
- eval harness tests cover post-run visual report generation and artifact
  capture
- `bun scripts/check_adrs.ts`
- focused report, CLI, and eval tests
- `mise run check`

## Boundaries

This ADR does not add PDF export, screenshot export, browser rendering, a
web server, charting libraries, external assets, new report record fields,
hidden workflow orchestration, background workers, leases, or scheduler
behavior.

This ADR does not change the meaning of report records. Durable reports
remain Markdown records. HTML is a generated view over the same visible
situ state.

This ADR does not introduce a second theme, dark mode, print-specific
styles, RTL layout, or per-tenant theming. The report is one canonical
light document.

## Consequences

situ remains primitive-focused. The visual report is not a workflow engine
or a dashboard: it is a polished editorial view over ordinary records.

Managers can keep using Markdown checkpoint reports for durable written
state, while humans and LLM judges can inspect a richer visual artifact
after a run.

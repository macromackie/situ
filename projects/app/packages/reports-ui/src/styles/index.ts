/**
 * Editorial CSS shared by every @situ/reports-ui component. Returned as a
 * string so the MDX compile pipeline and Storybook can each embed it once at
 * the document root.
 */
export const reportBaseCss = `
:root {
  --paper-bg: #fffdf8;
  --ink: #16181d;
  --ink-soft: #3f424a;
  --muted: #6e7280;
  --whisper: #9b9aa0;
  --rule: #e6e3d8;
  --rule-soft: #ece9de;
  --accent: #2b6a47;
  --accent-soft: #eaf2ec;
  --accent-2: #a14e16;
  --accent-2-soft: #fdf2e7;
  --bad: #9c3a2d;
  --bad-soft: #f5ecea;
  --measure: 36rem;
  --serif: "Source Serif 4 Variable", "Source Serif 4", "Source Serif Pro", "Iowan Old Style", "Charter", "Sitka Text", Cambria, Georgia, serif;
  --sans: "Inter Variable", Inter, "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --mono: "JetBrains Mono Variable", "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--paper-bg);
}

body {
  margin: 0;
  padding: 0;
  color: var(--ink);
  background: var(--paper-bg);
  font-family: var(--serif);
  font-size: 17px;
  line-height: 1.62;
  font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--rule);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}

a:hover {
  text-decoration-color: var(--ink);
}

.site-header {
  border-bottom: 1px solid var(--rule);
  background: var(--paper-bg);
}

.site-header-inner {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  max-width: 1180px;
  margin: 0 auto;
  padding: 18px 32px;
  font-family: var(--sans);
  font-size: 13px;
}

.site-wordmark {
  font-family: var(--sans);
  font-weight: 600;
  letter-spacing: 0.06em;
  font-size: 14px;
  text-transform: lowercase;
}

.site-nav a {
  margin-left: 24px;
  color: var(--muted);
  text-decoration: none;
}

.site-nav a:hover {
  color: var(--ink);
}

.paper {
  max-width: 980px;
  margin: 0 auto;
  padding: 96px 56px 120px;
}

.masthead {
  max-width: var(--measure);
}

.kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--sans);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 36px;
}

.kicker-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--accent);
  display: inline-block;
}

.display-title {
  font-family: var(--serif);
  font-weight: 600;
  font-size: clamp(36px, 4.6vw, 56px);
  line-height: 1.06;
  letter-spacing: -0.015em;
  color: var(--ink);
  margin: 0 0 24px;
  max-width: 42ch;
}

.lede {
  font-family: var(--serif);
  font-style: italic;
  font-size: 19px;
  line-height: 1.55;
  color: var(--ink-soft);
  margin: 0 0 24px;
  max-width: var(--measure);
}

.dateline {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 48px;
}

.dateline time {
  color: var(--ink);
}

.hero-figure,
.secondary-figure,
.lineage-figure,
.swimlane-figure {
  margin: 0 0 64px;
  padding: 0;
}

.hero-figure svg,
.secondary-figure svg,
.lineage-figure svg,
.swimlane-figure svg {
  display: block;
  width: 100%;
  height: auto;
  background: transparent;
}

figcaption {
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
  margin-top: 14px;
  max-width: 44rem;
}

.figure-label {
  font-family: var(--sans);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: 0.02em;
}

.run-metadata {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 28px 36px;
  padding: 28px 0;
  margin: 0 0 56px;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.meta-column {
  font-family: var(--sans);
  font-size: 13px;
}

.meta-label {
  margin: 0 0 10px;
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}

.meta-actors {
  list-style: none;
  padding: 0;
  margin: 0;
}

.meta-actors li {
  margin-bottom: 6px;
  color: var(--ink);
}

.actor-role {
  display: inline-block;
  font-family: var(--sans);
  font-size: 10px;
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: lowercase;
}

.meta-value {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.5;
}

.meta-sub {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.mono {
  font-family: var(--mono);
  font-size: 12px;
}

.meta-value.mono,
.meta-column .mono {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.contents {
  margin: 0 0 80px;
  padding: 24px 0 28px;
  border-bottom: 1px solid var(--rule);
}

.contents-label {
  margin: 0 0 16px;
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}

.contents-list {
  list-style: none;
  padding: 0;
  margin: 0;
  columns: 2;
  column-gap: 48px;
  font-family: var(--sans);
  font-size: 14px;
}

.contents-list li {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  break-inside: avoid;
}

.contents-index {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  min-width: 22px;
}

.contents-list a {
  color: var(--ink);
  text-decoration: none;
}

.contents-list a:hover {
  text-decoration: underline;
  text-decoration-color: var(--ink);
}

.paper-section {
  max-width: 56rem;
  margin: 0 0 80px;
}

.section-heading {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 30px;
  line-height: 1.18;
  letter-spacing: -0.005em;
  margin: 0 0 24px;
  color: var(--ink);
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.section-number {
  font-family: var(--sans);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-transform: uppercase;
  font-weight: 600;
  border-top: 1px solid var(--rule);
  padding-top: 4px;
  min-width: 24px;
}

.prose {
  font-family: var(--serif);
  font-size: 17px;
  line-height: 1.68;
  color: var(--ink);
  margin: 0 0 18px;
  max-width: var(--measure);
}

.abstract-prose {
  font-size: 18px;
}

.prose strong { font-weight: 600; }
.prose em { font-style: italic; }

.empty-note {
  color: var(--muted);
  font-style: italic;
}

.outcomes-table-wrap {
  overflow-x: auto;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
}

.outcomes-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sans);
  font-size: 13px;
}

.outcomes-table thead th {
  text-align: left;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted);
  padding: 10px 14px;
  border-bottom: 1px solid var(--ink);
}

.outcomes-table thead th.num {
  text-align: right;
}

.outcomes-table tbody td {
  padding: 14px;
  border-bottom: 1px solid var(--rule);
  vertical-align: top;
  color: var(--ink);
}

.outcomes-table tbody tr:last-child td { border-bottom: none; }
.outcomes-table td .row-sub { margin-top: 4px; color: var(--muted); font-size: 11px; }
.outcomes-table td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: 13px; }

.delta { font-variant-numeric: tabular-nums; }
.delta-good { color: var(--accent); }
.delta-bad { color: var(--bad); }
.delta-flat { color: var(--muted); }

.status-badge {
  display: inline-block;
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  color: var(--muted);
}

.status-good { color: var(--accent); background: var(--accent-soft); }
.status-bad { color: var(--bad); background: var(--bad-soft); }
.status-warn { color: var(--accent-2); background: var(--accent-2-soft); }
.status-neutral { color: var(--muted); }

.callout {
  border-left: 3px solid var(--accent);
  padding: 12px 18px;
  margin: 24px 0;
  background: var(--accent-soft);
  font-family: var(--serif);
  font-size: 17px;
  color: var(--ink);
}

.callout.callout-warning { border-left-color: var(--accent-2); background: var(--accent-2-soft); }
.callout.callout-finding { border-left-color: var(--accent); background: var(--accent-soft); }
.callout.callout-note { border-left-color: var(--muted); background: #f5f3ed; }

.aside {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--rule-soft);
  padding-top: 8px;
  margin: 18px 0;
}

.definition {
  font-style: italic;
  color: var(--ink);
}

.metric-card {
  display: inline-flex;
  flex-direction: column;
  padding: 12px 20px 14px 0;
  margin: 0 32px 12px 0;
  font-family: var(--sans);
  vertical-align: top;
}

.metric-card + .metric-card {
  border-left: 1px solid var(--rule);
  padding-left: 24px;
}

.metric-card-label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.metric-card-value { font-family: var(--serif); font-size: 28px; color: var(--ink); margin: 6px 0 4px; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; letter-spacing: -0.005em; }
.metric-card-delta { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.metric-card-delta.delta-good { color: var(--accent); }
.metric-card-delta.delta-bad { color: var(--bad); }

.task-block { padding: 36px 0 8px; border-top: 1px solid var(--rule); }
.task-block:first-of-type { border-top: none; }

.task-title { font-family: var(--serif); font-size: 22px; font-weight: 600; margin: 0 0 4px; color: var(--ink); }
.task-meta { margin: 0; font-family: var(--sans); font-size: 12px; color: var(--muted); }

.experiment-block { margin: 14px 0; border-top: 1px solid var(--rule-soft); padding-top: 14px; }
.experiment-block[open] .experiment-summary { border-bottom: 1px solid var(--rule-soft); padding-bottom: 8px; }
.experiment-summary { list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-family: var(--sans); font-size: 14px; }
.experiment-summary::-webkit-details-marker { display: none; }
.experiment-summary::before { content: "▸"; margin-right: 6px; color: var(--muted); }
.experiment-block[open] .experiment-summary::before { content: "▾"; }
.experiment-title { font-weight: 600; color: var(--ink); }
.experiment-status { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
.experiment-actor { color: var(--muted); font-size: 12px; margin-left: auto; }
.experiment-body { padding: 12px 0 8px; }
.experiment-meta { font-family: var(--sans); font-size: 12px; color: var(--muted); margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 14px; }
.exp-meta-item { display: inline-flex; align-items: baseline; gap: 6px; }
.meta-key { text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; color: var(--whisper); }

.mini-block { margin: 16px 0; }
.mini-label { margin: 0 0 8px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }

.measurement-list,
.review-list,
.attachment-list { list-style: none; margin: 0; padding: 0; font-family: var(--sans); font-size: 13px; }
.measurement-list li,
.review-list li,
.attachment-list li { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px 0; border-top: 1px solid var(--rule-soft); align-items: baseline; }
.measurement-list li:first-child,
.review-list li:first-child,
.attachment-list li:first-child { border-top: none; }

.metric-name { font-size: 12px; color: var(--ink); }
.metric-value { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 13px; color: var(--ink); }
.metric-actor,
.review-by,
.att-actor { color: var(--muted); font-size: 12px; }
.metric-note,
.review-body,
.att-body { flex-basis: 100%; color: var(--ink-soft); font-size: 13px; }
.att-kind,
.review-decision { font-family: var(--sans); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.review-decision { padding: 1px 8px; border-radius: 999px; }
.att-title { font-weight: 600; color: var(--ink); font-size: 13px; }

.baseline-card { padding: 18px 0; border-top: 1px solid var(--rule-soft); }
.baseline-card:first-of-type { border-top: none; }
.baseline-title { font-family: var(--serif); font-size: 18px; margin: 0 0 8px; color: var(--ink); }
.baseline-status { margin-left: 8px; font-family: var(--sans); font-size: 11px; letter-spacing: 0.06em; color: var(--muted); text-transform: uppercase; }

.colophon { margin-top: 96px; padding-top: 24px; border-top: 1px solid var(--rule); font-family: var(--sans); font-size: 12px; color: var(--muted); }
.colophon p { margin: 0; }

.muted { color: var(--muted); }

@media (max-width: 880px) {
  .paper { padding: 56px 24px 80px; }
  .run-metadata { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .contents-list { columns: 1; }
  .display-title { font-size: clamp(32px, 9vw, 48px); }
  .section-heading { font-size: 24px; }
}

@media (max-width: 560px) {
  .run-metadata { grid-template-columns: 1fr; }
}
`;

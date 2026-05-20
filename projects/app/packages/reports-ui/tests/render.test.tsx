import { expect, test } from "bun:test";

import {
  BaselineCard,
  Callout,
  Colophon,
  EvidenceBlock,
  Figure,
  Hero,
  LineageTree,
  MetricCard,
  OutcomesTable,
  ProgressChart,
  ResearchReport,
  Section,
  Swimlanes,
  TableOfContents,
  renderReportToHtml,
} from "../src/index.js";
import {
  emptyMetricSeries,
  populatedContents,
  populatedLineageEdges,
  populatedLineageNodes,
  populatedMetricSeries,
  populatedOutcomeRows,
  populatedSwimlaneRange,
  populatedSwimlaneRows,
} from "../src/fixtures/index.js";

test("ResearchReport renders a standalone HTML document", () => {
  const { html } = renderReportToHtml({
    tree: (
      <ResearchReport title="Test report">
        <Hero kicker="Test" title="Test report" />
      </ResearchReport>
    ),
  });
  expect(html.startsWith("<!doctype html>\n")).toBe(true);
  expect(html.endsWith("\n")).toBe(true);
  expect(html).toContain("<title>Test report</title>");
  expect(html).toContain('<header class="site-header"');
  expect(html).toContain('id="masthead"');
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
});

test("Hero escapes user-supplied content", () => {
  const { html } = renderReportToHtml({
    tree: (
      <ResearchReport title="Escape test">
        <Hero title="<script>alert(1)</script>" lede="A <em>fake</em> markup attempt." />
      </ResearchReport>
    ),
  });
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).not.toContain("<script>alert(1)</script>");
});

test("ProgressChart populated renders annotated step line", () => {
  const { html } = renderReportToHtml({
    tree: <ProgressChart series={populatedMetricSeries} />,
  });
  expect(html).toContain('class="progress-chart"');
  expect(html).toContain("Case and accent folding");
  expect(html).toContain("baseline");
});

test("ProgressChart empty renders an awaiting-measurements message", () => {
  const { html } = renderReportToHtml({
    tree: <ProgressChart series={emptyMetricSeries} />,
  });
  expect(html).toContain("Awaiting measurements");
});

test("LineageTree renders nodes and a dashed cherry-pick edge", () => {
  const { html } = renderReportToHtml({
    tree: <LineageTree nodes={populatedLineageNodes} edges={populatedLineageEdges} />,
  });
  expect(html).toContain("candidate/case-normalize");
  expect(html).toContain("synthesis/normalize-combined");
  expect(html).toContain("stroke-dasharray");
  expect(html).toContain("cherry 4a2b9d1");
});

test("Swimlanes renders one row per actor", () => {
  const { html } = renderReportToHtml({
    tree: (
      <Swimlanes
        rows={populatedSwimlaneRows}
        startMs={populatedSwimlaneRange.startMs}
        endMs={populatedSwimlaneRange.endMs}
      />
    ),
  });
  for (const row of populatedSwimlaneRows) {
    expect(html).toContain(row.actor);
  }
});

test("OutcomesTable renders status badges with status class", () => {
  const { html } = renderReportToHtml({
    tree: (
      <OutcomesTable
        rows={populatedOutcomeRows}
        primaryMetricName="dev_accuracy"
        direction="higher"
      />
    ),
  });
  expect(html).toContain("status-good");
  expect(html).toContain("status-bad");
  expect(html).toContain("delta-good");
  expect(html).toContain("delta-bad");
});

test("MetricCard exposes data attributes for validator grounding", () => {
  const { html } = renderReportToHtml({
    tree: (
      <MetricCard
        metric="dev_accuracy"
        value={0.6814}
        delta={0.05}
        direction="higher"
        source="experiment_synthesis"
      />
    ),
  });
  expect(html).toContain('data-source="experiment_synthesis"');
  expect(html).toContain('data-metric="dev_accuracy"');
  expect(html).toContain('data-value="0.6814"');
});

test("EvidenceBlock requires experimentId and emits data attribute", () => {
  const { html } = renderReportToHtml({
    tree: (
      <EvidenceBlock
        experimentId="experiment_case"
        title="Case and accent folding"
        status="accepted"
      />
    ),
  });
  expect(html).toContain('data-experiment-id="experiment_case"');
  expect(html).toContain("status-good");
});

test("BaselineCard exposes data-baseline-id", () => {
  const { html } = renderReportToHtml({
    tree: <BaselineCard baselineId="baseline_1" title="Native baseline" />,
  });
  expect(html).toContain('data-baseline-id="baseline_1"');
});

test("Callout uses the kind class", () => {
  const { html } = renderReportToHtml({
    tree: <Callout kind="finding">Headline result</Callout>,
  });
  expect(html).toContain("callout-finding");
});

test("TableOfContents emits anchor links", () => {
  const { html } = renderReportToHtml({
    tree: <TableOfContents items={populatedContents} />,
  });
  for (const item of populatedContents) {
    expect(html).toContain(`href="#${item.id}"`);
  }
});

test("Figure prefixes caption with the figure label", () => {
  const { html } = renderReportToHtml({
    tree: (
      <Figure number={1} kind="hero" caption="Test caption">
        <svg viewBox="0 0 10 10" />
      </Figure>
    ),
  });
  expect(html).toContain("Figure 1.");
  expect(html).toContain("Test caption");
});

test("Section emits the stable id and section number", () => {
  const { html } = renderReportToHtml({
    tree: (
      <Section id="abstract" number={1} title="Abstract">
        <p className="prose">Body</p>
      </Section>
    ),
  });
  expect(html).toContain('id="abstract"');
  expect(html).toContain("section-number");
});

test("Colophon renders the muted footer line", () => {
  const { html } = renderReportToHtml({
    tree: <Colophon recordCount={28} generatedAt="2026-05-15T09:00:00.000Z" />,
  });
  expect(html).toContain("28 visible records");
  expect(html).toContain('id="colophon"');
});

test("Composed report contains no remote URLs", () => {
  const { html } = renderReportToHtml({
    tree: (
      <ResearchReport title="Composed">
        <Hero title="Composed" />
        <Section id="abstract" number={1} title="Abstract">
          <p className="prose">Abstract body.</p>
        </Section>
        <TableOfContents items={populatedContents} />
        <Section id="lineage" number={2} title="Lineage">
          <Figure number={1} kind="lineage" caption="Lineage caption">
            <LineageTree nodes={populatedLineageNodes} edges={populatedLineageEdges} />
          </Figure>
        </Section>
        <Section id="parallelism" number={3} title="Parallel work">
          <Figure number={2} kind="swimlane" caption="Swimlanes">
            <Swimlanes
              rows={populatedSwimlaneRows}
              startMs={populatedSwimlaneRange.startMs}
              endMs={populatedSwimlaneRange.endMs}
            />
          </Figure>
        </Section>
        <Section id="outcomes" number={4} title="Outcomes">
          <OutcomesTable
            rows={populatedOutcomeRows}
            primaryMetricName="dev_accuracy"
            direction="higher"
          />
        </Section>
        <Colophon recordCount={28} />
      </ResearchReport>
    ),
  });
  expect(html).not.toContain("http://");
  expect(html).not.toContain("https://");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html.endsWith("\n")).toBe(true);
  expect(html.endsWith("\n\n")).toBe(false);
});

test("buildEmbeddedFontFaceCss returns a single string with @font-face rules", async () => {
  const { buildEmbeddedFontFaceCss } = await import("../src/fonts/index.js");
  const css = buildEmbeddedFontFaceCss();
  expect(css).toContain("@font-face");
  expect(css).toContain("Source Serif 4 Variable");
  expect(css).toContain("Inter Variable");
  expect(css).toContain("JetBrains Mono Variable");
  expect(css).toContain("data:font/woff2;base64,");
});

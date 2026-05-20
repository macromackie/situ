import type { ProjectReportSnapshot } from "../types.js";
import { mdxComponentNames } from "./components.js";
import { deriveSnapshotModel } from "./snapshot-to-props.js";

export type BuildInstructionsInput = {
  readonly snapshot: ProjectReportSnapshot;
  readonly draftPath: string;
};

export type BuiltInstructions = {
  readonly instructionsMarkdown: string;
  readonly draftMdx: string;
};

/**
 * Builds the author brief (Markdown) and a starter MDX scaffold for a project.
 *
 * The brief lists available components, the snapshot summary, what must not be
 * omitted per the validator, and tells the agent the path to write to.
 */
export function buildInstructions(input: BuildInstructionsInput): BuiltInstructions {
  const model = deriveSnapshotModel(input.snapshot);
  const project = input.snapshot.project;
  const baselineList = input.snapshot.baselines
    .map(
      (baselineSnapshot) =>
        `- \`${baselineSnapshot.baseline.id}\` — ${baselineSnapshot.baseline.title} (${baselineSnapshot.measurements.length} measurements)`,
    )
    .join("\n");
  const experimentList = model.experiments
    .map(
      (experimentSnapshot) =>
        `- \`${experimentSnapshot.experiment.id}\` — ${experimentSnapshot.experiment.title} (${experimentSnapshot.experiment.status}; ${experimentSnapshot.measurements.length} measurements)`,
    )
    .join("\n");
  const primary = model.primaryMetric;
  const primarySummary =
    primary === undefined
      ? "No baseline-comparable primary metric yet."
      : `Primary metric: \`${primary.metricName}\` (${primary.direction === "higher" ? "higher is better" : "lower is better"}). Baseline ${primary.baselineValue ?? "—"}, best ${primary.bestValue ?? "—"}.`;
  const requiredExperiments = model.experiments
    .filter((experimentSnapshot) =>
      ["accepted", "rejected", "abandoned"].includes(experimentSnapshot.experiment.status),
    )
    .map((experimentSnapshot) => `- ${experimentSnapshot.experiment.id}`)
    .join("\n");

  const instructionsMarkdown = [
    `# Research report brief — ${project.name}`,
    "",
    `Project id: \`${project.id}\``,
    `Repository: \`${project.repositoryPath}\``,
    `Generated at: ${nowIso()}`,
    "",
    "## Snapshot summary",
    "",
    `- Baselines: ${model.counts.baselines}`,
    `- Tasks: ${model.counts.tasks}`,
    `- Experiments: ${model.counts.experiments} (accepted ${model.counts.accepted}, rejected ${model.counts.rejected}, measured ${model.counts.measured})`,
    `- Measurements: ${model.counts.measurements}`,
    `- Reviews: ${model.counts.reviews}`,
    `- Distinct actors: ${model.actors.length}`,
    "",
    primarySummary,
    "",
    "## Baselines",
    "",
    baselineList === "" ? "_No baselines recorded._" : baselineList,
    "",
    "## Experiments",
    "",
    experimentList === "" ? "_No experiments recorded._" : experimentList,
    "",
    "## Available components",
    "",
    "Reference these from MDX as JSX elements. Props with `Id` suffixes are validated against the snapshot.",
    "",
    ...mdxComponentNames.map((name) => `- \`<${name}>\``),
    "",
    "## Must-include rules (validator blocks submit on failure)",
    "",
    '- Wrap the document in `<ResearchReport title="...">`.',
    `- ${model.counts.baselines > 0 ? 'Include at least one `<BaselineCard baselineId="...">` referencing one of the baselines listed above.' : "No baselines in the snapshot, so no `<BaselineCard>` is required."}`,
    '- Include an `<EvidenceBlock experimentId="...">` for every experiment in `accepted`, `rejected`, or `abandoned` status:',
    requiredExperiments === ""
      ? "  _(none in those statuses yet)_"
      : requiredExperiments.replace(/^- /gm, "  - "),
    '- Numeric `<MetricCard value=... metric="..." source="...">` must match a real measurement on that source.',
    "- Do not use raw `<script>`, `<iframe>`, `<style>`, or any `http(s)://` URLs.",
    "",
    "## Loop",
    "",
    "1. Read this brief.",
    `2. Edit \`${input.draftPath}\` (a starter MDX has been written there).`,
    "3. Run `situ reports preview --draft <path> --project-id <id>` to compile.",
    "4. Iterate until you are happy.",
    '5. Run `situ reports submit --project-id <id> --draft <path> --title "..."` to publish.',
    "",
  ].join("\n");

  const draftMdx = buildStarterMdx({ snapshot: input.snapshot, model });

  return { instructionsMarkdown, draftMdx };
}

function buildStarterMdx(input: {
  snapshot: ProjectReportSnapshot;
  model: ReturnType<typeof deriveSnapshotModel>;
}): string {
  const project = input.snapshot.project;
  const primary = input.model.primaryMetric;
  const baseline = input.snapshot.baselines[0];
  const evidenceBlocks = input.model.experiments
    .filter((experimentSnapshot) =>
      ["accepted", "rejected", "abandoned"].includes(experimentSnapshot.experiment.status),
    )
    .map(
      (experimentSnapshot) =>
        `<EvidenceBlock experimentId="${experimentSnapshot.experiment.id}" title="${escapeAttr(experimentSnapshot.experiment.title)}" status="${experimentSnapshot.experiment.status}" />`,
    )
    .join("\n\n");

  return [
    `{/* situ research report — edit this MDX and run \`situ reports preview\` to compile. */}`,
    "",
    `<ResearchReport title=${JSON.stringify(`${project.name} — situ research report`)}>`,
    "",
    `<Hero kicker="Situ research report" title=${JSON.stringify(project.name)} lede=${JSON.stringify(buildAutoLede(input.model))} />`,
    "",
    primary === undefined
      ? ""
      : `<MetricCard metric=${JSON.stringify(primary.metricName)} value={${primary.bestValue ?? 0}} delta={${primary.bestValue !== undefined && primary.baselineValue !== undefined ? (primary.direction === "higher" ? primary.bestValue - primary.baselineValue : primary.baselineValue - primary.bestValue).toFixed(4) : 0}} direction=${JSON.stringify(primary.direction)} source=${JSON.stringify(input.model.experiments[input.model.experiments.length - 1]?.experiment.id ?? "")} />`,
    "",
    `<Section id="abstract" number={1} title="Abstract">`,
    "",
    "Write a 3–5 sentence summary. Cover the goal, what was tried, the headline outcome, and any safety concerns.",
    "",
    "</Section>",
    "",
    `<Section id="goal" number={2} title="Goal and method">`,
    "",
    project.goalMarkdown,
    "",
    "</Section>",
    "",
    baseline === undefined
      ? ""
      : [
          `<Section id="baseline" number={3} title="Baseline">`,
          "",
          `<BaselineCard baselineId=${JSON.stringify(baseline.baseline.id)} title=${JSON.stringify(baseline.baseline.title)} status=${JSON.stringify(baseline.baseline.status)} summaryMarkdown=${JSON.stringify(baseline.baseline.summaryMarkdown)} />`,
          "",
          "</Section>",
          "",
        ].join("\n"),
    `<Section id="evidence" number={4} title="Evidence">`,
    "",
    evidenceBlocks === ""
      ? "_No checkpointed experiments yet — add an EvidenceBlock for each accepted/rejected/abandoned experiment once they exist._"
      : evidenceBlocks,
    "",
    "</Section>",
    "",
    `<Colophon recordCount={${input.model.counts.measurements + input.model.counts.experiments + input.model.counts.reviews}} />`,
    "",
    "</ResearchReport>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildAutoLede(model: ReturnType<typeof deriveSnapshotModel>): string {
  const primary = model.primaryMetric;
  const head =
    primary === undefined || primary.baselineValue === undefined || primary.bestValue === undefined
      ? "Replace this lede with one sentence about the run."
      : `${primary.metricName} ${primary.direction === "higher" ? "improved" : "improved"} from ${primary.baselineValue} at baseline to ${primary.bestValue} at best (${primary.direction === "higher" ? "higher" : "lower"} is better).`;
  return head;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "'");
}

function nowIso(): string {
  return new Date().toISOString();
}

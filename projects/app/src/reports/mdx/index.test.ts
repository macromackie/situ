import { expect, test } from "bun:test";

import type { SituId, TargetKind, TargetRef } from "@situ/common";
import { ValidationError } from "@situ/errors";

import { createAppActionContext } from "../../actions/context.js";
import { memoryDatabasePath, openAppDatabase } from "../../db/index.js";
import { collectProjectReportSnapshot } from "../collection.js";

import { buildInstructions } from "./instructions.js";
import { compileMdxReport } from "./compile.js";
import { submitMdxReport } from "./submit.js";
import { validateMdxReport } from "./validate.js";

function target<TKind extends TargetKind>(kind: TKind, id: SituId<TKind>): TargetRef<TKind> {
  return { targetKind: kind, targetId: id };
}

function buildFixture(input: { context: ReturnType<typeof createAppActionContext> }) {
  const projectId = "project_mdx" as SituId<"project">;
  const baselineId = "baseline_mdx" as SituId<"baseline">;
  const taskId = "task_mdx" as SituId<"task">;
  const acceptedExperimentId = "experiment_mdx_accepted" as SituId<"experiment">;
  const rejectedExperimentId = "experiment_mdx_rejected" as SituId<"experiment">;

  input.context.repositories.projects.create({
    id: projectId,
    name: "MDX test project",
    repositoryPath: "/tmp/mdx",
    goalMarkdown: "Test MDX pipeline.",
    createdBy: { actorKind: "human", actorId: "scott" },
    now: "2026-05-15T09:00:00.000Z",
  });
  input.context.repositories.baselines.create({
    id: baselineId,
    projectId,
    title: "Native baseline",
    summaryMarkdown: "Unmodified.",
    createdBy: { actorKind: "local_agent", actorId: "manager" },
    now: "2026-05-15T09:01:00.000Z",
  });
  input.context.repositories.measurements.create({
    id: "measurement_baseline_mdx" as SituId<"measurement">,
    baselineId,
    metricName: "dev_accuracy",
    numericValue: 0.6,
    summaryMarkdown: "Baseline.",
    measuredBy: { actorKind: "local_agent", actorId: "manager" },
    now: "2026-05-15T09:02:00.000Z",
  });
  input.context.repositories.tasks.create({
    id: taskId,
    projectId,
    title: "Test task",
    bodyMarkdown: "Test.",
    createdBy: { actorKind: "human", actorId: "scott" },
    now: "2026-05-15T09:03:00.000Z",
  });
  input.context.repositories.experiments.create({
    id: acceptedExperimentId,
    projectId,
    taskId,
    title: "Accepted candidate",
    summaryMarkdown: "Worked.",
    status: "accepted",
    createdBy: { actorKind: "local_agent", actorId: "scientist-1" },
    now: "2026-05-15T09:04:00.000Z",
  });
  input.context.repositories.experiments.create({
    id: rejectedExperimentId,
    projectId,
    taskId,
    title: "Rejected candidate",
    summaryMarkdown: "Did not work.",
    status: "rejected",
    createdBy: { actorKind: "local_agent", actorId: "scientist-2" },
    now: "2026-05-15T09:05:00.000Z",
  });
  input.context.repositories.measurements.create({
    id: "measurement_accepted_mdx" as SituId<"measurement">,
    experimentId: acceptedExperimentId,
    revisionNumber: 1,
    metricName: "dev_accuracy",
    numericValue: 0.7,
    summaryMarkdown: "Improved.",
    measuredBy: { actorKind: "local_agent", actorId: "verifier-1" },
    now: "2026-05-15T09:06:00.000Z",
  });

  return { projectId, baselineId, taskId, acceptedExperimentId, rejectedExperimentId };
}

const validMdx = `<ResearchReport title="MDX test project">
  <Hero kicker="Test" title="MDX test project" />
  <BaselineCard baselineId="baseline_mdx" title="Native baseline" />
  <Section id="evidence" number={1} title="Evidence">
    <EvidenceBlock experimentId="experiment_mdx_accepted" title="Accepted candidate" status="accepted" />
    <EvidenceBlock experimentId="experiment_mdx_rejected" title="Rejected candidate" status="rejected" />
    <MetricCard metric="dev_accuracy" value={0.7} delta={0.1} direction="higher" source="experiment_mdx_accepted" />
  </Section>
</ResearchReport>`;

test("validateMdxReport accepts a grounded draft", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const result = validateMdxReport({ mdxSource: validMdx, snapshot });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  } finally {
    database.close();
  }
});

test("validateMdxReport rejects ungrounded MetricCard values", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const bad = validMdx.replace("value={0.7}", "value={0.99}");
    const result = validateMdxReport({ mdxSource: bad, snapshot });
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === "value-mismatch")).toBe(true);
  } finally {
    database.close();
  }
});

test("validateMdxReport rejects unknown experiment id", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const bad = validMdx.replace(
      'experimentId="experiment_mdx_accepted"',
      'experimentId="experiment_does_not_exist"',
    );
    const result = validateMdxReport({ mdxSource: bad, snapshot });
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === "unknown-experiment")).toBe(true);
  } finally {
    database.close();
  }
});

test("validateMdxReport requires BaselineCard when baselines exist", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const bad = validMdx.replace(
      '<BaselineCard baselineId="baseline_mdx" title="Native baseline" />',
      "",
    );
    const result = validateMdxReport({ mdxSource: bad, snapshot });
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === "missing-baseline-card")).toBe(true);
  } finally {
    database.close();
  }
});

test("validateMdxReport requires EvidenceBlock for accepted/rejected experiments", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const bad = validMdx.replace(
      /<EvidenceBlock experimentId="experiment_mdx_rejected"[^/]+\/>/,
      "",
    );
    const result = validateMdxReport({ mdxSource: bad, snapshot });
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === "missing-evidence-block")).toBe(true);
  } finally {
    database.close();
  }
});

test("validateMdxReport rejects raw forbidden elements", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const bad = validMdx.replace(
      '<Hero kicker="Test" title="MDX test project" />',
      '<Hero kicker="Test" title="MDX test project" />\n<script>alert(1)</script>',
    );
    const result = validateMdxReport({ mdxSource: bad, snapshot });
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === "forbidden-element")).toBe(true);
  } finally {
    database.close();
  }
});

test("compileMdxReport produces a self-contained HTML document", async () => {
  const result = await compileMdxReport({
    mdxSource: validMdx,
    embedFonts: false,
  });
  expect(result.html.startsWith("<!doctype html>\n")).toBe(true);
  expect(result.html.endsWith("\n")).toBe(true);
  expect(result.html).toContain("Accepted candidate");
  expect(result.html).toContain("MDX test project");
  expect(result.html).not.toContain("<script");
});

test("buildInstructions emits a brief and a draft scaffold", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: "project_mdx" as SituId<"project">,
    });
    const built = buildInstructions({ snapshot, draftPath: "/tmp/test-draft.mdx" });
    expect(built.instructionsMarkdown).toContain("Research report brief");
    expect(built.instructionsMarkdown).toContain("baseline_mdx");
    expect(built.draftMdx).toContain("<ResearchReport");
    expect(built.draftMdx).toContain("<Hero");
  } finally {
    database.close();
  }
});

test("submitMdxReport creates a report and an artifact for a valid draft", async () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const result = await submitMdxReport({
      context,
      projectId: "project_mdx" as SituId<"project">,
      mdxSource: validMdx,
      title: "MDX test report",
      generatedBy: { actorKind: "human", actorId: "scott" },
      htmlOutputPath: "/tmp/situ-mdx-test.html",
      embedFonts: false,
    });
    expect(result.reportId).toContain("report_");
    expect(result.artifactId).toContain("artifact_");
    expect(result.htmlPath).toBe("/tmp/situ-mdx-test.html");

    const projectReports = context.repositories.reports.listForProject({
      projectId: "project_mdx" as SituId<"project">,
    });
    expect(projectReports.length).toBe(1);
    const artifacts = context.repositories.artifacts.listForTarget({
      target: target("report", result.reportId),
    });
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]?.mediaType).toBe("text/html");
  } finally {
    database.close();
  }
});

test("submitMdxReport throws ValidationError for invalid draft and writes nothing", async () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });
  try {
    const context = createAppActionContext({ database });
    buildFixture({ context });
    const bad = validMdx.replace("value={0.7}", "value={0.99}");
    let caught: unknown;
    try {
      await submitMdxReport({
        context,
        projectId: "project_mdx" as SituId<"project">,
        mdxSource: bad,
        title: "Bad",
        generatedBy: { actorKind: "human", actorId: "scott" },
        htmlOutputPath: "/tmp/situ-mdx-bad.html",
        embedFonts: false,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const projectReports = context.repositories.reports.listForProject({
      projectId: "project_mdx" as SituId<"project">,
    });
    expect(projectReports.length).toBe(0);
  } finally {
    database.close();
  }
});

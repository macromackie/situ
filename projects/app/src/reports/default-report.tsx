import type { ReactElement } from "react";

import {
  ActorList,
  AttachmentList,
  BaselineCard,
  Colophon,
  EvidenceBlock,
  Figure,
  Hero,
  LineageTree,
  MetaBlock,
  MetaColumn,
  OutcomesTable,
  ProgressChart,
  ResearchReport,
  Section,
  SmallMultiples,
  Swimlanes,
  TableOfContents,
} from "@situ/reports-ui";
import type { AttachmentSummary } from "@situ/reports-ui";

import { deriveSnapshotModel } from "./mdx/snapshot-to-props.js";
import {
  actorLabel,
  composeAbstractParagraphs,
  composeDateline,
  composeHeadlineSummary,
  composeLedeParagraph,
  composeLineageCaption,
  composeLineageNarrative,
  composeParallelismCaption,
  composeParallelismNarrative,
  composeProgressCaption,
  composeProgressNarrative,
  composeRunTime,
  composeSecondaryCaption,
} from "./narratives.js";
import type { ProjectReportSnapshot, ReportTargetAttachments } from "./types.js";

function attachmentsFromTarget(target: ReportTargetAttachments): readonly AttachmentSummary[] {
  const rows: AttachmentSummary[] = [];
  for (const comment of target.comments) {
    rows.push({
      kind: "comment",
      actor: actorLabel(comment.author),
      body: comment.bodyMarkdown,
    });
  }
  for (const event of target.events) {
    rows.push({
      kind: "event",
      actor: actorLabel(event.actor),
      body: event.summaryMarkdown,
      extra: event.bodyMarkdown,
    });
  }
  for (const artifact of target.artifacts) {
    rows.push({
      kind: "artifact",
      title: artifact.title,
      body: artifact.uri,
    });
  }
  for (const report of target.reports) {
    rows.push({
      kind: "report",
      title: report.title,
      actor: `by ${actorLabel(report.generatedBy)}`,
      body: report.bodyMarkdown.slice(0, 240),
    });
  }
  return rows;
}

export type ComposeReportTreeInput = {
  readonly snapshot: ProjectReportSnapshot;
  readonly generatedAt?: string;
};

/**
 * Composes the standard research-report React tree from a snapshot using only
 * `@situ/reports-ui` components. This is the single rendering layer for both
 * the standard report (no MDX submitted yet) and as a reference for what
 * agent-authored MDX is expected to produce.
 */
export function composeReportTree(input: ComposeReportTreeInput): ReactElement {
  const model = deriveSnapshotModel(input.snapshot);
  const project = input.snapshot.project;
  const lede = composeLedeParagraph({ model });
  const dateline = composeDateline({ model, generatedAt: input.generatedAt });
  const abstract = composeAbstractParagraphs({ model });
  const headline = composeHeadlineSummary({ model });
  const runTime = composeRunTime({ model });
  const primary = model.primaryMetric;

  return (
    <ResearchReport title={`${project.name} — situ research report`}>
      <Hero kicker="Situ research report" title={project.name} lede={lede} dateline={dateline} />

      {primary === undefined ? (
        <Figure
          number={1}
          kind="hero"
          id="figure-progress"
          caption="No comparable measurements have been recorded yet. The progress figure renders once experiments are measured against the baseline."
          ariaLabel="Empty progress figure"
        >
          <ProgressChart series={{ metricName: "pending", direction: "higher", points: [] }} />
        </Figure>
      ) : (
        <Figure
          number={1}
          kind="hero"
          id="figure-progress"
          caption={composeProgressCaption({ model, primary, figureNumber: 1 })}
          ariaLabel={`Running best of ${primary.metricName} over experiments`}
        >
          <ProgressChart series={primary} />
        </Figure>
      )}

      <MetaBlock>
        <MetaColumn label="Actors">
          <ActorList actors={model.actors} />
        </MetaColumn>
        <MetaColumn label="Run">
          <p className="meta-value">{runTime.range}</p>
          <p className="meta-sub">{runTime.duration}</p>
        </MetaColumn>
        <MetaColumn label="Repository">
          <p className="meta-value mono">{project.repositoryPath}</p>
          <p className="meta-sub">project {project.id}</p>
        </MetaColumn>
        <MetaColumn label="Headline">
          <p className="meta-value">{headline.value}</p>
          <p className="meta-sub">{headline.detail}</p>
        </MetaColumn>
      </MetaBlock>

      <TableOfContents items={model.contents} />

      <Section id="abstract" number={1} title="Abstract">
        {abstract.map((paragraph) => (
          <p key={`abstract:${paragraph}`} className="prose abstract-prose">
            {paragraph}
          </p>
        ))}
      </Section>

      <Section id="goal" number={2} title="Goal and method">
        <p className="prose">
          {project.goalMarkdown.trim() === ""
            ? "No project goal recorded yet."
            : project.goalMarkdown}
        </p>
        <p className="prose method-note">
          The run is autoresearch: the manager records baseline evidence, fans out into candidate
          experiments on isolated worktrees, captures measurements through situ, and (when useful)
          follows up with a synthesis branch that cherry-picks compatible improvements from
          siblings. Every record in this report comes from visible situ state; no scheduler or
          workflow engine sits behind it.
        </p>
      </Section>

      <Section id="progress" number={3} title="Progress">
        <p className="prose">{composeProgressNarrative({ model })}</p>
        {model.secondaryMetrics.length > 0 && (
          <Figure
            number={2}
            kind="secondary"
            id="figure-secondary"
            caption={composeSecondaryCaption()}
            ariaLabel="Secondary metric small multiples"
          >
            <SmallMultiples series={model.secondaryMetrics} />
          </Figure>
        )}
      </Section>

      <Section id="lineage" number={4} title="Branch lineage">
        <p className="prose">{composeLineageNarrative({ model })}</p>
        <Figure
          number={3}
          kind="lineage"
          id="figure-lineage"
          caption={composeLineageCaption()}
          ariaLabel="Branch lineage"
        >
          <LineageTree nodes={model.lineageNodes} edges={model.lineageEdges} />
        </Figure>
      </Section>

      <Section id="parallelism" number={5} title="Parallel work">
        <p className="prose">{composeParallelismNarrative({ model })}</p>
        <Figure
          number={4}
          kind="swimlane"
          id="figure-swimlanes"
          caption={composeParallelismCaption()}
          ariaLabel="Actor swimlanes over time"
        >
          <Swimlanes
            rows={model.swimlaneRows}
            startMs={model.swimlaneStartMs}
            endMs={model.swimlaneEndMs}
          />
        </Figure>
      </Section>

      <Section id="outcomes" number={6} title="Experiment outcomes">
        <OutcomesTable
          rows={model.outcomeRows}
          primaryMetricName={primary?.metricName}
          primaryUnit={primary?.unit}
          direction={primary?.direction}
        />
      </Section>

      <Section id="evidence" number={7} title="Evidence">
        {model.snapshot.tasks.length === 0 ? (
          <p className="prose empty-note">
            No tasks have been recorded yet. Evidence appears once the manager creates tasks,
            experiments, measurements, and reviews.
          </p>
        ) : (
          <>
            <p className="prose">
              Per-task narrative below. Each experiment can be expanded for its summary,
              measurements, reviews, and attachments.
            </p>
            {model.snapshot.tasks.map((taskSnapshot) => (
              <article key={taskSnapshot.task.id} className="task-block">
                <header className="task-header">
                  <h3 className="task-title">{taskSnapshot.task.title}</h3>
                  <p className="task-meta">
                    Task <span className="mono">{taskSnapshot.task.id}</span> · created{" "}
                    {taskSnapshot.task.metadata.createdAt}
                  </p>
                </header>
                {taskSnapshot.task.bodyMarkdown.trim() === "" ? null : (
                  <p className="prose">{taskSnapshot.task.bodyMarkdown}</p>
                )}
                {taskSnapshot.task.assignedTo !== undefined && (
                  <p className="task-assignee">
                    Assigned to <strong>{actorLabel(taskSnapshot.task.assignedTo)}</strong> · status{" "}
                    {taskSnapshot.task.status}
                  </p>
                )}
                {taskSnapshot.experiments.map((experimentSnapshot) => (
                  <EvidenceBlock
                    key={experimentSnapshot.experiment.id}
                    experimentId={experimentSnapshot.experiment.id}
                    title={experimentSnapshot.experiment.title}
                    status={experimentSnapshot.experiment.status}
                    actor={actorLabel(
                      experimentSnapshot.experiment.assignedTo ??
                        experimentSnapshot.experiment.createdBy,
                    )}
                    branchName={experimentSnapshot.experiment.branchName}
                    baseRef={
                      experimentSnapshot.experiment.baseRef === undefined
                        ? undefined
                        : experimentSnapshot.experiment.baseRef.slice(0, 7)
                    }
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
        )}
      </Section>

      <Section id="appendix" number={8} title="Appendix">
        <div className="appendix-block">
          <h3 className="appendix-heading">Baselines</h3>
          {model.snapshot.baselines.length === 0 ? (
            <p className="empty-note">No baseline records.</p>
          ) : (
            model.snapshot.baselines.map((baselineSnapshot) => (
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
            attachments={attachmentsFromTarget(model.snapshot.target)}
          />
        </div>
        <div className="appendix-block">
          <h3 className="appendix-heading">Record counts</h3>
          <table className="count-table">
            <tbody>
              <tr>
                <th>Baselines</th>
                <td className="num mono">{model.counts.baselines}</td>
              </tr>
              <tr>
                <th>Tasks</th>
                <td className="num mono">{model.counts.tasks}</td>
              </tr>
              <tr>
                <th>Experiments</th>
                <td className="num mono">{model.counts.experiments}</td>
              </tr>
              <tr>
                <th>Accepted</th>
                <td className="num mono">{model.counts.accepted}</td>
              </tr>
              <tr>
                <th>Rejected</th>
                <td className="num mono">{model.counts.rejected}</td>
              </tr>
              <tr>
                <th>Measured experiments</th>
                <td className="num mono">{model.counts.measured}</td>
              </tr>
              <tr>
                <th>Measurements</th>
                <td className="num mono">{model.counts.measurements}</td>
              </tr>
              <tr>
                <th>Reviews</th>
                <td className="num mono">{model.counts.reviews}</td>
              </tr>
              <tr>
                <th>Distinct actors</th>
                <td className="num mono">{model.actors.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Colophon
        recordCount={model.counts.measurements + model.counts.experiments + model.counts.reviews}
        generatedAt={input.generatedAt}
      />
    </ResearchReport>
  );
}

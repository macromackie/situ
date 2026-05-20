import type { ArtifactRecord } from "@situ/artifacts";
import type { CommentRecord } from "@situ/comments";
import type { ActorRef } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type { ReportRecord } from "@situ/reports";

import type {
  ProjectReportBaselineSnapshot,
  ProjectReportExperimentSnapshot,
  ProjectReportMeasurementSnapshot,
  ProjectReportReviewSnapshot,
  ProjectReportTaskSnapshot,
  RenderProjectReportMarkdownInput,
  ReportTargetAttachments,
} from "./types.js";

/**
 * Renders a collected project report snapshot as Markdown.
 */
export function renderProjectReportMarkdown(input: RenderProjectReportMarkdownInput): string {
  const lines: string[] = [];
  const { project } = input.snapshot;

  lines.push(`# Project Report: ${project.name}`);
  lines.push("");
  lines.push(`- Project: ${project.id}`);
  lines.push(`- Status: ${project.status}`);
  lines.push(`- Repository: ${project.repositoryPath}`);
  lines.push(`- Created: ${project.metadata.createdAt}`);
  lines.push(`- Created by: ${actorLabel(project.createdBy)}`);

  if (input.generatedAt !== undefined) {
    lines.push(`- Generated: ${input.generatedAt}`);
  }

  lines.push("");
  lines.push("## Goal");
  lines.push("");
  lines.push(project.goalMarkdown);
  lines.push("");
  lines.push("## Project Attachments");
  lines.push("");
  appendTargetAttachments({
    lines,
    attachments: input.snapshot.target,
  });
  lines.push("");
  lines.push("## Baselines");
  lines.push("");

  if (input.snapshot.baselines.length === 0) {
    lines.push("None.");
  } else {
    appendSeparated({
      lines,
      items: input.snapshot.baselines,
      append: (baselineSnapshot) =>
        appendBaselineSnapshot({
          lines,
          snapshot: baselineSnapshot,
        }),
    });
  }

  lines.push("");
  lines.push("## Tasks");
  lines.push("");

  if (input.snapshot.tasks.length === 0) {
    lines.push("None.");
  } else {
    appendSeparated({
      lines,
      items: input.snapshot.tasks,
      append: (taskSnapshot) =>
        appendTaskSnapshot({
          lines,
          snapshot: taskSnapshot,
        }),
    });
  }

  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

type AppendBaselineSnapshotInput = {
  readonly lines: string[];
  readonly snapshot: ProjectReportBaselineSnapshot;
};

function appendBaselineSnapshot(input: AppendBaselineSnapshotInput): void {
  const { baseline } = input.snapshot;

  input.lines.push(`### Baseline: ${baseline.title} (${baseline.id})`);
  input.lines.push("");
  input.lines.push(`- Status: ${baseline.status}`);
  input.lines.push(`- Created: ${baseline.metadata.createdAt}`);
  input.lines.push(`- Created by: ${actorLabel(baseline.createdBy)}`);

  if (baseline.taskId !== undefined) {
    input.lines.push(`- Task: ${baseline.taskId}`);
  }

  input.lines.push("");
  input.lines.push(baseline.summaryMarkdown);
  input.lines.push("");
  input.lines.push("#### Baseline Measurements");
  input.lines.push("");
  appendMeasurementSnapshots({
    lines: input.lines,
    snapshots: input.snapshot.measurements,
  });
  input.lines.push("");
  input.lines.push("#### Baseline Attachments");
  input.lines.push("");
  appendTargetAttachments({
    lines: input.lines,
    attachments: input.snapshot.target,
  });
}

type AppendTaskSnapshotInput = {
  readonly lines: string[];
  readonly snapshot: ProjectReportTaskSnapshot;
};

function appendTaskSnapshot(input: AppendTaskSnapshotInput): void {
  const { task } = input.snapshot;

  input.lines.push(`### Task: ${task.title} (${task.id})`);
  input.lines.push("");
  input.lines.push(`- Status: ${task.status}`);
  input.lines.push(`- Created: ${task.metadata.createdAt}`);
  input.lines.push(`- Created by: ${actorLabel(task.createdBy)}`);

  if (task.assignedTo !== undefined) {
    input.lines.push(`- Assigned to: ${actorLabel(task.assignedTo)}`);
  }

  input.lines.push("");
  input.lines.push(task.bodyMarkdown);
  input.lines.push("");
  input.lines.push("#### Task Attachments");
  input.lines.push("");
  appendTargetAttachments({
    lines: input.lines,
    attachments: input.snapshot.target,
  });
  input.lines.push("");
  input.lines.push("#### Experiments");
  input.lines.push("");

  if (input.snapshot.experiments.length === 0) {
    input.lines.push("None.");
  } else {
    appendSeparated({
      lines: input.lines,
      items: input.snapshot.experiments,
      append: (experimentSnapshot) =>
        appendExperimentSnapshot({
          lines: input.lines,
          snapshot: experimentSnapshot,
        }),
    });
  }
}

type AppendExperimentSnapshotInput = {
  readonly lines: string[];
  readonly snapshot: ProjectReportExperimentSnapshot;
};

function appendExperimentSnapshot(input: AppendExperimentSnapshotInput): void {
  const { experiment } = input.snapshot;

  input.lines.push(`##### Experiment: ${experiment.title} (${experiment.id})`);
  input.lines.push("");
  input.lines.push(`- Status: ${experiment.status}`);
  input.lines.push(`- Revision: ${experiment.revisionNumber}`);
  input.lines.push(`- Created: ${experiment.metadata.createdAt}`);
  input.lines.push(`- Created by: ${actorLabel(experiment.createdBy)}`);

  if (experiment.assignedTo !== undefined) {
    input.lines.push(`- Assigned to: ${actorLabel(experiment.assignedTo)}`);
  }

  if (experiment.baseRef !== undefined) {
    input.lines.push(`- Base ref: ${experiment.baseRef}`);
  }

  if (experiment.branchName !== undefined) {
    input.lines.push(`- Branch: ${experiment.branchName}`);
  }

  if (experiment.worktreePath !== undefined) {
    input.lines.push(`- Worktree: ${experiment.worktreePath}`);
  }

  input.lines.push("");
  input.lines.push(experiment.summaryMarkdown);
  input.lines.push("");
  input.lines.push("###### Measurements");
  input.lines.push("");
  appendMeasurementSnapshots({
    lines: input.lines,
    snapshots: input.snapshot.measurements,
  });
  input.lines.push("");
  input.lines.push("###### Reviews");
  input.lines.push("");
  appendReviewSnapshots({
    lines: input.lines,
    snapshots: input.snapshot.reviews,
  });
  input.lines.push("");
  input.lines.push("###### Experiment Attachments");
  input.lines.push("");
  appendTargetAttachments({
    lines: input.lines,
    attachments: input.snapshot.target,
  });
}

type AppendMeasurementSnapshotsInput = {
  readonly lines: string[];
  readonly snapshots: readonly ProjectReportMeasurementSnapshot[];
};

function appendMeasurementSnapshots(input: AppendMeasurementSnapshotsInput): void {
  if (input.snapshots.length === 0) {
    input.lines.push("None.");
    return;
  }

  appendSeparated({
    lines: input.lines,
    items: input.snapshots,
    append: (snapshot) =>
      appendMeasurementSnapshot({
        lines: input.lines,
        snapshot,
      }),
  });
}

type AppendMeasurementSnapshotInput = {
  readonly lines: string[];
  readonly snapshot: ProjectReportMeasurementSnapshot;
};

function appendMeasurementSnapshot(input: AppendMeasurementSnapshotInput): void {
  const { measurement } = input.snapshot;
  let numericValue = `${measurement.numericValue}`;

  if (measurement.unit !== undefined) {
    numericValue = `${measurement.numericValue} ${measurement.unit}`;
  }

  input.lines.push(`- ${measurement.id} ${measurementLabel(measurement)}: ${numericValue}`);
  appendContinuation({
    lines: input.lines,
    prefix: "  ",
    text: measurement.summaryMarkdown,
  });

  if (measurement.detailsMarkdown !== undefined) {
    appendContinuation({
      lines: input.lines,
      prefix: "  ",
      text: measurement.detailsMarkdown,
    });
  }

  appendNestedAttachments({
    lines: input.lines,
    attachments: input.snapshot.target,
  });
}

function measurementLabel(measurement: {
  readonly baselineId?: string;
  readonly experimentId?: string;
  readonly revisionNumber?: number;
  readonly metricName: string;
}): string {
  if (measurement.baselineId !== undefined) {
    return `baseline ${measurement.metricName}`;
  }

  if (measurement.revisionNumber !== undefined) {
    return `r${measurement.revisionNumber} ${measurement.metricName}`;
  }

  return measurement.metricName;
}

type AppendReviewSnapshotsInput = {
  readonly lines: string[];
  readonly snapshots: readonly ProjectReportReviewSnapshot[];
};

function appendReviewSnapshots(input: AppendReviewSnapshotsInput): void {
  if (input.snapshots.length === 0) {
    input.lines.push("None.");
    return;
  }

  appendSeparated({
    lines: input.lines,
    items: input.snapshots,
    append: (snapshot) =>
      appendReviewSnapshot({
        lines: input.lines,
        snapshot,
      }),
  });
}

type AppendReviewSnapshotInput = {
  readonly lines: string[];
  readonly snapshot: ProjectReportReviewSnapshot;
};

function appendReviewSnapshot(input: AppendReviewSnapshotInput): void {
  const { review } = input.snapshot;

  input.lines.push(
    `- ${review.id} r${review.revisionNumber} ${review.decision} by ${actorLabel(review.reviewer)}`,
  );
  appendContinuation({
    lines: input.lines,
    prefix: "  ",
    text: review.bodyMarkdown,
  });
  appendNestedAttachments({
    lines: input.lines,
    attachments: input.snapshot.target,
  });
}

type AppendNestedAttachmentsInput = {
  readonly lines: string[];
  readonly attachments: ReportTargetAttachments;
};

function appendNestedAttachments(input: AppendNestedAttachmentsInput): void {
  if (!hasAttachments(input.attachments)) {
    return;
  }

  input.lines.push("  Attachments:");
  appendTargetAttachments({
    lines: input.lines,
    attachments: input.attachments,
    indent: "  ",
  });
}

type AppendTargetAttachmentsInput = {
  readonly lines: string[];
  readonly attachments: ReportTargetAttachments;
  readonly indent?: string;
};

function appendTargetAttachments(input: AppendTargetAttachmentsInput): void {
  const indent = input.indent ?? "";

  appendCommentAttachments({
    lines: input.lines,
    comments: input.attachments.comments,
    indent,
  });
  input.lines.push("");
  appendEventAttachments({
    lines: input.lines,
    events: input.attachments.events,
    indent,
  });
  input.lines.push("");
  appendArtifactAttachments({
    lines: input.lines,
    artifacts: input.attachments.artifacts,
    indent,
  });
  input.lines.push("");
  appendReportAttachments({
    lines: input.lines,
    reports: input.attachments.reports,
    indent,
  });
}

type AppendCommentAttachmentsInput = {
  readonly lines: string[];
  readonly comments: readonly CommentRecord[];
  readonly indent: string;
};

function appendCommentAttachments(input: AppendCommentAttachmentsInput): void {
  input.lines.push(`${input.indent}Comments`);
  input.lines.push("");

  if (input.comments.length === 0) {
    input.lines.push(`${input.indent}None.`);
    return;
  }

  for (const comment of input.comments) {
    input.lines.push(
      `${input.indent}- ${comment.metadata.createdAt} ${actorLabel(comment.author)} (${
        comment.id
      }): ${comment.bodyMarkdown}`,
    );
  }
}

type AppendEventAttachmentsInput = {
  readonly lines: string[];
  readonly events: readonly EventRecord[];
  readonly indent: string;
};

function appendEventAttachments(input: AppendEventAttachmentsInput): void {
  input.lines.push(`${input.indent}Events`);
  input.lines.push("");

  if (input.events.length === 0) {
    input.lines.push(`${input.indent}None.`);
    return;
  }

  for (const event of input.events) {
    input.lines.push(
      `${input.indent}- ${event.metadata.createdAt} ${actorLabel(event.actor)} (${event.id}): ${
        event.summaryMarkdown
      }`,
    );

    if (event.bodyMarkdown !== undefined) {
      appendContinuation({
        lines: input.lines,
        prefix: `${input.indent}  `,
        text: event.bodyMarkdown,
      });
    }
  }
}

type AppendArtifactAttachmentsInput = {
  readonly lines: string[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly indent: string;
};

function appendArtifactAttachments(input: AppendArtifactAttachmentsInput): void {
  input.lines.push(`${input.indent}Artifacts`);
  input.lines.push("");

  if (input.artifacts.length === 0) {
    input.lines.push(`${input.indent}None.`);
    return;
  }

  for (const artifact of input.artifacts) {
    input.lines.push(`${input.indent}- ${artifact.title} (${artifact.id}) ${artifact.uri}`);
    appendContinuation({
      lines: input.lines,
      prefix: `${input.indent}  `,
      text: artifact.summaryMarkdown,
    });
    appendArtifactMetadata({
      lines: input.lines,
      artifact,
      indent: input.indent,
    });
  }
}

type AppendArtifactMetadataInput = {
  readonly lines: string[];
  readonly artifact: ArtifactRecord;
  readonly indent: string;
};

function appendArtifactMetadata(input: AppendArtifactMetadataInput): void {
  const metadataParts: string[] = [];

  if (input.artifact.mediaType !== undefined) {
    metadataParts.push(`mediaType=${input.artifact.mediaType}`);
  }

  if (input.artifact.byteSize !== undefined) {
    metadataParts.push(`byteSize=${input.artifact.byteSize}`);
  }

  if (input.artifact.sha256 !== undefined) {
    metadataParts.push(`sha256=${input.artifact.sha256}`);
  }

  if (metadataParts.length > 0) {
    input.lines.push(`${input.indent}  ${metadataParts.join(" ")}`);
  }
}

type AppendReportAttachmentsInput = {
  readonly lines: string[];
  readonly reports: readonly ReportRecord[];
  readonly indent: string;
};

function appendReportAttachments(input: AppendReportAttachmentsInput): void {
  input.lines.push(`${input.indent}Reports`);
  input.lines.push("");

  if (input.reports.length === 0) {
    input.lines.push(`${input.indent}None.`);
    return;
  }

  for (const report of input.reports) {
    input.lines.push(
      `${input.indent}- ${report.title} (${report.id}) generated by ${actorLabel(
        report.generatedBy,
      )}`,
    );
    appendContinuation({
      lines: input.lines,
      prefix: `${input.indent}  `,
      text: report.bodyMarkdown,
    });
  }
}

type AppendContinuationInput = {
  readonly lines: string[];
  readonly prefix: string;
  readonly text: string;
};

function appendContinuation(input: AppendContinuationInput): void {
  for (const line of input.text.split("\n")) {
    input.lines.push(`${input.prefix}${line}`);
  }
}

type AppendSeparatedInput<TItem> = {
  readonly lines: string[];
  readonly items: readonly TItem[];
  readonly append: (item: TItem) => void;
};

function appendSeparated<TItem>(input: AppendSeparatedInput<TItem>): void {
  input.items.forEach((item, index) => {
    if (index > 0) {
      input.lines.push("");
    }

    input.append(item);
  });
}

function hasAttachments(attachments: ReportTargetAttachments): boolean {
  return (
    attachments.comments.length > 0 ||
    attachments.events.length > 0 ||
    attachments.artifacts.length > 0 ||
    attachments.reports.length > 0
  );
}

function actorLabel(actor: ActorRef): string {
  return actor.displayName ?? `${actor.actorKind}/${actor.actorId}`;
}

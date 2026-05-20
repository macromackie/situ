import { serializeError } from "@situ/errors";

import type { SituStatusOutput } from "../status/index.js";
import type { SituVerifyOutput } from "../verification/index.js";
import type { SituCliErrorOutput, SituCliOutputMode, SituCliResult } from "./types.js";

export function formatDataResult(input: {
  readonly invocation: { readonly outputMode: SituCliOutputMode };
  readonly data: unknown;
  readonly text: string;
}): SituCliResult {
  if (input.invocation.outputMode === "json") {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(input.data)}\n`,
      stderr: "",
    };
  }

  return {
    exitCode: 0,
    stdout: input.text.length === 0 ? "" : `${input.text}\n`,
    stderr: "",
  };
}

export function formatProjectLines(
  projects: readonly { readonly id: string; readonly status: string; readonly name: string }[],
): string {
  return projects.map((project) => `${project.id}\t${project.status}\t${project.name}`).join("\n");
}

export function formatTaskLines(
  tasks: readonly { readonly id: string; readonly status: string; readonly title: string }[],
): string {
  return tasks.map((task) => `${task.id}\t${task.status}\t${task.title}`).join("\n");
}

export function formatExperimentLines(
  experiments: readonly {
    readonly id: string;
    readonly status: string;
    readonly revisionNumber: number;
    readonly title: string;
  }[],
): string {
  return experiments
    .map(
      (experiment) =>
        `${experiment.id}\t${experiment.status}\tr${experiment.revisionNumber}\t${experiment.title}`,
    )
    .join("\n");
}

export function formatBaselineLines(
  baselines: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly taskId?: string;
    readonly status: string;
    readonly title: string;
  }[],
): string {
  return baselines
    .map((baseline) => {
      const taskId = baseline.taskId ?? "-";

      return `${baseline.id}\t${baseline.status}\t${baseline.projectId}\t${taskId}\t${baseline.title}`;
    })
    .join("\n");
}

export function formatMeasurementLines(
  measurements: readonly {
    readonly id: string;
    readonly baselineId?: string;
    readonly experimentId?: string;
    readonly revisionNumber?: number;
    readonly metricName: string;
    readonly numericValue: number;
    readonly unit?: string;
    readonly summaryMarkdown: string;
  }[],
): string {
  return measurements
    .map((measurement) => {
      const unitSuffix = measurement.unit === undefined ? "" : ` ${measurement.unit}`;
      const target = measurementTargetLabel(measurement);

      return `${measurement.id}\t${target}\t${measurement.metricName}\t${measurement.numericValue}${unitSuffix}\t${measurement.summaryMarkdown}`;
    })
    .join("\n");
}

function measurementTargetLabel(measurement: {
  readonly baselineId?: string;
  readonly experimentId?: string;
  readonly revisionNumber?: number;
}): string {
  if (measurement.baselineId !== undefined) {
    return `baseline/${measurement.baselineId}`;
  }

  if (measurement.experimentId !== undefined && measurement.revisionNumber !== undefined) {
    return `experiment/${measurement.experimentId} r${measurement.revisionNumber}`;
  }

  return "unknown";
}

export function formatArtifactLines(
  artifacts: readonly {
    readonly id: string;
    readonly target: {
      readonly targetKind: string;
      readonly targetId: string;
    };
    readonly title: string;
    readonly summaryMarkdown: string;
    readonly uri: string;
  }[],
): string {
  return artifacts
    .map(
      (artifact) =>
        `${artifact.id}\t${artifact.target.targetKind}/${artifact.target.targetId}\t${artifact.title}\t${artifact.uri}\t${artifact.summaryMarkdown}`,
    )
    .join("\n");
}

export function formatReviewLines(
  reviews: readonly {
    readonly id: string;
    readonly experimentId: string;
    readonly revisionNumber: number;
    readonly decision: string;
    readonly reviewer: {
      readonly actorKind: string;
      readonly actorId: string;
    };
    readonly bodyMarkdown: string;
  }[],
): string {
  return reviews
    .map(
      (review) =>
        `${review.id}\t${review.experimentId}\tr${review.revisionNumber}\t${review.decision}\t${review.reviewer.actorKind}/${review.reviewer.actorId}\t${review.bodyMarkdown}`,
    )
    .join("\n");
}

export function formatReportLines(
  reports: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly target: {
      readonly targetKind: string;
      readonly targetId: string;
    };
    readonly title: string;
    readonly generatedBy: {
      readonly actorKind: string;
      readonly actorId: string;
    };
    readonly bodyMarkdown: string;
  }[],
): string {
  return reports
    .map(
      (report) =>
        `${report.id}\t${report.projectId}\t${report.target.targetKind}/${report.target.targetId}\t${report.title}\t${report.generatedBy.actorKind}/${report.generatedBy.actorId}\t${report.bodyMarkdown}`,
    )
    .join("\n");
}

export function formatNotificationLines(
  notifications: readonly {
    readonly id: string;
    readonly recipient: {
      readonly recipientId: string;
    };
    readonly target: {
      readonly targetKind: string;
      readonly targetId: string;
    };
    readonly readAt?: string;
    readonly dismissedAt?: string;
    readonly summaryMarkdown: string;
  }[],
): string {
  return notifications
    .map((notification) => {
      const state = notificationState(notification);

      return `${notification.id}\t${notification.recipient.recipientId}\t${notification.target.targetKind}/${notification.target.targetId}\t${state}\t${notification.summaryMarkdown}`;
    })
    .join("\n");
}

export function formatSituStatus(status: SituStatusOutput): string {
  return [
    `projects active=${status.projects.active} archived=${status.projects.archived}`,
    `work pending=${status.work.pending} running=${status.work.running} review=${status.work.review} attention=${status.work.attention} completed=${status.work.completed} idle=${status.isIdle}`,
    `tasks triage=${status.tasks.triage} backlog=${status.tasks.backlog} in_progress=${status.tasks.in_progress} in_review=${status.tasks.in_review} done=${status.tasks.done} canceled=${status.tasks.canceled}`,
    `experiments planned=${status.experiments.planned} running=${status.experiments.running} ready_for_review=${status.experiments.ready_for_review} accepted=${status.experiments.accepted} rejected=${status.experiments.rejected} abandoned=${status.experiments.abandoned}`,
    `notifications unread=${status.notifications.unread} read=${status.notifications.read} dismissed=${status.notifications.dismissed}`,
    `reviews approved=${status.reviews.approved} changes_requested=${status.reviews.changes_requested} rejected=${status.reviews.rejected} commented=${status.reviews.commented}`,
    `stale_assignments ${status.staleAssignments}`,
  ].join("\n");
}

export function formatSituVerify(verification: SituVerifyOutput): string {
  const lines = [`verify ok=${verification.ok}`];

  for (const check of verification.checks) {
    lines.push(`${check.name} ok=${check.ok} ${check.summary}`);

    for (const record of check.blockingRecords) {
      lines.push(`  ${record.targetKind} ${record.targetId} ${record.reason}`);
    }
  }

  return lines.join("\n");
}

export function formatCommentLines(
  comments: readonly {
    readonly id: string;
    readonly target: {
      readonly targetKind: string;
      readonly targetId: string;
    };
    readonly author: {
      readonly actorKind: string;
      readonly actorId: string;
    };
    readonly bodyMarkdown: string;
  }[],
): string {
  return comments
    .map(
      (comment) =>
        `${comment.id}\t${comment.target.targetKind}/${comment.target.targetId}\t${comment.author.actorKind}/${comment.author.actorId}\t${comment.bodyMarkdown}`,
    )
    .join("\n");
}

export function formatEventLines(
  events: readonly {
    readonly id: string;
    readonly target: {
      readonly targetKind: string;
      readonly targetId: string;
    };
    readonly actor: {
      readonly actorKind: string;
      readonly actorId: string;
    };
    readonly summaryMarkdown: string;
  }[],
): string {
  return events
    .map(
      (event) =>
        `${event.id}\t${event.target.targetKind}/${event.target.targetId}\t${event.actor.actorKind}/${event.actor.actorId}\t${event.summaryMarkdown}`,
    )
    .join("\n");
}

function notificationState(notification: {
  readonly readAt?: string;
  readonly dismissedAt?: string;
}): string {
  if (notification.dismissedAt !== undefined) {
    return "dismissed";
  }

  if (notification.readAt !== undefined) {
    return "read";
  }

  return "unread";
}

export function formatCliError(input: {
  readonly error: unknown;
  readonly outputMode: SituCliOutputMode;
  readonly includeHelp: boolean;
  readonly helpText?: string;
}): SituCliResult {
  const serialized = serializeError(input.error);

  if (input.outputMode === "json") {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${JSON.stringify({
        error: serialized,
      } satisfies SituCliErrorOutput)}\n`,
    };
  }

  const hint = hintForErrorMessage(serialized.message);
  const hintText = hint === undefined ? "" : `hint: ${hint}\n`;
  const helpSuffix = input.includeHelp ? `\n${input.helpText ?? ""}` : "";

  return {
    exitCode: 1,
    stdout: "",
    stderr: `Error [${serialized.kind}]: ${serialized.message}\n${hintText}${helpSuffix}`,
  };
}

function hintForErrorMessage(message: string): string | undefined {
  if (message.startsWith("Unknown command:")) {
    return "Run `situ help` to see available commands.";
  }

  if (message === "Current directory is not inside a git repository.") {
    return "Run from inside a git repository or pass an explicit project flag where supported.";
  }

  return undefined;
}

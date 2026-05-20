import type { AttachmentSummary, MeasurementSummary, ReviewSummary } from "../types.js";
import { formatNumber } from "./svg-helpers.js";

export type EvidenceBlockProps = {
  readonly experimentId: string;
  readonly title: string;
  readonly status: string;
  readonly actor?: string;
  readonly branchName?: string;
  readonly baseRef?: string;
  readonly worktreePath?: string;
  readonly summaryMarkdown?: string;
  readonly measurements?: readonly MeasurementSummary[];
  readonly reviews?: readonly ReviewSummary[];
  readonly attachments?: readonly AttachmentSummary[];
  readonly defaultOpen?: boolean;
};

const statusKind = (status: string): "good" | "bad" | "warn" | "neutral" => {
  if (status === "accepted" || status === "approved" || status === "active") {
    return "good";
  }
  if (status === "rejected" || status === "abandoned") {
    return "bad";
  }
  if (status === "ready_for_review" || status === "changes_requested") {
    return "warn";
  }
  return "neutral";
};

function measurementKey(measurement: MeasurementSummary): string {
  return [
    measurement.metricName,
    measurement.revisionNumber ?? "none",
    measurement.value,
    measurement.unit ?? "none",
    measurement.actor,
    measurement.note ?? "none",
  ].join(":");
}

function reviewKey(review: ReviewSummary): string {
  return [review.decision, review.reviewer, review.body].join(":");
}

function attachmentKey(attachment: AttachmentSummary): string {
  return [
    attachment.kind,
    attachment.title ?? "none",
    attachment.actor ?? "none",
    attachment.body,
    attachment.extra ?? "none",
  ].join(":");
}

/**
 * Collapsible per-experiment evidence block. Uses native <details>/<summary>
 * so reports remain static (no JavaScript) but long reports stay scannable.
 *
 * The `experimentId` prop is required so the MDX validator can confirm the
 * experiment exists.
 */
export function EvidenceBlock(props: EvidenceBlockProps) {
  const measurements = props.measurements ?? [];
  const reviews = props.reviews ?? [];
  const attachments = props.attachments ?? [];
  const isOpen = props.defaultOpen ?? true;
  return (
    <details className="experiment-block" data-experiment-id={props.experimentId} open={isOpen}>
      <summary className="experiment-summary">
        <span className="experiment-title">{props.title}</span>
        <span className={`experiment-status status-${statusKind(props.status)}`}>
          {props.status}
        </span>
        {props.actor !== undefined && <span className="experiment-actor">{props.actor}</span>}
      </summary>
      <div className="experiment-body">
        {(props.branchName !== undefined ||
          props.baseRef !== undefined ||
          props.worktreePath !== undefined) && (
          <p className="experiment-meta">
            {props.branchName !== undefined && (
              <span className="exp-meta-item">
                <span className="meta-key">branch</span>{" "}
                <span className="mono">{props.branchName}</span>
              </span>
            )}
            {props.baseRef !== undefined && (
              <span className="exp-meta-item">
                <span className="meta-key">base</span> <span className="mono">{props.baseRef}</span>
              </span>
            )}
            {props.worktreePath !== undefined && (
              <span className="exp-meta-item">
                <span className="meta-key">worktree</span>{" "}
                <span className="mono">{props.worktreePath}</span>
              </span>
            )}
          </p>
        )}
        {props.summaryMarkdown !== undefined && props.summaryMarkdown !== "" && (
          <p className="prose">{props.summaryMarkdown}</p>
        )}
        <MeasurementList measurements={measurements} />
        <ReviewList reviews={reviews} />
        <AttachmentList attachments={attachments} title="Experiment attachments" />
      </div>
    </details>
  );
}

function MeasurementList(props: { measurements: readonly MeasurementSummary[] }) {
  if (props.measurements.length === 0) {
    return (
      <div className="mini-block">
        <h6 className="mini-label">Measurements</h6>
        <p className="empty-note">None recorded.</p>
      </div>
    );
  }
  return (
    <div className="mini-block">
      <h6 className="mini-label">Measurements</h6>
      <ul className="measurement-list">
        {props.measurements.map((measurement) => (
          <li key={measurementKey(measurement)}>
            <span className="metric-name mono">{measurement.metricName}</span>
            <span className="metric-value">
              {formatNumber(measurement.value)}
              {measurement.unit !== undefined ? ` ${measurement.unit}` : ""}
            </span>
            {measurement.revisionNumber !== undefined && (
              <span className="muted">r{measurement.revisionNumber}</span>
            )}
            <span className="metric-actor">by {measurement.actor}</span>
            {measurement.note !== undefined && (
              <span className="metric-note">{measurement.note}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewList(props: { reviews: readonly ReviewSummary[] }) {
  if (props.reviews.length === 0) {
    return (
      <div className="mini-block">
        <h6 className="mini-label">Reviews</h6>
        <p className="empty-note">None recorded.</p>
      </div>
    );
  }
  return (
    <div className="mini-block">
      <h6 className="mini-label">Reviews</h6>
      <ul className="review-list">
        {props.reviews.map((review) => (
          <li key={reviewKey(review)}>
            <span className={`review-decision status-${statusKind(review.decision)}`}>
              {review.decision}
            </span>
            <span className="review-by">by {review.reviewer}</span>
            <span className="review-body">{review.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type AttachmentListProps = {
  readonly attachments: readonly AttachmentSummary[];
  readonly title: string;
};

export function AttachmentList(props: AttachmentListProps) {
  if (props.attachments.length === 0) {
    return (
      <div className="mini-block">
        <h6 className="mini-label">{props.title}</h6>
        <p className="empty-note">None.</p>
      </div>
    );
  }
  return (
    <div className="mini-block">
      <h6 className="mini-label">{props.title}</h6>
      <ul className="attachment-list">
        {props.attachments.map((att) => (
          <li key={attachmentKey(att)}>
            <span className="att-kind">{att.kind}</span>
            {att.title !== undefined && <span className="att-title">{att.title}</span>}
            {att.actor !== undefined && <span className="att-actor">{att.actor}</span>}
            <span className="att-body">{att.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

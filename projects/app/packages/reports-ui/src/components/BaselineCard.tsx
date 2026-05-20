import type { MeasurementSummary } from "../types.js";
import { formatNumber } from "./svg-helpers.js";

export type BaselineCardProps = {
  readonly baselineId: string;
  readonly title: string;
  readonly status?: string;
  readonly summaryMarkdown?: string;
  readonly measurements?: readonly MeasurementSummary[];
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

/**
 * Baseline summary block. Required when the snapshot has at least one baseline.
 *
 * The `baselineId` prop is required so the MDX validator can ground the card
 * in a real baseline record.
 */
export function BaselineCard(props: BaselineCardProps) {
  const measurements = props.measurements ?? [];
  return (
    <article className="baseline-card" data-baseline-id={props.baselineId}>
      <h4 className="baseline-title">
        {props.title}
        {props.status !== undefined && <span className="baseline-status">{props.status}</span>}
      </h4>
      {props.summaryMarkdown !== undefined && props.summaryMarkdown !== "" && (
        <p className="prose">{props.summaryMarkdown}</p>
      )}
      {measurements.length === 0 ? (
        <p className="empty-note">No baseline measurements.</p>
      ) : (
        <ul className="measurement-list">
          {measurements.map((measurement) => (
            <li key={measurementKey(measurement)}>
              <span className="metric-name mono">{measurement.metricName}</span>
              <span className="metric-value">
                {formatNumber(measurement.value)}
                {measurement.unit !== undefined ? ` ${measurement.unit}` : ""}
              </span>
              <span className="metric-actor">by {measurement.actor}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

import type { ImprovementDirection } from "../types.js";
import { formatNumber } from "./svg-helpers.js";

export type MetricCardProps = {
  readonly metric: string;
  readonly value: number;
  readonly unit?: string;
  readonly delta?: number;
  readonly direction?: ImprovementDirection;
  readonly source: string;
  readonly label?: string;
};

/**
 * Single-number callout: metric name, value, optional delta.
 *
 * The `source` prop is required so the MDX validator can ground the value
 * in a real measurement (baseline or experiment).
 */
export function MetricCard(props: MetricCardProps) {
  const deltaClass = deltaClassName(props.delta);
  return (
    <span
      className="metric-card"
      data-source={props.source}
      data-metric={props.metric}
      data-value={String(props.value)}
    >
      <span className="metric-card-label">{props.label ?? props.metric}</span>
      <span className="metric-card-value">
        {formatNumber(props.value)}
        {props.unit !== undefined ? ` ${props.unit}` : ""}
      </span>
      {props.delta !== undefined && (
        <span className={`metric-card-delta ${deltaClass}`}>
          {props.delta > 0 ? "+" : props.delta < 0 ? "−" : "±"}
          {formatNumber(Math.abs(props.delta))} vs. baseline
        </span>
      )}
    </span>
  );
}

function deltaClassName(delta: number | undefined): string {
  if (delta === undefined || delta === 0) {
    return "delta-flat";
  }
  return delta > 0 ? "delta-good" : "delta-bad";
}

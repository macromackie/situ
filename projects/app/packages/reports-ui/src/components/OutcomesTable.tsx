import type { ImprovementDirection, OutcomeRow } from "../types.js";
import { formatNumber } from "./svg-helpers.js";

export type OutcomesTableProps = {
  readonly rows: readonly OutcomeRow[];
  readonly primaryMetricName?: string;
  readonly primaryUnit?: string;
  readonly direction?: ImprovementDirection;
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

/**
 * Compact experiment outcomes table.
 */
export function OutcomesTable(props: OutcomesTableProps) {
  const metricHeader =
    props.primaryMetricName === undefined ? "Best metric" : `Best ${props.primaryMetricName}`;
  const deltaHeader = "Δ vs. baseline";

  if (props.rows.length === 0) {
    return <p className="empty-note">No experiments have been recorded yet.</p>;
  }

  return (
    <div className="outcomes-table-wrap">
      <table className="outcomes-table">
        <thead>
          <tr>
            <th>Experiment</th>
            <th>Task</th>
            <th>Status</th>
            <th>Actor</th>
            <th>Branch</th>
            <th className="num">{metricHeader}</th>
            <th className="num">{deltaHeader}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.experimentId}>
              <td>
                <strong>{row.experimentTitle}</strong>
                <div className="row-sub mono">{row.experimentId}</div>
              </td>
              <td>{row.taskTitle}</td>
              <td>
                <span className={`status-badge status-${statusKind(row.status)}`}>
                  {row.status}
                </span>
              </td>
              <td>{row.actor}</td>
              <td>
                {row.branchName === undefined ? (
                  <span className="muted">—</span>
                ) : (
                  <span className="mono">{row.branchName}</span>
                )}
              </td>
              <td className="num">
                {row.bestValue === undefined ? (
                  <span className="muted">—</span>
                ) : (
                  <>
                    {formatNumber(row.bestValue)}
                    {row.bestValueUnit !== undefined ? ` ${row.bestValueUnit}` : ""}
                  </>
                )}
              </td>
              <td className="num">
                {row.deltaVsBaseline === undefined ? (
                  <span className="muted">—</span>
                ) : (
                  <DeltaCell value={row.deltaVsBaseline} direction={props.direction} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeltaCell(props: { value: number; direction?: ImprovementDirection }) {
  const symbol = props.value > 0 ? "+" : props.value < 0 ? "−" : "±";
  const className = props.value > 0 ? "delta-good" : props.value < 0 ? "delta-bad" : "delta-flat";
  return (
    <span className={`delta ${className}`}>
      {symbol}
      {formatNumber(Math.abs(props.value))}
    </span>
  );
}

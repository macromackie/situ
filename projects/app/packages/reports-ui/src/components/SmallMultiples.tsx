import type { MetricSeries } from "../types.js";
import { formatNumber } from "./svg-helpers.js";

export type SmallMultiplesProps = {
  readonly series: readonly MetricSeries[];
  readonly perRow?: number;
  readonly cellWidth?: number;
  readonly cellHeight?: number;
  readonly ariaLabel?: string;
};

function metricPointKey(point: MetricSeries["points"][number]): string {
  return [
    point.origin,
    point.experimentId ?? "none",
    point.experimentOrdinal,
    point.value,
    point.actorLabel ?? "none",
  ].join(":");
}

function runningBestKey(entry: { ordinal: number; value: number }): string {
  return [entry.ordinal, entry.value].join(":");
}

/**
 * Small-multiples grid of secondary metrics. Each cell is a tiny scatter +
 * running-best chart, sharing the editorial palette of the flagship chart.
 */
export function SmallMultiples(props: SmallMultiplesProps) {
  if (props.series.length === 0) {
    return null;
  }
  const perRow = Math.min(props.perRow ?? 3, props.series.length);
  const cellWidth = props.cellWidth ?? 240;
  const cellHeight = props.cellHeight ?? 140;
  const padding = 32;
  const rows = Math.ceil(props.series.length / perRow);
  const totalWidth = perRow * cellWidth + (perRow + 1) * padding;
  const totalHeight = rows * cellHeight + (rows + 1) * padding;

  return (
    <svg
      className="secondary-charts"
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      role="img"
      aria-label={props.ariaLabel ?? "Secondary metrics small multiples"}
    >
      <rect x={0} y={0} width={totalWidth} height={totalHeight} fill="#ffffff" />
      {props.series.map((series, index) => {
        const row = Math.floor(index / perRow);
        const col = index % perRow;
        const originX = padding + col * (cellWidth + padding);
        const originY = padding + row * (cellHeight + padding);
        return (
          <SecondaryCell
            key={series.metricName}
            series={series}
            originX={originX}
            originY={originY}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
          />
        );
      })}
    </svg>
  );
}

function SecondaryCell(props: {
  series: MetricSeries;
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
}) {
  const innerPadding = 28;
  const innerLeft = props.originX + innerPadding;
  const innerRight = props.originX + props.cellWidth;
  const innerTop = props.originY + 24;
  const innerBottom = props.originY + props.cellHeight - 18;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const orderedPoints = props.series.points;
  const experimentPoints = orderedPoints.filter((point) => point.origin === "experiment");
  const maxOrdinal = Math.max(1, ...experimentPoints.map((point) => point.experimentOrdinal));
  const allValues = orderedPoints.map((point) => point.value);
  const baselineValue = props.series.baselineValue;
  if (baselineValue !== undefined) {
    allValues.push(baselineValue);
  }
  const minVal = allValues.length === 0 ? 0 : Math.min(...allValues);
  const maxVal = allValues.length === 0 ? 1 : Math.max(...allValues);
  const span = maxVal === minVal ? Math.max(Math.abs(maxVal), 1) * 0.1 : (maxVal - minVal) * 0.15;
  const yMin = minVal - span;
  const yMax = maxVal + span;

  const xScale = (ordinal: number): number =>
    innerLeft + (ordinal / Math.max(maxOrdinal, 1)) * innerWidth;
  const yScale = (value: number): number => {
    if (yMax === yMin) {
      return innerBottom - innerHeight / 2;
    }
    const ratio = (value - yMin) / (yMax - yMin);
    return props.series.direction === "higher"
      ? innerBottom - ratio * innerHeight
      : innerTop + ratio * innerHeight;
  };

  let best = baselineValue ?? experimentPoints[0]?.value ?? 0;
  const runningBest: Array<{ ordinal: number; value: number }> = [];
  if (baselineValue !== undefined) {
    runningBest.push({ ordinal: 0, value: baselineValue });
  }
  for (const point of experimentPoints) {
    const improvement =
      props.series.direction === "higher" ? point.value > best : point.value < best;
    if (improvement || runningBest.length === 0) {
      runningBest.push({ ordinal: point.experimentOrdinal, value: point.value });
      best = point.value;
    }
  }
  const stepPath = runningBest
    .map((entry, index) =>
      index === 0
        ? `M ${formatNumber(xScale(entry.ordinal))} ${formatNumber(yScale(entry.value))}`
        : `H ${formatNumber(xScale(entry.ordinal))} V ${formatNumber(yScale(entry.value))}`,
    )
    .join(" ");
  const direction = props.series.direction === "higher" ? "↑" : "↓";

  return (
    <g>
      <text
        x={props.originX + innerPadding}
        y={props.originY + 14}
        fill="#1a1a1a"
        fontSize={11}
        fontWeight={600}
      >
        {props.series.metricName}{" "}
        <tspan fill="#5e5e63" fontWeight={400}>
          {direction}
        </tspan>
      </text>
      <line
        x1={innerLeft}
        y1={innerTop}
        x2={innerLeft}
        y2={innerBottom}
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <line
        x1={innerLeft}
        y1={innerBottom}
        x2={innerRight}
        y2={innerBottom}
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      {baselineValue !== undefined && (
        <line
          x1={innerLeft}
          x2={innerRight}
          y1={yScale(baselineValue)}
          y2={yScale(baselineValue)}
          stroke="#9b9aa0"
          strokeWidth={0.5}
          strokeDasharray="3 3"
        />
      )}
      {experimentPoints.map((point) => (
        <circle
          key={metricPointKey(point)}
          cx={xScale(point.experimentOrdinal)}
          cy={yScale(point.value)}
          r={2}
          fill="#c9c5b8"
        />
      ))}
      {runningBest.length > 0 && (
        <path d={stepPath} fill="none" stroke="#2b6a47" strokeWidth={1.4} />
      )}
      {runningBest
        .filter((_, index) => index > 0 || baselineValue === undefined)
        .map((entry) => (
          <circle
            key={runningBestKey(entry)}
            cx={xScale(entry.ordinal)}
            cy={yScale(entry.value)}
            r={2.8}
            fill="#2b6a47"
          />
        ))}
      {props.series.bestValue !== undefined && (
        <text x={innerRight} y={innerTop - 4} textAnchor="end" fill="#1a1a1a" fontSize={10}>
          best {formatNumber(props.series.bestValue)}
        </text>
      )}
      {baselineValue !== undefined && (
        <text x={innerLeft} y={innerTop - 4} fill="#5e5e63" fontSize={10}>
          baseline {formatNumber(baselineValue)}
        </text>
      )}
    </g>
  );
}

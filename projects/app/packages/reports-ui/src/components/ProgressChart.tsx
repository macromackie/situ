import type { ImprovementDirection, MetricSeries } from "../types.js";
import { clampNumber, formatNumber, truncate } from "./svg-helpers.js";

export type ProgressChartProps = {
  readonly series: MetricSeries;
  readonly width?: number;
  readonly height?: number;
  readonly ariaLabel?: string;
};

const defaultWidth = 760;
const defaultHeight = 380;
const margin = { top: 36, right: 28, bottom: 56, left: 64 };

function metricPointKey(point: MetricSeries["points"][number]): string {
  return [
    point.origin,
    point.experimentId ?? "none",
    point.experimentOrdinal,
    point.value,
    point.actorLabel ?? "none",
  ].join(":");
}

function tickKey(tick: { value: number; x?: number; y?: number }): string {
  return [tick.value, tick.x ?? "none", tick.y ?? "none"].join(":");
}

function runningBestKey(entry: { ordinal: number; value: number; experimentId?: string }): string {
  return [entry.experimentId ?? "baseline", entry.ordinal, entry.value].join(":");
}

/**
 * Flagship progress chart: scatter of every experiment measurement, a stepped
 * running-best line, baseline marker, and labeled kept improvements.
 */
export function ProgressChart(props: ProgressChartProps) {
  const width = props.width ?? defaultWidth;
  const height = props.height ?? defaultHeight;
  const innerLeft = margin.left;
  const innerRight = width - margin.right;
  const innerTop = margin.top;
  const innerBottom = height - margin.bottom;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const points = [...props.series.points];
  points.sort((left, right) => {
    if (left.experimentOrdinal !== right.experimentOrdinal) {
      return left.experimentOrdinal - right.experimentOrdinal;
    }
    return 0;
  });
  const experimentPoints = points.filter((point) => point.origin === "experiment");

  if (experimentPoints.length === 0) {
    return <EmptyProgressChart width={width} height={height} ariaLabel={props.ariaLabel} />;
  }

  const maxOrdinal = Math.max(1, ...experimentPoints.map((point) => point.experimentOrdinal));
  const baselineValue = props.series.baselineValue;
  const allValues = points.map((point) => point.value);
  if (baselineValue !== undefined) {
    allValues.push(baselineValue);
  }
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const span = maxVal === minVal ? Math.max(Math.abs(maxVal), 1) * 0.1 : (maxVal - minVal) * 0.12;
  const yMin = minVal - span;
  const yMax = maxVal + span;

  const xScale = (ordinal: number): number => innerLeft + (ordinal / maxOrdinal) * innerWidth;
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
  const runningBest: Array<{
    ordinal: number;
    value: number;
    title?: string;
    experimentId?: string;
  }> = [];
  if (baselineValue !== undefined) {
    runningBest.push({ ordinal: 0, value: baselineValue });
  }
  for (const point of experimentPoints) {
    const improvement =
      props.series.direction === "higher" ? point.value > best : point.value < best;
    if (improvement || runningBest.length === 0) {
      runningBest.push({
        ordinal: point.experimentOrdinal,
        value: point.value,
        title: point.experimentTitle,
        experimentId: point.experimentId,
      });
      best = point.value;
    }
  }

  // Step path
  const stepCommands: string[] = [];
  for (const [index, entry] of runningBest.entries()) {
    if (index === 0) {
      stepCommands.push(
        `M ${formatNumber(xScale(entry.ordinal))} ${formatNumber(yScale(entry.value))}`,
      );
      continue;
    }
    stepCommands.push(
      `H ${formatNumber(xScale(entry.ordinal))} V ${formatNumber(yScale(entry.value))}`,
    );
  }
  if (runningBest.length > 0) {
    stepCommands.push(`H ${formatNumber(xScale(maxOrdinal))}`);
  }

  const tickCount = 5;
  const yTicks: Array<{ value: number; y: number }> = [];
  for (let index = 0; index <= tickCount; index += 1) {
    const ratio = index / tickCount;
    // Keep the visually "better" end of the axis at the top, matching yScale.
    const value =
      props.series.direction === "higher"
        ? yMax - ratio * (yMax - yMin)
        : yMin + ratio * (yMax - yMin);
    yTicks.push({ value, y: innerTop + ratio * innerHeight });
  }

  const xStep = Math.max(1, Math.ceil(maxOrdinal / 6));
  const xTicks: Array<{ value: number; x: number }> = [];
  for (let value = 0; value <= maxOrdinal; value += xStep) {
    xTicks.push({ value, x: xScale(value) });
  }
  if ((xTicks[xTicks.length - 1]?.value ?? -1) !== maxOrdinal) {
    xTicks.push({ value: maxOrdinal, x: xScale(maxOrdinal) });
  }

  // Annotation dedup by experiment id, with right-edge clamp.
  const bestByExperiment = new Map<string, { ordinal: number; value: number; title?: string }>();
  for (const entry of runningBest) {
    if (entry.experimentId === undefined) {
      continue;
    }
    bestByExperiment.set(entry.experimentId, entry);
  }
  const annotationEntries = Array.from(bestByExperiment.values());
  annotationEntries.sort((left, right) => left.ordinal - right.ordinal);

  const rawAnnotations = annotationEntries.map((entry, index) => {
    const baseX = xScale(entry.ordinal);
    const baseY = yScale(entry.value);
    const labelMaxChars = 32;
    const labelWidth = labelMaxChars * 5.4;
    const desiredX = baseX + 12;
    const textAnchor: "start" | "end" = desiredX + labelWidth > innerRight - 4 ? "end" : "start";
    const tx = textAnchor === "start" ? desiredX : Math.max(innerLeft + 8, baseX - 10);
    const stackSlot = index % 3;
    const offsetY = -14 - stackSlot * 18;
    const ty = clampNumber(baseY + offsetY, innerTop + 12, innerBottom - 14);
    const lineEndX = textAnchor === "start" ? tx - 4 : tx + 4;
    const label = truncate(entry.title ?? "improvement", labelMaxChars);
    const formattedValue = formatNumber(entry.value);
    const boxWidth = Math.max(label.length * 5.5, formattedValue.length * 4.8) + 8;
    return { baseX, baseY, boxWidth, formattedValue, label, lineEndX, textAnchor, tx, ty };
  });

  const annotationLayouts = [...rawAnnotations];
  annotationLayouts.sort((left, right) => {
    if (left.ty !== right.ty) {
      return left.ty - right.ty;
    }
    return left.baseX - right.baseX;
  });
  const minAnnotationGap = 27;
  const minAnnotationY = innerTop + 12;
  const maxAnnotationY = innerBottom - 16;
  let previousY = Number.NEGATIVE_INFINITY;
  for (const annotation of annotationLayouts) {
    annotation.ty = clampNumber(
      Math.max(annotation.ty, previousY + minAnnotationGap),
      minAnnotationY,
      maxAnnotationY,
    );
    previousY = annotation.ty;
  }
  const overflow = (annotationLayouts.at(-1)?.ty ?? maxAnnotationY) - maxAnnotationY;
  if (overflow > 0) {
    previousY = Number.NEGATIVE_INFINITY;
    for (const annotation of annotationLayouts) {
      annotation.ty = clampNumber(
        Math.max(annotation.ty - overflow, previousY + minAnnotationGap),
        minAnnotationY,
        maxAnnotationY,
      );
      previousY = annotation.ty;
    }
  }

  const annotations = annotationLayouts.map((entry) => {
    const boxX = entry.textAnchor === "start" ? entry.tx - 4 : entry.tx - entry.boxWidth + 4;
    return (
      <g key={`annotation:${entry.label}:${entry.formattedValue}:${entry.baseX}:${entry.baseY}`}>
        <line
          x1={entry.baseX}
          y1={entry.baseY}
          x2={entry.lineEndX}
          y2={entry.ty + 3}
          stroke="#2b6a47"
          strokeWidth={0.6}
        />
        <rect
          x={boxX}
          y={entry.ty - 11}
          width={entry.boxWidth}
          height={25}
          rx={2}
          fill="#ffffff"
          opacity={0.9}
        />
        <text
          x={entry.tx}
          y={entry.ty}
          textAnchor={entry.textAnchor}
          fill="#1a1a1a"
          fontSize={10}
          fontWeight={500}
        >
          {entry.label}
        </text>
        <text
          x={entry.tx}
          y={entry.ty + 11}
          textAnchor={entry.textAnchor}
          fill="#5e5e63"
          fontSize={9}
        >
          {entry.formattedValue}
        </text>
      </g>
    );
  });

  const directionLabel: string =
    props.series.direction === "higher" ? "higher is better ↑" : "lower is better ↓";

  return (
    <svg
      className="progress-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={props.ariaLabel ?? `Running best of ${props.series.metricName} over experiments`}
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      <text x={innerLeft} y={innerTop - 14} fill="#1a1a1a" fontSize={12} fontWeight={600}>
        {props.series.metricName}{" "}
        <tspan fill="#5e5e63" fontWeight={400}>
          {directionLabel}
        </tspan>
      </text>
      {yTicks.map((tick) => (
        <line
          key={`y-grid:${tickKey(tick)}`}
          x1={innerLeft}
          x2={innerRight}
          y1={tick.y}
          y2={tick.y}
          stroke="#ece9e0"
          strokeWidth={0.6}
        />
      ))}
      {yTicks.map((tick) => (
        <text
          key={`y-label:${tickKey(tick)}`}
          x={innerLeft - 8}
          y={tick.y + 3}
          textAnchor="end"
          fill="#5e5e63"
          fontSize={10}
        >
          {formatNumber(tick.value)}
        </text>
      ))}
      {xTicks.map((tick) => (
        <line
          key={`x-tick:${tickKey(tick)}`}
          x1={tick.x}
          x2={tick.x}
          y1={innerBottom}
          y2={innerBottom + 4}
          stroke="#1a1a1a"
          strokeWidth={0.6}
        />
      ))}
      {xTicks.map((tick) => (
        <text
          key={`x-label:${tickKey(tick)}`}
          x={tick.x}
          y={innerBottom + 18}
          textAnchor="middle"
          fill="#5e5e63"
          fontSize={10}
        >
          {tick.value}
        </text>
      ))}
      <line
        x1={innerLeft}
        y1={innerTop}
        x2={innerLeft}
        y2={innerBottom}
        stroke="#1a1a1a"
        strokeWidth={0.75}
      />
      <line
        x1={innerLeft}
        y1={innerBottom}
        x2={innerRight}
        y2={innerBottom}
        stroke="#1a1a1a"
        strokeWidth={0.75}
      />
      <text
        x={innerLeft - 44}
        y={innerTop + innerHeight / 2}
        transform={`rotate(-90 ${innerLeft - 44} ${innerTop + innerHeight / 2})`}
        textAnchor="middle"
        fill="#1a1a1a"
        fontSize={11}
      >
        {props.series.metricName}
        {props.series.unit !== undefined ? ` (${props.series.unit})` : ""}
      </text>
      <text
        x={innerLeft + innerWidth / 2}
        y={height - 14}
        textAnchor="middle"
        fill="#1a1a1a"
        fontSize={11}
      >
        experiment ordinal
      </text>
      {baselineValue !== undefined && (
        <>
          <line
            x1={innerLeft}
            x2={innerRight}
            y1={yScale(baselineValue)}
            y2={yScale(baselineValue)}
            stroke="#9b9aa0"
            strokeWidth={0.6}
            strokeDasharray="3 3"
          />
          <text
            x={innerRight - 6}
            y={yScale(baselineValue) - 6}
            textAnchor="end"
            fill="#5e5e63"
            fontSize={10}
          >
            baseline {formatNumber(baselineValue)}
          </text>
        </>
      )}
      {experimentPoints.map((point) => (
        <circle
          key={`dot:${metricPointKey(point)}`}
          cx={xScale(point.experimentOrdinal)}
          cy={yScale(point.value)}
          r={2.6}
          fill="#c9c5b8"
        />
      ))}
      {runningBest.length > 0 && (
        <path
          d={stepCommands.join(" ")}
          fill="none"
          stroke="#2b6a47"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {runningBest.map((entry) => (
        <circle
          key={`kept:${runningBestKey(entry)}`}
          cx={xScale(entry.ordinal)}
          cy={yScale(entry.value)}
          r={4.2}
          fill="#2b6a47"
          stroke="#ffffff"
          strokeWidth={1.2}
        />
      ))}
      {annotations}
    </svg>
  );
}

function EmptyProgressChart(props: { width: number; height: number; ariaLabel?: string }) {
  const innerLeft = margin.left;
  const innerRight = props.width - margin.right;
  const innerTop = margin.top;
  const innerBottom = props.height - margin.bottom;
  return (
    <svg
      className="progress-chart"
      viewBox={`0 0 ${props.width} ${props.height}`}
      role="img"
      aria-label={props.ariaLabel ?? "Progress chart with no data"}
    >
      <rect x={0} y={0} width={props.width} height={props.height} fill="#ffffff" />
      <line
        x1={innerLeft}
        y1={innerTop}
        x2={innerLeft}
        y2={innerBottom}
        stroke="#1a1a1a"
        strokeWidth={0.75}
      />
      <line
        x1={innerLeft}
        y1={innerBottom}
        x2={innerRight}
        y2={innerBottom}
        stroke="#1a1a1a"
        strokeWidth={0.75}
      />
      <text
        x={(innerLeft + innerRight) / 2}
        y={(innerTop + innerBottom) / 2}
        textAnchor="middle"
        fill="#9b9aa0"
        fontSize={13}
      >
        Awaiting measurements
      </text>
    </svg>
  );
}

export function pickImprovementDirection(metricName: string): ImprovementDirection {
  const lowered = metricName.toLowerCase();
  const lowerIsBetter = [
    "latency",
    "loss",
    "error",
    "bpb",
    "ppl",
    "perplexity",
    "duration",
    "time_ms",
    "_ms",
    "_seconds",
    "_minutes",
    "regression",
    "cost",
    "memory",
    "size",
  ];
  for (const marker of lowerIsBetter) {
    if (lowered.includes(marker)) {
      return "lower";
    }
  }
  return "higher";
}

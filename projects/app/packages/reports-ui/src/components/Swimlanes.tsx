import type { SwimlaneMark, SwimlaneRow } from "../types.js";
import { formatNumber, truncate } from "./svg-helpers.js";

export type SwimlanesProps = {
  readonly rows: readonly SwimlaneRow[];
  readonly startMs: number;
  readonly endMs: number;
  readonly ariaLabel?: string;
};

function markKey(actor: string, mark: SwimlaneMark): string {
  return [actor, mark.kind, mark.atMs, mark.detail].join(":");
}

/**
 * Gantt-style actor swimlane chart on a normalized time axis.
 */
export function Swimlanes(props: SwimlanesProps) {
  if (props.rows.length === 0 || props.endMs <= props.startMs) {
    return (
      <svg
        className="swimlane-svg"
        viewBox="0 0 800 200"
        role="img"
        aria-label={props.ariaLabel ?? "Empty swimlanes"}
      >
        <rect x={0} y={0} width={800} height={200} fill="#ffffff" />
        <text x={400} y={100} textAnchor="middle" fill="#9b9aa0" fontSize={13}>
          No timestamped activity yet.
        </text>
      </svg>
    );
  }

  const width = 820;
  const rowHeight = 32;
  const leftPad = 160;
  const rightPad = 24;
  const topPad = 28;
  const bottomPad = 38;
  const totalHeight = topPad + props.rows.length * rowHeight + bottomPad + 18;
  const span = Math.max(1, props.endMs - props.startMs);
  const xScale = (atMs: number): number =>
    leftPad + ((atMs - props.startMs) / span) * (width - leftPad - rightPad);

  const ticks = buildTimeTicks(props.startMs, props.endMs);
  const axisY = topPad + props.rows.length * rowHeight + 10;

  return (
    <svg
      className="swimlane-svg"
      viewBox={`0 0 ${width} ${totalHeight}`}
      role="img"
      aria-label={props.ariaLabel ?? "Actor swimlanes over time"}
    >
      <rect x={0} y={0} width={width} height={totalHeight} fill="#ffffff" />
      {props.rows.map((row, rowIndex) => {
        const y = topPad + rowIndex * rowHeight + rowHeight / 2;
        return (
          <g key={row.actor}>
            <text x={leftPad - 12} y={y + 4} textAnchor="end" fill="#1a1a1a" fontSize={11}>
              {truncate(row.actor, 24)}
            </text>
            <line
              x1={leftPad}
              y1={y}
              x2={width - rightPad}
              y2={y}
              stroke="#ece9e0"
              strokeWidth={0.8}
            />
            {row.marks.map((mark) => (
              <SwimlaneMarkShape
                key={markKey(row.actor, mark)}
                cx={xScale(mark.atMs)}
                cy={y}
                mark={mark}
              />
            ))}
          </g>
        );
      })}
      <line
        x1={leftPad}
        y1={axisY}
        x2={width - rightPad}
        y2={axisY}
        stroke="#1a1a1a"
        strokeWidth={0.6}
      />
      {ticks.map((tick) => (
        <g key={`tick:${tick.atMs}:${tick.label}`}>
          <line
            x1={xScale(tick.atMs)}
            x2={xScale(tick.atMs)}
            y1={axisY}
            y2={axisY + 4}
            stroke="#1a1a1a"
            strokeWidth={0.5}
          />
          <text
            x={xScale(tick.atMs)}
            y={axisY + 18}
            textAnchor="middle"
            fill="#5e5e63"
            fontSize={10}
          >
            {tick.label}
          </text>
        </g>
      ))}
      <g transform={`translate(${formatNumber(leftPad)}, ${formatNumber(totalHeight - 8)})`}>
        <circle cx={6} cy={-3} r={3.2} fill="#1a1a1a" />
        <text x={18} y={0} fill="#5e5e63" fontSize={10}>
          creation
        </text>
        <rect x={92} y={-7} width={8} height={8} fill="#2b6a47" />
        <text x={106} y={0} fill="#5e5e63" fontSize={10}>
          measurement
        </text>
        <polygon points="200,1 206,-7 212,1" fill="#a14e16" />
        <text x={220} y={0} fill="#5e5e63" fontSize={10}>
          review
        </text>
        <polygon points="276,-7 284,-3 276,1" fill="#1a1a1a" />
        <text x={292} y={0} fill="#5e5e63" fontSize={10}>
          assignment
        </text>
      </g>
    </svg>
  );
}

function SwimlaneMarkShape(props: { cx: number; cy: number; mark: SwimlaneMark }) {
  switch (props.mark.kind) {
    case "creation":
      return (
        <circle cx={props.cx} cy={props.cy} r={3.2} fill="#1a1a1a">
          <title>{props.mark.detail}</title>
        </circle>
      );
    case "measurement":
      return (
        <rect x={props.cx - 4} y={props.cy - 4} width={8} height={8} fill="#2b6a47">
          <title>{props.mark.detail}</title>
        </rect>
      );
    case "review":
      return (
        <polygon
          points={`${props.cx - 4},${props.cy + 4} ${props.cx},${props.cy - 5} ${props.cx + 4},${props.cy + 4}`}
          fill="#a14e16"
        >
          <title>{props.mark.detail}</title>
        </polygon>
      );
    case "assignment":
      return (
        <polygon
          points={`${props.cx - 4},${props.cy - 4} ${props.cx + 4},${props.cy} ${props.cx - 4},${props.cy + 4}`}
          fill="#1a1a1a"
        >
          <title>{props.mark.detail}</title>
        </polygon>
      );
    default:
      return (
        <circle cx={props.cx} cy={props.cy} r={2} fill="#5e5e63" opacity={0.6}>
          <title>{props.mark.detail}</title>
        </circle>
      );
  }
}

function buildTimeTicks(startMs: number, endMs: number): Array<{ atMs: number; label: string }> {
  if (endMs <= startMs) {
    return [];
  }
  const span = endMs - startMs;
  const ticks: Array<{ atMs: number; label: string }> = [];
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const atMs = startMs + ratio * span;
    const date = new Date(atMs);
    const hours = date.getUTCHours().toString().padStart(2, "0");
    const minutes = date.getUTCMinutes().toString().padStart(2, "0");
    ticks.push({ atMs, label: `${hours}:${minutes}` });
  }
  return ticks;
}

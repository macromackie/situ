import type { ResearchRecord, Sample } from "../../core/src/index";

type Series = { record: ResearchRecord; color: string; points: Sample[] };
export function ScalarPlot({
  series,
  metric,
}: {
  series: Series[];
  metric: string;
}) {
  const values = series.map((line) => line.points[0].value);
  const lower = Math.min(0, ...values);
  const upper = Math.max(0, ...values);
  const span = upper - lower || 1;
  const x = (value: number) => 40 + ((value - lower) / span) * 430;
  const height = series.length * 65 + 40;
  return (
    <svg
      viewBox={`0 0 520 ${height}`}
      role="img"
      aria-label={`${metric}, comparison of final observations`}
      style={{ width: "100%", maxHeight: 280 }}
    >
      {series.map((line, index) => {
        const value = line.points[0].value;
        const y = 40 + index * 65;
        return (
          <g key={line.record.id}>
            <text x="40" y={y - 14} fill="#657183" fontSize="11">
              {line.record.title}
            </text>
            <line
              x1="40"
              x2="470"
              y1={y}
              y2={y}
              stroke="#edf0f5"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <line
              x1={x(0)}
              x2={x(value)}
              y1={y}
              y2={y}
              stroke={line.color}
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx={x(value)} cy={y} r="5" fill={line.color}>
              <title>
                {line.record.title}: {value} {line.points[0].unit}
              </title>
            </circle>
          </g>
        );
      })}
      <text x="40" y={height - 12} fill="#8690a0" fontSize="10">
        {lower.toFixed(2)}
      </text>
      <text
        x="470"
        y={height - 12}
        textAnchor="end"
        fill="#8690a0"
        fontSize="10"
      >
        {(lower + span).toFixed(2)}
      </text>
    </svg>
  );
}

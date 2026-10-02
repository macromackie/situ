import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import type { ResearchRecord, Sample } from "../../core/src/index";
import { styles as s } from "./styles";
import { Card, RecordLink } from "./ui";
import { ScalarPlot } from "./scalar-plot";
import { useMeasurements } from "./measurements";

const colors = ["#5266cf", "#36977d", "#cb8b3f", "#ac67b7"];
function group(sample: Sample) {
  return JSON.stringify([
    sample.metric,
    sample.cohort,
    sample.unit,
    sample.direction,
  ]);
}
function plotPoints(points: Sample[]) {
  if (points.length <= 400) return points;
  const sampled = [points[0]];
  const size = Math.ceil(points.length / 198);
  for (let offset = 1; offset < points.length - 1; offset += size) {
    const bucket = points.slice(
      offset,
      Math.min(offset + size, points.length - 1),
    );
    const minimum = bucket.reduce((best, point) =>
      point.value < best.value ? point : best,
    );
    const maximum = bucket.reduce((best, point) =>
      point.value > best.value ? point : best,
    );
    sampled.push(...[minimum, maximum].sort((a, b) => a.step - b.step));
  }
  sampled.push(points.at(-1)!);
  return [...new Map(sampled.map((point) => [point.id, point])).values()];
}

export function Comparison({
  records,
  samples,
}: {
  records: ResearchRecord[];
  samples: Sample[];
}) {
  const [selected, setSelected] = useState("");
  const [axis, setAxis] = useState("step");
  const ids = new Set(records.map((record) => record.id));
  const history = useMeasurements(
    records.map((record) => record.id),
    samples,
  );
  const relevant = history.samples.filter((sample) => ids.has(sample.recordId));
  const groups = [...new Set([...relevant].reverse().map(group))].sort(
    (a, b) => {
      const priority = (key: string) =>
        ["accuracy", "success", "heldout_accuracy"].includes(JSON.parse(key)[0])
          ? 0
          : 1;
      return priority(a) - priority(b);
    },
  );
  const key = groups.includes(selected) ? selected : groups[0];
  useEffect(() => {
    if (key && key !== selected) setSelected(key);
  }, [key, selected]);
  const matching = relevant.filter((sample) => group(sample) === key);
  const coordinates = new Map(
    relevant
      .filter(
        (sample) =>
          sample.metric === axis &&
          sample.unit ===
            {
              train_tokens: "tokens",
              train_seconds: "seconds",
              environment_steps: "transitions",
            }[axis],
      )
      .map((sample) => [
        `${sample.recordId}:${sample.cohort}:${sample.step}`,
        sample.value,
      ]),
  );
  const points = matching.flatMap((sample) => {
    const coordinate =
      axis === "step"
        ? sample.step
        : coordinates.get(`${sample.recordId}:${sample.cohort}:${sample.step}`);
    return coordinate === undefined ? [] : [{ ...sample, step: coordinate }];
  });
  const axisLabel =
    {
      step: "updates",
      train_tokens: "forward tokens",
      train_seconds: "training seconds",
      environment_steps: "environment transitions",
    }[axis] ?? axis;
  const chosenIds = [...new Set(points.map((sample) => sample.recordId))].slice(
    -4,
  );
  const series = chosenIds.map((id, index) => ({
    record: records.find((record) => record.id === id)!,
    color: colors[index],
    points: points
      .filter((point) => point.recordId === id)
      .sort((a, b) => a.step - b.step),
  }));
  const values = series.flatMap((line) => line.points);
  const minY = values.reduce(
    (minimum, point) => Math.min(minimum, point.value),
    Infinity,
  );
  const maxY = values.reduce(
    (maximum, point) => Math.max(maximum, point.value),
    -Infinity,
  );
  const maxX = values.reduce(
    (maximum, point) => Math.max(maximum, point.step),
    1,
  );
  const spread = maxY - minY || Math.max(Math.abs(maxY) * 0.1, 1);
  const lower = minY - spread * 0.1;
  const upper = maxY + spread * 0.1;
  const x = (step: number) => 48 + (step / maxX) * 440;
  const y = (value: number) => 175 - ((value - lower) / (upper - lower)) * 145;
  return (
    <Card
      title="Compare measurements"
      aside={
        groups.length > 0 && (
          <div {...stylex.props(s.row)}>
            <select
              aria-label="Horizontal axis"
              {...stylex.props(s.input)}
              value={axis}
              onChange={(event) => setAxis(event.target.value)}
            >
              <option value="step">Updates</option>
              <option value="train_tokens">Forward tokens</option>
              <option value="train_seconds">Training seconds</option>
              <option value="environment_steps">Environment transitions</option>
            </select>
            <select
              aria-label="Metric and cohort"
              {...stylex.props(s.input)}
              value={key}
              onChange={(event) => setSelected(event.target.value)}
            >
              {groups.map((item) => {
                const [metric, cohort] = JSON.parse(item);
                return (
                  <option value={item} key={item}>
                    {metric} · {cohort}
                  </option>
                );
              })}
            </select>
          </div>
        )
      }
    >
      {history.error && (
        <div {...stylex.props(s.cardBody)}>
          Measurement refresh failed. Showing retained observations.{" "}
          <button {...stylex.props(s.button)} onClick={history.retry}>
            Retry
          </button>
        </div>
      )}
      {!series.length ? (
        <div {...stylex.props(s.empty)}>
          No matching measurements for this metric and horizontal axis.
        </div>
      ) : (
        <div {...stylex.props(s.cardBody)}>
          {series.every((line) => line.points.length === 1) ? (
            <ScalarPlot series={series} metric={points[0].metric} />
          ) : (
            <svg
              viewBox="0 0 520 215"
              role="img"
              aria-label={`${points[0].metric} by ${axisLabel}, cohort ${points[0].cohort}`}
              style={{ width: "100%", maxHeight: 250 }}
            >
              {[0, 0.5, 1].map((fraction) => {
                const value = lower + fraction * (upper - lower);
                return (
                  <g key={fraction}>
                    <line
                      x1="48"
                      x2="488"
                      y1={y(value)}
                      y2={y(value)}
                      stroke="#edf0f5"
                    />
                    <text
                      x="38"
                      y={y(value) + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#8690a0"
                    >
                      {value.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text x="48" y="202" fontSize="10" fill="#8690a0">
                0
              </text>
              <text
                x="488"
                y="202"
                textAnchor="end"
                fontSize="10"
                fill="#8690a0"
              >
                {maxX.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                {axisLabel}
              </text>
              {series.map((line) => (
                <g key={line.record.id}>
                  <polyline
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2"
                    points={plotPoints(line.points)
                      .map((point) => `${x(point.step)},${y(point.value)}`)
                      .join(" ")}
                  />
                  {plotPoints(line.points).map((point) => (
                    <circle
                      key={point.id}
                      cx={x(point.step)}
                      cy={y(point.value)}
                      r="3"
                      fill={line.color}
                    >
                      <title>
                        {line.record.title}: {point.value} {point.unit} at step{" "}
                        {point.step} {axisLabel}
                      </title>
                    </circle>
                  ))}
                </g>
              ))}
            </svg>
          )}
          <table aria-label="Compared runs">
            <thead>
              <tr>
                <th>Run</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {series.map((line) => (
                <tr key={line.record.id}>
                  <td>
                    <span style={{ color: line.color }}>● </span>
                    <RecordLink record={line.record} />
                  </td>
                  <td {...stylex.props(s.mono)}>
                    {line.points.at(-1)!.value.toFixed(3)}{" "}
                    {line.points.at(-1)!.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p {...stylex.props(s.muted)}>
            {matching.length - points.length > 0 &&
              `${matching.length - points.length} points lack the selected coordinate. `}
            Large curves retain endpoints and bucket extrema. Same metric,
            cohort, unit, and direction. Showing {series.length} of{" "}
            {new Set(points.map((point) => point.recordId)).size} series.{" "}
            {points[0].direction === "neutral"
              ? "No preferred direction."
              : `${points[0].direction === "higher" ? "Higher" : "Lower"} is better.`}
          </p>
        </div>
      )}
    </Card>
  );
}

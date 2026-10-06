import React, { useState } from "react";
import { scaleLinear } from "@visx/scale";
import type { Dataset } from "../../protocol/artifacts.js";
import type { Figure } from "../../protocol/publication/index.js";
import { usePublication } from "../publication/context.js";
import { SelectField } from "../components/index.js";
const colors = ["#2367ad", "#9c6640", "#4f827d", "#8165a2", "#b04e50"];
const number = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(v);
export function Plot({
  figure,
}: {
  figure: Extract<Figure, { kind: "comparison" | "curve" | "matrix" }>;
}) {
  const { view } = usePublication();
  const datasets = figure.assetIds
    .map((id) => view.assets[id]?.dataset)
    .filter((d): d is Dataset => !!d);
  const data = datasets[0];
  const series = datasets.flatMap((d) => d.series);
  const scenarios = [
    ...new Set(series.flatMap((s) => s.values.map((v) => v.scenario))),
  ];
  const [selection, select] = useState(figure.scenario ?? "");
  const scenario = scenarios.includes(selection) ? selection : scenarios[0];
  if (!data)
    return (
      <p className="empty">
        Dataset unavailable. Inspect the source to recover it.
      </p>
    );
  const values = series.map((s) => ({
    ...s,
    observations: s.values.filter((v) => v.scenario === scenario),
  }));
  const all = values
    .flatMap((s) => s.observations)
    .filter((v) => v.value !== null);
  const domainValues = all.flatMap((v) => [
    v.value!,
    v.lower ?? v.value!,
    v.upper ?? v.value!,
  ]);
  const min = Math.min(0, ...domainValues),
    max = Math.max(1e-6, ...domainValues);
  const x = scaleLinear({ domain: [min, max], range: [235, 750], nice: true });
  const ticks = x.ticks(5);
  return (
    <>
      <div className="figure-toolbar">
        <span>
          {data.metric} · {data.unit} ·{" "}
          {data.direction === "higher" ? "higher" : "lower"} is better
        </span>
        {figure.kind !== "matrix" && scenarios.length > 1 && (
          <SelectField
            label="Scenario"
            value={scenario}
            options={scenarios.map((s) => ({ value: s, label: s }))}
            onChange={select}
          />
        )}
      </div>
      {figure.kind === "matrix" ? (
        <div className="table-scroll">
          <table className="scenario-matrix">
            <thead>
              <tr>
                <th>Candidate</th>
                {scenarios.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.id}>
                  <th>
                    {s.label}
                    {s.id === figure.baseline && <small>Baseline</small>}
                  </th>
                  {scenarios.map((sc) => {
                    const v = s.values.filter((v) => v.scenario === sc).at(-1);
                    return (
                      <td
                        key={sc}
                        className={
                          v?.value == null ? "missing-cell" : "measured-cell"
                        }
                        title={
                          v
                            ? `n=${v.n}; ${v.lower === undefined ? "uncertainty unavailable" : `${v.lower}–${v.upper}`}`
                            : "Not measured"
                        }
                      >
                        {number(v?.value)}
                        <small>
                          {v?.value == null ? "Not measured" : `n=${v.n}`}
                        </small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : figure.kind === "comparison" ? (
        <svg
          className="plot"
          viewBox={`0 0 900 ${values.length * 51 + 48}`}
          role="img"
          aria-label={`${figure.title}: ${scenario}. Exact observations follow below.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={12}
                y2={values.length * 51 + 5}
                className="grid-line"
              />
              <text
                x={x(t)}
                y={values.length * 51 + 29}
                textAnchor="middle"
                className="axis-label"
              >
                {number(t)}
              </text>
            </g>
          ))}
          {values.map((s, i) => {
            const v = s.observations.at(-1);
            const y = i * 51 + 31;
            return (
              <g key={s.id}>
                <text x="12" y={y} className="plot-label">
                  {s.label.slice(0, 27)}
                </text>
                {v?.value != null && (
                  <>
                    {v.lower !== undefined && (
                      <line
                        x1={x(v.lower)}
                        x2={x(v.upper!)}
                        y1={y - 4}
                        y2={y - 4}
                        stroke={colors[i % colors.length]}
                        strokeWidth="2"
                      />
                    )}
                    <circle
                      cx={x(v.value)}
                      cy={y - 4}
                      r={s.id === figure.baseline ? 4 : 5}
                      fill={
                        s.id === figure.baseline
                          ? "white"
                          : colors[i % colors.length]
                      }
                      stroke={colors[i % colors.length]}
                      strokeWidth="2"
                    />
                  </>
                )}
                <text x="890" y={y} textAnchor="end" className="plot-label">
                  {number(v?.value)}
                  {s.id === figure.baseline ? " · base" : ""}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <Curve series={values} colors={colors} title={figure.title} />
      )}
      <div className="figure-note">
        Cohort {data.cohortId} · evaluator {data.evaluatorVersion} ·{" "}
        {figure.kind === "comparison"
          ? "Dots: latest observation per candidate. Lines: reported intervals."
          : figure.kind === "curve"
            ? "Steps and intervals are reported by the experiment."
            : "Each cell shows the latest observation. Missing is distinct from zero."}
      </div>
      <details className="exact-values">
        <summary>Exact observations</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Scenario</th>
                <th>Step</th>
                <th>Value</th>
                <th>Interval</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap((s) =>
                s.values.map((v, i) => (
                  <tr key={s.id + i}>
                    <td>{s.label}</td>
                    <td>{v.scenario}</td>
                    <td>{v.step ?? "—"}</td>
                    <td>{number(v.value)}</td>
                    <td>
                      {v.lower === undefined
                        ? "Not reported"
                        : `${number(v.lower)}–${number(v.upper)}`}
                    </td>
                    <td>{v.n}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
function Curve({
  series,
  colors,
  title,
}: {
  series: Array<
    Dataset["series"][number] & {
      observations: Dataset["series"][number]["values"];
    }
  >;
  colors: string[];
  title: string;
}) {
  const values = series.flatMap((s) => s.observations);
  const x = scaleLinear({
    domain: [
      Math.min(0, ...values.map((v) => v.step ?? 0)),
      Math.max(1, ...values.map((v) => v.step ?? 0)),
    ],
    range: [70, 860],
    nice: true,
  });
  const measured = values.filter((v) => v.value !== null);
  const y = scaleLinear({
    domain: [
      Math.min(0, ...measured.map((v) => v.lower ?? v.value!)),
      Math.max(1e-6, ...measured.map((v) => v.upper ?? v.value!)),
    ],
    range: [235, 20],
    nice: true,
  });
  return (
    <>
      <svg className="plot" viewBox="0 0 900 280" role="img" aria-label={title}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={70} x2={860} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x="56" y={y(t) + 4} textAnchor="end" className="axis-label">
              {number(t)}
            </text>
          </g>
        ))}
        {x.ticks(5).map((t) => (
          <text
            key={t}
            x={x(t)}
            y="259"
            textAnchor="middle"
            className="axis-label"
          >
            {number(t)}
          </text>
        ))}
        {series.map((s, i) => {
          let pen = false;
          const ordered = [...s.observations].sort((a, b) => a.step! - b.step!);
          const path = ordered
            .map((v) => {
              if (v.value === null) {
                pen = false;
                return "";
              }
              const op = pen ? "L" : "M";
              pen = true;
              return `${op}${x(v.step!)},${y(v.value)}`;
            })
            .join(" ");
          return (
            <g key={s.id}>
              <path
                d={path}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="2"
              />
              {ordered
                .filter((v) => v.value !== null)
                .map((v, j) => (
                  <g key={j}>
                    {v.lower !== undefined && (
                      <line
                        x1={x(v.step!)}
                        x2={x(v.step!)}
                        y1={y(v.lower)}
                        y2={y(v.upper!)}
                        stroke={colors[i % colors.length]}
                        opacity=".45"
                      />
                    )}
                    <circle
                      cx={x(v.step!)}
                      cy={y(v.value!)}
                      r="3"
                      fill={colors[i % colors.length]}
                    />
                  </g>
                ))}
            </g>
          );
        })}
      </svg>
      <div className="figure-legend">
        {series.map((s, i) => (
          <span key={s.id}>
            <i style={{ background: colors[i % colors.length] }} />
            {s.label}
          </span>
        ))}
      </div>
    </>
  );
}

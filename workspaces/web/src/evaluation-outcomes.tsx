import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import type { ResearchRecord, Sample } from "../../core/src/index";
import { useMeasurements } from "./measurements";
import { RunOutcome } from "./experiment-flow";
import { styles as s } from "./styles";
import { Badge, Card, RecordLink } from "./ui";

function comparisonKey(sample: Sample) {
  return JSON.stringify([
    sample.metric,
    sample.cohort,
    sample.unit,
    sample.direction,
  ]);
}

function comparisonLabel(key: string) {
  const [metric, cohort, unit, direction] = JSON.parse(key);
  const preference =
    direction === "neutral" ? "neutral" : `${direction} is better`;
  return `${metric} · ${cohort} · ${unit || "unitless"} · ${preference}`;
}

const number = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 5,
});

export function EvaluationOutcomes({
  records,
  samples,
}: {
  records: ResearchRecord[];
  samples: Sample[];
}) {
  const evaluations = records.filter(
    (record) => record.kind === "run" && record.metadata.stage === "evaluate",
  );
  const experiments = records
    .filter(
      (record) =>
        record.kind === "experiment" &&
        evaluations.some((run) =>
          run.links.some((link) => link.target === record.id),
        ),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const [selectedExperiments, setSelectedExperiments] = useState<
    string[] | null
  >(null);
  const experimentIds =
    selectedExperiments ?? experiments.slice(-1).map((record) => record.id);
  const [selectedRuns, setSelectedRuns] = useState<string[] | null>(null);
  const [selectedMetric, setSelectedMetric] = useState("");
  const [metricFilter, setMetricFilter] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (selectedExperiments === null && experimentIds.length) {
      setSelectedExperiments(experimentIds);
    }
  }, [selectedExperiments, experimentIds.join(",")]);
  const runs = evaluations
    .filter((record) =>
      record.links.some((link) => experimentIds.includes(link.target)),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const runIds = new Set(runs.map((record) => record.id));
  const history = useMeasurements([...runIds], samples);
  const relevant = history.samples.filter((sample) =>
    runIds.has(sample.recordId),
  );
  const groups = [...new Set(relevant.map(comparisonKey))].sort();
  const defaultMetric =
    groups.find((key) =>
      ["accuracy", "success", "heldout_accuracy"].includes(JSON.parse(key)[0]),
    ) ??
    groups[0] ??
    "";
  const metric = groups.includes(selectedMetric)
    ? selectedMetric
    : defaultMetric;
  useEffect(() => {
    if (metric && metric !== selectedMetric) setSelectedMetric(metric);
  }, [metric, selectedMetric]);
  const matchingGroups = groups.filter((key) =>
    comparisonLabel(key)
      .toLowerCase()
      .includes(metricFilter.trim().toLowerCase()),
  );
  const selectedOutsideFilter =
    metric !== "" && !matchingGroups.includes(metric);
  const finalSamples = new Map<string, Sample>();
  for (const sample of relevant) {
    if (comparisonKey(sample) !== metric) continue;
    const previous = finalSamples.get(sample.recordId);
    if (!previous || sample.step > previous.step)
      finalSamples.set(sample.recordId, sample);
  }
  const chosenRuns = runs.filter(
    (record) => !selectedRuns || selectedRuns.includes(record.id),
  );
  const filteredRuns = chosenRuns.filter((record) =>
    record.title.toLowerCase().includes(search.toLowerCase()),
  );
  const visible = expanded ? filteredRuns : filteredRuns.slice(0, 12);
  if (!experiments.length) return null;
  return (
    <section {...stylex.props(s.section)}>
      <Card
        title="Evaluation outcomes"
        aside={
          <span {...stylex.props(s.muted)}>
            {chosenRuns.length} runs selected
          </span>
        }
      >
        <div {...stylex.props(s.toolbar)}>
          <details {...stylex.props(outcomes.picker)}>
            <summary>
              Choose experiments · {experimentIds.length} selected
            </summary>
            <div {...stylex.props(s.form)}>
              {[...experiments].reverse().map((record) => (
                <label key={record.id} {...stylex.props(s.row)}>
                  <input
                    type="checkbox"
                    checked={experimentIds.includes(record.id)}
                    disabled={
                      experimentIds.length >= 4 &&
                      !experimentIds.includes(record.id)
                    }
                    onChange={(event) => {
                      setSelectedExperiments(
                        event.target.checked
                          ? [...experimentIds, record.id]
                          : experimentIds.filter((id) => id !== record.id),
                      );
                      setSelectedRuns(null);
                      setExpanded(false);
                    }}
                  />
                  {record.title}
                </label>
              ))}
              <span {...stylex.props(s.muted)}>
                Choose up to four experiments.
              </span>
            </div>
          </details>
          {runs.length > 1 && (
            <details {...stylex.props(outcomes.picker)}>
              <summary>Choose runs · {chosenRuns.length} selected</summary>
              <div {...stylex.props(s.form)}>
                {runs.map((record) => (
                  <label key={record.id} {...stylex.props(s.row)}>
                    <input
                      type="checkbox"
                      checked={
                        !selectedRuns || selectedRuns.includes(record.id)
                      }
                      onChange={(event) => {
                        const chosen = selectedRuns ?? [...runIds];
                        setSelectedRuns(
                          event.target.checked
                            ? [...chosen, record.id]
                            : chosen.filter((id) => id !== record.id),
                        );
                      }}
                    />
                    {record.title}
                  </label>
                ))}
                <button
                  {...stylex.props(s.button)}
                  onClick={() => setSelectedRuns(null)}
                >
                  Use all runs
                </button>
              </div>
            </details>
          )}
        </div>
        <div {...stylex.props(s.cardBody, outcomes.controls)}>
          {groups.length > 0 && (
            <div {...stylex.props(outcomes.field)}>
              {(groups.length > 12 || metricFilter !== "") && (
                <input
                  aria-label="Filter outcome metrics"
                  placeholder="Filter metrics or cohorts…"
                  {...stylex.props(s.input)}
                  value={metricFilter}
                  onChange={(event) => setMetricFilter(event.target.value)}
                />
              )}
              <label {...stylex.props(outcomes.field)}>
                <span {...stylex.props(s.muted)}>
                  Metric and evaluation cohort
                </span>
                <select
                  aria-label="Outcome metric and cohort"
                  {...stylex.props(s.input, outcomes.select)}
                  value={metric}
                  onChange={(event) => setSelectedMetric(event.target.value)}
                >
                  {selectedOutsideFilter && (
                    <option value={metric}>
                      Selected: {comparisonLabel(metric)}
                    </option>
                  )}
                  {matchingGroups.map((key) => (
                    <option key={key} value={key}>
                      {comparisonLabel(key)}
                    </option>
                  ))}
                </select>
              </label>
              <div {...stylex.props(s.muted, outcomes.wrap)}>
                {comparisonLabel(metric)}
              </div>
              {metricFilter && (
                <div {...stylex.props(s.muted)} role="status">
                  {matchingGroups.length} of {groups.length} metrics match.
                  {selectedOutsideFilter && " Current selection is retained."}
                </div>
              )}
            </div>
          )}
          <input
            aria-label="Filter evaluation runs"
            placeholder="Filter run titles…"
            {...stylex.props(s.input)}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div {...stylex.props(s.muted)}>
            Latest recorded step for each evaluation run. Missing observations
            stay visible. Each cohort is compared separately.
          </div>
          {!history.complete && !history.error && (
            <div {...stylex.props(s.muted)} role="status">
              Loading full measurement history…
            </div>
          )}
          <div {...stylex.props(s.row, outcomes.wrap)}>
            <span {...stylex.props(s.muted)}>From selected experiments:</span>
            {experiments
              .filter((record) => experimentIds.includes(record.id))
              .map((record) => (
                <RecordLink key={record.id} record={record} />
              ))}
          </div>
        </div>
        {history.error && (
          <div {...stylex.props(s.cardBody)} role="status">
            Measurement refresh failed. Showing retained observations.{" "}
            <button {...stylex.props(s.button)} onClick={history.retry}>
              Retry
            </button>
          </div>
        )}
        <div
          {...stylex.props(outcomes.table)}
          role="region"
          aria-label="Scrollable evaluation outcomes"
          tabIndex={0}
        >
          <table aria-label="Evaluation outcomes">
            <thead>
              <tr>
                <th>Evaluation run</th>
                <th>Value</th>
                <th>Step</th>
                <th>Execution / gate</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((record) => {
                const sample = finalSamples.get(record.id);
                const trainLink = record.links.find(
                  (link) => link.relation === "derived_from",
                );
                const train = records.find(
                  (item) => item.id === trainLink?.target,
                );
                return (
                  <tr key={record.id}>
                    <td {...stylex.props(outcomes.run)}>
                      <RecordLink record={record} />
                      {train && (
                        <div {...stylex.props(s.muted, outcomes.source)}>
                          Checkpoint: <RecordLink record={train} />
                          {trainLink?.revision && (
                            <>
                              {" · "}
                              <a
                                {...stylex.props(s.link)}
                                href={`/api/records/${encodeURIComponent(train.id)}?revision=${trainLink.revision}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Saved revision {trainLink.revision} ↗
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td {...stylex.props(s.mono)}>
                      {sample ? (
                        number.format(sample.value)
                      ) : (
                        <span {...stylex.props(s.muted)}>
                          {history.complete ? "No observation" : "Not loaded"}
                        </span>
                      )}
                      {sample && record.metadata.outcome === "failed" && (
                        <div {...stylex.props(outcomes.partial)}>
                          Partial · evaluation failed
                        </div>
                      )}
                    </td>
                    <td {...stylex.props(s.mono)}>{sample?.step ?? "—"}</td>
                    <td>
                      <Badge state={record.state} />
                      <RunOutcome record={record} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filteredRuns.length && (
          <div {...stylex.props(s.empty)}>
            Choose experiments and runs with matching titles to see their
            evaluation outcomes.
          </div>
        )}
        {filteredRuns.length > 12 && (
          <div {...stylex.props(s.cardBody)}>
            <button
              {...stylex.props(s.button)}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Show first 12 runs"
                : `Show all ${filteredRuns.length} runs`}
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}

const outcomes = stylex.create({
  picker: { flex: "1 1 260px", minWidth: 0 },
  controls: { display: "flex", flexDirection: "column", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 7, minWidth: 0 },
  select: { width: "100%" },
  table: { overflowX: "auto" },
  run: { minWidth: 260 },
  source: { marginTop: 5 },
  wrap: { overflowWrap: "anywhere" },
  partial: {
    color: "#9b6e21",
    fontSize: 12,
    fontFamily: "inherit",
    marginTop: 5,
  },
});

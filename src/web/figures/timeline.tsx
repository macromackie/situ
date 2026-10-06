import React from "react";
import { scaleLinear } from "@visx/scale";
import type { Figure } from "../../protocol/publication/index.js";
import { usePublication } from "../publication/context.js";
export function Timeline({
  figure,
}: {
  figure: Extract<Figure, { kind: "timeline" }>;
}) {
  const { view, inspect } = usePublication();
  const items = figure.items
    .map((item) => {
      const record =
        view.sources[item.source.snapshotId]?.records[item.source.recordId];
      return {
        ...item,
        start: Number(record?.[item.startField]),
        end: Number(record?.[item.endField ?? item.startField]),
      };
    })
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));
  const start = Math.min(...items.map((i) => i.start));
  const end = Math.max(start + 60000, ...items.map((i) => i.end));
  const scale = scaleLinear({ domain: [start, end], range: [0, 100] });
  if (!items.length)
    return <p className="empty">No sourced events on this timeline.</p>;
  return (
    <div className="timeline-scroll">
      <div className="research-timeline">
        <div className="timeline-axis">
          <span>Research question</span>
          <div>
            {[0, 1, 2, 3, 4].map((i) => {
              const time = new Date(start + ((end - start) * i) / 4);
              return (
                <time
                  key={i}
                  style={{ left: `${i * 25}%` }}
                  title={time.toLocaleString()}
                >
                  {time.toLocaleString([], {
                    ...(end - start > 86400000
                      ? { month: "short", day: "numeric" }
                      : {}),
                    ...(end - start < 300000 ? { second: "2-digit" } : {}),
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              );
            })}
          </div>
        </div>
        {figure.lanes.map((lane) => (
          <div className="timeline-lane" key={lane.id}>
            <div className="timeline-label">
              {lane.pageId ? (
                <a href={`#/projects/${view.project.id}/pages/${lane.pageId}`}>
                  {lane.label}
                </a>
              ) : (
                lane.label
              )}
            </div>
            <div
              className="timeline-track"
              style={{
                minHeight: Math.max(
                  58,
                  items.filter((i) => i.laneId === lane.id).length * 34 + 12,
                ),
              }}
            >
              {items
                .filter((i) => i.laneId === lane.id)
                .map((item, index) => (
                  <button
                    key={item.id}
                    className={
                      "timeline-event " +
                      (scale(item.start) > 70 ? "end-label" : "")
                    }
                    onClick={() => inspect([item.source])}
                    style={{
                      left: `${scale(item.start)}%`,
                      width: `${Math.max(1, scale(item.end) - scale(item.start))}%`,
                      top: index * 34 + 12,
                    }}
                    aria-label={item.label}
                    title={`${item.label}: ${new Date(item.start).toLocaleString()} – ${new Date(item.end).toLocaleString()}`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        <p className="figure-note">
          Position and span show source timestamps. Duration does not measure
          research progress.
        </p>
      </div>
    </div>
  );
}
export function EvidenceMap({
  figure,
}: {
  figure: Extract<Figure, { kind: "evidence" }>;
}) {
  const { inspect } = usePublication();
  const [selected, setSelected] = React.useState(figure.nodes[0]?.id);
  const nodes = figure.nodes.filter(
    (n) =>
      n.id === selected ||
      figure.edges.some(
        (e) =>
          (e.from === selected && e.to === n.id) ||
          (e.to === selected && e.from === n.id),
      ),
  );
  return (
    <div className="evidence-map">
      <div className="evidence-choices" aria-label="Focus a claim">
        {figure.nodes.map((n) => (
          <button
            key={n.id}
            className={selected === n.id ? "control active" : "control"}
            onClick={() => setSelected(n.id)}
          >
            {n.label}
          </button>
        ))}
      </div>
      <div className="evidence-connections">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={
              n.id === selected ? "evidence-node focused" : "evidence-node"
            }
          >
            <button onClick={() => inspect([n.source])}>{n.label} ↗</button>
            {figure.edges
              .filter(
                (e) =>
                  (e.from === n.id && e.to === selected) ||
                  (e.to === n.id && e.from === selected),
              )
              .map((e, i) => (
                <small key={i}>
                  {e.from === n.id
                    ? `→ ${e.relationship} →`
                    : `← ${e.relationship} ←`}{" "}
                  {
                    figure.nodes.find(
                      (x) => x.id === (e.from === n.id ? e.to : e.from),
                    )?.label
                  }
                </small>
              ))}
          </div>
        ))}
      </div>
      <p className="figure-note">
        Connections are cited research relationships. Select a claim to inspect
        its immediate evidence.
      </p>
    </div>
  );
}

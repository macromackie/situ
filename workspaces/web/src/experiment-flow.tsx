import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ResearchRecord } from "../../core/src/index";
import { styles as s } from "./styles";
import { Badge, Card, RecordLink } from "./ui";

export function ExperimentFlow({
  records,
  context,
}: {
  records: ResearchRecord[];
  context: ResearchRecord[];
}) {
  const [expanded, setExpanded] = useState(false);
  const attempts = new Map<string, ResearchRecord[]>();
  for (const record of records) {
    const attempt = record.metadata.attempt;
    if (record.kind !== "run" || typeof attempt !== "string") continue;
    const group = attempts.get(attempt) ?? [];
    group.push(record);
    attempts.set(attempt, group);
  }
  if (!attempts.size) return null;
  const groups = [...attempts];
  const visible = expanded ? groups : groups.slice(-6);
  return (
    <section {...stylex.props(s.section)}>
      <Card
        title="Training branches"
        aside={<span {...stylex.props(s.muted)}>{groups.length} attempts</span>}
      >
        {visible.map(([attempt, stages]) => {
          const train = context
            .filter((record) => record.metadata.attempt === attempt)
            .find((record) => record.metadata.stage === "train");
          const input = train?.links
            .filter((link) => link.relation === "derived_from")
            .map((link) => context.find((record) => record.id === link.target))
            .find((record) => record && record.metadata.attempt !== attempt);
          const phase = stages[0].metadata.phase;
          return (
            <div key={attempt} {...stylex.props(s.item)}>
              <div {...stylex.props(s.row)}>
                <strong>
                  {train?.title.replace(/ · train$/, "") ?? stages[0].title}
                </strong>
                {typeof phase === "string" && <Badge state={phase} />}
              </div>
              <RunAttribution record={train ?? stages[0]} />
              <div {...stylex.props(s.muted)} style={{ marginTop: 8 }}>
                {input ? (
                  <>
                    Checkpoint from <RecordLink record={input} />
                  </>
                ) : train ? (
                  "From scratch"
                ) : (
                  "Waiting for training inputs"
                )}
              </div>
              <div {...stylex.props(flow.stages)}>
                {stages
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((record) => (
                    <div key={record.id} {...stylex.props(flow.stage)}>
                      <RecordLink record={record}>
                        {typeof record.metadata.stage === "string"
                          ? record.metadata.stage
                          : record.title}
                      </RecordLink>
                      <RunOutcome record={record} />
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
        {groups.length > 6 && (
          <div {...stylex.props(s.cardBody)}>
            <button
              {...stylex.props(s.button)}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Show recent six"
                : `Show all ${groups.length} branches`}
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}

export function RunAttribution({ record }: { record: ResearchRecord }) {
  const {
    method,
    seed,
    parent_method,
    parent_seed,
    parent_title,
    parent_attempt,
  } = record.metadata;
  const current: string[] = [];
  if (typeof method === "string") current.push(`Method ${method}`);
  if (typeof seed === "number" || typeof seed === "string")
    current.push(`seed ${seed}`);
  const parent: string[] = [];
  if (typeof parent_method === "string") parent.push(parent_method);
  if (typeof parent_seed === "number" || typeof parent_seed === "string")
    parent.push(`seed ${parent_seed}`);
  const hasParentDetails =
    typeof parent_title === "string" || typeof parent_attempt === "string";
  if (!current.length && !parent.length && !hasParentDetails) return null;
  const parentLabel = ["Immediate parent", ...parent].join(" · ");
  return (
    <div {...stylex.props(s.muted, flow.attribution)}>
      {current.length > 0 && <div>{current.join(" · ")}</div>}
      {hasParentDetails ? (
        <details>
          <summary>{parentLabel}</summary>
          <div {...stylex.props(flow.parent)}>
            {typeof parent_title === "string" && <div>{parent_title}</div>}
            {typeof parent_attempt === "string" && (
              <div {...stylex.props(s.mono)}>{parent_attempt}</div>
            )}
          </div>
        </details>
      ) : (
        parent.length > 0 && <div>{parentLabel}</div>
      )}
    </div>
  );
}

export function RunOutcome({ record }: { record: ResearchRecord }) {
  const { outcome, gate, error } = record.metadata;
  return (
    <div {...stylex.props(s.row)}>
      {typeof outcome === "string" && <Badge state={outcome} />}
      {typeof gate === "string" && <Badge state={`gate ${gate}`} />}
      {typeof error === "string" && (
        <span {...stylex.props(flow.error)}>{error}</span>
      )}
    </div>
  );
}

const flow = stylex.create({
  attribution: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    marginTop: 5,
    overflowWrap: "anywhere",
  },
  parent: { display: "flex", flexDirection: "column", gap: 5, marginTop: 8 },
  stages: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 },
  stage: {
    flex: "1 1 160px",
    border: "1px solid #e2e6ed",
    borderRadius: 6,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  error: { color: "#a13f40", overflowWrap: "anywhere" },
});

import * as stylex from "@stylexjs/stylex";
import type { ResearchRecord } from "../../core/src/index";
import { styles as s } from "./styles";
import { Badge, Card, RecordLink } from "./ui";

export function ExperimentFlow({ records }: { records: ResearchRecord[] }) {
  const attempts = new Map<string, ResearchRecord[]>();
  for (const record of records) {
    const attempt = record.metadata.attempt;
    if (record.kind !== "run" || typeof attempt !== "string") continue;
    const group = attempts.get(attempt) ?? [];
    group.push(record);
    attempts.set(attempt, group);
  }
  if (!attempts.size) return null;
  return (
    <section {...stylex.props(s.section)}>
      <Card title="Experiment flow">
        {[...attempts].map(([attempt, stages]) => (
          <div key={attempt} {...stylex.props(s.item)}>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.mono, s.muted)}>{attempt}</span>
              {typeof stages[0].metadata.phase === "string" && (
                <Badge state={stages[0].metadata.phase} />
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
        ))}
      </Card>
    </section>
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
  stages: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 },
  stage: {
    flex: "1 1 190px",
    border: "1px solid #e2e6ed",
    borderRadius: 6,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  error: { color: "#a13f40", overflowWrap: "anywhere" },
});

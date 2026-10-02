import type { ResearchRecord, Snapshot } from "./model";

export function contextBrief(
  snapshot: Snapshot,
  projectId: string,
  query = "",
) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const projectRecords = snapshot.records.filter(
    (record) => record.projectId === projectId,
  );
  const matches = projectRecords.filter((record) =>
    terms.every((term) =>
      `${record.title} ${record.body} ${record.tags.join(" ")}`
        .toLowerCase()
        .includes(term),
    ),
  );
  const relevant = new Set(matches.map((record) => record.id));
  for (const record of projectRecords) {
    for (const link of record.links) {
      if (
        matches.some(
          (match) => match.id === record.id || match.id === link.target,
        )
      ) {
        relevant.add(record.id);
        relevant.add(link.target);
      }
    }
  }
  const records = projectRecords.filter((record) => relevant.has(record.id));
  const summarize = (record: ResearchRecord) => ({
    id: record.id,
    kind: record.kind,
    title: record.title,
    state: record.state,
    assessment: record.assessment,
    excerpt: record.body.slice(0, 1000),
    excerptTruncated: record.body.length > 1000,
    revision: record.revision,
    updatedAt: record.updatedAt,
    links: record.links,
    artifacts: record.artifacts,
  });
  return {
    project: snapshot.projects.find((project) => project.id === projectId),
    cursor: snapshot.cursor,
    query,
    totalRelevant: records.length,
    findings: records
      .filter((record) => record.kind === "finding")
      .slice(-30)
      .map(summarize),
    active: records
      .filter((record) => record.state === "active")
      .slice(-30)
      .map(summarize),
    other: records
      .filter(
        (record) => record.kind !== "finding" && record.state !== "active",
      )
      .slice(-30)
      .map(summarize),
    note: "Source excerpts, not an inferred consensus. Follow evidence links; omitted records remain available in the snapshot.",
  };
}

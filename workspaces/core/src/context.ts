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
      `${record.id} ${record.title} ${record.body} ${record.tags.join(" ")}`
        .toLowerCase()
        .includes(term),
    ),
  );
  const matchedIds = new Set(matches.map((record) => record.id));
  const relevant = new Set(matchedIds);
  for (const record of projectRecords) {
    for (const link of record.links) {
      if (matchedIds.has(record.id) || matchedIds.has(link.target)) {
        relevant.add(record.id);
        relevant.add(link.target);
      }
    }
  }
  const records = projectRecords
    .filter((record) => relevant.has(record.id))
    .sort((a, b) => {
      if (a.kind === "run" && b.kind !== "run") return 1;
      if (a.kind !== "run" && b.kind === "run") return -1;
      const aMatches = matchedIds.has(a.id);
      const bMatches = matchedIds.has(b.id);
      if (aMatches !== bMatches) return aMatches ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
    });
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
  const findings = records.filter((record) => record.kind === "finding");
  const active = records.filter((record) => record.state === "active");
  const other = records.filter(
    (record) => record.kind !== "finding" && record.state !== "active",
  );
  return {
    project: snapshot.projects.find((project) => project.id === projectId),
    cursor: snapshot.cursor,
    query,
    totalRelevant: records.length,
    findings: findings.slice(0, 30).map(summarize),
    active: active.slice(0, 30).map(summarize),
    other: other.slice(0, 30).map(summarize),
    omitted: {
      findings: Math.max(0, findings.length - 30),
      active: Math.max(0, active.length - 30),
      other: Math.max(0, other.length - 30),
    },
    note: "Source excerpts, not an inferred consensus. Follow evidence links; omitted records remain available in the snapshot.",
  };
}

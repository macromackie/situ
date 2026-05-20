import {
  ActorList,
  BaselineCard,
  Callout,
  Colophon,
  Definition,
  EvidenceBlock,
  Figure,
  Hero,
  LineageTree,
  MetaBlock,
  MetaColumn,
  MetricCard,
  OutcomesTable,
  ProgressChart,
  ReportAside,
  ResearchReport,
  Section,
  SmallMultiples,
  Swimlanes,
  TableOfContents,
} from "@situ/reports-ui";

/**
 * The set of components MDX drafts may reference. The validator rejects any
 * JSX element name not in this map.
 */
export const mdxComponentRegistry = {
  ActorList,
  Aside: ReportAside,
  BaselineCard,
  Callout,
  Colophon,
  Definition,
  EvidenceBlock,
  Figure,
  Hero,
  LineageTree,
  MetaBlock,
  MetaColumn,
  MetricCard,
  OutcomesTable,
  ProgressChart,
  ReportAside,
  ResearchReport,
  Section,
  SmallMultiples,
  Swimlanes,
  TableOfContents,
} as const;

const allComponentNames = Object.keys(mdxComponentRegistry);
allComponentNames.sort();
export const mdxComponentNames = allComponentNames;

export function isRegisteredComponent(name: string): boolean {
  return name in mdxComponentRegistry;
}

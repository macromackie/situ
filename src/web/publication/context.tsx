import { createContext, useContext } from "react";
import type {
  PublicationView,
  SourceRef,
} from "../../protocol/publication/index.js";
export const PublicationContext = createContext<{
  view: PublicationView;
  inspect: (sources: SourceRef[]) => void;
} | null>(null);
export function usePublication() {
  const context = useContext(PublicationContext);
  if (!context) throw new Error("Publication context is missing");
  return context;
}
export function Sources({ refs }: { refs: SourceRef[] }) {
  const { inspect } = usePublication();
  const unique = [
    ...new Map(
      refs.map((r) => [`${r.snapshotId}:${r.recordId}:${r.relationship}`, r]),
    ).values(),
  ];
  if (!unique.length) return null;
  return (
    <button className="source-link" onClick={() => inspect(unique)}>
      {unique.length === 1 ? "Source" : `${unique.length} sources`} ↗
    </button>
  );
}

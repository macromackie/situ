import type { ContentsItem } from "../types.js";

export type TableOfContentsProps = {
  readonly items: readonly ContentsItem[];
};

/**
 * Two-column anchored table of contents.
 */
export function TableOfContents(props: TableOfContentsProps) {
  return (
    <nav className="contents" aria-label="Contents">
      <h6 className="contents-label">Contents</h6>
      <ol className="contents-list">
        {props.items.map((item, index) => (
          <li key={item.id}>
            <span className="contents-index">{String(index + 1).padStart(2, "0")}</span>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

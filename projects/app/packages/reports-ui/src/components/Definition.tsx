import type { ReactNode } from "react";

export type DefinitionProps = {
  readonly term: string;
  readonly children?: ReactNode;
};

/**
 * Inline italicized term for technical vocabulary, with optional definition body.
 */
export function Definition(props: DefinitionProps) {
  return (
    <span className="definition">
      <em>{props.term}</em>
      {props.children !== undefined && <> — {props.children}</>}
    </span>
  );
}

import type { ReactNode } from "react";

export type CalloutKind = "note" | "warning" | "finding";

export type CalloutProps = {
  readonly kind?: CalloutKind;
  readonly children: ReactNode;
};

/**
 * Pull-out block for an important note, warning, or finding.
 */
export function Callout(props: CalloutProps) {
  const kind = props.kind ?? "note";
  return <aside className={`callout callout-${kind}`}>{props.children}</aside>;
}

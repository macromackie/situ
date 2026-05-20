import type { ReactNode } from "react";

export type AsideProps = {
  readonly children: ReactNode;
};

/**
 * Sidenote-style block for ancillary commentary.
 */
export function ReportAside(props: AsideProps) {
  return <aside className="aside">{props.children}</aside>;
}

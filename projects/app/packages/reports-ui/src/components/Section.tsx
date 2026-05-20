import type { ReactNode } from "react";

export type SectionProps = {
  readonly id: string;
  readonly number?: number | string;
  readonly title: string;
  readonly children: ReactNode;
};

/**
 * Numbered paper section with a stable id for anchored linking.
 */
export function Section(props: SectionProps) {
  return (
    <section className="paper-section" id={props.id}>
      <h2 className="section-heading">
        {props.number !== undefined && <span className="section-number">{props.number}</span>}
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

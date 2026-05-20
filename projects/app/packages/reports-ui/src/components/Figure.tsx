import type { ReactNode } from "react";

export type FigureKind = "hero" | "secondary" | "lineage" | "swimlane" | "inline";

export type FigureProps = {
  readonly id?: string;
  readonly number: number | string;
  readonly caption: ReactNode;
  readonly kind?: FigureKind;
  readonly ariaLabel?: string;
  readonly children: ReactNode;
};

const classForKind: Record<FigureKind, string> = {
  hero: "hero-figure",
  secondary: "secondary-figure",
  lineage: "lineage-figure",
  swimlane: "swimlane-figure",
  inline: "hero-figure",
};

/**
 * Captioned figure wrapper. Use `kind` to control max-width and spacing.
 */
export function Figure(props: FigureProps) {
  const className = classForKind[props.kind ?? "inline"];
  return (
    <figure className={className} id={props.id} aria-label={props.ariaLabel}>
      {props.children}
      <figcaption>
        <span className="figure-label">Figure {props.number}.</span> {props.caption}
      </figcaption>
    </figure>
  );
}

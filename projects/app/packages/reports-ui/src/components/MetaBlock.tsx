import type { ReactNode } from "react";

import type { ActorLabel } from "../types.js";

export type MetaBlockProps = { readonly children: ReactNode };

/**
 * Hairline-ruled metadata grid that wraps the four-column run summary
 * (actors, run, repository, headline).
 */
export function MetaBlock(props: MetaBlockProps) {
  return (
    <section className="run-metadata" id="metadata" aria-label="Run metadata">
      {props.children}
    </section>
  );
}

export type MetaColumnProps = {
  readonly label: string;
  readonly children: ReactNode;
};

/**
 * One column of the run-metadata grid.
 */
export function MetaColumn(props: MetaColumnProps) {
  return (
    <div className="meta-column">
      <h6 className="meta-label">{props.label}</h6>
      {props.children}
    </div>
  );
}

export type ActorListProps = {
  readonly actors: readonly ActorLabel[];
};

/**
 * Renders a list of actors with optional role chips.
 */
export function ActorList(props: ActorListProps) {
  return (
    <ul className="meta-actors">
      {props.actors.map((actor) => (
        <li key={actor.displayName}>
          {actor.displayName}
          {actor.role !== undefined && <span className="actor-role">{actor.role}</span>}
        </li>
      ))}
    </ul>
  );
}

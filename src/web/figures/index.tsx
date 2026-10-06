import React from "react";
import type { Figure as FigureModel } from "../../protocol/publication/index.js";
import { Sources } from "../publication/context.js";
import { Plot } from "./plots.js";
import { Timeline, EvidenceMap } from "./timeline.js";
import { Replay, Example } from "./media.js";
export function Figure({ value }: { value: FigureModel }) {
  let content: React.ReactNode;
  switch (value.kind) {
    case "comparison":
    case "curve":
    case "matrix":
      content = <Plot figure={value} />;
      break;
    case "timeline":
      content = <Timeline figure={value} />;
      break;
    case "replay":
      content = <Replay figure={value} />;
      break;
    case "example":
      content = <Example figure={value} />;
      break;
    case "evidence":
      content = <EvidenceMap figure={value} />;
      break;
  }
  return (
    <figure className="figure" id={`figure-${value.id}`}>
      <header>
        <h3>{value.title}</h3>
        <Sources refs={value.sources} />
      </header>
      <div className="figure-body">{content}</div>
      <figcaption>{value.caption}</figcaption>
    </figure>
  );
}

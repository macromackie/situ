import React from "react";
import { z } from "zod";
import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import type { Page } from "../../protocol/publication/index.js";
import { Sources, usePublication } from "./context.js";
import { Figure } from "../figures/index.js";
import { NavigationRow } from "../components/index.js";

export const catalog = defineCatalog(schema, {
  components: {
    Section: {
      props: z.object({ title: z.string().nullable() }),
      slots: ["default"],
      description: "A readable section with an optional heading.",
    },
    Block: {
      props: z.object({ pageId: z.string(), blockId: z.string() }),
      description:
        "A verified Situ statement, figure, next test, or related page reference.",
    },
  },
  actions: {},
});
const { registry } = defineRegistry(catalog, {
  components: {
    Section: ({ props, children }) => (
      <section className="publication-section">
        {props.title && <h2>{props.title}</h2>}
        {children}
      </section>
    ),
    Block: ({ props }) => (
      <PublicationBlock pageId={props.pageId} blockId={props.blockId} />
    ),
  },
});
function PublicationBlock({
  pageId,
  blockId,
}: {
  pageId: string;
  blockId: string;
}) {
  const { view } = usePublication();
  const document = view.release?.document;
  const page = document?.pages.find((p) => p.id === pageId);
  const block = page?.sections
    .flatMap((s) => s.blocks)
    .find((b) => b.id === blockId);
  if (!block) return null;
  if (block.kind === "statement")
    return (
      <div className="statement">
        <div className="statement-label">
          {block.stance}
          {block.acceptedReview && <span> · Reviewed at publication</span>}
        </div>
        <p>{block.text}</p>
        <Sources
          refs={
            block.acceptedReview
              ? [...block.sources, block.acceptedReview]
              : block.sources
          }
        />
      </div>
    );
  if (block.kind === "next-test")
    return (
      <div className="next-test">
        <span className="statement-label">Next test</span>
        <p>{block.text}</p>
        <Sources refs={block.sources} />
      </div>
    );
  if (block.kind === "related")
    return (
      <div className="question-list">
        {block.pageIds.map((id) => {
          const p = document?.pages.find((p) => p.id === id);
          return p && !p.archived ? (
            <NavigationRow
              key={id}
              href={`#/projects/${view.project.id}/pages/${p.id}`}
              title={p.title}
              detail={p.summary.text}
              meta="→"
            />
          ) : null;
        })}
      </div>
    );
  const figure = document?.figures.find((f) => f.id === block.figureId);
  return figure ? (
    <Figure value={figure} />
  ) : (
    <p className="notice">Figure unavailable.</p>
  );
}
export function PublishedPage({ page }: { page: Page }) {
  const elements: Spec["elements"] = {
    root: {
      type: "Section",
      props: { title: null },
      children: page.sections.map((s) => `section-${s.id}`),
    },
  };
  for (const section of page.sections) {
    elements[`section-${section.id}`] = {
      type: "Section",
      props: { title: section.title ?? null },
      children: section.blocks.map((b) => `block-${b.id}`),
    };
    for (const block of section.blocks)
      elements[`block-${block.id}`] = {
        type: "Block",
        props: { pageId: page.id, blockId: block.id },
        children: [],
      };
  }
  return (
    <>
      <header className="publication-heading">
        <div className="eyebrow">
          {page.template === "question"
            ? "RESEARCH QUESTION"
            : "CURRENT UNDERSTANDING"}
          {page.archived ? " · ARCHIVED" : ""}
        </div>
        <h1>{page.title}</h1>
        <p>{page.summary.text}</p>
        <Sources refs={page.summary.sources} />
      </header>
      <JSONUIProvider registry={registry}>
        <Renderer spec={{ root: "root", elements }} registry={registry} />
      </JSONUIProvider>
    </>
  );
}

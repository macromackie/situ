export * from "./collection.js";
export * from "./render.js";
export * from "./types.js";
export { composeReportTree } from "./default-report.js";
export type { ComposeReportTreeInput } from "./default-report.js";

import type { SituId } from "@situ/common";
import { renderReportToHtml } from "@situ/reports-ui";

import { collectProjectReportSnapshot } from "./collection.js";
import { composeReportTree } from "./default-report.js";
import { compileMdxReport } from "./mdx/compile.js";
import { renderProjectReportMarkdown } from "./render.js";
import type {
  GenerateProjectReportHtmlInput,
  GenerateProjectReportMarkdownInput,
  RenderProjectReportHtmlInput,
} from "./types.js";

/**
 * Pure renderer: snapshot → standalone HTML document. Composes the standard
 * tree from `@situ/reports-ui` components and SSRs it.
 */
export function renderProjectReportHtml(input: RenderProjectReportHtmlInput): string {
  const tree = composeReportTree({
    snapshot: input.snapshot,
    generatedAt: input.generatedAt,
  });
  return renderReportToHtml({ tree }).html;
}

/**
 * Collects project report records and renders them as Markdown.
 */
export function generateProjectReportMarkdown(input: GenerateProjectReportMarkdownInput): string {
  const snapshot = collectProjectReportSnapshot({
    context: input.context,
    projectId: input.projectId,
  });

  return renderProjectReportMarkdown({
    snapshot,
    generatedAt: input.generatedAt,
  });
}

/**
 * Generates a project report as HTML. Prefers the most recently submitted MDX
 * report for the project when one exists (recompiled via the @situ/reports-ui
 * component layer); otherwise composes the standard tree from visible records.
 */
export async function generateProjectReportHtml(
  input: GenerateProjectReportHtmlInput,
): Promise<string> {
  const snapshot = collectProjectReportSnapshot({
    context: input.context,
    projectId: input.projectId,
  });

  const authored = pickLatestAuthoredReport({
    context: input.context,
    projectId: input.projectId,
  });
  if (authored !== undefined) {
    const compiled = await compileMdxReport({
      mdxSource: authored.bodyMarkdown,
      snapshot,
      generatedAt: input.generatedAt,
    });
    return compiled.html;
  }

  return renderProjectReportHtml({
    snapshot,
    generatedAt: input.generatedAt,
  });
}

const mdxMarker = /<ResearchReport\b/;

function pickLatestAuthoredReport(input: {
  readonly context: GenerateProjectReportHtmlInput["context"];
  readonly projectId: SituId<"project">;
}): { readonly bodyMarkdown: string } | undefined {
  const reports = input.context.repositories.reports.listForProject({
    projectId: input.projectId,
  });
  const sorted = [...reports];
  sorted.sort((left, right) => right.metadata.createdAt.localeCompare(left.metadata.createdAt));
  for (const report of sorted) {
    if (mdxMarker.test(report.bodyMarkdown)) {
      return { bodyMarkdown: report.bodyMarkdown };
    }
  }
  return undefined;
}

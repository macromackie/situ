import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type RenderReportInput = {
  readonly tree: ReactElement;
};

export type RenderReportResult = {
  readonly html: string;
};

/**
 * Renders a `<ResearchReport>` (or any other React element) to a single
 * standalone HTML document string with the `<!doctype html>` preamble and
 * a single trailing newline.
 */
export function renderReportToHtml(input: RenderReportInput): RenderReportResult {
  const body = renderToStaticMarkup(input.tree);
  return { html: `<!doctype html>\n${body}\n` };
}

/**
 * Awaitable variant for callers that want to keep their pipeline async-shaped.
 */
export async function renderReportToHtmlAsync(
  input: RenderReportInput,
): Promise<RenderReportResult> {
  return renderReportToHtml(input);
}

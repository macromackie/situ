import { evaluate } from "@mdx-js/mdx";
import type { IsoTimestamp } from "@situ/common";
import { buildEmbeddedFontFaceCss, reportBaseCss } from "@situ/reports-ui";
import { createElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProjectReportSnapshot } from "../types.js";
import { mdxComponentRegistry } from "./components.js";

export type CompileMdxReportInput = {
  readonly mdxSource: string;
  readonly snapshot?: ProjectReportSnapshot;
  readonly generatedAt?: IsoTimestamp;
  readonly embedFonts?: boolean;
};

export type CompileMdxReportResult = {
  readonly html: string;
};

/**
 * Compiles an MDX draft into a single standalone HTML document.
 *
 * The MDX may reference any component in `mdxComponentRegistry`. Fonts are
 * base64-embedded by default; pass `embedFonts: false` for faster local
 * iteration (the rendered HTML then relies on system serif/sans fallbacks).
 */
export async function compileMdxReport(
  input: CompileMdxReportInput,
): Promise<CompileMdxReportResult> {
  const compiled = await evaluate(input.mdxSource, {
    Fragment,
    jsx,
    jsxs,
    useMDXComponents: () => mdxComponentRegistry,
  });
  const tree = createElement(compiled.default, {
    components: mdxComponentRegistry,
  });
  const body = renderToStaticMarkup(tree);
  const fontFaceCss = input.embedFonts === false ? "" : buildEmbeddedFontFaceCss();
  const styleBlock = `<style>\n${fontFaceCss}\n${reportBaseCss}\n</style>`;
  const html = body.includes("<head>")
    ? body.replace("</head>", `${styleBlock}\n</head>`)
    : `<!doctype html>\n<html lang="en"><head>${styleBlock}</head><body>${body}</body></html>`;
  const preamble = body.startsWith("<html") ? "<!doctype html>\n" : "";
  return { html: `${preamble}${html}\n` };
}

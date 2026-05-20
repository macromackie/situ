import type { ReactNode } from "react";

import { reportBaseCss } from "../styles/index.js";

export type ResearchReportProps = {
  readonly title: string;
  readonly embeddedFontFaceCss?: string;
  readonly children: ReactNode;
};

/**
 * The standalone HTML document. Owns <head>, embedded CSS and fonts, and the
 * paper container. Compose all other components inside `children`.
 */
export function ResearchReport(props: ResearchReportProps) {
  const css = `${props.embeddedFontFaceCss ?? ""}\n${reportBaseCss}`;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <meta name="generator" content="situ reports generate (ADR 0096 + 0097)" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <header className="site-header" aria-label="Report header">
          <div className="site-header-inner">
            <span className="site-wordmark">situ</span>
            <nav className="site-nav" aria-label="Report sections">
              <a href="#abstract">Abstract</a>
              <a href="#progress">Progress</a>
              <a href="#lineage">Lineage</a>
              <a href="#evidence">Evidence</a>
            </nav>
          </div>
        </header>
        <main className="paper">{props.children}</main>
      </body>
    </html>
  );
}

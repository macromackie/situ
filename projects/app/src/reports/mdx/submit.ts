import { writeFileSync } from "node:fs";

import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { ValidationError } from "@situ/errors";

import { createArtifactAction } from "../../actions/artifacts.js";
import { createReportAction } from "../../actions/reports.js";
import type { AppActionContext } from "../../actions/context.js";

import { collectProjectReportSnapshot } from "../collection.js";
import { compileMdxReport } from "./compile.js";
import { validateMdxReport } from "./validate.js";
import type { ValidationIssue } from "./validate.js";

export type SubmitMdxReportInput = {
  readonly context: AppActionContext;
  readonly projectId: SituId<"project">;
  readonly mdxSource: string;
  readonly title: string;
  readonly generatedBy: ActorRef;
  readonly htmlOutputPath: string;
  readonly generatedAt?: IsoTimestamp;
  readonly embedFonts?: boolean;
};

export type SubmitMdxReportResult = {
  readonly reportId: SituId<"report">;
  readonly artifactId: SituId<"artifact">;
  readonly htmlPath: string;
  readonly warnings: readonly ValidationIssue[];
};

/**
 * Validates the MDX, compiles it, persists the source as a ReportRecord, and
 * writes the rendered HTML as an Artifact attached to that report.
 *
 * Validation errors throw ValidationError before any record write happens.
 */
export async function submitMdxReport(input: SubmitMdxReportInput): Promise<SubmitMdxReportResult> {
  const snapshot = collectProjectReportSnapshot({
    context: input.context,
    projectId: input.projectId,
  });

  const validation = validateMdxReport({ mdxSource: input.mdxSource, snapshot });
  if (!validation.ok) {
    throw new ValidationError({
      message: "Report draft failed validation; submission was blocked.",
      details: {
        errors: validation.errors,
        warnings: validation.warnings,
      },
    });
  }

  const compiled = await compileMdxReport({
    mdxSource: input.mdxSource,
    snapshot,
    generatedAt: input.generatedAt,
    embedFonts: input.embedFonts,
  });

  writeFileSync(input.htmlOutputPath, compiled.html, "utf8");

  const reportResult = createReportAction({
    context: input.context,
    projectId: input.projectId,
    target: { targetKind: "project", targetId: input.projectId },
    title: input.title,
    bodyMarkdown: input.mdxSource,
    generatedBy: input.generatedBy,
    now: input.generatedAt,
  });

  const artifactResult = createArtifactAction({
    context: input.context,
    target: { targetKind: "report", targetId: reportResult.report.id },
    title: `${input.title} (HTML)`,
    summaryMarkdown: `Compiled HTML for report ${reportResult.report.id}.`,
    uri: `file://${input.htmlOutputPath}`,
    mediaType: "text/html",
    byteSize: Buffer.byteLength(compiled.html, "utf8"),
    createdBy: input.generatedBy,
    now: input.generatedAt,
  });

  return {
    reportId: reportResult.report.id,
    artifactId: artifactResult.artifact.id,
    htmlPath: input.htmlOutputPath,
    warnings: validation.warnings,
  };
}

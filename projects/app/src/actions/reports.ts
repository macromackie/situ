import type { SituId } from "@situ/common";
import type {
  CreateReportInput,
  ListRecentReportsInput,
  ListReportsForProjectInput,
  ListReportsForTargetInput,
  ReportRecord,
} from "@situ/reports";

import type { AppActionContext } from "./context.js";

export type CreateReportActionInput = CreateReportInput & {
  readonly context: AppActionContext;
};

export type CreateReportActionResult = {
  readonly report: ReportRecord;
};

export function createReportAction(input: CreateReportActionInput): CreateReportActionResult {
  const report = input.context.repositories.reports.create({
    id: input.id,
    projectId: input.projectId,
    target: input.target,
    title: input.title,
    bodyMarkdown: input.bodyMarkdown,
    generatedBy: input.generatedBy,
    now: input.now,
  });

  return { report };
}

export type GetReportActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"report">;
};

export function getReportAction(input: GetReportActionInput): ReportRecord | undefined {
  return input.context.repositories.reports.getById({
    id: input.id,
  });
}

export type ListReportsForProjectActionInput = ListReportsForProjectInput & {
  readonly context: AppActionContext;
};

export function listReportsForProjectAction(
  input: ListReportsForProjectActionInput,
): readonly ReportRecord[] {
  return input.context.repositories.reports.listForProject({
    projectId: input.projectId,
  });
}

export type ListReportsForTargetActionInput = ListReportsForTargetInput & {
  readonly context: AppActionContext;
};

export function listReportsForTargetAction(
  input: ListReportsForTargetActionInput,
): readonly ReportRecord[] {
  return input.context.repositories.reports.listForTarget({
    target: input.target,
  });
}

export type ListRecentReportsActionInput = ListRecentReportsInput & {
  readonly context: AppActionContext;
};

export function listRecentReportsAction(
  input: ListRecentReportsActionInput,
): readonly ReportRecord[] {
  return input.context.repositories.reports.listRecent({
    limit: input.limit,
  });
}

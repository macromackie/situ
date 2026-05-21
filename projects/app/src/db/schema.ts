import { artifactsSchemaFragment } from "@situ/artifacts";
import { baselinesSchemaFragment } from "@situ/baselines";
import { briefingsSchemaFragment } from "@situ/briefings";
import { commentsSchemaFragment } from "@situ/comments";
import { eventsSchemaFragment } from "@situ/events";
import { experimentsSchemaFragment } from "@situ/experiments";
import { liveSchemaFragment } from "@situ/live";
import { measurementsSchemaFragment } from "@situ/measurements";
import { notificationsSchemaFragment } from "@situ/notifications";
import { projectsSchemaFragment } from "@situ/projects";
import { reportsSchemaFragment } from "@situ/reports";
import { reviewsSchemaFragment } from "@situ/reviews";
import { tasksSchemaFragment } from "@situ/tasks";

import { ValidationError } from "@situ/errors";

/**
 * Package-owned SQLite schema creation statements.
 */
export type SchemaFragment = {
  readonly packageName: string;
  readonly statements: readonly string[];
};

export const appSchemaFragments = [
  projectsSchemaFragment,
  tasksSchemaFragment,
  commentsSchemaFragment,
  eventsSchemaFragment,
  notificationsSchemaFragment,
  baselinesSchemaFragment,
  experimentsSchemaFragment,
  measurementsSchemaFragment,
  artifactsSchemaFragment,
  reportsSchemaFragment,
  briefingsSchemaFragment,
  liveSchemaFragment,
  reviewsSchemaFragment,
] as const satisfies readonly SchemaFragment[];

export type SchemaStatementsFromFragmentsInput = {
  readonly fragments: readonly SchemaFragment[];
};

/**
 * Returns package schema statements after checking fragment names.
 */
export function schemaStatementsFromFragments(
  input: SchemaStatementsFromFragmentsInput,
): readonly string[] {
  const packageNames = new Set<string>();
  const statements: string[] = [];

  for (const fragment of input.fragments) {
    if (packageNames.has(fragment.packageName)) {
      throw new ValidationError({
        message: "Schema fragment package names must be unique.",
        details: { packageName: fragment.packageName },
      });
    }

    packageNames.add(fragment.packageName);
    statements.push(...fragment.statements);
  }

  return statements;
}

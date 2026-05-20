import type { AppProjectName, SituCliResult } from "@situ/app";
import { fixturesPackageName, tinyAutoresearchFixture } from "@situ/fixtures";
import type { TestFixture } from "@situ/fixtures";

export type E2eTestsAppDependency = AppProjectName;

export const e2eTestsProjectName = "e2e-tests" as const;
export const e2eTestsFixturePackage = fixturesPackageName;

export type TinyRegressionE2eResult = {
  readonly fixture: TestFixture;
  readonly versionResult: SituCliResult;
  readonly doctorResult: SituCliResult;
};

export type CurrentRepositoryE2eResult = {
  readonly fixture: TestFixture;
  readonly repositoryPath: string;
  readonly initResult: SituCliResult;
  readonly currentTextResult: SituCliResult;
  readonly currentJsonResult: SituCliResult;
  readonly taskCreateResult: SituCliResult;
  readonly taskListResult: SituCliResult;
  readonly currentTasksTextResult: SituCliResult;
  readonly currentTasksJsonResult: SituCliResult;
  readonly assignedTaskCreateResult: SituCliResult;
  readonly notificationListTextResult: SituCliResult;
  readonly notificationListJsonResult: SituCliResult;
};

/**
 * Captures the deterministic tiny autoresearch e2e result.
 */
export function createTinyRegressionE2eResult(input: {
  readonly versionResult: SituCliResult;
  readonly doctorResult: SituCliResult;
}): TinyRegressionE2eResult {
  return {
    fixture: tinyAutoresearchFixture,
    versionResult: input.versionResult,
    doctorResult: input.doctorResult,
  };
}

/**
 * Captures the deterministic current repository e2e result.
 */
export function createCurrentRepositoryE2eResult(input: {
  readonly repositoryPath: string;
  readonly initResult: SituCliResult;
  readonly currentTextResult: SituCliResult;
  readonly currentJsonResult: SituCliResult;
  readonly taskCreateResult: SituCliResult;
  readonly taskListResult: SituCliResult;
  readonly currentTasksTextResult: SituCliResult;
  readonly currentTasksJsonResult: SituCliResult;
  readonly assignedTaskCreateResult: SituCliResult;
  readonly notificationListTextResult: SituCliResult;
  readonly notificationListJsonResult: SituCliResult;
}): CurrentRepositoryE2eResult {
  return {
    fixture: tinyAutoresearchFixture,
    repositoryPath: input.repositoryPath,
    initResult: input.initResult,
    currentTextResult: input.currentTextResult,
    currentJsonResult: input.currentJsonResult,
    taskCreateResult: input.taskCreateResult,
    taskListResult: input.taskListResult,
    currentTasksTextResult: input.currentTasksTextResult,
    currentTasksJsonResult: input.currentTasksJsonResult,
    assignedTaskCreateResult: input.assignedTaskCreateResult,
    notificationListTextResult: input.notificationListTextResult,
    notificationListJsonResult: input.notificationListJsonResult,
  };
}

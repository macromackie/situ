import { expect, test } from "bun:test";

import {
  archiveProjectAction,
  archiveProjectInContext,
  assignTaskAction,
  assignTaskInContext,
  createProjectAction,
  createProjectInContext,
  createTaskAction,
  createTaskInContext,
  moveTaskAction,
  moveTaskInContext,
  type ArchiveProjectActionInput,
  type ArchiveProjectActionResult,
  type ArchiveProjectInContextInput,
  type AssignTaskActionInput,
  type AssignTaskActionResult,
  type AssignTaskInContextInput,
  type CreateProjectActionInput,
  type CreateProjectActionResult,
  type CreateProjectInContextInput,
  type CreateTaskActionInput,
  type CreateTaskActionResult,
  type CreateTaskInContextInput,
  type MoveTaskActionInput,
  type MoveTaskActionResult,
  type MoveTaskInContextInput,
} from "@situ/app";

type PublicActionInput =
  | CreateProjectActionInput
  | ArchiveProjectActionInput
  | CreateTaskActionInput
  | MoveTaskActionInput
  | AssignTaskActionInput;

type PublicInContextInput =
  | CreateProjectInContextInput
  | ArchiveProjectInContextInput
  | CreateTaskInContextInput
  | MoveTaskInContextInput
  | AssignTaskInContextInput;

type PublicInContextResult =
  | CreateProjectActionResult
  | ArchiveProjectActionResult
  | CreateTaskActionResult
  | MoveTaskActionResult
  | AssignTaskActionResult;

test("exports project and task in-context action helpers from the app root", () => {
  const functions = [
    createProjectAction,
    archiveProjectAction,
    createTaskAction,
    moveTaskAction,
    assignTaskAction,
    createProjectInContext,
    archiveProjectInContext,
    createTaskInContext,
    moveTaskInContext,
    assignTaskInContext,
  ];
  const actionInput: PublicActionInput | undefined = undefined;
  const input: PublicInContextInput | undefined = undefined;
  const result: PublicInContextResult | undefined = undefined;

  expect(functions).toHaveLength(10);
  expect(actionInput).toBeUndefined();
  expect(input).toBeUndefined();
  expect(result).toBeUndefined();
});

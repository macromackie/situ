import { expect, test } from "bun:test";

import {
  BaseError,
  ConflictError,
  ErrorKind,
  ExternalError,
  InternalError,
  NotFoundError,
  ValidationError,
  errorsPackageName,
  isBaseError,
  serializeError,
} from "../src/index.js";

test("exports the package marker", () => {
  const expectedPackageName: "errors" = errorsPackageName;
  expect(expectedPackageName).toBe("errors");
});

test("assigns stable kinds to concrete application errors", () => {
  const errors = [
    new ValidationError({
      message: "Task title is required",
      details: { field: "title" },
    }),
    new NotFoundError({
      message: "Task was not found",
      details: { taskId: "task_123" },
    }),
    new ConflictError({
      message: "Task is already claimed",
      details: { taskId: "task_123" },
    }),
    new ExternalError({
      message: "git command failed",
      details: { command: "git status" },
    }),
    new InternalError({
      message: "Unexpected repository state",
      details: { packageName: "tasks" },
    }),
  ];

  expect(errors.map((error) => error.kind)).toEqual([
    ErrorKind.Validation,
    ErrorKind.NotFound,
    ErrorKind.Conflict,
    ErrorKind.External,
    ErrorKind.Internal,
  ]);

  for (const error of errors) {
    expect(error).toBeInstanceOf(BaseError);
    expect(isBaseError(error)).toBe(true);
  }
});

test("serializes BaseError instances without changing details", () => {
  const error = new ValidationError({
    message: "Task title is required",
    details: { field: "title" },
  });

  expect(serializeError(error)).toEqual({
    kind: ErrorKind.Validation,
    message: "Task title is required",
    details: { field: "title" },
  });
});

test("serializes ordinary Error values as internal errors", () => {
  expect(serializeError(new Error("database open failed"))).toEqual({
    kind: ErrorKind.Internal,
    message: "database open failed",
    details: {},
  });
});

test("serializes unknown thrown values as generic internal errors", () => {
  expect(serializeError("not an error")).toEqual({
    kind: ErrorKind.Internal,
    message: "An internal error occurred.",
    details: {},
  });
});

test("does not treat ordinary values as BaseError instances", () => {
  expect(isBaseError(new Error("plain error"))).toBe(false);
  expect(isBaseError({ kind: ErrorKind.Validation })).toBe(false);
});

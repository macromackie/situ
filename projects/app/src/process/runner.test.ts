import { expect, test } from "bun:test";

import { ValidationError } from "@situ/errors";

import { createExecaProcessRunner } from "./runner.js";

test("createExecaProcessRunner captures stdout stderr and exit code", async () => {
  const runner = createExecaProcessRunner();
  const result = await runner.run({
    command: process.execPath,
    args: [
      "--eval",
      "console.log('runner stdout'); console.error('runner stderr'); process.exit(3);",
    ],
  });

  expect(result).toEqual({
    exitCode: 3,
    stdout: "runner stdout\n",
    stderr: "runner stderr\n",
  });
});

test("createExecaProcessRunner validates command names", async () => {
  const runner = createExecaProcessRunner();

  await expect(
    runner.run({
      command: " ",
    }),
  ).rejects.toThrow(ValidationError);
});

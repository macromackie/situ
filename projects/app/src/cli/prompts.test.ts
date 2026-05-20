import { expect, test } from "bun:test";

import { ValidationError } from "@situ/errors";

import { confirmCliAction } from "./prompts.js";

test("confirmCliAction delegates confirmation through the Clack adapter", async () => {
  const decision = await confirmCliAction({
    message: "Continue?",
    initialValue: true,
    prompt: async (options) => {
      expect(options.message).toBe("Continue?");
      expect(options.initialValue).toBe(true);
      return true;
    },
  });

  expect(decision).toBe(true);
});

test("confirmCliAction rejects interactive prompts when disabled", async () => {
  await expect(
    confirmCliAction({
      message: "Continue?",
      nonInteractive: true,
      prompt: async () => true,
    }),
  ).rejects.toThrow(ValidationError);
});

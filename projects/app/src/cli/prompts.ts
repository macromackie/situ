import { cancel, confirm, isCancel, type ConfirmOptions } from "@clack/prompts";
import { ValidationError } from "@situ/errors";

export type ConfirmCliActionInput = {
  readonly message: string;
  readonly initialValue?: boolean;
  readonly nonInteractive?: boolean;
  readonly prompt?: (options: ConfirmOptions) => Promise<boolean | symbol>;
};

export async function confirmCliAction(input: ConfirmCliActionInput): Promise<boolean> {
  if (input.nonInteractive === true) {
    throw new ValidationError({
      message: "Interactive confirmation is disabled.",
      details: {
        prompt: input.message,
      },
    });
  }

  const prompt = input.prompt ?? confirm;
  const value = await prompt({
    message: input.message,
    initialValue: input.initialValue,
  });

  if (isCancel(value)) {
    cancel("Canceled.");
    throw new ValidationError({
      message: "Interactive confirmation was canceled.",
      details: {
        prompt: input.message,
      },
    });
  }

  return value;
}

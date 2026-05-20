import type { IsoTimestamp, SituId } from "@situ/common";
import * as v from "valibot";

import { openAppDatabase } from "../../db/index.js";
import { normalizeMaintenanceInspectionOptions } from "../../maintenance/index.js";
import { findCurrentRepositoryRoot } from "../../repositories/index.js";
import { verifySitu } from "../../verification/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseDefinedCommandSpec,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatSituVerify } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runVerifyCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult {
  const parsedCommand = parseVerifyCommand(input.invocation);
  const repositoryPath =
    parsedCommand.projectId === undefined
      ? findCurrentRepositoryRoot({ cwd: input.invocation.cwd })
      : undefined;
  const database = openAppDatabase({
    databasePath: input.invocation.databasePath,
    environment: input.invocation.environment,
  });

  try {
    const verification = verifySitu({
      database,
      projectId: parsedCommand.projectId,
      repositoryPath,
      generatedAt: parsedCommand.generatedAt,
    });

    return formatDataResult({
      invocation: input.invocation,
      data: verification,
      text: formatSituVerify(verification),
    });
  } finally {
    database.close();
  }
}

type ParsedVerifyCommand = {
  readonly projectId?: SituId<"project">;
  readonly generatedAt?: IsoTimestamp;
};

const verifyCommand = defineCommandSpec({
  command: "verify",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    projectId: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

function parseVerifyCommand(invocation: SituCliInvocation): ParsedVerifyCommand {
  const options = parseDefinedCommandSpec({
    invocation,
    args: invocation.rest,
    spec: verifyCommand,
  });

  return {
    projectId: options.projectId as SituId<"project"> | undefined,
    generatedAt: optionalNow({
      invocation,
      value: options.now,
    }),
  };
}

function optionalNow(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): IsoTimestamp | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  try {
    return normalizeMaintenanceInspectionOptions({
      now: input.value,
    }).generatedAt;
  } catch {
    throwParserError({
      message: "Expected a valid ISO timestamp for --now.",
      details: {
        flag: "--now",
        value: input.value,
      },
      outputMode: input.invocation.outputMode,
    });
  }
}

import type { IsoTimestamp, SituId } from "@situ/common";
import * as v from "valibot";

import { openAppDatabase } from "../../db/index.js";
import { normalizeMaintenanceInspectionOptions } from "../../maintenance/index.js";
import { findCurrentRepositoryRoot } from "../../repositories/index.js";
import { getSituStatus } from "../../status/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseDefinedCommandSpec,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatSituStatus } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runStatusCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult {
  const parsedCommand = parseStatusCommand(input.invocation);
  const repositoryPath =
    parsedCommand.projectId === undefined
      ? findCurrentRepositoryRoot({ cwd: input.invocation.cwd })
      : undefined;
  const database = openAppDatabase({
    databasePath: input.invocation.databasePath,
    environment: input.invocation.environment,
  });

  try {
    const status = getSituStatus({
      database,
      projectId: parsedCommand.projectId,
      repositoryPath,
      generatedAt: parsedCommand.generatedAt,
      staleAfterHours: parsedCommand.staleAfterHours,
    });

    return formatDataResult({
      invocation: input.invocation,
      data: status,
      text: formatSituStatus(status),
    });
  } finally {
    database.close();
  }
}

type ParsedStatusCommand = {
  readonly projectId?: SituId<"project">;
  readonly generatedAt?: IsoTimestamp;
  readonly staleAfterHours?: number;
};

const statusCommand = defineCommandSpec({
  command: "status",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project" }),
    valueOption({ key: "now", flag: "--now" }),
    valueOption({ key: "staleAfterHours", flag: "--stale-after-hours" }),
  ],
  schema: v.object({
    projectId: v.optional(v.string()),
    now: v.optional(v.string()),
    staleAfterHours: v.optional(v.string()),
  }),
});

function parseStatusCommand(invocation: SituCliInvocation): ParsedStatusCommand {
  const options = parseDefinedCommandSpec({
    invocation,
    args: invocation.rest,
    spec: statusCommand,
  });

  return {
    projectId: options.projectId as SituId<"project"> | undefined,
    generatedAt: optionalNow({
      invocation,
      value: options.now,
    }),
    staleAfterHours: optionalStaleAfterHours({
      invocation,
      value: options.staleAfterHours,
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

function optionalStaleAfterHours(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): number | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  if (!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(input.value)) {
    throwStaleAfterHoursError(input);
  }

  const parsed = Number(input.value);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  throwStaleAfterHoursError(input);
}

function throwStaleAfterHoursError(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): never {
  throwParserError({
    message: "Expected a positive number for --stale-after-hours.",
    details: {
      flag: "--stale-after-hours",
      value: input.value,
    },
    outputMode: input.invocation.outputMode,
  });
}

import type { ActorKind, ActorRef, TargetKind } from "@situ/common";
import { ValidationError } from "@situ/errors";
import { object } from "@optique/core/constructs";
import { runParser } from "@optique/core/facade";
import { multiple } from "@optique/core/modifiers";
import { argument, option } from "@optique/core/primitives";
import type { Parser } from "@optique/core/parser";
import type { OptionName } from "@optique/core/usage";
import { string as optiqueString } from "@optique/core/valueparser";
import { valibot } from "@optique/valibot";
import * as v from "valibot";

import type { SituCliInvocation, SituCliOutputMode } from "./types.js";

const actorKinds = ["human", "local_agent", "system"] as const;
const targetKinds = [
  "project",
  "task",
  "comment",
  "event",
  "notification",
  "baseline",
  "experiment",
  "measurement",
  "artifact",
  "review",
  "report",
] as const;
const projectStatuses = ["active", "archived"] as const;
const taskStatuses = ["triage", "backlog", "in_progress", "in_review", "done", "canceled"] as const;
const experimentStatuses = [
  "planned",
  "running",
  "ready_for_review",
  "accepted",
  "rejected",
  "abandoned",
] as const;
const baselineStatuses = ["active", "superseded", "abandoned"] as const;

const ActorKindSchema = v.picklist(actorKinds);
const TargetKindSchema = v.picklist(targetKinds);
const ProjectStatusSchema = v.picklist(projectStatuses);
const TaskStatusSchema = v.picklist(taskStatuses);
const ExperimentStatusSchema = v.picklist(experimentStatuses);
const BaselineStatusSchema = v.picklist(baselineStatuses);
const PositiveIntegerTextSchema = v.pipe(v.string(), v.regex(/^[0-9]+$/u));
const NonNegativeSafeIntegerTextSchema = v.pipe(v.string(), v.regex(/^[0-9]+$/u));
const FiniteNumericValueTextSchema = v.pipe(
  v.string(),
  v.check((value) => value.trim().length > 0),
  v.check((value) => Number.isFinite(Number(value))),
);
const CommandFlagValueSchema = v.pipe(
  v.string(),
  v.check((value) => !value.startsWith("--"), "Expected a command flag value."),
);

const commandFlagValueParser = valibot(CommandFlagValueSchema, {
  metavar: "VALUE",
  placeholder: "value",
});

export type ProjectStatus = (typeof projectStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type ExperimentStatus = (typeof experimentStatuses)[number];
export type BaselineStatus = (typeof baselineStatuses)[number];

export type AssignedToFilter = {
  readonly actorKind: ActorKind;
  readonly actorId: string;
};

type ParsedCommandTokens = {
  readonly flags: ReadonlyMap<string, string | true>;
  readonly positionals: readonly string[];
};

export type CommandValueOption = {
  readonly kind: "value";
  readonly key: string;
  readonly flag: string;
  readonly required?: boolean;
};

export type CommandBooleanOption = {
  readonly kind: "boolean";
  readonly key: string;
  readonly flag: string;
};

export type CommandOption = CommandValueOption | CommandBooleanOption;

export type CommandPositionalSpec =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "single";
      readonly key: string;
      readonly name: string;
    };

export type CommandSpec<TSchema extends CommandOptionsSchema = CommandOptionsSchema> = {
  readonly command: string;
  readonly positionals: CommandPositionalSpec;
  readonly options: readonly CommandOption[];
  readonly schema: TSchema;
};

export type CliParserError = {
  readonly error: unknown;
  readonly outputMode: SituCliOutputMode;
  readonly includeHelp: boolean;
};

type CommandOptionsSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
type CommandTokenParser = Parser<"sync", readonly string[] | readonly boolean[], unknown>;
type CommandTokenOutput = Record<string, readonly string[] | readonly boolean[]>;
type CommandTokenParseError = {
  readonly kind: "error";
};

export function valueOption(input: {
  readonly key: string;
  readonly flag: string;
  readonly required?: boolean;
}): CommandValueOption {
  return {
    kind: "value",
    key: input.key,
    flag: input.flag,
    required: input.required,
  };
}

export function booleanOption(input: {
  readonly key: string;
  readonly flag: string;
}): CommandBooleanOption {
  return {
    kind: "boolean",
    key: input.key,
    flag: input.flag,
  };
}

export function noPositionals(): CommandPositionalSpec {
  return { kind: "none" };
}

export function singlePositional(input: {
  readonly key: string;
  readonly name: string;
}): CommandPositionalSpec {
  return {
    kind: "single",
    key: input.key,
    name: input.name,
  };
}

export function defineCommandSpec<TSchema extends CommandOptionsSchema>(
  spec: CommandSpec<TSchema>,
): CommandSpec<TSchema> {
  return spec;
}

export function parseDefinedCommandSpec<TSchema extends CommandOptionsSchema>(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
  readonly spec: CommandSpec<TSchema>;
}): v.InferOutput<TSchema> {
  return parseCommandSpec({
    invocation: input.invocation,
    command: input.spec.command,
    args: input.args,
    positionals: input.spec.positionals,
    options: input.spec.options,
    schema: input.spec.schema,
  });
}

function parseCommandSpec<TSchema extends CommandOptionsSchema>(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly args: readonly string[];
  readonly positionals: CommandPositionalSpec;
  readonly options: readonly CommandOption[];
  readonly schema: TSchema;
}): v.InferOutput<TSchema> {
  const parsed = parseCommandSpecTokens({
    invocation: input.invocation,
    command: input.command,
    args: input.args,
    valueFlags: input.options
      .filter((optionSpec): optionSpec is CommandValueOption => optionSpec.kind === "value")
      .map((optionSpec) => optionSpec.flag),
    booleanFlags: input.options
      .filter((optionSpec): optionSpec is CommandBooleanOption => optionSpec.kind === "boolean")
      .map((optionSpec) => optionSpec.flag),
  });

  const rawOptions = collectCommandOptions({
    parsed,
    options: input.options,
  });

  collectCommandPositionals({
    invocation: input.invocation,
    command: input.command,
    positionals: parsed.positionals,
    spec: input.positionals,
    rawOptions,
  });

  for (const optionSpec of input.options) {
    if (optionSpec.kind !== "value" || optionSpec.required !== true) {
      continue;
    }

    if (rawOptions[optionSpec.key] === undefined) {
      throwParserError({
        message: `Missing required flag ${optionSpec.flag}.`,
        details: { flag: optionSpec.flag },
        outputMode: input.invocation.outputMode,
      });
    }
  }

  const commandOptions = v.safeParse(input.schema, rawOptions);

  if (commandOptions.success) {
    return commandOptions.output;
  }

  throwParserError({
    message: commandOptions.issues[0]?.message ?? `Invalid options for ${input.command}.`,
    details: {
      command: input.command,
      issues: commandOptions.issues,
    },
    outputMode: input.invocation.outputMode,
  });
}

function parseCommandSpecTokens(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly args: readonly string[];
  readonly valueFlags: readonly string[];
  readonly booleanFlags: readonly string[];
}): ParsedCommandTokens {
  assertNoUnknownEqualsOptions(input);

  const flags = new Map<string, string | true>();
  const parserTerms: Record<string, CommandTokenParser> = {
    positionals: multiple(argument(optiqueString())) as CommandTokenParser,
  };

  for (const flag of input.valueFlags) {
    parserTerms[flag] = multiple(
      option(toOptionName(flag), commandFlagValueParser),
    ) as CommandTokenParser;
  }

  for (const flag of input.booleanFlags) {
    parserTerms[flag] = multiple(option(toOptionName(flag))) as CommandTokenParser;
  }

  let errorMessage = "";
  const parsed = runParser(object(parserTerms), input.command, input.args, {
    aboveError: "none",
    onError: (): CommandTokenParseError => ({ kind: "error" }),
    stderr: (text) => {
      errorMessage += text;
    },
  }) as CommandTokenOutput | CommandTokenParseError;

  if (isCommandTokenParseError(parsed)) {
    throwCommandTokenParseError({
      command: input.command,
      message: errorMessage,
      outputMode: input.invocation.outputMode,
    });
  }

  for (const flag of input.valueFlags) {
    const values = parsed[flag];
    const value = values.at(-1);

    if (typeof value === "string") {
      flags.set(flag, value);
    }
  }

  for (const flag of input.booleanFlags) {
    const values = parsed[flag];

    if (values.length > 0) {
      flags.set(flag, true);
    }
  }

  return {
    flags,
    positionals: parsed.positionals as readonly string[],
  };
}

function collectCommandOptions(input: {
  readonly parsed: ParsedCommandTokens;
  readonly options: readonly CommandOption[];
}): Record<string, unknown> {
  const rawOptions: Record<string, unknown> = {};

  for (const optionSpec of input.options) {
    if (optionSpec.kind === "value") {
      const value = input.parsed.flags.get(optionSpec.flag);

      if (typeof value === "string") {
        rawOptions[optionSpec.key] = value;
      }

      continue;
    }

    rawOptions[optionSpec.key] = input.parsed.flags.get(optionSpec.flag) === true;
  }

  return rawOptions;
}

function collectCommandPositionals(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly positionals: readonly string[];
  readonly spec: CommandPositionalSpec;
  readonly rawOptions: Record<string, unknown>;
}): void {
  if (input.spec.kind === "none") {
    assertNoPositionals({
      invocation: input.invocation,
      command: input.command,
      positionals: input.positionals,
    });
    return;
  }

  input.rawOptions[input.spec.key] = requireSinglePositional({
    invocation: input.invocation,
    command: input.command,
    positionals: input.positionals,
    name: input.spec.name,
  });
}

function assertNoPositionals(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly positionals: readonly string[];
}): void {
  if (input.positionals.length === 0) {
    return;
  }

  throwParserError({
    message: `Command ${input.command} received extra positional arguments: ${input.positionals.join(" ")}`,
    details: {
      command: input.command,
      arguments: input.positionals,
    },
    outputMode: input.invocation.outputMode,
  });
}

function requireSinglePositional(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly positionals: readonly string[];
  readonly name: string;
}): string {
  if (input.positionals.length === 1) {
    return input.positionals[0];
  }

  if (input.positionals.length === 0) {
    throwParserError({
      message: `Command ${input.command} requires <${input.name}>.`,
      details: { command: input.command, positional: input.name },
      outputMode: input.invocation.outputMode,
    });
  }

  throwParserError({
    message: `Command ${input.command} received extra positional arguments: ${input.positionals.slice(1).join(" ")}`,
    details: {
      command: input.command,
      arguments: input.positionals.slice(1),
    },
    outputMode: input.invocation.outputMode,
  });
}

export function parseActorRef(input: {
  readonly invocation: SituCliInvocation;
  readonly kindFlag: string;
  readonly kind: string;
  readonly id: string;
  readonly displayName?: string;
}): ActorRef {
  return {
    actorKind: parseActorKind({
      invocation: input.invocation,
      flag: input.kindFlag,
      value: input.kind,
    }),
    actorId: input.id,
    displayName: input.displayName,
  };
}

export function parseOptionalAssigneeFields(input: {
  readonly invocation: SituCliInvocation;
  readonly kind?: string;
  readonly id?: string;
  readonly displayName?: string;
}): ActorRef | undefined {
  const hasKind = input.kind !== undefined;
  const hasId = input.id !== undefined;
  const hasDisplayName = input.displayName !== undefined;

  if (!hasKind && !hasId && !hasDisplayName) {
    return undefined;
  }

  if (!hasKind || !hasId) {
    throwParserError({
      message: "Assignee flags require both --assigned-to-kind and --assigned-to-id.",
      details: {
        flags: ["--assigned-to-kind", "--assigned-to-id"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  return parseActorRef({
    invocation: input.invocation,
    kindFlag: "--assigned-to-kind",
    kind: input.kind,
    id: input.id,
    displayName: input.displayName,
  });
}

export function parseOptionalAssigneeFilterFields(input: {
  readonly invocation: SituCliInvocation;
  readonly kind?: string;
  readonly id?: string;
}): AssignedToFilter | undefined {
  const hasKind = input.kind !== undefined;
  const hasId = input.id !== undefined;

  if (!hasKind && !hasId) {
    return undefined;
  }

  if (!hasKind || !hasId) {
    throwParserError({
      message: "Assignee filter flags require both --assigned-to-kind and --assigned-to-id.",
      details: {
        flags: ["--assigned-to-kind", "--assigned-to-id"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  return {
    actorKind: parseActorKind({
      invocation: input.invocation,
      flag: "--assigned-to-kind",
      value: input.kind,
    }),
    actorId: input.id,
  };
}

export function parseAssignmentAssigneeFields(input: {
  readonly invocation: SituCliInvocation;
  readonly clear: boolean;
  readonly assignedToKind?: string;
  readonly assignedToId?: string;
  readonly assignedToDisplayName?: string;
  readonly command?: string;
}): ActorRef | undefined {
  const hasAssignedTo =
    input.assignedToKind !== undefined ||
    input.assignedToId !== undefined ||
    input.assignedToDisplayName !== undefined;

  if (input.clear && hasAssignedTo) {
    throwParserError({
      message: "--clear cannot be combined with assignee flags.",
      details: {
        flag: "--clear",
        assigneeFlags: ["--assigned-to-kind", "--assigned-to-id", "--assigned-to-display-name"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  if (input.clear) {
    return undefined;
  }

  const assignedTo = parseOptionalAssigneeFields({
    invocation: input.invocation,
    kind: input.assignedToKind,
    id: input.assignedToId,
    displayName: input.assignedToDisplayName,
  });

  if (assignedTo !== undefined) {
    return assignedTo;
  }

  throwParserError({
    message: `Command ${input.command ?? "tasks assign"} requires assignee flags unless --clear is present.`,
    details: {
      flags: ["--assigned-to-kind", "--assigned-to-id"],
    },
    outputMode: input.invocation.outputMode,
  });
}

export function requireValueOption(input: {
  readonly invocation: SituCliInvocation;
  readonly flag: string;
  readonly value?: string;
}): string {
  if (input.value !== undefined) {
    return input.value;
  }

  throwParserError({
    message: `Missing required flag ${input.flag}.`,
    details: { flag: input.flag },
    outputMode: input.invocation.outputMode,
  });
}

export function parseProjectStatus(input: {
  readonly invocation: SituCliInvocation;
  readonly status: string;
}): ProjectStatus {
  const parsed = v.safeParse(ProjectStatusSchema, input.status);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid project status: ${input.status}.`,
    details: {
      value: input.status,
      allowedValues: projectStatuses,
    },
    outputMode: input.invocation.outputMode,
  });
}

export function parseTaskStatus(input: {
  readonly invocation: SituCliInvocation;
  readonly status: string;
}): TaskStatus {
  const parsed = v.safeParse(TaskStatusSchema, input.status);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid task status: ${input.status}.`,
    details: {
      value: input.status,
      allowedValues: taskStatuses,
    },
    outputMode: input.invocation.outputMode,
  });
}

export function parseExperimentStatus(input: {
  readonly invocation: SituCliInvocation;
  readonly status: string;
}): ExperimentStatus {
  const parsed = v.safeParse(ExperimentStatusSchema, input.status);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid experiment status: ${input.status}.`,
    details: {
      value: input.status,
      allowedValues: experimentStatuses,
    },
    outputMode: input.invocation.outputMode,
  });
}

export function parseBaselineStatus(input: {
  readonly invocation: SituCliInvocation;
  readonly status: string;
}): BaselineStatus {
  const parsed = v.safeParse(BaselineStatusSchema, input.status);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid baseline status: ${input.status}.`,
    details: {
      value: input.status,
      allowedValues: baselineStatuses,
    },
    outputMode: input.invocation.outputMode,
  });
}

export function parseTargetKind(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): TargetKind {
  const parsed = v.safeParse(TargetKindSchema, input.value);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid target kind: ${input.value}.`,
    details: {
      value: input.value,
      allowedValues: targetKinds,
    },
    outputMode: input.invocation.outputMode,
  });
}

export function parsePositiveIntegerLimit(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): number {
  const parsed = v.safeParse(PositiveIntegerTextSchema, input.value);

  if (parsed.success) {
    const limit = Number(parsed.output);

    if (Number.isSafeInteger(limit) && limit > 0) {
      return limit;
    }
  }

  throwParserError({
    message: "Expected a positive integer limit.",
    details: { field: "limit", value: input.value },
    outputMode: input.invocation.outputMode,
  });
}

export function parseNonNegativeSafeIntegerByteSize(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): number {
  const parsed = v.safeParse(NonNegativeSafeIntegerTextSchema, input.value);

  if (parsed.success) {
    const byteSize = Number(parsed.output);

    if (Number.isSafeInteger(byteSize) && byteSize >= 0) {
      return byteSize;
    }
  }

  throwParserError({
    message: "Expected a non-negative safe integer byte size.",
    details: { field: "byteSize", value: input.value },
    outputMode: input.invocation.outputMode,
  });
}

export function parsePositiveIntegerRevisionNumber(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): number {
  const parsed = v.safeParse(PositiveIntegerTextSchema, input.value);

  if (parsed.success) {
    const revisionNumber = Number(parsed.output);

    if (Number.isSafeInteger(revisionNumber) && revisionNumber > 0) {
      return revisionNumber;
    }
  }

  throwParserError({
    message: "Expected a positive integer revision number.",
    details: { field: "revisionNumber", value: input.value },
    outputMode: input.invocation.outputMode,
  });
}

export function parseFiniteNumericValue(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): number {
  const parsed = v.safeParse(FiniteNumericValueTextSchema, input.value);

  if (parsed.success) {
    return Number(parsed.output);
  }

  throwParserError({
    message: "Expected a finite numeric value.",
    details: { field: "numericValue", value: input.value },
    outputMode: input.invocation.outputMode,
  });
}

export function throwParserError(input: {
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly outputMode: SituCliOutputMode;
  readonly includeHelp?: boolean;
}): never {
  throw {
    error: new ValidationError({
      message: input.message,
      details: input.details,
    }),
    outputMode: input.outputMode,
    includeHelp: input.includeHelp ?? false,
  } satisfies CliParserError;
}

export function isCliParserError(value: unknown): value is CliParserError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    "outputMode" in value &&
    "includeHelp" in value
  );
}

function toOptionName(flag: string): OptionName {
  if (/^--[A-Za-z0-9][A-Za-z0-9-]*$/u.test(flag)) {
    return flag as OptionName;
  }

  throw new ValidationError({
    message: "Command flag declarations must use long option names.",
    details: { flag },
  });
}

function assertNoUnknownEqualsOptions(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly args: readonly string[];
  readonly valueFlags: readonly string[];
  readonly booleanFlags: readonly string[];
}): void {
  const knownValueFlags = new Set(input.valueFlags);
  const knownBooleanFlags = new Set(input.booleanFlags);

  for (const [index, arg] of input.args.entries()) {
    if (arg === "--") {
      const previousArg = input.args[index - 1];

      if (previousArg !== undefined && knownValueFlags.has(previousArg)) {
        continue;
      }

      throwParserError({
        message: `Unknown flag for ${input.command}: --.`,
        details: { command: input.command, flag: "--" },
        outputMode: input.invocation.outputMode,
      });
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const equalsIndex = arg.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const flag = arg.slice(0, equalsIndex);

    if (knownValueFlags.has(flag) || knownBooleanFlags.has(flag)) {
      continue;
    }

    throwParserError({
      message: `Unknown flag for ${input.command}: ${arg}.`,
      details: { command: input.command, flag: arg },
      outputMode: input.invocation.outputMode,
    });
  }
}

function isCommandTokenParseError(
  value: CommandTokenOutput | CommandTokenParseError,
): value is CommandTokenParseError {
  return "kind" in value && value.kind === "error";
}

function throwCommandTokenParseError(input: {
  readonly command: string;
  readonly message: string;
  readonly outputMode: SituCliOutputMode;
}): never {
  const normalized = input.message.trim().replace(/^Error:\s*/u, "");
  const missingValueFlag = matchMissingCommandValueFlag(normalized);

  if (missingValueFlag !== undefined) {
    throwParserError({
      message: `Missing value for ${missingValueFlag}.`,
      details: { command: input.command, flag: missingValueFlag },
      outputMode: input.outputMode,
    });
  }

  const unknownFlag = matchUnexpectedCommandFlag(normalized);

  if (unknownFlag !== undefined) {
    throwParserError({
      message: `Unknown flag for ${input.command}: ${unknownFlag}.`,
      details: { command: input.command, flag: unknownFlag },
      outputMode: input.outputMode,
    });
  }

  if (normalized === "Expected an argument, but got end of input.") {
    throwParserError({
      message: `Unknown flag for ${input.command}: --.`,
      details: { command: input.command, flag: "--" },
      outputMode: input.outputMode,
    });
  }

  throwParserError({
    message: normalized,
    details: { command: input.command, parser: "optique" },
    outputMode: input.outputMode,
  });
}

function matchMissingCommandValueFlag(message: string): string | undefined {
  const requiredMatch = /^`(?<flag>--[a-z0-9-]+)` requires `VALUE`\.$/iu.exec(message);

  if (requiredMatch?.groups?.flag !== undefined) {
    return requiredMatch.groups.flag;
  }

  const invalidMatch = /^`(?<flag>--[a-z0-9-]+)`: "Expected a command flag value\."$/iu.exec(
    message,
  );

  if (invalidMatch?.groups?.flag !== undefined) {
    return invalidMatch.groups.flag;
  }

  return undefined;
}

function matchUnexpectedCommandFlag(message: string): string | undefined {
  const match = /^Unexpected option or argument: "(?<flag>-[^"]+)"\./u.exec(message);
  return match?.groups?.flag;
}

function parseActorKind(input: {
  readonly invocation: SituCliInvocation;
  readonly flag: string;
  readonly value: string;
}): ActorKind {
  const parsed = v.safeParse(ActorKindSchema, input.value);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid actor kind for ${input.flag}: ${input.value}.`,
    details: {
      flag: input.flag,
      value: input.value,
      allowedValues: actorKinds,
    },
    outputMode: input.invocation.outputMode,
  });
}

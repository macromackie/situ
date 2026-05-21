import * as v from "valibot";

import type { SituCliInvocation } from "./types.js";

const situCliCommandNames = [
  "help",
  "version",
  "doctor",
  "runbook",
  "serve",
  "artifacts",
  "baselines",
  "briefings",
  "comments",
  "events",
  "experiments",
  "live",
  "measurements",
  "notifications",
  "projects",
  "reports",
  "reviews",
  "status",
  "tasks",
  "verify",
] as const;

const SituCliCommandNameSchema = v.picklist(situCliCommandNames);
const SituCliOutputModeSchema = v.picklist(["text", "json"]);

const ProcessEnvironmentSchema = v.optional(
  v.custom<NodeJS.ProcessEnv>((value) => typeof value === "object" && value !== null),
);

const SituCliInvocationSchema = v.object({
  command: v.optional(SituCliCommandNameSchema),
  rest: v.array(v.string()),
  outputMode: SituCliOutputModeSchema,
  databasePath: v.optional(v.string()),
  environment: ProcessEnvironmentSchema,
  cwd: v.string(),
  version: v.string(),
});

export type SituCliCommandName = v.InferOutput<typeof SituCliCommandNameSchema>;

export function parseSituCliInvocationSchema(input: unknown): SituCliInvocation {
  return v.parse(SituCliInvocationSchema, input);
}

export function isSituCliCommandName(value: string): value is SituCliCommandName {
  return (situCliCommandNames as readonly string[]).includes(value);
}

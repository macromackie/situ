import { z } from "zod";

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const title = z.string().trim().min(1).max(200);
export const kinds = [
  "question",
  "experiment",
  "run",
  "finding",
  "note",
] as const;
export const states = ["open", "active", "done", "paused"] as const;
export const linkSchema = z
  .object({
    target: id,
    relation: z.enum(["related", "derived_from", "supports", "contradicts"]),
    revision: z.number().int().positive().optional(),
  })
  .strict();
export const artifactSchema = z
  .object({
    name: title,
    uri: z
      .string()
      .max(2000)
      .refine(
        (value) => /^(https?:\/\/|file:\/\/)/.test(value),
        "Use an http, https, or file URI",
      ),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    description: z.string().max(2000).default(""),
    format: z.literal("table/v1").optional(),
  })
  .strict();
export const recordInput = z
  .object({
    id,
    projectId: id,
    kind: z.enum(kinds),
    title,
    body: z.string().max(30000).default(""),
    state: z.enum(states).default("open"),
    assessment: z.string().max(100).default(""),
    tags: z.array(z.string().min(1).max(80)).max(30).default([]),
    links: z.array(linkSchema).max(100).default([]),
    artifacts: z.array(artifactSchema).max(50).default([]),
    metadata: z
      .record(
        z.string().max(100),
        z.union([
          z.string().max(4000),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .default({}),
  })
  .strict();
export const patchInput = z
  .object({
    title: recordInput.shape.title.optional(),
    body: recordInput.shape.body.removeDefault().optional(),
    state: recordInput.shape.state.removeDefault().optional(),
    assessment: recordInput.shape.assessment.removeDefault().optional(),
    tags: recordInput.shape.tags.removeDefault().optional(),
    links: recordInput.shape.links.removeDefault().optional(),
    artifacts: recordInput.shape.artifacts.removeDefault().optional(),
    metadata: recordInput.shape.metadata.removeDefault().optional(),
  })
  .strict();
export const projectInput = z
  .object({ id, title, description: z.string().max(10000).default("") })
  .strict();
export const sampleInput = z
  .object({
    recordId: id,
    metric: title,
    cohort: title,
    unit: z.string().max(50).default(""),
    direction: z.enum(["higher", "lower", "neutral"]).default("neutral"),
    step: z.number().finite().nonnegative(),
    value: z.number().finite(),
  })
  .strict();
const envelope = { requestId: id, actor: z.string().trim().min(1).max(150) };
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...envelope,
      type: z.literal("project.create"),
      project: projectInput,
    })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal("record.create"),
      record: recordInput,
    })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal("record.update"),
      id,
      revision: z.number().int().positive(),
      patch: patchInput,
    })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal("samples.append"),
      samples: z.array(sampleInput).min(1).max(500),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type RecordInput = z.infer<typeof recordInput>;
export type ResearchRecord = RecordInput & {
  revision: number;
  createdAt: string;
  updatedAt: string;
  actor: string;
};
export type Project = z.infer<typeof projectInput> & { createdAt: string };
export type Sample = z.infer<typeof sampleInput> & {
  id: number;
  createdAt: string;
};
export type Change = {
  cursor: number;
  requestId: string;
  actor: string;
  at: string;
  type: Command["type"];
  project?: Project;
  record?: ResearchRecord;
  samples?: Sample[];
};
export type Snapshot = {
  cursor: number;
  projects: Project[];
  records: ResearchRecord[];
  samples: Sample[];
  sampleCount: number;
};
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

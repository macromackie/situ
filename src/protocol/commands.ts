import { z } from "zod";
import { publicationInputs } from "./publication/index.js";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
const text = z.string().trim().min(1).max(24000);
const short = z.string().trim().min(1).max(240);
const revision = z.number().int().positive();
const seconds = z.number().int().min(30).max(86400);
export const roles = z.enum(["worker", "reviewer", "coordinator", "curator"]);
export const evidence = z
  .object({
    uri: z.string().min(1).max(2048),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    title: short,
    mediaType: short.default("application/json"),
  })
  .strict();
export const policy = z
  .object({
    maxActiveTopics: z.number().int().min(1).max(32).default(3),
    maxActiveWork: z.number().int().min(1).max(128).default(30),
    maxPendingReviews: z.number().int().min(1).max(128).default(8),
    leaseSeconds: seconds.default(300),
    checkInSeconds: seconds.default(1200),
    reflectionSeconds: seconds.default(1800),
  })
  .strict();
const plan = z
  .object({
    question: text,
    prediction: text,
    test: text,
    falsifier: text,
    next: text,
    source: short,
    budget: text,
  })
  .strict();
const held = { workId: id, generation: revision };
export const inputs = {
  ...publicationInputs,
  "project.create": z
    .object({
      id,
      title: short,
      goal: text,
      focus: text,
      policy: policy.default(() => policy.parse({})),
    })
    .strict(),
  "project.update": z
    .object({
      projectId: id,
      expectedRevision: revision,
      focus: text.optional(),
      brief: text.optional(),
      sources: z.array(id).max(30).optional(),
      policy: policy.optional(),
    })
    .strict(),
  "session.join": z
    .object({ projectId: id, name: short, token: z.string().min(32).max(128) })
    .strict(),
  "session.grant": z
    .object({ sessionId: id, roles: z.array(roles).min(1).max(4) })
    .strict(),
  "session.replace": z
    .object({ oldSessionId: id, newSessionId: id, reason: text })
    .strict(),
  "session.heartbeat": z.object({}).strict(),
  "session.leave": z.object({}).strict(),
  "topic.create": z
    .object({
      projectId: id,
      title: short,
      brief: text,
      parentId: id.optional(),
    })
    .strict(),
  "topic.update": z
    .object({
      topicId: id,
      expectedRevision: revision,
      brief: text,
      sources: z.array(id).max(30).default([]),
    })
    .strict(),
  "post.create": z
    .object({
      topicId: id,
      body: text,
      replyTo: id.optional(),
      mentions: z.array(id).max(16).default([]),
      evidence: z.array(evidence).max(24).default([]),
    })
    .strict(),
  "request.create": z
    .object({ topicId: id, recipient: id, body: text, workId: id.optional() })
    .strict(),
  "inbox.read": z.object({ ids: z.array(id).max(100) }).strict(),
  "inbox.resolve": z
    .object({
      id,
      response: text,
      disposition: z
        .enum(["answered", "declined", "handled"])
        .default("handled"),
    })
    .strict(),
  "inbox.defer": z.object({ id, reason: text, seconds }).strict(),
  subscribe: z.object({ topicId: id, enabled: z.boolean() }).strict(),
  "work.propose": z
    .object({
      topicId: id,
      title: short,
      purpose: z.enum(["experiment", "validation"]).default("experiment"),
      plan,
      dependsOn: z.array(id).max(16).default([]),
    })
    .strict(),
  "work.admit": z
    .object({ workId: id, expectedRevision: revision, reason: text })
    .strict(),
  "work.start": z.object({ workId: id, expectedRevision: revision }).strict(),
  "work.checkpoint": z
    .object({
      ...held,
      planRevision: revision,
      observed: text,
      next: text,
      evidence: z.array(evidence).max(24).default([]),
      continueReason: text,
    })
    .strict(),
  "work.revise": z
    .object({ ...held, expectedRevision: revision, plan, reason: text })
    .strict(),
  "work.handoff": z
    .object({ ...held, next: text, blockers: text.optional() })
    .strict(),
  "work.finish": z
    .object({
      ...held,
      outcome: z.enum([
        "result",
        "negative",
        "inconclusive",
        "operational_failure",
      ]),
      summary: text,
      evidence: z.array(evidence).min(1).max(24),
    })
    .strict(),
  "work.cancel": z
    .object({ workId: id, expectedRevision: revision, reason: text })
    .strict(),
  "job.register": z
    .object({
      ...held,
      jobId: id,
      command: z.array(z.string().max(4096)).min(1).max(80),
      cwd: short,
      receiptPath: z.string().min(1).max(2048),
    })
    .strict(),
  "job.progress": z
    .object({
      jobId: id,
      runnerToken: z.string().min(32),
      status: z.enum([
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "unknown",
      ]),
      evidence: z.array(evidence).max(24).default([]),
      note: text,
    })
    .strict(),
  "job.reconcile": z
    .object({
      jobId: id,
      status: z.enum(["succeeded", "failed", "cancelled"]),
      evidence: z.array(evidence).min(1).max(24),
      reason: text,
    })
    .strict(),
  "review.submit": z
    .object({
      workId: id,
      expectedRevision: revision,
      claim: text,
      evidence: z.array(evidence).min(1).max(24),
    })
    .strict(),
  "review.decide": z
    .object({
      reviewId: id,
      expectedRevision: revision,
      decision: z.enum([
        "accepted",
        "needs_evidence",
        "needs_correction",
        "operational_failure",
      ]),
      rationale: text,
      evidence: z.array(evidence).min(1).max(24),
    })
    .strict(),
  "review.withdraw": z
    .object({ reviewId: id, expectedRevision: revision, reason: text })
    .strict(),
  "review.challenge": z
    .object({
      reviewId: id,
      reason: text,
      evidence: z.array(evidence).min(1).max(24),
    })
    .strict(),
} as const;
export type CommandType = keyof typeof inputs;
export type Command = {
  [K in CommandType]: {
    id: string;
    workspaceId: string;
    type: K;
    input: z.infer<(typeof inputs)[K]>;
  };
}[CommandType];
export const envelope = z
  .object({
    id,
    workspaceId: id,
    type: z.enum(Object.keys(inputs) as [CommandType, ...CommandType[]]),
    input: z.unknown(),
  })
  .strict();
export function parseCommand(value: unknown): Command {
  const c = envelope.parse(value);
  return { ...c, input: inputs[c.type].parse(c.input) } as Command;
}
export function commandSchemas() {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, schema]) => [
      key,
      z.toJSONSchema(schema),
    ]),
  );
}
export type Evidence = z.infer<typeof evidence>;
export type Policy = z.infer<typeof policy>;

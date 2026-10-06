import { z } from "zod";
import { artifactId } from "../artifacts.js";
import { sourceRef } from "./sources.js";
const label = z.string().trim().min(1).max(240);
const base = {
  id: artifactId,
  title: label,
  caption: z.string().max(2000),
  sources: z.array(sourceRef).min(1).max(100),
};
const plot = {
  assetIds: z.array(artifactId).min(1).max(12),
  baseline: artifactId.optional(),
  scenario: label.optional(),
};
const clip = z
  .object({
    assetId: artifactId,
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .strict();
export const figure = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("comparison"), ...plot }).strict(),
  z.object({ ...base, kind: z.literal("curve"), ...plot }).strict(),
  z.object({ ...base, kind: z.literal("matrix"), ...plot }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("replay"),
      left: clip,
      right: clip,
      alignment: z.enum(["matched", "illustrative"]),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("example"),
      assetId: artifactId,
      annotations: z.array(label).max(12),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("timeline"),
      lanes: z
        .array(
          z
            .object({ id: artifactId, label, pageId: artifactId.optional() })
            .strict(),
        )
        .min(1)
        .max(30),
      items: z
        .array(
          z
            .object({
              id: artifactId,
              laneId: artifactId,
              label,
              source: sourceRef,
              startField: z.enum(["createdAt", "updatedAt"]),
              endField: z.enum(["updatedAt"]).optional(),
            })
            .strict(),
        )
        .max(200),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("evidence"),
      nodes: z
        .array(z.object({ id: artifactId, label, source: sourceRef }).strict())
        .min(1)
        .max(40),
      edges: z
        .array(
          z
            .object({
              from: artifactId,
              to: artifactId,
              relationship: z.enum([
                "supports",
                "challenges",
                "motivates",
                "replicates",
              ]),
            })
            .strict(),
        )
        .max(80),
    })
    .strict(),
]);
export type Figure = z.infer<typeof figure>;

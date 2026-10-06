import { z } from "zod";
import { artifactId, type Asset } from "../artifacts.js";
import { figure } from "./figures.js";
import { sourceRef, type SourceSnapshot } from "./sources.js";
const prose = z.string().trim().min(1).max(6000);
const label = z.string().trim().min(1).max(240);
export const block = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("statement"),
      id: artifactId,
      stance: z.enum(["observation", "interpretation", "proposal"]),
      text: prose,
      sources: z.array(sourceRef).max(30),
      acceptedReview: sourceRef.optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("figure"), id: artifactId, figureId: artifactId })
    .strict(),
  z
    .object({
      kind: z.literal("next-test"),
      id: artifactId,
      text: prose,
      sources: z.array(sourceRef).max(30),
    })
    .strict(),
  z
    .object({
      kind: z.literal("related"),
      id: artifactId,
      pageIds: z.array(artifactId).max(20),
    })
    .strict(),
]);
export const page = z
  .object({
    id: artifactId,
    template: z.enum(["overview", "question"]),
    title: label,
    summary: z
      .object({ text: prose, sources: z.array(sourceRef).min(1).max(30) })
      .strict(),
    sections: z
      .array(
        z
          .object({
            id: artifactId,
            title: label.optional(),
            blocks: z.array(block).min(1).max(30),
          })
          .strict(),
      )
      .max(20),
    archived: z.boolean().default(false),
  })
  .strict();
export const update = z
  .object({
    id: artifactId,
    pageIds: z.array(artifactId).max(20),
    kind: z.enum([
      "result",
      "decision",
      "contradiction",
      "blocker",
      "correction",
    ]),
    headline: label,
    body: prose,
    occurredAt: z.number().int().nonnegative(),
    sources: z.array(sourceRef).min(1).max(30),
    corrects: artifactId.optional(),
  })
  .strict();
export const publicationDocument = z
  .object({
    schemaVersion: z.literal(1),
    pages: z.array(page).max(100),
    figures: z.array(figure).max(100),
    updates: z.array(update).max(300),
  })
  .strict();
export type PublicationDocument = z.infer<typeof publicationDocument>;
export type Page = z.infer<typeof page>;
export type Update = z.infer<typeof update>;
export interface Draft {
  projectId: string;
  revision: number;
  baseRelease: number;
  snapshotId: string;
  document: PublicationDocument;
  author: string;
  updatedAt: number;
}
export interface Release extends Draft {
  publishedAt: number;
  through: number;
}
export interface ValidationIssue {
  path: string;
  message: string;
}
export interface PublicationView {
  project: { id: string; title: string; goal: string; focus: string };
  release: Release | null;
  sources: Record<string, SourceSnapshot>;
  assets: Record<string, Asset>;
  freshness: {
    through: number;
    latest: number;
    pending: number;
    changedSources: string[];
  };
  live: { running: number; unknown: number; asOf: number };
}

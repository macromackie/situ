import { z } from "zod";
import { artifactId } from "../artifacts.js";
export const sourceRef = z
  .object({
    snapshotId: artifactId,
    recordId: artifactId,
    relationship: z.enum(["supports", "challenges", "context"]),
  })
  .strict();
export type SourceRef = z.infer<typeof sourceRef>;
export interface SourceSnapshot {
  id: string;
  projectId: string;
  through: number;
  capturedAt: number;
  records: Record<string, Record<string, any>>;
}

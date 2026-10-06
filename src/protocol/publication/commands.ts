import { z } from "zod";
import { artifactId } from "../artifacts.js";
import { publicationDocument } from "./models.js";
const version = z.number().int().nonnegative();
export const publicationInputs = {
  "publication.capture": z
    .object({
      projectId: artifactId,
      after: version.default(0),
      recordIds: z.array(artifactId).max(2000).optional(),
    })
    .strict(),
  "publication.save": z
    .object({
      projectId: artifactId,
      expectedRevision: version,
      baseRelease: version,
      snapshotId: artifactId,
      document: publicationDocument,
    })
    .strict(),
  "publication.publish": z
    .object({
      projectId: artifactId,
      expectedRevision: version,
      expectedRelease: version,
    })
    .strict(),
  "publication.archive": z
    .object({
      projectId: artifactId,
      pageId: artifactId,
      expectedRevision: version,
      expectedRelease: version,
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
};

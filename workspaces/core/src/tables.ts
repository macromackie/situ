import { z } from "zod";

export const tableArtifactSchema = z
  .object({
    schema: z.literal("situ.table.v1"),
    title: z.string().max(200),
    columns: z.array(z.string().min(1).max(80)).min(1).max(24),
    rows: z
      .array(
        z.record(
          z.string().max(80),
          z.union([
            z.string().max(8000),
            z.number().finite(),
            z.boolean(),
            z.null(),
          ]),
        ),
      )
      .max(1000),
  })
  .strict()
  .superRefine((table, ctx) => {
    if (
      new Set(table.columns).size !== table.columns.length ||
      table.rows.some((row) =>
        Object.keys(row).some((key) => !table.columns.includes(key)),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Use unique columns and matching row keys",
      });
    }
  });
export type TableArtifact = z.infer<typeof tableArtifactSchema>;

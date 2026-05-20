import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  createAppActionContext,
  createReportAction,
  getReportAction,
  listRecentReportsAction,
  listReportsForProjectAction,
  listReportsForTargetAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import { generateProjectReportHtml, generateProjectReportMarkdown } from "../../reports/index.js";
import { collectProjectReportSnapshot } from "../../reports/collection.js";
import {
  buildInstructions,
  compileMdxReport,
  submitMdxReport,
  validateMdxReport,
} from "../../reports/mdx/index.js";
import {
  booleanOption,
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parsePositiveIntegerLimit,
  parseTargetKind,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatReportLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export async function runReportsCommand(input: {
  readonly invocation: SituCliInvocation;
}): Promise<SituCliResult> {
  const parsedCommand = parseReportCommand(input.invocation);

  if (parsedCommand.subcommand === "instructions") {
    return runInstructionsCommand({
      invocation: input.invocation,
      parsedCommand,
    });
  }

  if (parsedCommand.subcommand === "preview") {
    return runPreviewCommand({
      invocation: input.invocation,
      parsedCommand,
    });
  }

  if (parsedCommand.subcommand === "submit") {
    return runSubmitCommand({
      invocation: input.invocation,
      parsedCommand,
    });
  }

  if (parsedCommand.subcommand === "generate") {
    return runGenerateCommand({
      invocation: input.invocation,
      parsedCommand,
    });
  }

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createReportAction({
            context,
            id: parsedCommand.id,
            projectId: parsedCommand.projectId,
            target: parsedCommand.target,
            title: parsedCommand.title,
            bodyMarkdown: parsedCommand.bodyMarkdown,
            generatedBy: parsedCommand.generatedBy,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created report ${result.report.id}`,
          });
        }

        case "list": {
          if (parsedCommand.selector === "project") {
            const reports = listReportsForProjectAction({
              context,
              projectId: parsedCommand.projectId,
            });

            return formatDataResult({
              invocation: input.invocation,
              data: { reports },
              text: formatReportLines(reports),
            });
          }

          const reports = listReportsForTargetAction({
            context,
            target: parsedCommand.target,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { reports },
            text: formatReportLines(reports),
          });
        }

        case "recent": {
          const reports = listRecentReportsAction({
            context,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { reports },
            text: formatReportLines(reports),
          });
        }

        case "get": {
          const report = getReportAction({
            context,
            id: parsedCommand.id,
          });

          if (report === undefined) {
            throw new NotFoundError({
              message: "Report was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { report },
            text: formatReportLines([report]),
          });
        }
      }
    },
  });
}

type ParsedReportCommand =
  | {
      readonly subcommand: "generate";
      readonly projectId: SituId<"project">;
      readonly generatedAt?: IsoTimestamp;
      readonly format: GeneratedReportFormat;
      readonly outPath?: string;
    }
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"report">;
      readonly projectId: SituId<"project">;
      readonly target: TargetRef;
      readonly title: string;
      readonly bodyMarkdown: string;
      readonly generatedBy: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly selector: "project";
      readonly projectId: SituId<"project">;
    }
  | {
      readonly subcommand: "list";
      readonly selector: "target";
      readonly target: TargetRef;
    }
  | {
      readonly subcommand: "recent";
      readonly limit?: number;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"report">;
    }
  | {
      readonly subcommand: "instructions";
      readonly projectId: SituId<"project">;
      readonly outDirectory?: string;
    }
  | {
      readonly subcommand: "preview";
      readonly projectId: SituId<"project">;
      readonly draftPath: string;
      readonly outPath?: string;
      readonly generatedAt?: IsoTimestamp;
      readonly embedFonts: boolean;
    }
  | {
      readonly subcommand: "submit";
      readonly projectId: SituId<"project">;
      readonly draftPath: string;
      readonly title: string;
      readonly htmlOutputPath?: string;
      readonly generatedAt?: IsoTimestamp;
      readonly generatedBy: ActorRef;
    };

const generateReportCommand = defineCommandSpec({
  command: "reports generate",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "generatedAt", flag: "--generated-at" }),
    valueOption({ key: "format", flag: "--format" }),
    valueOption({ key: "outPath", flag: "--out" }),
  ],
  schema: v.object({
    projectId: v.string(),
    generatedAt: v.optional(v.string()),
    format: v.optional(v.string()),
    outPath: v.optional(v.string()),
  }),
});

const createReportCommand = defineCommandSpec({
  command: "reports create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "targetKind", flag: "--target-kind", required: true }),
    valueOption({ key: "targetId", flag: "--target-id", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "bodyMarkdown", flag: "--body", required: true }),
    valueOption({ key: "generatedByKind", flag: "--generated-by-kind", required: true }),
    valueOption({ key: "generatedById", flag: "--generated-by-id", required: true }),
    valueOption({ key: "generatedByDisplayName", flag: "--generated-by-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    targetKind: v.string(),
    targetId: v.string(),
    title: v.string(),
    bodyMarkdown: v.string(),
    generatedByKind: v.string(),
    generatedById: v.string(),
    generatedByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listReportCommand = defineCommandSpec({
  command: "reports list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id" }),
    valueOption({ key: "targetKind", flag: "--target-kind" }),
    valueOption({ key: "targetId", flag: "--target-id" }),
  ],
  schema: v.object({
    projectId: v.optional(v.string()),
    targetKind: v.optional(v.string()),
    targetId: v.optional(v.string()),
  }),
});

const recentReportCommand = defineCommandSpec({
  command: "reports recent",
  positionals: noPositionals(),
  options: [valueOption({ key: "limit", flag: "--limit" })],
  schema: v.object({
    limit: v.optional(v.string()),
  }),
});

const getReportCommand = defineCommandSpec({
  command: "reports get",
  positionals: singlePositional({ key: "id", name: "report-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

const instructionsReportCommand = defineCommandSpec({
  command: "reports instructions",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "outDirectory", flag: "--out" }),
  ],
  schema: v.object({
    projectId: v.string(),
    outDirectory: v.optional(v.string()),
  }),
});

const previewReportCommand = defineCommandSpec({
  command: "reports preview",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "draftPath", flag: "--draft", required: true }),
    valueOption({ key: "outPath", flag: "--out" }),
    valueOption({ key: "generatedAt", flag: "--generated-at" }),
    booleanOption({ key: "noEmbedFonts", flag: "--no-embed-fonts" }),
  ],
  schema: v.object({
    projectId: v.string(),
    draftPath: v.string(),
    outPath: v.optional(v.string()),
    generatedAt: v.optional(v.string()),
    noEmbedFonts: v.boolean(),
  }),
});

const submitReportCommand = defineCommandSpec({
  command: "reports submit",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "draftPath", flag: "--draft", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "htmlOutputPath", flag: "--out" }),
    valueOption({ key: "generatedAt", flag: "--generated-at" }),
    valueOption({ key: "generatedByKind", flag: "--generated-by-kind", required: true }),
    valueOption({ key: "generatedById", flag: "--generated-by-id", required: true }),
    valueOption({ key: "generatedByDisplayName", flag: "--generated-by-display-name" }),
  ],
  schema: v.object({
    projectId: v.string(),
    draftPath: v.string(),
    title: v.string(),
    htmlOutputPath: v.optional(v.string()),
    generatedAt: v.optional(v.string()),
    generatedByKind: v.string(),
    generatedById: v.string(),
    generatedByDisplayName: v.optional(v.string()),
  }),
});

function parseReportCommand(invocation: SituCliInvocation): ParsedReportCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command reports requires a subcommand.",
      details: { command: "reports" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "generate": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: generateReportCommand,
      });

      return {
        subcommand,
        projectId: options.projectId as SituId<"project">,
        generatedAt: options.generatedAt as IsoTimestamp | undefined,
        format: parseGeneratedReportFormat({
          invocation,
          value: options.format,
        }),
        outPath: options.outPath,
      };
    }

    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createReportCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"report"> | undefined,
        projectId: options.projectId as SituId<"project">,
        target: parseTarget({
          invocation,
          targetKindValue: options.targetKind,
          targetId: options.targetId,
        }),
        title: options.title,
        bodyMarkdown: options.bodyMarkdown,
        generatedBy: parseActorRef({
          invocation,
          kindFlag: "--generated-by-kind",
          kind: options.generatedByKind,
          id: options.generatedById,
          displayName: options.generatedByDisplayName,
        }),
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listReportCommand,
      });

      return parseListCommand({
        invocation,
        projectId: options.projectId,
        targetKindValue: options.targetKind,
        targetId: options.targetId,
      });
    }

    case "recent": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: recentReportCommand,
      });

      return {
        subcommand,
        limit:
          options.limit === undefined
            ? undefined
            : parsePositiveIntegerLimit({
                invocation,
                value: options.limit,
              }),
      };
    }

    case "get": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: getReportCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"report">,
      };
    }

    case "instructions": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: instructionsReportCommand,
      });
      return {
        subcommand,
        projectId: options.projectId as SituId<"project">,
        outDirectory: options.outDirectory,
      };
    }

    case "preview": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: previewReportCommand,
      });
      return {
        subcommand,
        projectId: options.projectId as SituId<"project">,
        draftPath: options.draftPath,
        outPath: options.outPath,
        generatedAt: options.generatedAt as IsoTimestamp | undefined,
        embedFonts: !options.noEmbedFonts,
      };
    }

    case "submit": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: submitReportCommand,
      });
      return {
        subcommand,
        projectId: options.projectId as SituId<"project">,
        draftPath: options.draftPath,
        title: options.title,
        htmlOutputPath: options.htmlOutputPath,
        generatedAt: options.generatedAt as IsoTimestamp | undefined,
        generatedBy: parseActorRef({
          invocation,
          kindFlag: "--generated-by-kind",
          kind: options.generatedByKind,
          id: options.generatedById,
          displayName: options.generatedByDisplayName,
        }),
      };
    }

    default:
      throwParserError({
        message: `Unknown reports subcommand: ${subcommand}.`,
        details: { command: "reports", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function parseListCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly projectId?: string;
  readonly targetKindValue?: string;
  readonly targetId?: string;
}): ParsedReportCommand {
  const hasProject = input.projectId !== undefined;
  const hasTargetKind = input.targetKindValue !== undefined;
  const hasTargetId = input.targetId !== undefined;

  if (hasProject && (hasTargetKind || hasTargetId)) {
    throwParserError({
      message: "Command reports list cannot combine --project-id with target flags.",
      details: {
        command: "reports list",
        projectFlag: "--project-id",
        targetFlags: ["--target-kind", "--target-id"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  if (!hasProject && !hasTargetKind && !hasTargetId) {
    throwParserError({
      message: "Command reports list requires --project-id or target flags.",
      details: {
        command: "reports list",
        projectFlag: "--project-id",
        targetFlags: ["--target-kind", "--target-id"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  if (hasTargetKind !== hasTargetId) {
    throwParserError({
      message: "Report target flags require both --target-kind and --target-id.",
      details: {
        command: "reports list",
        targetFlags: ["--target-kind", "--target-id"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  if (hasProject) {
    return {
      subcommand: "list",
      selector: "project",
      projectId: input.projectId as SituId<"project">,
    };
  }

  if (input.targetKindValue === undefined || input.targetId === undefined) {
    throw new Error("Report list target selector was not parsed.");
  }

  return {
    subcommand: "list",
    selector: "target",
    target: parseTarget({
      invocation: input.invocation,
      targetKindValue: input.targetKindValue,
      targetId: input.targetId,
    }),
  };
}

function parseTarget(input: {
  readonly invocation: SituCliInvocation;
  readonly targetKindValue: string;
  readonly targetId: string;
}): TargetRef {
  return {
    targetKind: parseTargetKind({
      invocation: input.invocation,
      value: input.targetKindValue,
    }),
    targetId: input.targetId as TargetRef["targetId"],
  };
}

type GeneratedReportFormat = "markdown" | "html";

type GeneratedReport =
  | {
      readonly format: "markdown";
      readonly bodyMarkdown: string;
    }
  | {
      readonly format: "html";
      readonly bodyHtml: string;
    };

function parseGeneratedReportFormat(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): GeneratedReportFormat {
  if (input.value === undefined || input.value === "markdown") {
    return "markdown";
  }

  if (input.value === "html") {
    return "html";
  }

  throwParserError({
    message: `Unsupported report format: ${input.value}.`,
    details: {
      command: "reports generate",
      flag: "--format",
      value: input.value,
      supported: ["markdown", "html"],
    },
    outputMode: input.invocation.outputMode,
  });
}

async function generateProjectReport(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly projectId: SituId<"project">;
  readonly generatedAt?: IsoTimestamp;
  readonly format: GeneratedReportFormat;
}): Promise<GeneratedReport> {
  if (input.format === "html") {
    return {
      format: "html",
      bodyHtml: await generateProjectReportHtml({
        context: input.context,
        projectId: input.projectId,
        generatedAt: input.generatedAt,
      }),
    };
  }

  return {
    format: "markdown",
    bodyMarkdown: generateProjectReportMarkdown({
      context: input.context,
      projectId: input.projectId,
      generatedAt: input.generatedAt,
    }),
  };
}

function formatGeneratedReportResult(input: {
  readonly invocation: SituCliInvocation;
  readonly projectId: SituId<"project">;
  readonly generatedAt?: IsoTimestamp;
  readonly generatedReport: GeneratedReport;
}): SituCliResult {
  if (input.invocation.outputMode === "json") {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        projectId: input.projectId,
        generatedAt: input.generatedAt,
        format: input.generatedReport.format,
        ...generatedReportBody(input.generatedReport),
      })}\n`,
      stderr: "",
    };
  }

  if (input.generatedReport.format === "html") {
    return {
      exitCode: 0,
      stdout: input.generatedReport.bodyHtml,
      stderr: "",
    };
  }

  return {
    exitCode: 0,
    stdout: input.generatedReport.bodyMarkdown,
    stderr: "",
  };
}

function generatedReportBody(input: GeneratedReport):
  | { readonly bodyMarkdown: string }
  | {
      readonly bodyHtml: string;
    } {
  if (input.format === "html") {
    return {
      bodyHtml: input.bodyHtml,
    };
  }

  return {
    bodyMarkdown: input.bodyMarkdown,
  };
}

async function withActionContext(input: {
  readonly invocation: SituCliInvocation;
  readonly run: (
    context: ReturnType<typeof createAppActionContext>,
  ) => SituCliResult | Promise<SituCliResult>;
}): Promise<SituCliResult> {
  const database = openAppDatabase({
    databasePath: input.invocation.databasePath,
    environment: input.invocation.environment,
  });

  try {
    return await input.run(createAppActionContext({ database }));
  } finally {
    database.close();
  }
}

function defaultDraftDirectory(input: {
  readonly invocation: SituCliInvocation;
  readonly projectId: SituId<"project">;
}): string {
  const env = input.invocation.environment ?? process.env;
  const drafts = env.SITU_REPORT_DRAFT_DIR;
  if (typeof drafts === "string" && drafts.length > 0) {
    return join(drafts, input.projectId);
  }
  const home = env.SITU_HOME;
  if (typeof home === "string" && home.length > 0) {
    return join(home, "drafts", input.projectId);
  }
  return join(process.cwd(), ".situ-drafts", input.projectId);
}

function runInstructionsCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly parsedCommand: Extract<ParsedReportCommand, { subcommand: "instructions" }>;
}): Promise<SituCliResult> {
  const outDirectory =
    input.parsedCommand.outDirectory ??
    defaultDraftDirectory({
      invocation: input.invocation,
      projectId: input.parsedCommand.projectId,
    });
  mkdirSync(outDirectory, { recursive: true });
  const instructionsPath = join(outDirectory, "instructions.md");
  const draftPath = join(outDirectory, "draft.mdx");

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      const snapshot = collectProjectReportSnapshot({
        context,
        projectId: input.parsedCommand.projectId,
      });
      const built = buildInstructions({ snapshot, draftPath });
      writeFileSync(instructionsPath, built.instructionsMarkdown, "utf8");
      writeFileSync(draftPath, built.draftMdx, "utf8");

      if (input.invocation.outputMode === "json") {
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            projectId: input.parsedCommand.projectId,
            instructionsPath,
            draftPath,
          })}\n`,
          stderr: "",
        };
      }
      return {
        exitCode: 0,
        stdout: `Wrote instructions to ${instructionsPath}\nWrote starter MDX to ${draftPath}\n`,
        stderr: "",
      };
    },
  });
}

function runPreviewCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly parsedCommand: Extract<ParsedReportCommand, { subcommand: "preview" }>;
}): Promise<SituCliResult> {
  const draftPath = input.parsedCommand.draftPath;
  const outPath = input.parsedCommand.outPath ?? `${draftPath.replace(/\.mdx$/, "")}.preview.html`;
  return withActionContext({
    invocation: input.invocation,
    run: async (context) => {
      const snapshot = collectProjectReportSnapshot({
        context,
        projectId: input.parsedCommand.projectId,
      });
      const mdxSource = readFileSync(draftPath, "utf8");
      const validation = validateMdxReport({ mdxSource, snapshot });
      const compiled = await compileMdxReport({
        mdxSource,
        snapshot,
        generatedAt: input.parsedCommand.generatedAt,
        embedFonts: input.parsedCommand.embedFonts,
      });
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, compiled.html, "utf8");

      if (input.invocation.outputMode === "json") {
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            projectId: input.parsedCommand.projectId,
            draftPath,
            htmlPath: outPath,
            errors: validation.errors,
            warnings: validation.warnings,
          })}\n`,
          stderr: "",
        };
      }
      const messages: string[] = [`Compiled preview to ${outPath}`];
      for (const issue of validation.errors) {
        messages.push(`error[${issue.code}]: ${issue.message}`);
      }
      for (const issue of validation.warnings) {
        messages.push(`warn[${issue.code}]: ${issue.message}`);
      }
      return {
        exitCode: 0,
        stdout: `${messages.join("\n")}\n`,
        stderr: "",
      };
    },
  });
}

function runSubmitCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly parsedCommand: Extract<ParsedReportCommand, { subcommand: "submit" }>;
}): Promise<SituCliResult> {
  const draftPath = input.parsedCommand.draftPath;
  const htmlOutputPath =
    input.parsedCommand.htmlOutputPath ?? `${draftPath.replace(/\.mdx$/, "")}.submitted.html`;
  return withActionContext({
    invocation: input.invocation,
    run: async (context) => {
      const mdxSource = readFileSync(draftPath, "utf8");
      mkdirSync(dirname(htmlOutputPath), { recursive: true });
      const result = await submitMdxReport({
        context,
        projectId: input.parsedCommand.projectId,
        mdxSource,
        title: input.parsedCommand.title,
        generatedBy: input.parsedCommand.generatedBy,
        htmlOutputPath,
        generatedAt: input.parsedCommand.generatedAt,
      });

      if (input.invocation.outputMode === "json") {
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            projectId: input.parsedCommand.projectId,
            reportId: result.reportId,
            artifactId: result.artifactId,
            htmlPath: result.htmlPath,
            warnings: result.warnings,
          })}\n`,
          stderr: "",
        };
      }
      const messages: string[] = [
        `Submitted report ${result.reportId}`,
        `Artifact ${result.artifactId} -> ${result.htmlPath}`,
      ];
      for (const warning of result.warnings) {
        messages.push(`warn[${warning.code}]: ${warning.message}`);
      }
      return {
        exitCode: 0,
        stdout: `${messages.join("\n")}\n`,
        stderr: "",
      };
    },
  });
}

function runGenerateCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly parsedCommand: Extract<ParsedReportCommand, { subcommand: "generate" }>;
}): Promise<SituCliResult> {
  return withActionContext({
    invocation: input.invocation,
    run: async (context) => {
      const generatedReport = await generateProjectReport({
        context,
        projectId: input.parsedCommand.projectId,
        generatedAt: input.parsedCommand.generatedAt,
        format: input.parsedCommand.format,
      });

      if (input.parsedCommand.outPath !== undefined) {
        // Bypass stdout to avoid the macOS 64KB pipe-buffer truncation that
        // affects callers (e.g. the eval harness) capturing very large HTML
        // via spawnSync. Writing directly to disk is reliable for any size.
        const body =
          generatedReport.format === "html"
            ? generatedReport.bodyHtml
            : generatedReport.bodyMarkdown;
        mkdirSync(dirname(input.parsedCommand.outPath), { recursive: true });
        writeFileSync(input.parsedCommand.outPath, body, "utf8");

        if (input.invocation.outputMode === "json") {
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({
              projectId: input.parsedCommand.projectId,
              generatedAt: input.parsedCommand.generatedAt,
              format: generatedReport.format,
              outPath: input.parsedCommand.outPath,
              byteSize: Buffer.byteLength(body, "utf8"),
            })}\n`,
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: `Wrote ${generatedReport.format} report to ${input.parsedCommand.outPath} (${Buffer.byteLength(body, "utf8")} bytes)\n`,
          stderr: "",
        };
      }

      return formatGeneratedReportResult({
        invocation: input.invocation,
        projectId: input.parsedCommand.projectId,
        generatedAt: input.parsedCommand.generatedAt,
        generatedReport,
      });
    },
  });
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const adrDirectory = ".agents/adrs";
const allowedCategories = new Set([
  "heuristic",
  "context",
  "structure",
  "tooling",
  "policy",
  "contract",
  "feature",
]);
const allowedStatuses = new Set(["active", "deprecated"]);
const expectedFrontmatterKeys = ["status", "category", "created"] as const;
const branchLocalProsePhrases = [
  "current implementation",
  "currently describes",
  "before this ADR",
  "Update ADR",
  "move it",
  "already satisfied",
  "implementation progress",
] as const;

type AdrIssue = {
  readonly path: string;
  readonly message: string;
};

type FilenameMetadata = {
  readonly number: number;
  readonly numberText: string;
  readonly category: string;
};

type ParsedFrontmatter = {
  readonly fields: ReadonlyMap<string, string>;
  readonly body: string;
  readonly bodyStartLine: number;
};

async function main(): Promise<void> {
  const issues: AdrIssue[] = [];
  const files = await loadAdrFiles();
  const filenameMetadataByPath = validateFilenames({ files, issues });
  const existingNumbers = new Set(
    [...filenameMetadataByPath.values()].map((metadata) => metadata.numberText),
  );

  for (const file of files) {
    const metadata = filenameMetadataByPath.get(file.path);
    validateAdrContent({
      file,
      metadata,
      existingNumbers,
      issues,
    });
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.path}: ${issue.message}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`ADR validation passed: ${files.length} files`);
}

type AdrFile = {
  readonly filename: string;
  readonly path: string;
  readonly content: string;
};

async function loadAdrFiles(): Promise<readonly AdrFile[]> {
  const entries = await readdir(adrDirectory, { withFileTypes: true });
  const markdownFilenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  return Promise.all(
    sortStrings(markdownFilenames).map(async (filename) => {
      const path = join(adrDirectory, filename);

      return {
        filename,
        path,
        content: await readFile(path, "utf8"),
      };
    }),
  );
}

function sortStrings(values: readonly string[]): readonly string[] {
  const sorted: string[] = [];

  for (const value of values) {
    const insertionIndex = sorted.findIndex((candidate) => value < candidate);

    if (insertionIndex === -1) {
      sorted.push(value);
      continue;
    }

    sorted.splice(insertionIndex, 0, value);
  }

  return sorted;
}

function validateFilenames(input: {
  readonly files: readonly AdrFile[];
  readonly issues: AdrIssue[];
}): ReadonlyMap<string, FilenameMetadata> {
  const metadataByPath = new Map<string, FilenameMetadata>();
  const numbersByText = new Map<string, string>();
  let previous:
    | {
        readonly path: string;
        readonly number: number;
      }
    | undefined;

  for (const file of input.files) {
    const match = file.filename.match(/^([0-9]{4})-([a-z]+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);

    if (match === null) {
      input.issues.push({
        path: file.path,
        message: "filename must match NNNN-<category>-<short-title>.md",
      });
      continue;
    }

    const numberText = match[1];
    const category = match[2];
    const number = Number(numberText);

    metadataByPath.set(file.path, {
      number,
      numberText,
      category,
    });

    if (!allowedCategories.has(category)) {
      input.issues.push({
        path: file.path,
        message: `filename category must be one of ${[...allowedCategories].join(", ")}`,
      });
    }

    const existingPath = numbersByText.get(numberText);

    if (existingPath !== undefined) {
      input.issues.push({
        path: file.path,
        message: `ADR number ${numberText} duplicates ${existingPath}`,
      });
    } else {
      numbersByText.set(numberText, file.path);
    }

    if (previous !== undefined && number <= previous.number) {
      input.issues.push({
        path: file.path,
        message: `ADR numbers must be strictly increasing when filenames are sorted; previous file ${previous.path} has ${formatAdrNumber(previous.number)}`,
      });
    }

    previous = {
      path: file.path,
      number,
    };
  }

  return metadataByPath;
}

function validateAdrContent(input: {
  readonly file: AdrFile;
  readonly metadata: FilenameMetadata | undefined;
  readonly existingNumbers: ReadonlySet<string>;
  readonly issues: AdrIssue[];
}): void {
  const parsed = parseFrontmatter({
    file: input.file,
    issues: input.issues,
  });

  if (parsed !== undefined) {
    validateFrontmatterFields({
      file: input.file,
      metadata: input.metadata,
      fields: parsed.fields,
      issues: input.issues,
    });
    validateFirstHeading({
      file: input.file,
      metadata: input.metadata,
      body: parsed.body,
      issues: input.issues,
    });
    validateTargetStateProse({
      file: input.file,
      parsed,
      issues: input.issues,
    });
  }

  validateAdrReferences({
    file: input.file,
    existingNumbers: input.existingNumbers,
    issues: input.issues,
  });
}

function parseFrontmatter(input: {
  readonly file: AdrFile;
  readonly issues: AdrIssue[];
}): ParsedFrontmatter | undefined {
  const content = normalizeLineEndings(input.file.content);
  const lines = content.split("\n");

  if (lines[0] !== "---") {
    input.issues.push({
      path: input.file.path,
      message: "file must start with YAML frontmatter delimiter ---",
    });
    return undefined;
  }

  const fields = new Map<string, string>();

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    if (line === "---") {
      return {
        fields,
        body: lines.slice(lineIndex + 1).join("\n"),
        bodyStartLine: lineIndex + 2,
      };
    }

    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([^:]+):(.*)$/);

    if (match === null) {
      input.issues.push({
        path: input.file.path,
        message: `frontmatter line ${lineIndex + 1} must be a key: value pair`,
      });
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim();

    if (key.length === 0) {
      input.issues.push({
        path: input.file.path,
        message: `frontmatter line ${lineIndex + 1} has an empty key`,
      });
      continue;
    }

    if (isQuoted(value)) {
      input.issues.push({
        path: input.file.path,
        message: `frontmatter field ${key} must use an unquoted plain value`,
      });
    }

    if (!expectedFrontmatterKeys.includes(key as (typeof expectedFrontmatterKeys)[number])) {
      input.issues.push({
        path: input.file.path,
        message: `unknown frontmatter field ${key}`,
      });
    }

    if (fields.has(key)) {
      input.issues.push({
        path: input.file.path,
        message: `duplicate frontmatter field ${key}`,
      });
      continue;
    }

    fields.set(key, value);
  }

  input.issues.push({
    path: input.file.path,
    message: "frontmatter must have a closing --- delimiter before Markdown body text",
  });
  return undefined;
}

function validateTargetStateProse(input: {
  readonly file: AdrFile;
  readonly parsed: ParsedFrontmatter;
  readonly issues: AdrIssue[];
}): void {
  if (input.parsed.fields.get("status") !== "active") {
    return;
  }

  const bodyWithoutCodeBlocks = stripFencedCodeBlocks(normalizeLineEndings(input.parsed.body));
  const lines = bodyWithoutCodeBlocks.split("\n");

  for (const [lineIndex, line] of lines.entries()) {
    const searchableLine = removeInlineCodeSpans(line);

    for (const phrase of branchLocalProsePhrases) {
      if (containsPhrase(searchableLine, phrase)) {
        input.issues.push({
          path: input.file.path,
          message: `line ${input.parsed.bodyStartLine + lineIndex} uses branch-local ADR prose "${phrase}"`,
        });
      }
    }
  }
}

function validateFrontmatterFields(input: {
  readonly file: AdrFile;
  readonly metadata: FilenameMetadata | undefined;
  readonly fields: ReadonlyMap<string, string>;
  readonly issues: AdrIssue[];
}): void {
  for (const key of expectedFrontmatterKeys) {
    if (!input.fields.has(key)) {
      input.issues.push({
        path: input.file.path,
        message: `missing frontmatter field ${key}`,
      });
    }
  }

  const status = input.fields.get("status");

  if (status !== undefined && !allowedStatuses.has(status)) {
    input.issues.push({
      path: input.file.path,
      message: "frontmatter status must be active or deprecated",
    });
  }

  const category = input.fields.get("category");

  if (category !== undefined) {
    if (!allowedCategories.has(category)) {
      input.issues.push({
        path: input.file.path,
        message: `frontmatter category must be one of ${[...allowedCategories].join(", ")}`,
      });
    }

    if (input.metadata !== undefined && category !== input.metadata.category) {
      input.issues.push({
        path: input.file.path,
        message: `frontmatter category ${category} must match filename category ${input.metadata.category}`,
      });
    }
  }

  const created = input.fields.get("created");

  if (created !== undefined && !isValidCalendarDate(created)) {
    input.issues.push({
      path: input.file.path,
      message: "frontmatter created must be a real calendar date in YYYY-MM-DD format",
    });
  }
}

function validateFirstHeading(input: {
  readonly file: AdrFile;
  readonly metadata: FilenameMetadata | undefined;
  readonly body: string;
  readonly issues: AdrIssue[];
}): void {
  const heading = normalizeLineEndings(input.body)
    .split("\n")
    .find((line) => line.startsWith("#"));

  if (heading === undefined) {
    input.issues.push({
      path: input.file.path,
      message: "first Markdown heading must match # NNNN. <title>",
    });
    return;
  }

  const match = heading.match(/^# ([0-9]{4})\. (.*)$/);

  if (match === null) {
    input.issues.push({
      path: input.file.path,
      message: "first Markdown heading must match # NNNN. <title>",
    });
    return;
  }

  const headingNumber = match[1];
  const title = match[2].trim();

  if (input.metadata !== undefined && headingNumber !== input.metadata.numberText) {
    input.issues.push({
      path: input.file.path,
      message: `heading number ${headingNumber} must match filename number ${input.metadata.numberText}`,
    });
  }

  if (title.length === 0) {
    input.issues.push({
      path: input.file.path,
      message: "heading title must be non-empty",
    });
  }
}

function validateAdrReferences(input: {
  readonly file: AdrFile;
  readonly existingNumbers: ReadonlySet<string>;
  readonly issues: AdrIssue[];
}): void {
  const stripped = stripFencedCodeBlocks(normalizeLineEndings(input.file.content));
  const missingReferences = new Set<string>();

  for (const match of stripped.matchAll(/\bADRs?\s+([0-9]{4})\b/g)) {
    const referencedNumber = match[1];

    if (!input.existingNumbers.has(referencedNumber)) {
      missingReferences.add(referencedNumber);
    }
  }

  for (const referencedNumber of missingReferences) {
    input.issues.push({
      path: input.file.path,
      message: `references missing ADR ${referencedNumber}`,
    });
  }
}

function stripFencedCodeBlocks(content: string): string {
  const lines = content.split("\n");
  const keptLines: string[] = [];
  let fence: Fence | undefined;

  for (const line of lines) {
    const marker = parseFenceMarker(line);

    if (fence === undefined) {
      if (marker === undefined) {
        keptLines.push(line);
      } else {
        fence = marker;
        keptLines.push("");
      }

      continue;
    }

    keptLines.push("");

    if (
      marker !== undefined &&
      marker.character === fence.character &&
      marker.length >= fence.length
    ) {
      fence = undefined;
    }
  }

  return keptLines.join("\n");
}

type Fence = {
  readonly character: "`" | "~";
  readonly length: number;
};

function parseFenceMarker(line: string): Fence | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);

  if (match === null) {
    return undefined;
  }

  const marker = match[1];
  const character = marker.startsWith("`") ? "`" : "~";

  return {
    character,
    length: marker.length,
  };
}

function isValidCalendarDate(value: string): boolean {
  const match = value.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isQuoted(value: string): boolean {
  return (
    value.startsWith('"') || value.endsWith('"') || value.startsWith("'") || value.endsWith("'")
  );
}

function containsPhrase(value: string, phrase: string): boolean {
  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapedPhrase}($|[^A-Za-z0-9_])`, "i");

  return pattern.test(value);
}

function removeInlineCodeSpans(value: string): string {
  return value.replace(/`[^`]*`/g, "");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function formatAdrNumber(value: number): string {
  return value.toString().padStart(4, "0");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

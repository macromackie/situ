import { buildWorkspaceEvidenceMarkdown, runCodexJudge } from "../codex.js";
import type { WorkspaceAutoresearchCase, WorkspaceAutoresearchOutput } from "../harness/types.js";
import type { CodexJudgeStructuredResult } from "../harness/types.js";

/**
 * Scores a completed workspace run with a Codex-backed LLM judge.
 */
export async function scoreWithCodexJudge(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly output: WorkspaceAutoresearchOutput;
}): Promise<{
  readonly score: number;
  readonly metadata: unknown;
}> {
  const judge = await runCodexJudge(input);
  const parsed = parseCodexJudgeResult(judge.rawMessage);

  if (parsed === undefined) {
    return {
      score: 0,
      metadata: {
        judgeName: "codex-llm-judge",
        verdict: "fail",
        rationaleMarkdown: "The Codex judge did not return valid structured JSON.",
        rawMessage: judge.rawMessage,
        command: judge.command,
        evidenceMarkdown: buildWorkspaceEvidenceMarkdown(input),
      },
    };
  }

  return {
    score: parsed.score,
    metadata: {
      ...parsed,
      rawMessage: judge.rawMessage,
      command: judge.command,
    },
  };
}

function parseCodexJudgeResult(rawMessage: string): CodexJudgeStructuredResult | undefined {
  try {
    const parsed = JSON.parse(rawMessage) as Partial<Omit<CodexJudgeStructuredResult, "judgeName">>;

    if (!isValidJudgeResult(parsed)) {
      return undefined;
    }

    return {
      judgeName: "codex-llm-judge",
      ...parsed,
    };
  } catch {
    return undefined;
  }
}

function isValidJudgeResult(
  value: Partial<Omit<CodexJudgeStructuredResult, "judgeName">>,
): value is Omit<CodexJudgeStructuredResult, "judgeName"> {
  return (
    isValidScore(value.score) &&
    isValidVerdict(value.verdict) &&
    typeof value.rationaleMarkdown === "string" &&
    isStringArray(value.strengths) &&
    isStringArray(value.problems) &&
    isValidFacetArray(value.facets)
  );
}

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidVerdict(value: unknown): value is CodexJudgeStructuredResult["verdict"] {
  return value === "pass" || value === "fail" || value === "inconclusive";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidFacetArray(value: unknown): value is CodexJudgeStructuredResult["facets"] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        "score" in item &&
        "verdict" in item &&
        "rationaleMarkdown" in item &&
        typeof item.name === "string" &&
        isValidScore(item.score) &&
        isValidVerdict(item.verdict) &&
        typeof item.rationaleMarkdown === "string",
    )
  );
}

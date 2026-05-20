export const evalsProjectName = "evals" as const;

export type LlmJudgeVerdict = "pass" | "fail" | "inconclusive";

export type LlmJudgeResult = {
  readonly judgeName: string;
  readonly verdict: LlmJudgeVerdict;
  readonly rationaleMarkdown: string;
  readonly score?: number;
};

export type LlmEvalResult = {
  readonly evalName: string;
  readonly judgeResults: readonly [LlmJudgeResult, ...LlmJudgeResult[]];
};

export type {
  CodexJudgeFacetResult,
  CodexJudgeStructuredResult,
  WorkspaceAutoresearchCase,
  WorkspaceAutoresearchOutput,
} from "./harness/types.js";
export { listWorkspaceAutoresearchCases } from "./harness/workspace-cases.js";
export { runEvals } from "./run.js";

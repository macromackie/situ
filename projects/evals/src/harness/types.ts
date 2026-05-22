import type { CommandResult } from "../command.js";
import type { AgentTerminalDriverId, TerminalSessionResult } from "../terminal/index.js";

export type WorkspaceManagerRun = {
  readonly actorId: "manager";
  readonly driverId: AgentTerminalDriverId;
  readonly outputPath: string;
  readonly promptPath: string;
  readonly goalInputPath: string;
  readonly transcriptPath: string;
  readonly cleanTranscriptPath: string;
  readonly terminal: TerminalSessionResult;
  readonly prompt: string;
  readonly goalInput: string;
  readonly finalMessage: string;
  readonly startedAtUnixMs: number;
  readonly endedAtUnixMs: number;
};

export type WorkspaceRunArtifact = {
  readonly relativePath: string;
  readonly text: string;
};

export type WorkspaceWorktreeSummary = {
  readonly path: string;
  readonly branch: CommandResult;
  readonly head: CommandResult;
  readonly status: CommandResult;
  readonly diff: CommandResult;
  readonly protectedDiff: CommandResult;
  readonly log: CommandResult;
  readonly logFull: CommandResult;
  readonly commits: CommandResult;
};

export type WorkspaceAutoresearchCase = {
  readonly id: string;
  readonly title: string;
  readonly workspacePath: string;
  readonly projectId: string;
  readonly targetCandidateCount: number;
  readonly managerTimeoutMs?: number;
  readonly requiresSynthesis: boolean;
  readonly protectedPaths: readonly string[];
  readonly editablePaths: readonly string[];
  readonly harnessCommand: string;
  readonly researchInstructionsMarkdown: string;
  readonly synthesisInstructionsMarkdown?: string;
  readonly suggestedResearchDirectionMarkdowns?: readonly string[];
  readonly goalMarkdown: string;
  readonly expectedOutcomeMarkdown: string;
};

export type WorkspaceAutoresearchOutput = {
  readonly caseId: string;
  readonly title: string;
  readonly sourceWorkspacePath: string;
  readonly repositoryPath: string;
  readonly initialCommitSha: string;
  readonly situHomePath: string;
  readonly runOutputPath: string;
  readonly agentOutputPath: string;
  readonly worktreesPath: string;
  readonly protectedPaths: readonly string[];
  readonly manager: WorkspaceManagerRun;
  readonly situStatus: CommandResult;
  readonly situVerify: CommandResult;
  readonly baselinesList: CommandResult;
  readonly baselineMeasurementsList: CommandResult;
  readonly experimentsList: CommandResult;
  readonly liveRecords: CommandResult;
  readonly eventsRecent: CommandResult;
  readonly measurementsRecent: CommandResult;
  readonly reportsRecent: CommandResult;
  readonly visualReport: CommandResult;
  readonly visualReportPath: string;
  readonly visualReportHtml?: string;
  readonly projectsCurrent: CommandResult;
  readonly tasksCurrent: CommandResult;
  readonly worktreeList: CommandResult;
  readonly worktreeSummaries: readonly WorkspaceWorktreeSummary[];
  readonly runArtifacts: readonly WorkspaceRunArtifact[];
  readonly agentArtifacts: readonly WorkspaceRunArtifact[];
  readonly gitStatus: CommandResult;
  readonly gitDiff: CommandResult;
  readonly protectedGitDiff: CommandResult;
  readonly resultsTsv?: string;
  readonly runLog?: string;
  readonly finalReportMarkdown?: string;
};

export type CodexJudgeStructuredResult = {
  readonly judgeName: string;
  readonly verdict: "pass" | "fail" | "inconclusive";
  readonly rationaleMarkdown: string;
  readonly score: number;
  readonly strengths: readonly string[];
  readonly problems: readonly string[];
  readonly facets: readonly CodexJudgeFacetResult[];
};

export type CodexJudgeFacetResult = {
  readonly name: string;
  readonly verdict: "pass" | "fail" | "inconclusive";
  readonly rationaleMarkdown: string;
  readonly score: number;
};

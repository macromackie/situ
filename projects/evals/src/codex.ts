import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reportTrace } from "evalite/traces";

import { runCommand, truncateText, type CommandResult } from "./command.js";
import type {
  WorkspaceAutoresearchCase,
  WorkspaceAutoresearchOutput,
  WorkspaceManagerRun,
  WorkspaceRunArtifact,
} from "./harness/types.js";
import {
  baselineIdForWorkspaceCase,
  type MaterializedWorkspaceEnvironment,
} from "./harness/workspace-environment.js";
import {
  buildNativeGoalInput,
  getAgentTerminalDriver,
  resolveAgentTerminalDriverId,
  runTerminalSession,
  type AgentTerminalDriverId,
} from "./terminal/index.js";

const defaultManagerTimeoutMs = 10 * 60 * 1000;
const defaultJudgeTimeoutMs = 5 * 60 * 1000;
const promptEvidenceMaxCharacters = 40_000;

export type WorkspaceManagerTerminalCommand = {
  readonly driverId: AgentTerminalDriverId;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly outputPath: string;
  readonly promptPath: string;
  readonly goalInputPath: string;
  readonly transcriptPath: string;
  readonly cleanTranscriptPath: string;
  readonly prompt: string;
  readonly goalInput: string;
};

/**
 * Runs one root local-agent manager against the prepared workspace.
 */
export async function runWorkspaceTerminalManager(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly environment: MaterializedWorkspaceEnvironment;
}): Promise<WorkspaceManagerRun> {
  const command = buildWorkspaceManagerTerminalCommand(input);
  const terminalDriver = getAgentTerminalDriver({ id: command.driverId });

  mkdirSync(command.outputPath, { recursive: true });
  writeFileSync(command.promptPath, command.prompt, "utf8");
  writeFileSync(command.goalInputPath, command.goalInput, "utf8");

  const startedAtUnixMs = Date.now();
  const terminal = await runTerminalSession({
    command: command.command,
    args: command.args,
    cwd: command.cwd,
    environment: command.environment,
    initialInput: command.goalInput,
    readyPatterns: terminalDriver.readyPatterns,
    readyTimeoutMs: terminalDriver.readyTimeoutMs,
    followUpInput: terminalDriver.followUpInput,
    followUpDelayMs: terminalDriver.followUpDelayMs,
    timeoutMs: managerTimeoutMs({ workspaceCase: input.workspaceCase }),
    transcriptPath: command.transcriptPath,
    cleanTranscriptPath: command.cleanTranscriptPath,
  });
  const endedAtUnixMs = Date.now();
  const finalMessage = readOptionalText(command.cleanTranscriptPath) ?? "";

  reportTrace({
    input: {
      step: "agent-terminal-root-manager",
      caseId: input.workspaceCase.id,
      repositoryPath: input.environment.repositoryPath,
      driverId: command.driverId,
      prompt: command.prompt,
    },
    output: {
      exitCode: terminal.exitCode,
      signal: terminal.signal,
      timedOut: terminal.timedOut,
      transcript: truncateText({ text: terminal.stdout, maxCharacters: 8_000 }),
      finalMessage: truncateText({ text: finalMessage, maxCharacters: 8_000 }),
    },
    start: startedAtUnixMs,
    end: endedAtUnixMs,
  });

  return {
    actorId: "manager",
    driverId: command.driverId,
    outputPath: command.outputPath,
    promptPath: command.promptPath,
    goalInputPath: command.goalInputPath,
    transcriptPath: command.transcriptPath,
    cleanTranscriptPath: command.cleanTranscriptPath,
    terminal,
    prompt: command.prompt,
    goalInput: command.goalInput,
    finalMessage,
    startedAtUnixMs,
    endedAtUnixMs,
  };
}

/**
 * Builds the single terminal command used by the workspace autoresearch eval.
 */
export function buildWorkspaceManagerTerminalCommand(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly environment: MaterializedWorkspaceEnvironment;
}): WorkspaceManagerTerminalCommand {
  const driverId = resolveAgentTerminalDriverId({
    value: process.env.SITU_AGENT_EVAL_DRIVER,
  });
  const driver = getAgentTerminalDriver({ id: driverId });
  const terminalCommand = driver.buildCommand(input);
  const outputPath = join(input.environment.agentOutputPath, "manager");
  const promptPath = join(outputPath, "prompt.md");
  const goalInputPath = join(outputPath, "goal-input.txt");
  const transcriptPath = join(outputPath, "terminal-transcript.ansi");
  const cleanTranscriptPath = join(outputPath, "terminal-transcript.txt");
  const prompt = buildCodexWorkspaceManagerPrompt(input);
  const goalInput = buildNativeGoalInput({
    prompt: buildWorkspaceManagerGoalText({ promptPath }),
  });

  return {
    driverId,
    command: terminalCommand.command,
    args: terminalCommand.args,
    cwd: terminalCommand.cwd,
    environment: terminalCommand.environment,
    outputPath,
    promptPath,
    goalInputPath,
    transcriptPath,
    cleanTranscriptPath,
    prompt,
    goalInput,
  };
}

/**
 * Runs Codex as the LLM judge for a completed workspace eval.
 */
export async function runCodexJudge(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly output: WorkspaceAutoresearchOutput;
}): Promise<{
  readonly rawMessage: string;
  readonly command: CommandResult;
}> {
  const judgeRootPath = await mkdtemp(
    join(tmpdir(), `situ-eval-codex-judge-${input.workspaceCase.id}-`),
  );
  const outputPath = join(judgeRootPath, "judge-result.json");
  const schemaPath = join(judgeRootPath, "judge-schema.json");
  const prompt = buildCodexJudgePrompt({
    workspaceCase: input.workspaceCase,
    output: input.output,
  });

  writeFileSync(schemaPath, JSON.stringify(codexJudgeOutputSchema, undefined, 2), "utf8");

  const start = Date.now();
  const command = runCommand({
    command: "codex",
    args: [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      ...optionalModelArgs(process.env.SITU_CODEX_JUDGE_MODEL),
      prompt,
    ],
    cwd: judgeRootPath,
    timeoutMs: judgeTimeoutMs(),
  });
  const end = Date.now();
  const rawMessage = readOptionalText(outputPath) ?? command.stdout;

  reportTrace({
    input: {
      step: "codex-judge",
      caseId: input.workspaceCase.id,
      prompt: truncateText({ text: prompt, maxCharacters: 8_000 }),
    },
    output: {
      exitCode: command.exitCode,
      signal: command.signal,
      timedOut: command.timedOut,
      rawMessage: truncateText({ text: rawMessage, maxCharacters: 8_000 }),
      stderr: truncateText({ text: command.stderr, maxCharacters: 8_000 }),
    },
    start,
    end,
  });

  return {
    rawMessage,
    command,
  };
}

/**
 * Builds compact evidence for a judge prompt or metadata.
 */
export function buildWorkspaceEvidenceMarkdown(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly output: WorkspaceAutoresearchOutput;
}): string {
  const sections = [
    ["Case", `${input.workspaceCase.title}\n\n${input.workspaceCase.goalMarkdown}`],
    ["Expected Outcome", input.workspaceCase.expectedOutcomeMarkdown],
    ["Source Workspace", input.output.sourceWorkspacePath],
    ["Initial Commit", input.output.initialCommitSha],
    ["Run Output Directory", input.output.runOutputPath],
    ["Agent Output Directory", input.output.agentOutputPath],
    ["Worktrees Directory", input.output.worktreesPath],
    ["Protected Paths", input.output.protectedPaths.join("\n")],
    ["Protected File Evidence", formatProtectedFileEvidence(input.output)],
    ["Native Goal Terminal Evidence", formatGoalStyleRunEvidence(input.output)],
    ["Synthesis Lineage Evidence", formatSynthesisLineageEvidence(input.output)],
    ["Root Manager Run", JSON.stringify(managerSummary(input.output.manager), undefined, 2)],
    ["Situ Status JSON", input.output.situStatus.stdout],
    ["Situ Verify JSON", input.output.situVerify.stdout],
    ["Baselines JSON", input.output.baselinesList.stdout],
    ["Baseline Measurements JSON", input.output.baselineMeasurementsList.stdout],
    ["Experiments JSON", input.output.experimentsList.stdout],
    ["Measurements Recent JSON", input.output.measurementsRecent.stdout],
    ["Events Recent JSON", input.output.eventsRecent.stdout],
    ["Recent Reports JSON", input.output.reportsRecent.stdout],
    [
      "Visual Report Command",
      JSON.stringify(commandSummary(input.output.visualReport), undefined, 2),
    ],
    ["SITU_REPORT.html", input.output.visualReportHtml ?? "(missing)"],
    ["Current Projects JSON", input.output.projectsCurrent.stdout],
    ["Current Tasks JSON", input.output.tasksCurrent.stdout],
    ["Git Worktree List", input.output.worktreeList.stdout],
    ["Worktree Summaries", JSON.stringify(worktreeSummaries(input.output), undefined, 2)],
    ["Run Artifacts", formatArtifacts(input.output.runArtifacts)],
    ["Agent Artifacts", formatArtifacts(input.output.agentArtifacts)],
    ["Results TSV", input.output.resultsTsv ?? "(missing)"],
    ["Run Log", input.output.runLog ?? "(missing)"],
    ["Git Status", input.output.gitStatus.stdout],
    ["Git Diff", input.output.gitDiff.stdout],
    ["Protected File Diff", input.output.protectedGitDiff.stdout],
    ["FINAL_REPORT.md", input.output.finalReportMarkdown ?? "(missing)"],
  ];

  return truncateText({
    text: sections.map(([heading, body]) => `## ${heading}\n\n${body.trim()}`).join("\n\n"),
    maxCharacters: promptEvidenceMaxCharacters,
  });
}

/**
 * Builds the compact native goal submitted to the terminal CLI.
 */
function buildWorkspaceManagerGoalText(input: { readonly promptPath: string }): string {
  return [
    "Run `situ runbook` and follow it as the operating guide.",
    `Then read ${input.promptPath} and execute it as the full Situ autoresearch eval goal.`,
    "Use Situ records as the durable source of truth.",
    "Keep working until the instructions are complete or the external timeout stops you.",
  ].join(" ");
}

function buildCodexWorkspaceManagerPrompt(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly environment: MaterializedWorkspaceEnvironment;
}): string {
  const baselineId = baselineIdForWorkspaceCase({ workspaceCase: input.workspaceCase });
  const suggestedDirections = input.workspaceCase.suggestedResearchDirectionMarkdowns
    ?.map((focus, index) => `${index + 1}. ${focus}`)
    .join("\n");

  return [
    "You are the root local-agent manager for a realistic Situ autoresearch eval.",
    "",
    "The eval harness has only prepared this folder, initialized git, and put `situ` on PATH.",
    "It has not created a Situ project, baseline, tasks, experiments, worktrees, subagents, or reports.",
    "Do the work as if the user opened a local coding agent in this folder and started this `/goal`:",
    nativeGoalObjective({ workspaceCase: input.workspaceCase }),
    "",
    "Keep working in this same root manager turn until the goal is complete or the external eval timeout stops you.",
    "Use Situ as the durable state of record. Do not create a private workflow file as the source of truth.",
    "Run `situ runbook` first and follow it; it is situ's operating guide for this kind of run, and the loop below is this eval's specifics layered on top of it.",
    "",
    "Stable environment:",
    `- Repository: ${input.environment.repositoryPath}`,
    `- Project id: ${input.workspaceCase.projectId}`,
    `- Suggested baseline id: ${baselineId}`,
    `- Worktrees directory: ${input.environment.worktreesPath}`,
    `- Run output directory: ${input.environment.runOutputPath}`,
    `- Target candidate count: ${input.workspaceCase.targetCandidateCount}`,
    `- Synthesis required: ${input.workspaceCase.requiresSynthesis ? "yes" : "no"}`,
    "",
    "Autoresearch loop:",
    "1. Read `OBJECTIVE.md`, `program.md`, and `MANIFEST.md`.",
    "2. Initialize the Situ project for this repository with `situ projects init`.",
    "3. Run the unmodified harness once and record a dynamic baseline before creating candidate tasks or experiments.",
    "4. Create task and experiment records for useful candidate research directions.",
    "5. Create git worktree branches under `$SITU_EVAL_WORKTREES_DIR` and store `baseRef`, `branchName`, and `worktreePath` on experiments.",
    "6. After the baseline and candidate records exist, strongly prefer parallel native subagents for independent candidate work.",
    "7. Record measurements, status, reviews/comments/reports, and artifacts through `situ`.",
    "8. Surface progress with `situ status --json` and `situ verify --json`.",
    "",
    "Baseline requirements:",
    `- Run \`${input.workspaceCase.harnessCommand}\` before edits.`,
    "- Create one baseline with `situ baselines create`.",
    "- Record comparable baseline metrics with `situ measurements create --baseline-id`.",
    "- Prefer metric names `dev_accuracy`, `dev_wps`, and `final_accuracy` when the harness exposes them.",
    "- Candidate measurements should use the same metric names where possible.",
    "",
    "Candidate coverage:",
    `- Treat the target candidate count (${input.workspaceCase.targetCandidateCount}) as distinct measured experiment coverage, not raw metric rows.`,
    "- Before deeply refining one direction, get one minimal measured result for each requested independent candidate direction.",
    "- For synthesis-required cases, do not let candidate coverage become a late-phase blocker for synthesis records; create synthesis records once enough measured evidence exists to choose a current best base.",
    "- If a worker stalls or cannot start, fall back quickly enough to complete that candidate directly and record the fallback visibly.",
    "- A bounded run with one polished measured candidate and multiple assigned-but-unmeasured packets is weaker than a run with measured evidence across the target candidate count.",
    "",
    "Delegation guidance:",
    "- The root manager should keep ownership of shared setup, candidate selection, final synthesis, and status/verification evidence.",
    "- For independent candidate work after baseline setup, use native subagents in parallel only when the selected local agent tool can start them and surface visible evidence quickly.",
    "- Completed candidate measurements and synthesis evidence are more important than proving delegation purity.",
    "- Do not wait on assigned-but-idle workers during the fixed eval budget.",
    "- If a practical native subagent path is unavailable, invisible, slow, or too costly, record the fallback and execute the candidate directly.",
    "- Before implementation starts, create and assign durable task/experiment packets with distinct actor ids such as `scientist-1`, `scientist-2`, `verifier-1`, or `synthesizer`.",
    "- Assignment alone is not delegation. After assigning a packet, immediately start a real native worker for it or record a fallback reason and execute the packet yourself.",
    "- Do not wait for background workers to poll Situ. There are no background workers unless you actually start them through the local agent tool.",
    "- Prefer one measured, checkpointed candidate over multiple assigned-but-idle candidates.",
    "- The eval harness must not hard-code or spawn baseline, worker, or synthesis phases; any worker use is a root-manager runtime decision.",
    "- Direct root-manager work is a visible fallback when native subagents are unavailable, invisible, slow, the work is genuinely sequential, or delegation would cost too much of the remaining budget.",
    "- If you fall back to direct manager work, record which worker mechanism you considered, why it was unavailable or skipped, and why direct work remains faithful to the goal.",
    "- Useful worker evidence includes a distinct non-manager actor id, bounded prompt/packet, separate worktree or working directory when applicable, visible worker output or transcript, and Situ records updated by or for that actor.",
    "- If you delegate, each subagent should receive a bounded packet with project id, task id, experiment id, worktree path, objective, done condition, checks, and records to update.",
    "- Subagents do not need native goals of their own.",
    "- The durable handoff must be recoverable from Situ task Markdown and experiment summary Markdown.",
    "- Use actor ids such as `manager`, `scientist-1`, `scientist-2`, or `synthesizer` for attribution.",
    "",
    "Checkpoint reporting:",
    "- After the first candidate has comparable measurements and is moved to a review-ready checkpoint, write a short project checkpoint report before continuing deeper search.",
    "- Put the report Markdown under `$SITU_RUN_OUTPUT_DIR`, then create a durable project-targeted report with `situ reports create`.",
    "- The checkpoint report should summarize the baseline, measured candidate, current best branch/worktree, open work, and next intended step.",
    "- Be honest about state: call it a checkpoint or partial report unless the run is genuinely complete.",
    "",
    "Final authored research report (REQUIRED before completion):",
    "- The visual HTML research report is the durable artifact of this run. You author it as MDX using a typed component library; the system compiles, validates, and submits it.",
    "- Step 1: `situ reports instructions --project-id <project-id>` writes an `instructions.md` brief and a starter `draft.mdx` under `$SITU_REPORT_DRAFT_DIR/<project-id>/` (default `$SITU_HOME/drafts/<project-id>/`).",
    "- Step 2: read `instructions.md` for the available components, the snapshot summary, and the validator's required pieces (`<BaselineCard>` when baselines exist, an `<EvidenceBlock>` per accepted/rejected/abandoned experiment, `<MetricCard>` values that match real measurements within 3 decimal places, no remote URLs, no raw `<script>`/`<iframe>`/`<style>`).",
    "- Step 3: edit `draft.mdx` to write the actual research write-up. Use the components: `<ResearchReport>`, `<Hero>`, `<MetricCard>`, `<BaselineCard>`, `<EvidenceBlock>`, `<Callout>`, `<Section>`, etc. Numbers in component props must trace to recorded measurements; prose can summarize freely.",
    "- Step 4: `situ reports preview --project-id <project-id> --draft <draft.mdx>` compiles and validates. Iterate on the draft until validation is clean.",
    '- Step 5: `situ reports submit --project-id <project-id> --draft <draft.mdx> --title "<title>" --generated-by-kind local_agent --generated-by-id manager --generated-by-display-name "Root manager"` publishes the final report. This creates one `ReportRecord` with the MDX source and one `ArtifactRecord` with the compiled HTML.',
    "- After a successful submit, `situ reports generate --project-id <project-id> --format html` recompiles your authored MDX rather than the standard tree. Verify by running it once.",
    "- If you skip the authored report, the system still produces an HTML report from visible records — but the authored path is the deliberate work product. Treat it as a required final step.",
    "",
    "Workspace constraints:",
    `- Editable paths: ${input.workspaceCase.editablePaths.join(", ")}.`,
    `- Protected paths: ${input.workspaceCase.protectedPaths.join(", ")}.`,
    "- Do not modify protected paths.",
    "- Do not read held-out protected data directly; use the harness.",
    "- Write run logs and result files under `$SITU_RUN_OUTPUT_DIR`, not in the checkout.",
    "",
    "Case-specific research guidance:",
    input.workspaceCase.researchInstructionsMarkdown,
    "",
    suggestedDirections === undefined
      ? "Suggested research directions: choose useful independent directions from the objective."
      : `Suggested research directions:\n${suggestedDirections}`,
    "",
    input.workspaceCase.requiresSynthesis
      ? [
          "Synthesis requirements:",
          input.workspaceCase.synthesisInstructionsMarkdown ?? "(none)",
          "- After enough candidate measurements exist to choose a current best branch, create the synthesis records and choose that branch as the synthesis base.",
          "- Candidate coverage and synthesis may overlap; do not wait for every candidate to be perfect before creating the synthesis task and experiment.",
          "- Once at least three candidate branches have measured useful commits, a minimal synthesis can represent one base branch plus two cherry-picked sibling branches.",
          "- Create the follow-up synthesis task and experiment before creating the synthesis worktree or cherry-picking.",
          "- Do not leave synthesis work only as a worktree, branch, report, or task; the Situ synthesis experiment record is required lineage evidence.",
          "- Create the synthesis branch and worktree from the selected base commit recorded on the synthesis experiment.",
          "- Use `git cherry-pick -x` for useful commits from at least two sibling branches when possible.",
          "- If time is tight, prefer a minimal recorded synthesis with measurements over extra candidate refinement.",
          "- Write `$SITU_RUN_OUTPUT_DIR/cherry-picks.tsv` and `$SITU_RUN_OUTPUT_DIR/SYNTHESIS_REPORT.md`.",
          "- Record synthesis measurements and move the synthesis task/experiment to review-ready states.",
        ].join("\n")
      : "Synthesis is not required for this case.",
    "",
    "Useful Situ commands:",
    `- situ projects init --id ${input.workspaceCase.projectId} --name ${JSON.stringify(input.workspaceCase.title)} --goal <markdown> --actor-kind local_agent --actor-id manager`,
    `- situ baselines create --id ${baselineId} --project-id ${input.workspaceCase.projectId} --title "Native baseline" --summary <markdown> --actor-kind local_agent --actor-id manager`,
    `- situ measurements create --baseline-id ${baselineId} --metric-name dev_accuracy --value <value> --summary <markdown> --actor-kind local_agent --actor-id manager`,
    "- situ tasks create ...",
    "- situ experiments create ... --base-ref <git-ref> --branch-name <branch> --worktree-path <path> ...",
    "- situ measurements create --experiment-id <experiment-id> --revision-number <n> --metric-name <name> --value <value> --summary <markdown> --actor-kind local_agent --actor-id <actor-id>",
    `- situ reports create --project-id ${input.workspaceCase.projectId} --target-kind project --target-id ${input.workspaceCase.projectId} --title "Checkpoint report" --body <markdown> --generated-by-kind local_agent --generated-by-id manager`,
    `- situ reports instructions --project-id ${input.workspaceCase.projectId}`,
    `- situ reports preview --project-id ${input.workspaceCase.projectId} --draft <draft.mdx>`,
    `- situ reports submit --project-id ${input.workspaceCase.projectId} --draft <draft.mdx> --title "<title>" --generated-by-kind local_agent --generated-by-id manager --generated-by-display-name "Root manager"`,
    `- situ reports generate --project-id ${input.workspaceCase.projectId} --format html`,
    "- situ status --json",
    "- situ verify --json",
    "",
    "Completion:",
    "- Keep going with real autoresearch until the external timeout stops you or the run is genuinely complete.",
    "- Before declaring complete, run the final authored research report flow (instructions → edit draft.mdx → preview until clean → submit). The authored MDX is the run's durable artifact; an unauthored run is incomplete unless time literally ran out.",
    "- Optionally write `FINAL_REPORT.md` alongside for a free-form Markdown summary, but the authored MDX is the primary deliverable.",
    "- Only treat the goal as complete after checking Situ status, Situ verify, protected diffs, measurements, the authored report submission, and that `situ reports generate --format html` returns the compiled authored HTML.",
  ].join("\n");
}

function nativeGoalObjective(input: { readonly workspaceCase: WorkspaceAutoresearchCase }): string {
  return [
    `Use Situ to run autoresearch for the ${input.workspaceCase.title} workspace.`,
    "Create a dynamic baseline before candidate tasks, run candidate experiments in git worktrees, record measurements and evidence through Situ, keep protected files clean, and write a final report if the run completes.",
    "After baseline setup, strongly prefer parallel native subagents for independent candidate work, with direct root-manager work as a visible fallback when subagents are unavailable, sequentially inappropriate, or too costly for the remaining budget.",
    input.workspaceCase.requiresSynthesis
      ? "For this case, also create a follow-up synthesis experiment from the best candidate branch and use cherry-picks from useful sibling branches."
      : "For this case, focus on useful candidate exploration through native parallel workers when available or clearly explained manager-led fallback work.",
  ].join(" ");
}

function buildCodexJudgePrompt(input: {
  readonly workspaceCase: WorkspaceAutoresearchCase;
  readonly output: WorkspaceAutoresearchOutput;
}): string {
  return [
    "You are judging a Situ autoresearch eval run.",
    "",
    "Return JSON only. Score from 0 to 1.",
    "",
    "Overall rubric:",
    ...judgeRubricLines(input.workspaceCase),
    "",
    "Required judge facets:",
    ...judgeFacetLines(input.workspaceCase),
    "",
    "Return one facet result for each required facet. The overall score should reflect the full product experience, not a mechanical average.",
    "",
    "The root manager may be externally cut off after a fixed wall-clock budget.",
    "The eval launches the agent in a pseudo-terminal and submits a real `/goal` slash command.",
    "Do not require a separate app-server, SDK, or `create_goal` call.",
    "Do not penalize timeout by itself. Penalize lack of useful progress, missing Situ records,",
    "missing dynamic baseline evidence, missing worktree isolation, protected-file changes,",
    "direct held-out data inspection, hidden harness orchestration, or unclear evidence.",
    "The post-run Situ visual report is supporting evidence for report quality, lineage clarity, and parallelism clarity.",
    "",
    "Evidence:",
    buildWorkspaceEvidenceMarkdown(input),
  ].join("\n");
}

function optionalModelArgs(model: string | undefined): readonly string[] {
  if (model === undefined || model.trim().length === 0) {
    return [];
  }

  return ["--model", model.trim()];
}

function managerTimeoutMs(input: { readonly workspaceCase: WorkspaceAutoresearchCase }): number {
  const rawValue = process.env.SITU_AGENT_EVAL_TIMEOUT_MS ?? process.env.SITU_CODEX_EVAL_TIMEOUT_MS;

  if (rawValue === undefined) {
    return input.workspaceCase.managerTimeoutMs ?? defaultManagerTimeoutMs;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return input.workspaceCase.managerTimeoutMs ?? defaultManagerTimeoutMs;
  }

  return parsed;
}

function judgeTimeoutMs(): number {
  const rawValue = process.env.SITU_CODEX_JUDGE_TIMEOUT_MS;

  if (rawValue === undefined) {
    return defaultJudgeTimeoutMs;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultJudgeTimeoutMs;
  }

  return parsed;
}

function managerSummary(manager: WorkspaceManagerRun): unknown {
  return {
    actorId: manager.actorId,
    driverId: manager.driverId,
    outputPath: manager.outputPath,
    promptPath: manager.promptPath,
    goalInputPath: manager.goalInputPath,
    transcriptPath: manager.transcriptPath,
    cleanTranscriptPath: manager.cleanTranscriptPath,
    startedAtUnixMs: manager.startedAtUnixMs,
    endedAtUnixMs: manager.endedAtUnixMs,
    terminal: commandSummary(manager.terminal),
    goalInput: truncateText({ text: manager.goalInput, maxCharacters: 2_000 }),
    finalMessage: truncateText({ text: manager.finalMessage, maxCharacters: 2_000 }),
  };
}

function worktreeSummaries(output: WorkspaceAutoresearchOutput): unknown {
  return output.worktreeSummaries.map((summary) => ({
    path: summary.path,
    branch: commandSummary(summary.branch, {
      maxStdoutCharacters: 500,
      maxStderrCharacters: 500,
    }),
    head: commandSummary(summary.head, {
      maxStdoutCharacters: 500,
      maxStderrCharacters: 500,
    }),
    status: commandSummary(summary.status),
    protectedDiffClean: summary.protectedDiff.stdout.trim().length === 0,
    protectedDiff: commandSummary(summary.protectedDiff, {
      maxStdoutCharacters: 1_000,
      maxStderrCharacters: 1_000,
    }),
    log: commandSummary(summary.log, {
      maxStdoutCharacters: 1_000,
      maxStderrCharacters: 1_000,
    }),
    commits: commandSummary(summary.commits, {
      maxStdoutCharacters: 2_000,
      maxStderrCharacters: 1_000,
    }),
    logFull: commandSummary(summary.logFull, {
      maxStdoutCharacters: 3_000,
      maxStderrCharacters: 1_000,
    }),
    diffPreview: commandSummary(summary.diff, {
      maxStdoutCharacters: 1_500,
      maxStderrCharacters: 1_000,
    }),
  }));
}

function formatProtectedFileEvidence(output: WorkspaceAutoresearchOutput): string {
  const rootProtectedDiffClean = output.protectedGitDiff.stdout.trim().length === 0;
  const worktreeRows = output.worktreeSummaries.map((summary, index) => {
    const protectedDiff = summary.protectedDiff.stdout.trim();

    return [
      `### Worktree ${index + 1}`,
      "",
      `Path: ${summary.path}`,
      `Protected diff clean: ${protectedDiff.length === 0 ? "yes" : "no"}`,
      "",
      protectedDiff.length === 0
        ? "Protected diff: (empty)"
        : `Protected diff:\n\n${truncateText({ text: protectedDiff, maxCharacters: 1_500 })}`,
    ].join("\n");
  });

  return [
    `Root protected diff clean: ${rootProtectedDiffClean ? "yes" : "no"}`,
    "",
    `Protected paths: ${output.protectedPaths.join(", ")}`,
    "",
    ...worktreeRows,
  ].join("\n");
}

function formatGoalStyleRunEvidence(output: WorkspaceAutoresearchOutput): string {
  const command = output.manager.terminal.command;
  const submittedGoal = output.manager.goalInput.trimStart().startsWith("/goal ");
  const codexGoalsEnabled =
    output.manager.driverId !== "codex" ||
    command.some((arg, index) => arg === "--enable" && command[index + 1] === "goals");
  const commandText = formatCommandPreview(command);

  return [
    `Driver: ${output.manager.driverId}`,
    `Submitted native /goal: ${submittedGoal ? "yes" : "no"}`,
    `Codex goals feature enabled when needed: ${codexGoalsEnabled ? "yes" : "no"}`,
    `Root command cwd: ${output.manager.terminal.cwd}`,
    "",
    "Command:",
    "",
    commandText,
    "",
    "Submitted input:",
    "",
    truncateText({ text: output.manager.goalInput, maxCharacters: 4_000 }),
    "",
    "Interpretation:",
    "Evalite prepared the folder, launched one real local-agent CLI in a pseudo-terminal, and submitted a native `/goal`. Situ records and git evidence should show whether that manager ran the autoresearch loop. The eval harness does not hard-code or spawn baseline, worker, or synthesis phases, and it does not require a separate baseline-manager process, worker-manager process, app-server call, SDK call, or `create_goal` tool call. Native subagents are a root-manager runtime choice, with direct manager work remaining a visible fallback when appropriate.",
  ].join("\n");
}

function formatSynthesisLineageEvidence(output: WorkspaceAutoresearchOutput): string {
  const synthesis = output.worktreeSummaries.find((summary) => {
    const text = [summary.path, summary.branch.stdout].join(" ").toLowerCase();

    return text.includes("synthesis");
  });

  if (synthesis === undefined) {
    return "(no synthesis worktree detected)";
  }

  return [
    `Path: ${synthesis.path}`,
    `Branch: ${synthesis.branch.stdout.trim()}`,
    `Head: ${synthesis.head.stdout.trim()}`,
    "",
    "Commits:",
    synthesis.commits.stdout.trim(),
    "",
    "Full git log excerpt:",
    truncateText({
      text: synthesis.logFull.stdout.trim(),
      maxCharacters: 6_000,
    }),
  ].join("\n");
}

function judgeRubricLines(workspaceCase: WorkspaceAutoresearchCase): readonly string[] {
  if (workspaceCase.requiresSynthesis) {
    return [
      "- 0.07: The root local-agent manager was launched through a native `/goal` terminal run and used Situ as the durable system of record.",
      "- 0.05: The manager ran `situ runbook` near the start of the run (visible in the transcript) and operated consistently with its guidance rather than ignoring it.",
      "- 0.12: A dynamic baseline was measured and recorded before candidate experiment work.",
      "- 0.12: Candidate experiments used separate git worktree branches with clear Situ task/experiment handoffs.",
      "- 0.12: Independent candidate work shows native subagent/worker evidence, or a concrete direct-work fallback explanation.",
      "- 0.12: The manager chose a candidate branch as base and created a follow-up synthesis experiment from that base.",
      "- 0.10: The synthesis branch used `git cherry-pick -x` to bring useful commits from other candidate branches.",
      "- 0.10: Protected files stayed unchanged and measurements make the combined result understandable.",
      "- 0.20: The manager authored a final research report via `situ reports submit` (MDX through `@situ/reports-ui` components) AND the rendered HTML reads as a research artifact: editorial layout, captioned figures, baseline + experiments + lineage all surfaced, prose that summarizes what was learned. Skip this credit if no authored report was submitted or the rendered output is a generic dump.",
    ];
  }

  return [
    "- 0.10: The root local-agent manager was launched through a native `/goal` terminal run and used Situ as the durable system of record.",
    "- 0.05: The manager ran `situ runbook` near the start of the run (visible in the transcript) and operated consistently with its guidance rather than ignoring it.",
    "- 0.15: A dynamic baseline was measured and recorded before candidate experiment work.",
    "- 0.15: Candidate experiments used ordinary tasks, experiment records, measurements, and git worktrees.",
    "- 0.10: Independent candidate work shows native subagent/worker evidence, or a concrete direct-work fallback explanation.",
    "- 0.10: Protected files stayed unchanged and held-out data was respected.",
    "- 0.10: The evidence makes partial progress understandable, even if the external timeout cut off the run.",
    "- 0.25: The manager authored a final research report via `situ reports submit` (MDX through `@situ/reports-ui` components) AND the rendered HTML reads as a research artifact: editorial layout, captioned figures, baseline + experiments + outcomes all surfaced, prose that summarizes what was learned. Skip this credit if no authored report was submitted or the rendered output is a generic dump.",
  ];
}

function judgeFacetLines(workspaceCase: WorkspaceAutoresearchCase): readonly string[] {
  const commonFacets = [
    "- `baseline-discipline`: Did the manager establish and use dynamic baseline evidence before candidate work?",
    "- `delegation-and-parallelism`: Did the manager use native workers for independent candidate work, or give a credible visible fallback?",
    "- `research-quality`: Did the experiments make useful, measurement-backed progress toward the objective?",
    "- `evidence-clarity`: Are Situ records, worktrees, outputs, and reports sufficient to understand the run?",
    "- `authored-report-presence`: Did the manager submit a final MDX research report via `situ reports submit` (look for a project-targeted `ReportRecord` whose `bodyMarkdown` starts with `<ResearchReport`, and an attached `text/html` artifact)? A non-authored run earns 0 here.",
    "- `authored-report-quality`: Read the captured `SITU_REPORT.html` and judge it as a research artifact: editorial layout, large display title and italic lede, captioned figures (progress chart, lineage, swimlanes, outcomes), `<BaselineCard>` and per-experiment `<EvidenceBlock>` content matching the snapshot, `<MetricCard>` values traceable to real measurements, and prose that explains what was tried and what was learned. Score how closely it reads like a polished short research write-up versus a generic data dump.",
    "- `protected-data-safety`: Were protected files and held-out data respected?",
    "- `situ-advantage`: Did Situ records, worktrees, measurements, worker handoffs, and the authored report make the run meaningfully better than a plain `/goal` prompt?",
  ];

  if (!workspaceCase.requiresSynthesis) {
    return commonFacets;
  }

  return [
    ...commonFacets,
    "- `synthesis-quality`: Did the follow-up branch choose a sensible base and combine sibling commits in a clear, useful way? The authored report should make the synthesis lineage obvious.",
  ];
}

function formatArtifacts(artifacts: readonly WorkspaceRunArtifact[]): string {
  if (artifacts.length === 0) {
    return "(missing)";
  }

  return artifacts
    .map(
      (artifact) =>
        `### ${artifact.relativePath}\n\n${truncateText({ text: artifact.text, maxCharacters: 4_000 })}`,
    )
    .join("\n\n");
}

function commandSummary(
  command: {
    readonly command: readonly string[];
    readonly cwd: string;
    readonly exitCode?: number;
    readonly signal?: string | NodeJS.Signals;
    readonly timedOut: boolean;
    readonly errorMessage?: string;
    readonly stdout: string;
    readonly stderr: string;
  },
  options: {
    readonly maxStdoutCharacters?: number;
    readonly maxStderrCharacters?: number;
  } = {},
): unknown {
  return {
    command: command.command.map((arg) => truncateText({ text: arg, maxCharacters: 500 })),
    cwd: command.cwd,
    exitCode: command.exitCode,
    signal: command.signal,
    timedOut: command.timedOut,
    errorMessage: command.errorMessage,
    stdout: truncateText({
      text: command.stdout,
      maxCharacters: options.maxStdoutCharacters ?? 4_000,
    }),
    stderr: truncateText({
      text: command.stderr,
      maxCharacters: options.maxStderrCharacters ?? 4_000,
    }),
  };
}

function formatCommandPreview(command: readonly string[]): string {
  return command.map((arg) => truncateText({ text: arg, maxCharacters: 500 })).join(" ");
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  return readFileSync(path, "utf8");
}

const codexJudgeOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    verdict: {
      type: "string",
      enum: ["pass", "fail", "inconclusive"],
    },
    rationaleMarkdown: {
      type: "string",
    },
    strengths: {
      type: "array",
      items: {
        type: "string",
      },
    },
    problems: {
      type: "array",
      items: {
        type: "string",
      },
    },
    facets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
          },
          score: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          verdict: {
            type: "string",
            enum: ["pass", "fail", "inconclusive"],
          },
          rationaleMarkdown: {
            type: "string",
          },
        },
        required: ["name", "score", "verdict", "rationaleMarkdown"],
      },
    },
  },
  required: ["score", "verdict", "rationaleMarkdown", "strengths", "problems", "facets"],
} as const;

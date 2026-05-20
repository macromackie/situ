import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { WorkspaceAutoresearchCase } from "./types.js";

const evalsProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Returns the enabled workspace autoresearch cases.
 */
export function listWorkspaceAutoresearchCases(
  input: {
    readonly caseIds?: readonly string[];
  } = {},
): readonly WorkspaceAutoresearchCase[] {
  const cases = [spellingCorrectorCase, branchingNormalizerCase];

  if (input.caseIds === undefined || input.caseIds.length === 0) {
    return cases;
  }

  return cases.filter((workspaceCase) => input.caseIds?.includes(workspaceCase.id) ?? false);
}

const spellingCorrectorCase = {
  id: "spelling-corrector",
  title: "Spelling corrector",
  workspacePath: join(evalsProjectRoot, "workspaces", "spelling-corrector"),
  projectId: "project_spelling_corrector_autoresearch",
  targetCandidateCount: 2,
  requiresSynthesis: false,
  protectedPaths: ["harness.py", "spell-testset1.txt", "spell-testset2.txt"],
  editablePaths: ["spell.py", "helper files"],
  harnessCommand: 'python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1',
  researchInstructionsMarkdown: [
    "- Edit `spell.py` only unless a helper file is genuinely useful.",
    "- Do not create run logs or result files in the checkout.",
    "- Keep or discard candidates according to dev accuracy and the dev WPS floor.",
  ].join("\n"),
  goalMarkdown: [
    "Use Situ to run real autoresearch in the spelling-corrector workspace from one root native local-agent goal.",
    "",
    "The workspace contains Norvig's spelling corrector, a read-only Python harness,",
    "objective/program documents, a corpus, and dev/held-out spelling testsets.",
    "",
    "Do the work through ordinary Situ records:",
    "- initialize a project for the current repository",
    "- establish one dynamic baseline record and baseline measurements before candidate tasks",
    "- create one task and experiment per candidate direction",
    "- create one git worktree branch per experiment under `$SITU_EVAL_WORKTREES_DIR`",
    "- after baseline setup, use native subagents for independent candidate work when they can be started and observed quickly",
    "- use direct manager work as a visible fallback when subagents are unavailable, invisible, slow, sequential, or too costly for the remaining budget",
    "- completed candidate measurements are more important than proving delegation purity",
    "- do not stop at assigning tasks; start real workers or execute candidate work directly so at least one candidate reaches measurement evidence",
    "- prioritize one measured result for each target candidate direction before spending the remaining budget refining one direction",
    "- have each candidate path use the `situ` CLI to record measurements and status",
    "- after the first measured candidate checkpoint, create a project-level checkpoint report through `situ reports create` before continuing search",
    "- repeatedly try candidate improvements, run the harness, and keep or discard according to the objective",
    "- keep going until the external time limit stops the process or the run is complete",
    "- keep protected files unchanged",
    "- leave enough Situ records and output files for a judge to understand how far the run got",
  ].join("\n"),
  expectedOutcomeMarkdown: [
    "A useful run uses Situ as the durable record system, runs the real spelling",
    "harness from the copied workspace, preserves `harness.py` and both testsets,",
    "creates a dynamic baseline record and baseline measurements, then launches at",
    "least two candidate experiments on separate git worktree branches, using",
    "native subagents only when they can produce visible evidence quickly,",
    "records experiment branches, worktree paths, assignments, measurements, and",
    "status changes through the Situ CLI, gets distinct measured evidence across",
    "the target candidate count, creates a project-level checkpoint report after",
    "the first measured candidate, and leaves enough evidence to judge partial",
    "progress when the external time limit cuts off the run.",
  ].join(" "),
} satisfies WorkspaceAutoresearchCase;

const branchingNormalizerCase = {
  id: "branching-normalizer",
  title: "Branching normalizer",
  workspacePath: join(evalsProjectRoot, "workspaces", "branching-normalizer"),
  projectId: "project_branching_normalizer_autoresearch",
  targetCandidateCount: 3,
  managerTimeoutMs: 10 * 60 * 1000,
  requiresSynthesis: true,
  protectedPaths: ["harness.py", "dev-cases.tsv", "final-cases.tsv"],
  editablePaths: [
    "normalizers/casefold.py",
    "normalizers/punctuation.py",
    "normalizers/numbers.py",
    "normalizers/spacing.py",
  ],
  harnessCommand: 'python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1',
  suggestedResearchDirectionMarkdowns: [
    [
      "Focus on `normalizers/casefold.py`.",
      "Implement generic lowercasing and accent folding without reading protected cases.",
      "Avoid touching the other normalizer modules unless absolutely necessary.",
    ].join(" "),
    [
      "Focus on `normalizers/punctuation.py`.",
      "Implement generic punctuation and separator normalization without reading protected cases.",
      "Avoid touching the other normalizer modules unless absolutely necessary.",
    ].join(" "),
    [
      "Focus on `normalizers/numbers.py`.",
      "Implement generic digit-to-English-word normalization for common small integers without reading protected cases.",
      "Avoid touching the other normalizer modules unless absolutely necessary.",
    ].join(" "),
    [
      "Focus on `normalizers/spacing.py`.",
      "Implement generic whitespace collapse and trimming without reading protected cases.",
      "Avoid touching the other normalizer modules unless absolutely necessary.",
    ].join(" "),
  ],
  researchInstructionsMarkdown: [
    "- This case is designed for clean branch composition.",
    "- Stay in your assigned normalizer module so the synthesis path can cherry-pick your commit cleanly.",
    "- Commit a useful focused change with a clear message before recording measurements.",
    "- Do not inspect `dev-cases.tsv` or `final-cases.tsv` directly; use the harness output.",
    "- If your focused change improves dev accuracy, leave the commit in place and mark the experiment ready for review.",
    "- After one useful focused commit, record measurements and stop instead of adding extra refinement commits.",
  ].join("\n"),
  synthesisInstructionsMarkdown: [
    "- Do not wait for every candidate to be polished before creating synthesis records.",
    "- Once enough measured candidates exist to choose a current best base, create the synthesis task and experiment.",
    "- Create the synthesis worktree from the best candidate branch after the synthesis experiment exists.",
    "- Bring in useful focused commits from other candidate branches with `git cherry-pick -x`.",
    "- Aim for one combined branch that contains at least three candidate improvements total.",
    "- Because candidate branches should edit separate modules, clean cherry-picks are expected.",
    "- Run the harness from the synthesis worktree after the combined candidate.",
    "- Write `SYNTHESIS_REPORT.md` and `cherry-picks.tsv` in `$SITU_RUN_OUTPUT_DIR`, not in the checkout.",
  ].join("\n"),
  goalMarkdown: [
    "Use Situ to run branching autoresearch in the normalizer workspace from one root native local-agent goal.",
    "",
    "The root manager should create at least three sibling candidate experiments from the same initial commit.",
    "Four suggested directions are available, but the fourth is stretch work after synthesis is recorded.",
    "Each chosen candidate direction receives a focused normalizer module and should produce one useful branch-local commit.",
    "After candidate measurements exist, the manager chooses one candidate branch as the base,",
    "creates a follow-up synthesis experiment, and uses `git cherry-pick -x` to bring",
    "compatible useful commits from sibling branches into one combined branch.",
    "",
    "Do the work through ordinary Situ records:",
    "- establish one dynamic baseline record and baseline measurements before candidate tasks",
    "- create one task and experiment per chosen candidate direction",
    "- create at least three worktree branches under `$SITU_EVAL_WORKTREES_DIR`",
    "- after baseline setup, use native subagents for independent candidate branches only when they can be started and observed quickly",
    "- use direct manager work as a visible fallback when subagents are unavailable, invisible, slow, sequential, or too costly for the remaining budget",
    "- completed candidate measurements and synthesis lineage are more important than proving delegation purity",
    "- do not stop at assigning tasks; start real workers or execute candidate work directly so candidates reach measurement evidence",
    "- prioritize one measured result for each target candidate direction, but do not defer synthesis records until all candidate polish is complete",
    "- record candidate measurements and review-ready status through `situ`",
    "- after the first measured candidate checkpoint, create a project-level checkpoint report through `situ reports create`",
    "- create the synthesis task and experiment as soon as enough measured candidate evidence exists to choose a current best base, before synthesis worktree or cherry-pick work",
    "- choose a candidate branch HEAD as `baseRef`",
    "- cherry-pick useful commits from at least two other candidate branches",
    "- prioritize a minimal recorded synthesis with measurements over extra candidate polishing when the time budget is tight",
    "- keep protected files unchanged",
    "- leave enough Situ records, git logs, and output files for a judge to understand the lineage",
  ].join("\n"),
  expectedOutcomeMarkdown: [
    "A useful run uses Situ as the durable record system, creates a dynamic",
    "baseline record with baseline measurements before candidate tasks,",
    "creates at least three focused candidate experiments on separate git worktree branches,",
    "records useful candidate measurements, preferring native parallel subagents",
    "for the independent candidate branches when available, then creates a follow-up synthesis",
    "experiment from one candidate branch HEAD that cherry-picks",
    "useful commits from at least two other candidate branches with `git cherry-pick -x`.",
    "The synthesis branch should represent at least three candidate branches total,",
    "keep protected files unchanged, record distinct measured evidence across the",
    "target candidate count, create a project-level checkpoint report after the",
    "first measured candidate, and record synthesis measurements and review-ready",
    "status through the Situ CLI.",
  ].join(" "),
} satisfies WorkspaceAutoresearchCase;

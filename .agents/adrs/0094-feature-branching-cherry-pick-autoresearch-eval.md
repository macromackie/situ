---
status: active
category: feature
created: 2026-05-15
---

# 0094. Feature: Branching Cherry-Pick Autoresearch Eval

## Context

ADR 0093 defines the real eval shape: Evalite prepares an isolated workspace,
starts one local agent CLI in a pseudo-terminal, and submits a native `/goal`.
The manager, not the harness, creates Situ records, worktrees, optional
subagent handoffs, and reports.

The next product question is whether Situ can support experiment lineage
without adding a heavy workflow model:

```text
experiment A branch
  -> accepted useful commit
  -> follow-up experiment starts from that commit
  -> cherry-picks compatible useful commits from sibling branches
```

This should use normal git and ordinary Situ records. Situ should not need a
special lineage graph before the product has proven that `baseRef`,
`branchName`, `worktreePath`, events, measurements, and Markdown handoffs are
insufficient.

## Decision

Add a second real Evalite workspace case:

```text
branching-normalizer
```

The eval is an advanced local-agent eval with this wall-clock shape:

```text
0:00
  -> Evalite copies workspace into isolated SITU_HOME/evals/workspaces/branching-normalizer
  -> Evalite initializes git and puts situ on PATH
  -> Evalite starts one native /goal terminal manager in the repository
  -> the manager creates the Situ project
  -> the manager creates a dynamic baseline and baseline measurements through Situ
  -> the manager creates sibling candidate tasks, experiments, and worktree branches
  -> the manager strongly prefers native subagents for candidate branches
  -> as measured candidate evidence arrives, the manager creates synthesis records
     before all candidate polish is complete
  -> the manager chooses a candidate branch as the current synthesis base
  -> the manager creates a follow-up synthesis branch and worktree from that base
  -> the manager cherry-picks useful commits from sibling branches with `git cherry-pick -x`
  -> the manager records synthesis measurements and review-ready status through situ

~10:00 max
  -> external timeout may stop the root manager
  -> Evalite collects Situ records, branch lineage, cherry-pick evidence,
     worktree diffs, output files, and terminal output
  -> Evalite scores with deterministic evidence checks and a Codex LLM judge
```

The 10 minute limit is the root manager work budget for the case. The LLM
judge timeout is separate because it evaluates the collected evidence after
the agent work has stopped.

## Workspace

The workspace lives at:

```text
projects/evals/workspaces/branching-normalizer/
```

It is a small Python text-normalization autoresearch problem with independent
improvement surfaces:

- case and accent normalization
- punctuation/separator normalization
- number normalization
- whitespace normalization

The case prompt gives the manager four suggested candidate directions, but the
10 minute eval target requires three measured candidate directions. Three is
the smallest useful branching lineage for this case: one selected base branch
plus two cherry-picked sibling branches. The fourth direction is useful stretch
work when the manager has time after synthesis is recorded.

Each direction should primarily edit a different module. This makes independent
useful commits likely and keeps cherry-picks real but low-conflict.

Protected files include:

- `harness.py`
- `dev-cases.tsv`
- `final-cases.tsv`

The manager and any delegated subagents run:

```text
python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1
```

They record at least:

- `dev_accuracy`
- `dev_wps`
- `final_accuracy`

The manager records the same metric names on the baseline before candidate
branches are created. Candidate and synthesis experiments compare measurements
to that durable baseline instead of recreating baseline rows independently.

## Lineage Contract

The exploration experiments are sibling candidates:

```text
initial commit
  +-- candidate-1 branch
  +-- candidate-2 branch
  +-- candidate-3 branch
  +-- candidate-4 branch
```

The synthesis experiment is a follow-up candidate:

```text
chosen candidate branch HEAD
  +-- synthesis branch
        +-- cherry-pick from another candidate branch
        +-- cherry-pick from another candidate branch
```

The synthesis experiment record stores:

- `baseRef`: the selected candidate branch commit
- `branchName`: the synthesis branch
- `worktreePath`: the synthesis worktree
- `assignedTo`: the synthesis local-agent actor

The synthesis branch must use `git cherry-pick -x` so the resulting git log
contains the original commit ids. The eval treats those commit ids as the
machine-readable lineage evidence.

Do not add `parentExperimentId`, `derivedFromExperimentId`, a lineage table, or
a workflow graph for this eval. If later evals show that git refs and Markdown
handoffs are too weak, a future ADR can add a product-level lineage primitive.

## Manager Contract

The manager owns the whole flow. It should not rely on the eval harness to
select branches or prepare follow-up records.

A successful manager run should:

1. Create the dynamic baseline and baseline measurements before candidate tasks.
2. Create at least three sibling tasks and experiments with clear
   module-focused Markdown handoffs. Creating all four suggested directions is
   allowed when it does not delay synthesis.
3. Create matching worktree branches from the initial commit under
   `$SITU_EVAL_WORKTREES_DIR`.
4. Dispatch independent candidate packets to native subagents or the selected
   tool's closest worker mechanism when that can produce visible evidence
   quickly. Otherwise, record the fallback and execute candidates directly.
5. Produce useful focused commits on candidate branches.
6. Record candidate measurements through `situ measurements create`.
7. Move useful candidate experiments and tasks to review-ready states.
8. Create the synthesis task and experiment as soon as there is enough measured
   candidate evidence to choose a current best base. This should happen before
   the manager spends the remaining budget on candidate polish.
9. Select a candidate branch as the synthesis base using recorded evidence.
10. Create the synthesis branch and worktree from that base commit.
11. Cherry-pick useful commits from at least two other candidate branches with
    `git cherry-pick -x`.
12. Run the harness after the combined candidate.
13. Write `cherry-picks.tsv` and `SYNTHESIS_REPORT.md` under
    `$SITU_RUN_OUTPUT_DIR`.
14. Record synthesis measurements through Situ.
15. Move the synthesis experiment to `ready_for_review` and the synthesis task
    to `in_review`.

The synthesis experiment record must exist before synthesis work begins. A
synthesis worktree, cherry-pick attempt, or report without a matching Situ
experiment is incomplete evidence. Once candidate measurements exist, the
manager should prioritize a minimal recorded synthesis over extra candidate
polish because the lineage question is the point of this case.

Candidate coverage and synthesis are allowed to overlap. Three measured
candidate directions are required; a fourth measured direction is optional
stretch work. The manager should not defer all synthesis records until every
suggested direction has been explored. Once at least three candidate branches
have useful measured commits, the manager has enough source material for a
minimal synthesis branch: one selected base plus two cherry-picked siblings. If
the time budget is tight, a minimal measured synthesis with clear skipped-branch
notes is stronger evidence than a perfect candidate phase with no synthesis
lineage.

The manager may skip a candidate branch when its change is not useful, does
not apply cleanly, or hurts the metric. It must explain skipped branches in
the synthesis report or a Situ report.

Direct manager work is allowed as a fallback when native subagents are
unavailable, invisible, slow, or too costly for the remaining eval budget. That
fallback should be explicit in Situ records or terminal output because this case
is designed to exercise fast candidate exploration, not to prove a specific
vendor's subagent mechanics.

Completed measured synthesis is more important than delegation purity. A run
with direct manager-led candidate execution and clear fallback notes is stronger
evidence than a run with assigned candidate workers that never produce
measurements or synthesis lineage.

Candidate branch work should therefore show either:

- distinct non-manager actor ids and bounded candidate packets for worker-led
  branches
- or a concrete fallback note naming the worker mechanism considered and why
  the root manager continued directly

## Evidence Collection

The eval output includes ADR 0093's evidence plus synthesis-specific evidence:

- root manager terminal command, timeout state, transcript, and submitted `/goal`
- candidate and synthesis task and experiment records
- worktree branch names and HEAD commits
- per-worktree commit lists
- per-worktree full git logs
- synthesis `cherry-picks.tsv`
- synthesis `SYNTHESIS_REPORT.md`
- deterministic mapping from cherry-picked commit ids back to candidate
  branches when the evidence is available

## Scorers

The existing LLM judge remains required.

The deterministic support scorer must additionally expose evidence and
metadata for this case:

- a baseline exists with measurements before candidate measurements
- at least three candidate experiments exist
- at least three candidate worktrees exist
- a synthesis-like experiment exists with `baseRef`, `branchName`,
  `worktreePath`, and assignment
- the synthesis `baseRef` is not the initial commit
- the synthesis branch includes `git cherry-pick -x` evidence
- cherry-picked commit ids map back to at least two non-base candidate branches
  when enough git evidence exists
- the synthesis result represents at least three branches total: selected base
  branch plus at least two cherry-picked source branches
- synthesis measurements exist
- synthesis result rows may live in the shared `results.tsv`; they do not need
  a separate synthesis-specific results file
- synthesis task and experiment are in review-ready states
- protected-file diffs are clean across all worktrees
- candidate and synthesis dev accuracy comparisons, plus any synthesis report
  explanation for metric-preserving safety tradeoffs
- worker actor ids and task assignments

The deterministic scorer is still supporting evidence. It should not decide
whether the delegation was good, whether a fallback explanation was credible,
or whether the combined branch is the right research outcome. The LLM judge
decides those through structured facets, including a delegation/subagent facet
and a synthesis-quality facet.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
bun x tsgo --noEmit -p tsconfig.json
mise run evals
mise run check
git diff --check
```

The real advanced eval command is:

```text
mise run evals branching-normalizer
```

It requires the selected local agent CLI and the Codex judge CLI to work
locally, and may spend model time.

## Consequences

Situ can now evaluate the product behavior that matters for higher-order
autoresearch:

```text
parallel or manager-led exploration
  -> branch-local evidence
  -> choose the best base
  -> fork a follow-up candidate from that base
  -> cherry-pick compatible sibling improvements
  -> record the result through Situ
```

This keeps the app primitive-focused. Git owns commit lineage; Situ owns the
human-readable candidate records and durable evidence around that lineage.

# Branching Normalizer — Research Objective

This workspace tests whether Situ can support a branching autoresearch flow:
at least three independent candidate branches first, then one synthesis branch
that builds on a chosen candidate result and cherry-picks useful commits from
sibling branches. Four candidate directions are available, but the fourth is
stretch work after synthesis is recorded.

The root local-agent manager owns the whole flow. Before creating candidate
tasks, it records the unmodified harness result through Situ baseline and
measurement records. Candidate branches and synthesis compare measurements to
that shared baseline instead of each creating their own baseline.

Native subagents are useful only when they produce visible progress quickly.
Do not wait on assigned-but-idle workers during the fixed eval budget. If native
worker execution is unavailable, invisible, slow, or too costly, record the
fallback reason and execute the candidate directly. Completed candidate
measurements and synthesis lineage are more important than delegation purity.

After the first candidate branch has comparable measurements and reaches a
review-ready checkpoint, the manager creates a project-targeted checkpoint
report through `situ reports create`. The report summarizes the baseline,
measured candidates so far, current best branch, open candidate/synthesis work,
and next intended step. This checkpoint is part of the search loop; it is not a
claim that the run is final.

## Working Directory

The source workspace for this run is **`<LAB_DIR>`**. The Evalite harness
substitutes this placeholder before launch. Treat that directory and the
worktrees under `$SITU_EVAL_WORKTREES_DIR` as the full scope of the run.

Candidate work happens in isolated worktrees. After candidate measurements
exist, the manager creates a follow-up synthesis worktree from the chosen
candidate branch HEAD.

Create the synthesis task and synthesis experiment before doing synthesis
worktree or cherry-pick work. A synthesis branch without a matching Situ
experiment is incomplete evidence. Do not wait for every candidate to be
polished before creating synthesis records. Once there is enough measured
candidate evidence to choose a current best base, create the synthesis task and
experiment. Once at least three candidate branches have useful measured commits,
there is enough source material for one base branch plus two cherry-picked
siblings. If time is tight, prioritize that minimal recorded synthesis over
extra candidate polish.

## Scope

Editable files:

- `normalizers/casefold.py`
- `normalizers/punctuation.py`
- `normalizers/numbers.py`
- `normalizers/spacing.py`

Protected files:

- `harness.py`
- `dev-cases.tsv`
- `final-cases.tsv`

Do not read the protected TSV files directly. Use the harness output only.
Do not modify protected files.

## Candidate Expectations

Each candidate direction has a focused module. Stay focused so the synthesis
branch can cleanly cherry-pick the commit.

Run:

```bash
python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1
```

Append rows to `$SITU_RUN_OUTPUT_DIR/results.tsv`:

```text
commit  dev_accuracy  dev_wps  final_accuracy  status  description
```

Record `dev_accuracy`, `dev_wps`, and `final_accuracy` through
`situ measurements create`. After the first measured candidate checkpoint,
write `$SITU_RUN_OUTPUT_DIR/CHECKPOINT_REPORT.md` and create the durable Situ
report before continuing candidate or synthesis work. Before spending the
remaining budget on candidate polish, make sure synthesis records exist once
enough measured evidence is available to choose the current best base.

## Synthesis Expectations

The manager should:

1. Inspect candidate branches, result tables, and Situ measurements.
2. Choose one candidate branch HEAD as the base.
3. Create a synthesis task and experiment through `situ`, with the synthesis
   experiment `baseRef` set to the selected candidate branch HEAD.
4. Create the synthesis worktree from that base.

The synthesis path should:

1. Confirm it is in the prepared synthesis worktree.
2. Use `git cherry-pick -x` to bring useful commits from at least two other
   candidate branches.
3. Run the harness in the synthesis worktree.
4. Write `$SITU_RUN_OUTPUT_DIR/cherry-picks.tsv`.
5. Write `$SITU_RUN_OUTPUT_DIR/SYNTHESIS_REPORT.md`.
6. Record synthesis measurements and move the synthesis task/experiment to
   review-ready states.

## Good Run Signal

- At least three candidate branches exist and ran in parallel or in a clearly bounded manager-led sequence.
- One baseline exists with comparable measurements before candidate tasks.
- A project-targeted checkpoint report exists after the first measured
  candidate.
- Three distinct candidate experiment ids have comparable measurements.
- At least three candidate branches are represented in the synthesis result.
- The synthesis task and experiment exist before the synthesis branch work.
- The synthesis experiment `baseRef` is a candidate branch HEAD.
- The synthesis git log includes `cherry picked from commit ...` lines.
- Protected files are unchanged in every worktree.
- The synthesis dev accuracy is at least as good as the best single candidate.

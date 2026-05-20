# Spelling Corrector — Research Objective

This research project pursues continuous improvement to Norvig's spelling
corrector. The root local-agent manager owns the whole Situ run: it creates the
project, records a dynamic baseline for the unmodified harness, creates
candidate tasks and experiments, gives each candidate its own git worktree
branch, and records measurements/status through Situ. The manager may use
native subagents when useful, but delegation is an execution choice inside the
root goal, not something the eval harness pre-orchestrates. The durable source
of truth is ordinary Situ records plus git branches. See `program.md` in this
directory for the original autoresearch program statement; this objective
adapts it to a Situ run.

## Working directory

The source workspace for this run is **`<LAB_DIR>`**. The Evalite harness
substitutes this placeholder before launch, so by the time you read this it is
an absolute path under `SITU_HOME/evals/workspaces/`. Treat that directory as
the scope of the run. Do not push, do not touch the operator's other
repositories, and do not assume any state outside this run.

Candidate work happens in isolated worktrees under `$SITU_EVAL_WORKTREES_DIR`.
Make `spell.py` edits, harness invocations, `git commit`, and
`git reset --hard HEAD~1` calls in the candidate worktree, not the source
workspace branch. Do not try to force the source workspace branch to match an
experiment worktree.

The eval runner provides `SITU_RUN_OUTPUT_DIR`, an output directory outside the
checkout for run logs and result tables. Put command output there. If you
delegate subagents, give each subagent a subdirectory under `SITU_RUN_OUTPUT_DIR`.
Do not create `results.tsv`, `run.log`, or other scratch/output files in the
project root or experiment worktree root.

## Scope

- Edit `spell.py` only. Add helper files (corpora, lookup tables,
  precomputed indexes) freely.
- Do NOT modify `harness.py`, `spell-testset1.txt`, or
  `spell-testset2.txt`. These are the eval ground truth.
- Do NOT use `spell-testset1.txt` as training data. The dev set is
  for harness scoring only; candidate code and helper files must not
  read, copy, encode, lookup, or reweight its right-column labels.
- Do NOT read `spell-testset2.txt`. It is held out — reading it for
  ideas invalidates the run.
- Do NOT add Python dependencies outside the standard library.

## Pre-authorizations

The following operations are explicitly authorized within the current
workspace-command cwd and are part of the experiment loop:

- `git commit -am "<short description>"` per experiment.
- `git reset --hard HEAD~1` to discard a failed experiment. This is
  the only acceptable form of destructive git here; do not force-push,
  do not rewrite history beyond the most recent commit.
- `python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1` to run the
  eval. Use the command tool timeout rather than a `timeout` binary.
- `situ baselines create`, `situ measurements create`, `situ experiments move`,
  `situ tasks move`, and `situ reports create` to record durable progress.

If you use manual git staging, prefer explicit paths such as
`git add spell.py helper.py` over `git add -A`. Before committing or
capturing a candidate, inspect `git status --short` and remove generated
files such as `__pycache__/` or `*.pyc`; they are not candidate source
changes.

## The loop

For each experiment:

1. Read git state, Situ baseline measurements, and any existing
   `$SITU_RUN_OUTPUT_DIR/**/results.tsv` files to see what has been tried.
2. Propose a change to `spell.py`. Candidate directions:
   - weighted edit costs (transpositions cheaper than substitutions)
   - Damerau–Levenshtein
   - larger edit distance with better pruning
   - n-gram or character-level context
   - smoothing of word frequencies
   - additional corpora (you may add files but not delete `big.txt`)
   - keyboard-distance scoring
   - common-typo lookup tables
3. `git commit -am "<short description>"`.
4. `python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1`.
5. Parse `dev_accuracy` and `dev_wps` from
   `$SITU_RUN_OUTPUT_DIR/run.log`. If grep is empty, the run crashed —
   `tail -50 "$SITU_RUN_OUTPUT_DIR/run.log"` for the traceback.
6. Decide:
   - `dev_wps < 10` → discard (`git reset --hard HEAD~1`), status
     `discard`.
   - Candidate uses dev-set labels as training data or lookup source
     → discard as invalid overfit.
   - `dev_accuracy` did not improve over best kept → discard.
   - `dev_accuracy` improved → keep; leave the candidate commit in place.
   - Crash → status `crash`, fix or skip.
7. Append a row to a `results.tsv` file under `$SITU_RUN_OUTPUT_DIR`.
8. Record metrics with `situ measurements create` against the candidate
   experiment.
9. After the first completed candidate, move the experiment to
   `ready_for_review` and the task to `in_review` so partial progress is
   visible even if the timeout interrupts later work.
10. Immediately after that first measured checkpoint, write
    `$SITU_RUN_OUTPUT_DIR/CHECKPOINT_REPORT.md` and create a project-targeted
    Situ report with `situ reports create`. Summarize the baseline, measured
    candidate, current best branch/worktree, open work, and next intended step.
    Call it a checkpoint or partial report unless the run is genuinely final.
11. Before spending the remaining budget on deeper refinement of the first
    candidate, complete a minimal measured pass for the second candidate
    direction. Candidate coverage means distinct experiment ids with comparable
    measurements, not multiple metric rows from one experiment.

`$SITU_RUN_OUTPUT_DIR/results.tsv` columns:

```text
commit  dev_accuracy  dev_wps  final_accuracy  status  description
```

`status` is one of `keep`, `discard`, `crash`. Use `0.000000` /
`0.0` for missing metrics. Do NOT create or commit `results.tsv` in
the checkout.

## Phase guidance

Treat this run as a bounded slice of the broader experiment loop. Stay in
`search` until the wall-clock timeout set at launch is reached or until no
improvement has been seen across the last 10 experiments, but write the
checkpoint report immediately after the first measured candidate before
continuing search. The report is part of the search loop, not a signal that the
run is done. In this bounded eval, cover the requested candidate directions
with measurements before polishing one direction.

## Simplicity

All else equal, simpler is better. A 0.001 accuracy gain that adds 50
lines of hacky code is probably not worth keeping. A gain from
deletion is a clear win.

## What "good" looks like

- Baseline established: unmodified `spell.py` evaluated and recorded as a
  Situ baseline with baseline measurements before candidate tasks.
- At least 2 candidate experiments exist on separate worktree branches.
- At least 2 distinct experimental directions attempted.
- At least 2 distinct experiment ids have comparable measurements.
- At least one `keep` row above the baseline `dev_accuracy`.
- Situ experiment records include branch names, worktree paths, assignments,
  and measurement evidence.
- A project-targeted checkpoint report exists after the first measured
  candidate.
- `dev_wps >= 10` floor honored on every kept row.
- `spell-testset2.txt` never read.
- `harness.py` never modified.

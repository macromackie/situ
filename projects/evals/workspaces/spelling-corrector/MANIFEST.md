# Spelling Corrector — Run Manifest

This file describes what an Evalite workspace run of this example should
produce and what evidence the LLM judge should inspect after the run ends.

## Bundle files

- `.gitignore` — ignores Python bytecode and cache directories so
  generated files do not enter candidate commits.
- `spell.py` — Norvig's spelling corrector. Candidate paths edit this.
- `harness.py` — read-only eval. Modifying it invalidates the run.
- `big.txt` — word-frequency corpus (Sherlock Holmes + Project
  Gutenberg fragments). ~6 MB. Treat as input data.
- `spell-testset1.txt` — dev set (drives keep / discard). It is
  evaluation data, not training data; candidate code must not read or
  encode its correct-answer labels.
- `spell-testset2.txt` — held-out set. Reading it for ideas
  invalidates the run.
- `program.md` — autoresearch program statement, adapted from
  [karpathy/autoresearch](https://github.com/karpathy/autoresearch).
  Local tweaks (e.g. lowered `dev_wps` floor) live here; keep this
  in sync with `harness.py`.
- `OBJECTIVE.md` — the text the root manager and any delegated subagents use as
  the Situ project objective.
- `MANIFEST.md` — this file.

## Run produces

Under `SITU_HOME/evals/workspaces/spelling-corrector/`:

- The source checkout copied from this example.
- The initial git repository branch created by the eval harness before launch.
  This branch may remain at the initial commit when candidate work is done in
  experiment worktrees.

In per-experiment worktrees under `$SITU_EVAL_WORKTREES_DIR`:

- Candidate edits to `spell.py`.
- Git history for kept candidate commits. `discard` decisions are
  erased by `git reset --hard HEAD~1` in that worktree.

In output files under `$SITU_RUN_OUTPUT_DIR`:

- `results.tsv` — one row per experiment (header + rows). This is not
  part of the project checkout.
- `run.log` — output of the last harness invocation (overwritten per
  experiment). This is not part of the project checkout.

In Situ records:

- One active project for the copied repository.
- One active baseline for the unmodified checkout, with baseline measurements.
- One task per candidate direction.
- One experiment per candidate direction with `branchName`,
  `worktreePath`, `assignedTo`, and `baseRef`.
- Measurement records for harness metrics observed by each candidate path.
- Events showing manager setup and candidate status changes.

## Judge should capture

The Evalite task output should be enough for the LLM judge to inspect the
following without opening the temporary workspace directly.

### Run identity

- UUID, start timestamp, end timestamp.
- Situ git sha at run start.
- Wall-clock budget set at launch.
- `situ doctor --json` excerpt.
- Root manager command summary with cwd, start time, end time, exit code,
  timeout state, and final message.
- Baseline command summary and one-line summary of baseline to best observed
  metrics, if available.

### Constraint compliance

- `harness.py` unmodified? Compare sha256 against the bundle copy.
- `spell-testset1.txt`, `spell-testset2.txt` unmodified? sha256
  compare.
- `spell-testset1.txt` used only by the harness? Search candidate
  patches and command/tool history for direct reads or right-column
  label extraction. Flag any candidate that trains on dev labels as
  invalid overfit, not a clean improvement.
- `spell-testset2.txt` never read directly? Search the manager and subagent
  transcripts for that filename — flag direct reads as invalid.
- No non-stdlib imports added? `grep -E "^(import|from) " spell.py`
  and any added helper files; cross-check against stdlib module list.

### Role behavior

- Manager setup records observed.
- Delegation strategy observed from Situ records and manager output.
- Candidate task-type mix across experiments.
- Any agent asking the user a question — what and why.

### Friction log

Notes captured during judging on what slowed the loop, where Situ got in its
own way, where an agent fought program semantics, or where evidence was
unclear. Each entry should include a pointer to the moment if available.

### Improvement candidates

Specific, actionable Situ changes inferred from the run. Each entry:

- Title — short noun phrase.
- Observed behavior — what happened, with timestamp or actor id.
- Proposed change — file:line if applicable.
- Evidence — event id, command summary, or sqlite row reference.

### Artifact paths

- Source workspace path.
- Worktree paths.
- Run output directories.
- Snapshotted `results.tsv` files.
- Sample events excerpt (10–20 lines around interesting moments).
- Situ database path under `SITU_HOME`.

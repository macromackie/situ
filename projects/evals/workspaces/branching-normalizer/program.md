# autoresearch / branching-normalizer

Improve a simple Python text normalizer through parallel focused experiments,
then synthesize compatible improvements.

## Candidate Loop

1. Confirm `pwd` matches the candidate worktree.
2. Read `OBJECTIVE.md` and `MANIFEST.md`.
3. Edit only your assigned normalizer module unless there is a clear reason.
4. Commit a focused candidate.
5. Run `python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1`.
6. Parse `dev_accuracy`, `dev_wps`, and `final_accuracy`.
7. Append a result row to `$SITU_RUN_OUTPUT_DIR/results.tsv`.
8. Record measurements through `situ measurements create`.
9. Move your experiment to `ready_for_review` and task to `in_review`.

## Synthesis Loop

1. Confirm `pwd` is the prepared synthesis worktree.
2. Inspect the manager-provided candidate summary, result tables, and branch logs.
3. Cherry-pick useful commits from sibling branches with `git cherry-pick -x`.
4. Run the harness in the synthesis worktree.
5. Write `cherry-picks.tsv` and `SYNTHESIS_REPORT.md` under
   `$SITU_RUN_OUTPUT_DIR`.
6. Record synthesis measurements and move synthesis records to review-ready
   states.

# autoresearch / spell

Autonomous research on Norvig's spelling corrector. Adapted from
[karpathy/autoresearch](https://github.com/karpathy/autoresearch) — same
loop, non-ML target.

## Setup

The Evalite harness only copied this folder, initialized git, and put `situ`
on `PATH`. The root manager creates the Situ project, dynamic baseline,
candidate tasks, experiment records, worktrees, measurements, and reports
through ordinary commands.

Start the run from the source checkout:

1. **Read the in-scope files**:
   - `harness.py` — read-only eval. **DO NOT MODIFY.**
   - `spell.py` — the file you edit. Norvig's 21-line corrector.
   - `big.txt` — corpus used to build the word-frequency table. You may add additional corpora; do not delete this file.
2. **Verify data**: `ls big.txt spell-testset1.txt spell-testset2.txt`.
3. **Confirm output**: `$SITU_RUN_OUTPUT_DIR/results.tsv` should already have
   the header row. This output directory must be outside the checkout.
4. **Create the baseline before candidate tasks** by running the unmodified
   harness once and recording the metrics with `situ baselines create` and
   `situ measurements create --baseline-id`.
5. **Create candidate tasks and experiments** only after that baseline is
   recorded. Put candidate code work in git worktrees under
   `$SITU_EVAL_WORKTREES_DIR`.
6. **Run autonomously** until the eval timeout stops you.

If the root manager delegates to subagents, each subagent should read its Situ
task and experiment handoff before editing. Delegation is optional; the durable
source of truth is still Situ records plus git branches.

## Experimentation

Each experiment runs the eval harness:

```bash
python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1
```

**What you CAN do:**

- Modify `spell.py` — change the algorithm, candidate generator, scoring function, the corpus loaded, anything.
- Add helper files (additional corpora, lookup tables, precomputed indexes).

**What you CANNOT do:**

- Modify `harness.py`, `spell-testset1.txt`, or `spell-testset2.txt`.
- Use `spell-testset1.txt` labels as training data, lookup tables, or
  frequency boosts. The dev set is for harness scoring only.
- Read `spell-testset2.txt` for ideas. It is **held out**. Optimizing against it invalidates the run.
- Add dependencies outside Python stdlib.

## The metric

Primary signal: **`dev_accuracy`** on `spell-testset1.txt`.

**Hard floor:** `dev_wps >= 10`. Runs below this floor are **always discarded**, regardless of accuracy gains.

**Held out:** `final_accuracy` (testset2) is reported but never drives keep/discard.

**Time budget:** 60 seconds wall clock per experiment. Exceeding it counts as a crash.

**Simplicity:** All else equal, simpler is better. A 0.001 accuracy gain that adds 50 lines of hacky code is probably not worth keeping. A gain from deletion is a clear win.

The baseline is established before candidate fan-out through ordinary Situ
baseline and measurement records. Candidate paths should compare to that
baseline rather than each creating their own baseline run.

## Output format

Harness prints:

```text
---
dev_accuracy:      0.748148
dev_wps:           150.2
dev_unknown_rate:  0.0556
dev_n:             270
final_accuracy:    0.675000  # held-out, do not optimize
final_wps:         130.4
eval_seconds:      4.95
total_seconds:     5.10
wps_floor:         10
meets_floor:       True
```

Extract key metrics:
`grep "^dev_accuracy:\|^dev_wps:\|^final_accuracy:" "$SITU_RUN_OUTPUT_DIR/run.log"`.

## Logging results

Append to `$SITU_RUN_OUTPUT_DIR/results.tsv` (tab-separated). Header:

```text
commit\tdev_accuracy\tdev_wps\tfinal_accuracy\tstatus\tdescription
```

Columns:

1. short git hash (7 chars)
2. `dev_accuracy` (use `0.000000` for crashes)
3. `dev_wps` (use `0.0` for crashes)
4. `final_accuracy` (held-out reference; `0.000000` for crashes)
5. `status`: `keep`, `discard`, or `crash`
6. short description of what was tried

Do NOT create or commit `results.tsv` in the checkout.

## The experiment loop

LOOP FOREVER:

1. Look at git state.
2. Read the baseline record and baseline measurements from Situ.
3. Tune `spell.py` with an experimental idea.
4. Inspect `git status --short`, remove generated files such as
   `__pycache__/` or `*.pyc`, then stage only intentional files with
   explicit paths such as `git add spell.py helper.py`.
5. `git commit -m "..."`.
6. `python harness.py > "$SITU_RUN_OUTPUT_DIR/run.log" 2>&1`.
7. `grep "^dev_accuracy:\|^dev_wps:\|^final_accuracy:" "$SITU_RUN_OUTPUT_DIR/run.log"`.
8. If grep is empty, run crashed. `tail -50 "$SITU_RUN_OUTPUT_DIR/run.log"` for the traceback. Fix or skip.
9. Decide:
   - **`dev_wps < 10`** → discard (`git reset --hard HEAD~1`).
   - **`dev_accuracy` did not improve** over current best → discard.
   - **`dev_accuracy` improved** → keep; leave the candidate commit in place.
10. Append to `$SITU_RUN_OUTPUT_DIR/results.tsv`.
11. Record metrics with `situ measurements create`.
12. After the first completed candidate, move your experiment to
    `ready_for_review` and your task to `in_review` so partial progress is
    durable before timeout. Then write `$SITU_RUN_OUTPUT_DIR/CHECKPOINT_REPORT.md`
    and create a project-targeted checkpoint report with `situ reports create`
    before continuing search.
13. Complete a minimal measured pass for the next distinct candidate direction
    before deeply refining the first one. Candidate coverage means distinct
    experiment ids with comparable measurements, not multiple metric rows from
    one experiment. Continue recording new measurements if you keep searching
    after that coverage checkpoint.

**NEVER STOP**: once started, run autonomously until manually interrupted.

If stuck, consider: weighted edit costs (transpositions cheaper than substitutions), Damerau–Levenshtein, larger edit distance with better pruning, n-gram or character-level language model context, smoothing of word frequencies, additional corpora, keyboard-distance scoring, common-typo lookup tables.

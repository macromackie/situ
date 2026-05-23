/**
 * The `situ runbook` command prints this static operating manual for an agent
 * acting as an autoresearch manager. It is embedded as a string (not read from
 * disk) so it survives `bun build --compile` into the released single-file
 * binary. Keep it terse, action-oriented, and tool-agnostic — it is a runbook,
 * not a tutorial, and not a reference (that is `situ help`).
 */
export const runbookText = `situ runbook — how to operate situ for an autoresearch run

You are the manager of this run. situ is your durable memory and the record
other people and agents read. You drive the work; situ records what happened.
There is no "situ run" command — the loop below is yours to run. Leave a trail
in situ that explains the run without you in the room, and keep situ as the
single source of truth (do not keep a private notes file as the real state).

THE LOOP
  orient → lock the baseline → (hypothesize → try → measure → record) ×N → report

1. ORIENT
   Read the workspace before changing anything. Find what the goal optimizes,
   how it is measured, and which interface you must not break.

2. LOCK THE BASELINE   (do this before any change)
   Turn the goal's metric into one concrete, repeatable command and build it
   first — if you cannot measure it you cannot improve it. Run it on the
   unchanged code for your baseline. If the metric is stochastic (random seeds,
   sampling), run it several times or across seeds to learn its run-to-run
   spread; that spread is your noise floor, and any change smaller than it is not
   real. Record the baseline and the noise floor in situ.

3. RUN THE LOOP
   For each idea:
     - State the hypothesis in one sentence and create an experiment in situ.
     - Do the work in its own git worktree, never on the baseline checkout.
     - Re-run the SAME command (fixed seed for comparability). Record every
       attempt — kept or discarded — with its number and a one-line reason; keep
       logging to the very end, especially late in a long run.
     - Keep it only if it clears the running best by MORE than the noise floor;
       treat smaller moves as ties and prefer the simpler config.
     - Re-run the current best now and then: a win that does not survive
       re-validation was noise. The surviving best is your frontier — keep it
       visible.
     - Publish each baseline and experiment to the live run map as soon as it
       starts with \`situ live attempts start\`; use descriptive titles for what
       is being tried. Do not fake a metric while it is running. When measurement
       finishes, append \`situ live attempts publish\` with the same node key and
       the real numeric metric fact. Use the lower-level \`situ live nodes set\`,
       \`situ live details set\`, \`situ live edges set\`, and \`situ live focus set\`
       commands when you need finer control. Numeric metric facts in live details
       are what the dashboard charts. The run map is curated, not derived — skip
       this and the dashboard's run map stays empty.

4. SEARCH WIDE BEFORE DEEP
   - One knob at a time misses interactions: a change that fails alone can win
     after a structural move. Do not bury rejected ideas — note them and revisit
     when the frontier shifts, and test plausible combinations together.
   - After two or three non-improving attempts on the same axis, treat it as
     exhausted and pivot. Change the approach in response to a failure instead of
     re-tuning the same knob.
   - Get one measured result across several distinct directions before deep-tuning
     any one of them. What you reach is path-dependent, not the global best.

5. DELEGATE
   Once the baseline exists, prefer parallel subagents for independent
   candidates; they share setup and can run at once. Keep baseline creation,
   synthesis, and accept/reject decisions for yourself. If you cannot delegate,
   do the work directly and say why in a situ comment.

6. STAY HONEST
   - Never tune against held-out or test data, and never read its answers into
     the code. Optimize the dev metric; check held-out now and then as a two-sided
     signal: dev up while held-out flat or down means you are overfitting; dev
     down while held-out up means you may have dropped a real win — revisit it.
     If a branch reaches a suspicious dev frontier by training on, memorizing,
     or looking up dev labels, do not accept it as the clean generalizing result.
     Mark it as overfit-risky, use watch/rejected/change-requested language, and
     report the best non-leaky branch separately.
   - Do not change the metric's definition mid-run. If you must touch the eval,
     re-baseline and say so.
   - If a result surprises you or you cannot explain it (a collapse, a too-good
     jump), stop and investigate before building on it. Gains come from the
     method, not from leaking answers or chasing lucky samples.

7. MIND THE BUDGET
   You own the clock — situ will not stop you. Note your start time and budget,
   check elapsed periodically, and leave room at the end to synthesize and write
   up. Stop at the budget or a clear plateau, whichever comes first.

8. FINISH
   Publish a final briefing: baseline → best, what worked, what did not, and the
   verified numbers (dev and held-out). Run situ verify. The briefing is what a
   human reads to trust the run.

COMMANDS   (run \`situ help <group>\` for exact subcommands and flags)
  situ projects       the run itself; create it first and attach everything to it
  situ baselines      the starting point and its measurement
  situ experiments    one per hypothesis
  situ measurements   numbers attached to baselines and experiments
  situ reviews        accept / reject decisions, with reasoning
  situ briefings      the live narrative humans watch (drives the live page)
  situ live           run-map nodes, edges, details, and focus (drives the chart)
  situ status         what is pending, running, and done
  situ verify         completion and integrity evidence before you call it done
  situ serve          open the live briefing in a browser

EXAMPLE   (a spelling-corrector run, goal "maximize dev_accuracy")
  - Orient: the corrector exposes correction(word); a dev set of wrong→right
    pairs defines accuracy; the import interface must stay intact.
  - Lock baseline: there is no scorer yet, so write one and run it → 74.8% on
    the dev set. Record it as the baseline; check the held-out set too (67.5%).
  - Loop: try a larger corpus in a worktree and re-score; accept only if it
    clears 74.8% by more than one test item (the deterministic noise floor here).
    If two or three edit-model variants in a row fail, pivot to a different axis.
  - Finish: report 74.8% → best, with the held-out number beside it so the gain
    is shown to be real, not overfit.

situ is the notebook; you are the scientist. Keep the trail honest and legible.
`;

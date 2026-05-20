---
status: active
category: feature
created: 2026-05-15
---

# 0093. Feature: Evalite Terminal Workspace Autoresearch Eval

## Context

ADR 0011 defines evals as real LLM tests with at least one LLM judge. ADR 0088
defines the desired product loop: one native goal in the external local agent
tool, one root manager session, and Situ as the durable state of record.

The eval should test that product shape directly:

```text
Evalite
  -> copy a realistic autoresearch workspace
  -> initialize git
  -> make situ available as a local CLI
  -> launch one local agent CLI in a pseudo-terminal
  -> submit a real /goal slash command
  -> the agent uses situ like a human-facing CLI
  -> the agent creates the project, baseline, tasks, experiments, worktrees,
     measurements, reviews, artifacts, and reports
  -> Evalite collects Situ records, worktree outputs, repository diffs,
     terminal transcripts, and final artifacts
  -> deterministic support scorer checks observable evidence
  -> Codex LLM judge scores the full run
```

The eval harness must not pre-orchestrate a baseline manager, worker managers,
or synthesis manager. It should feel like a user opened a local coding agent in
a prepared folder, typed `/goal ...`, and gave that agent the `situ` CLI.

## Decision

Use Evalite as the eval runner for real LLM evals.

The eval project depends on:

```text
evalite
vitest
@situ/app
```

`vitest` is included because Evalite's runner imports Vitest directly.
The eval runtime also requires the local `expect` command. `expect` launches
local agent CLIs in pseudo-terminal sessions so slash-command behavior matches
the human product experience without depending on provider-specific APIs.

The first Evalite eval remains:

```text
projects/evals/src/evals/codex-workspace-autoresearch.eval.ts
```

The file name may still say `codex` because Codex is the default manager and
the LLM judge. The eval contract itself is local-agent-terminal based.

Workspace cases live under:

```text
projects/evals/workspaces/<case-id>/
```

The first workspace case is:

```text
projects/evals/workspaces/spelling-corrector/
```

It is adapted from the spelling-corrector example in the reference Situ
implementation. It contains a real Python spelling-corrector workspace with:

- `spell.py`
- `harness.py`
- `big.txt`
- `spell-testset1.txt`
- `spell-testset2.txt`
- `program.md`
- `OBJECTIVE.md`
- `MANIFEST.md`

Run the eval suite with:

```text
mise run evals
```

This command runs actual local-agent manager work and an actual Codex-backed
LLM judge. It may spend model time and requires the selected local agent CLI to
be installed and authenticated. Ordinary local checks do not call this command.

## Evalite Configuration

`projects/evals/evalite.config.ts` configures:

- `maxConcurrency: 1`
- long enough `testTimeout` for local agent runs
- `trialCount: 1`

Agent evals are expensive, stateful, and non-deterministic. They should not run
multiple workspace cases in parallel until a later ADR defines isolated
parallel case execution. A single workspace case may still use native subagents
or shell-launched local agent processes. The prompt should strongly encourage
the root manager to use those native workers for independent candidate work
when the selected local agent tool supports it.

## Runner Commands

The root command remains:

```text
mise run evals
```

The evals project command remains:

```text
cd projects/evals && mise run evals
```

Both run the real Evalite suite and export the latest JSON result.

To run a subset, pass exact case ids as positional arguments:

```text
mise run evals spelling-corrector
mise run evals branching-normalizer
mise run evals spelling-corrector branching-normalizer
```

The runner validates case ids before launching Evalite so typos fail before
model work starts. Case selectors are arguments, not environment variables.

Useful optional environment variables:

```text
SITU_AGENT_EVAL_DRIVER=codex | claude
SITU_AGENT_EVAL_TIMEOUT_MS=<milliseconds>
SITU_CODEX_EVAL_MODEL=<model>
SITU_CLAUDE_EVAL_MODEL=<model>
SITU_CLAUDE_EVAL_PERMISSION_MODE=dontAsk
SITU_CLAUDE_EVAL_EFFORT=medium
SITU_CODEX_JUDGE_MODEL=<model>
SITU_CODEX_JUDGE_TIMEOUT_MS=<milliseconds>
SITU_EVAL_OUTPUT_PATH=<json-output-path>
```

`SITU_AGENT_EVAL_DRIVER` selects the local agent CLI under test. The default is
`codex`. This is an eval harness choice, not a Situ product provider profile.

`SITU_AGENT_EVAL_TIMEOUT_MS` is the root manager wall-clock cutoff. The default
is 600000 milliseconds, or 10 minutes. The eval observes how far the real
manager-led autoresearch loop gets before that external cutoff. It should not
ask the agent to perform one superficial candidate and stop.

`SITU_CODEX_EVAL_TIMEOUT_MS` may remain as a compatibility alias for Codex
manager runs. New code should use `SITU_AGENT_EVAL_TIMEOUT_MS`.

`SITU_CODEX_JUDGE_TIMEOUT_MS` is the LLM judge timeout. The default is 300000
milliseconds, or 5 minutes.

## Terminal Driver Contract

The eval harness owns thin terminal drivers for local agent CLIs. A driver may:

- build the launch command for one local agent CLI
- include workspace and additional-directory flags
- include model or permission flags that are native to that CLI
- wait briefly for a ready prompt
- answer basic terminal capability queries needed by full-screen CLIs
- answer first-run workspace trust prompts when the selected CLI asks for
  interactive confirmation
- answer routine command approval prompts during the run so the eval does not
  stall at a local-agent permission menu
- submit one compact `/goal ...` slash command through the pseudo-terminal
- capture raw and cleaned terminal transcripts
- stop the session when the external timeout expires

A driver must not:

- create Situ records
- create git worktrees
- run the baseline
- spawn worker phases
- inspect hidden provider state
- call app-server, SDK, or provider-specific goal APIs as the manager kickoff

The supported drivers are:

```text
codex
claude
```

The selected local agent CLI must support native `/goal` in interactive
terminal mode. If a selected CLI version does not support `/goal`, the eval
should fail as a product-compatibility signal rather than falling back to a
non-goal prompt.

The Codex driver launches the interactive CLI with native goals enabled:

```text
codex --enable goals --cd <repository> --sandbox workspace-write \
  --ask-for-approval never --no-alt-screen \
  --add-dir <situ-home> --add-dir <run-output> \
  --add-dir <agent-output> --add-dir <worktrees>
```

The Claude driver launches Claude Code from the repository and grants the eval
directories as additional directories:

```text
claude --permission-mode dontAsk \
  --allowedTools Bash Edit Write MultiEdit Read LS Glob Grep \
  --effort medium \
  --add-dir <situ-home> --add-dir <run-output> \
  --add-dir <agent-output> --add-dir <worktrees>
```

`dontAsk` plus an explicit tool allowlist is the default Claude permission
shape. It avoids repeated command approval menus without turning the eval into
a dangerous fully bypassed session. The default effort is `medium` so the
ten-minute eval budget is spent on observable autoresearch progress instead of
long deliberation. If a future eval needs bypass mode, it must run inside an
external sandbox and be covered by a separate ADR.

## Workspace Environment Contract

Each workspace case materializes under the eval's isolated Situ home:

```text
<SITU_HOME>/evals/workspaces/<case-id>/
  repository/
  worktrees/
  run-output/
  agent-output/
  bin/situ
```

The environment contains:

- a real git repository copied from `projects/evals/workspaces/<case-id>/`
- an initially empty `worktrees/` directory
- an initially empty `run-output/` directory with a `results.tsv` header
- an initially empty `agent-output/` directory for terminal transcripts
- a local `bin/situ` shim on `PATH`
- an isolated `SITU_HOME`
- an isolated `SITU_RUN_OUTPUT_DIR`
- `SITU_EVAL_AGENT_OUTPUT_DIR`
- `SITU_EVAL_WORKSPACE_DIR`
- `SITU_EVAL_WORKTREES_DIR`
- `SITU_EVAL_PROJECT_ID`
- `SITU_EVAL_TARGET_CANDIDATE_COUNT`
- `SITU_EVAL_SYNTHESIS_REQUIRED`

The `situ` shim calls the current workspace's app CLI through `@situ/app`.
The selected local agent sees `situ` as an ordinary local command and does not
need to know the workspace implementation details.

The eval harness must not create the Situ project, baseline, task, experiment,
review, report, measurement, worktree, or subagent records. The harness only
prepares a realistic folder, starts one root local-agent process in a
pseudo-terminal, and submits one native `/goal` command.

The full root manager prompt is written to the manager agent output directory
as Markdown. The terminal submits a compact native `/goal` that tells the
manager to read that prompt file and execute it as the eval goal. This keeps
the interaction faithful to the product shape while staying under local-agent
slash-command length limits.

The root manager prompt should describe the desired product objective,
available environment, delegation default, fallback evidence rule, and worker
packet shape. It should not describe a hidden step-by-step harness API.

## Baseline Contract

The root manager owns baseline creation.

Before creating candidate tasks or experiments, the manager should:

1. Read `OBJECTIVE.md`, `program.md`, and `MANIFEST.md`.
2. Run the unmodified harness once in the repository checkout.
3. Create one baseline record with `situ baselines create`.
4. Record baseline metrics with `situ measurements create --baseline-id`.

The baseline is dynamic and agent-driven. The workspace objective may describe
useful commands and metrics, but the eval harness must not parse a
fixture-specific command output and write baseline rows as hidden state.
Baseline evidence is stored as:

```text
Baseline
  -> Measurements
```

Candidate experiments compare their measurements to that durable baseline.

## Manager Autoresearch Contract

After baseline evidence exists, the manager uses ordinary product primitives:

```text
project
  -> baseline
  -> tasks
  -> experiments
  -> git worktrees
  -> measurements
  -> reviews / comments / reports when useful
```

The manager should create one task and one experiment per useful candidate
research direction. The experiment record should store:

- `baseRef`
- `branchName`
- `worktreePath`
- `assignedTo`

The manager should create git worktree branches under
`$SITU_EVAL_WORKTREES_DIR`.

The manager should strongly prefer native subagents, shell-launched local agent
processes, or the selected tool's closest worker mechanism for independent
candidate experiments after baseline evidence exists. The root manager should
remain the coordinator: it creates the shared baseline, writes the task and
experiment handoffs, assigns distinct actor ids, collects results, chooses
follow-up work, and verifies/report the run.

A worker mechanism must be more than an ordinary shell command run by the root
manager. Useful evidence includes a distinct non-manager actor id, a bounded
prompt or task packet, a separate worktree or working directory when
applicable, a transcript or visible worker output, and Situ records updated by
or for that actor.

Assignment alone is not worker evidence. A manager that creates tasks assigned
to `scientist-1` and `scientist-2` but does not actually start those workers is
still responsible for progress. In the 10 minute eval, the manager should
prefer one completed candidate measurement over many assigned-but-idle
packets.

Direct root-session work is a fallback, not the preferred shape for independent
candidate exploration. It is acceptable when the selected local agent CLI has
no usable worker mechanism, when the remaining time budget makes delegation
counterproductive, or when the work is genuinely sequential. A manager that
falls back to direct work should leave a visible reason in Situ comments,
reports, or terminal output.

The fallback reason should name the worker mechanism considered, explain why
it was unavailable or skipped, and explain why direct root-session work remains
faithful to the autoresearch goal.

The eval does not hard-code worker phases and the harness must not spawn them
for the manager. It judges the durable evidence left behind in Situ, git, and
the visible terminal transcript.

When the manager delegates, each subagent packet should be recoverable from
Situ task Markdown, experiment summary Markdown, and visible prompt/output.
Subagents should use the `situ` CLI to record measurements and status. Private
manager context must not be required to understand the handoff.

For the spelling-corrector workspace, protected files must stay unchanged:

- `harness.py`
- `spell-testset1.txt`
- `spell-testset2.txt`

The agent may edit `spell.py` and add helper files. It must not read
`spell-testset2.txt` directly; that file is held out and should only be touched
by the harness.

## Evidence Collection

After the root manager exits or times out, the task collects:

- the root terminal command, cwd, exit code, timeout state, transcript, start
  time, end time, and submitted `/goal` input
- raw and cleaned terminal transcript files
- concise native-goal launch evidence before bulky manager output
- an explicit protected-file evidence summary before large candidate diffs
- concise synthesis lineage evidence before bulky manager output when a
  synthesis worktree exists
- `situ status --json --project <project-id>`
- `situ verify --json --project <project-id>`
- `situ baselines list --json --project-id <project-id>`
- `situ measurements list --json --baseline-id <suggested-baseline-id>`
- `situ experiments list --json --project-id <project-id>`
- recent measurements, events, and reports
- generated visual report command result from
  `situ reports generate --project-id <project-id> --format html`
- generated `$SITU_RUN_OUTPUT_DIR/SITU_REPORT.html` when the project exists
- current repository project/task views
- `git worktree list --porcelain`
- per-worktree `git status --short`
- per-worktree diff against the initial workspace commit
- per-worktree protected-file diff against the initial workspace commit
- per-worktree commit log against the initial workspace commit
- files under `$SITU_RUN_OUTPUT_DIR`
- selected agent output files such as the terminal transcripts
- `FINAL_REPORT.md` when the manager writes one

This evidence becomes the Evalite task output. It should be sufficient for a
human or LLM judge to understand what happened without opening the temporary
workspace. Judge-facing evidence should surface concise summaries and
protected-file results before bulky worktree diffs so large candidate artifacts
cannot hide the safety signal. Long command prompt arguments should be
truncated in summaries so they do not push git lineage and protected-file
evidence out of the LLM judge context window.

## Scorers

The eval includes at least two scorers:

1. a deterministic support scorer for observable Situ/workspace evidence
2. a Codex-backed LLM judge scorer

The deterministic scorer is supporting evidence only. It does not replace the
LLM judge, and it does not require the manager to finish cleanly. A cutoff can
leave active work behind, so `situ verify --json` may be false while the eval
still contains useful autoresearch evidence.

The deterministic scorer should focus on mechanical observability and safety:
whether records parse, commands ran, protected files stayed clean, worktrees
exist, measurements were recorded, and timestamps/ids make the flow inspectable.
It should expose metadata for qualitative concerns instead of turning them into
brittle hard-coded pass/fail rules.

If a scorer check starts judging generated text, manager strategy, fallback
quality, report usefulness, or whether Situ was better than a plain prompt, it
belongs in an LLM judge facet instead. The support scorer should gather and
summarize evidence for that judgment, not hard-code the judgment.

Visual report quality is judged by the LLM judge. The deterministic scorer may
record whether the post-run visual report command ran and whether the artifact
was captured, but it should not hard-code stylistic or narrative quality.

The deterministic scorer checks for:

- the harness submitted a native `/goal` through a terminal driver
- the Codex terminal driver enabled the `goals` feature when Codex is selected
- at least one baseline record
- baseline measurements through `situ measurements create --baseline-id`
- candidate experiment records with `assignedTo`, `branchName`, and
  `worktreePath`
- git worktrees under the eval worktrees directory that match experiment
  `worktreePath` or `branchName` records
- measurements recorded through Situ
- candidate experiment measurements use metric names comparable with baseline
  measurements
- measured candidate coverage is counted by distinct experiment ids, not by
  raw measurement rows from one experiment
- review-ready, accepted, rejected, or abandoned experiment checkpoints when
  work has progressed far enough to record measurements and a decision
- a project-targeted checkpoint or final report once at least one candidate has
  baseline-comparable measurements
- synthesis-required cases must include the synthesis-specific evidence from
  their case ADR before the deterministic support scorer can return full credit
- result rows or reports in run output
- clean protected-file diffs across the root repository and worktrees
- parsable Situ status and verification output

The deterministic scorer may expose worker-use metadata and baseline-order
metadata, but it should not turn native subagent use or fallback prose into a
hard pass/fail requirement. Native worker availability and terminal transcripts
differ across local agent tools and versions.

For runs without worker evidence, the LLM judge should look for the explicit
fallback reason before accepting a direct-work run as product-faithful.

Measured progress is more important than delegation purity. The manager should
not wait on assigned-but-idle workers when a fixed eval budget is running down.
If native worker startup is unavailable, slow, invisible, or not producing
candidate evidence quickly, the manager should record the fallback reason and
continue directly while preserving the Situ task and experiment handoff records.
The judge can then evaluate whether the fallback was credible and whether Situ
still improved the run.

The LLM judge launches Codex in non-interactive mode with a judgment prompt and
asks it to return structured JSON with an overall score and facet results. The
judge reads the goal, workspace summary, terminal command output, Situ status,
Situ verification output, baseline records, experiment records, measurements,
worktree evidence, workspace result files, protected-file diffs, and git diffs.

The LLM judge should not penalize timeout by itself. It judges whether the root
manager used Situ as the durable record, established baseline evidence before
candidate work, ran a realistic autoresearch loop, used isolated worktrees
when appropriate, made a clear attempt to parallelize independent work through
native subagents or an explicit direct-work fallback, kept protected data
protected, left a checkpoint or final report when candidate measurements exist,
left evidence clear enough to understand how far the run got, and demonstrated
product advantage over a plain `/goal` prompt without Situ records.

The LLM judge returns:

```ts
{
  score: number; // 0..1
  verdict: "pass" | "fail" | "inconclusive";
  rationaleMarkdown: string;
  strengths: string[];
  problems: string[];
  facets: {
    name: string;
    score: number; // 0..1
    verdict: "pass" | "fail" | "inconclusive";
    rationaleMarkdown: string;
  }[];
}
```

The Evalite score for the LLM judge is the returned `score`. The full judge
result, including facet scores, is stored as scorer metadata.

## Future Seeded Worlds

This ADR starts with from-scratch workspace copies. The same harness should be
able to support later cases that start in the middle:

```text
preseeded Situ project
  -> active task
  -> partial experiment/evidence/report records
  -> local agent resumes from existing Situ state
  -> LLM judge checks continuation quality
```

Do not add a second harness for seeded worlds. Add case setup modes to the same
Evalite task when those evals are introduced.

## Boundaries

Do not make `mise run check` run real LLM evals.

Do not require provider API keys for this first eval. The selected local agent
CLI should use the user's existing local authentication or subscription.

Do not add managed-agent runtimes, schedulers, leases, provider profiles, or
workflow engines to Situ.

Do not add a scaffolded eval coordinator that creates baseline, worker, or
synthesis phases outside the root local-agent manager.

Do not treat a mocked judge as product-quality evidence.

Do not put deterministic CLI regression tests back into `projects/evals/`.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
bun test projects/evals/src/codex.test.ts
bun test projects/evals/src/terminal
bun x tsgo --noEmit -p tsconfig.json
mise run evals
mise run e2e-tests
mise run check
git diff --check
```

`mise run evals spelling-corrector` narrows the real product eval to one case.
It runs the root manager for up to 10 minutes by default, requires a working
local agent CLI, and may spend model time, so it is not part of the normal
implementation gate.

## Consequences

Situ now has an eval shape that tests the desired product loop instead of only
testing library code:

```text
local coding agent
  -> starts one native /goal terminal run
  -> uses situ like a human-facing CLI
  -> works in a realistic autoresearch workspace
  -> optionally fans out bounded native subagents
  -> isolates candidates in git worktree branches
  -> leaves durable records
  -> produces repo changes, metrics, and reports
  -> gets judged by another LLM
```

This keeps Evalite as the eval runner, local agent CLIs as the manager runtime,
Codex as the default manager and judge runtime, and Situ as the durable system
of record.

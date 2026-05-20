# Evals

Real LLM evals for Situ's autoresearch product behavior.

Every eval is expected to exercise a realistic agent-facing workflow and use at
least one LLM judge. Deterministic CLI and integration checks belong in
`projects/e2e-tests/`.

Run the real local-agent eval suite with:

```bash
mise run evals
```

Run one case by passing its id as an argument:

```bash
mise run evals branching-normalizer
```

Useful optional environment variables:

```bash
SITU_CODEX_EVAL_MODEL=<model>
SITU_CLAUDE_EVAL_MODEL=<model>
SITU_CLAUDE_EVAL_PERMISSION_MODE=dontAsk
SITU_CLAUDE_EVAL_EFFORT=medium
SITU_AGENT_EVAL_DRIVER=codex
SITU_AGENT_EVAL_TIMEOUT_MS=600000
SITU_CODEX_JUDGE_MODEL=<model>
SITU_CODEX_JUDGE_TIMEOUT_MS=300000
SITU_EVAL_OUTPUT_PATH=projects/evals/.runs/latest-results.json
```

The suite uses Evalite as the runner, one terminal-native root local-agent
manager as the agent under test, and Codex as the LLM judge. Workspace cases
live under `projects/evals/workspaces/`; the runner copies each workspace
under an isolated `SITU_HOME/evals/workspaces` directory, initializes git
there, puts a local `situ` shim on `PATH`, then launches the selected local
agent CLI in a pseudo-terminal and submits:

```bash
/goal Read <manager-prompt.md> and execute it as the full Situ autoresearch eval goal.
```

The eval harness does not create Situ projects, baselines, tasks,
experiments, worktrees, or worker processes. The local agent owns the full
autoresearch loop through ordinary `situ` and `git` commands, like a user
started a native `/goal` in the prepared folder. After the root manager has
created the dynamic baseline and candidate records, the manager prompt strongly
prefers parallel native subagents for independent candidate work when the
selected local agent supports them. The harness still does not hard-code or
spawn worker phases; direct root-manager work remains a visible fallback when
subagents are unavailable, the work is sequential, or delegation is too costly
for the remaining budget.

The spelling-corrector eval asks the root manager to run real autoresearch
until the external timeout cuts it off. The default manager timeout is 10
minutes; the judge then scores how far the run got from Situ records, worktree
branches, harness output, repository diffs, and final artifacts if any were
written before cutoff. Deterministic scoring is supporting evidence only; the
Codex LLM judge returns facet scores for baseline discipline, delegation,
research quality, evidence clarity, protected-data safety, and whether Situ
made the run meaningfully better than a plain `/goal` prompt.

The branching-normalizer eval is the advanced lineage case:

```bash
mise run evals branching-normalizer
```

It asks the root manager to create a dynamic baseline, create sibling
candidate tasks/experiments/worktrees, produce focused candidate commits, then
create a follow-up synthesis experiment from the best candidate branch and use
`git cherry-pick -x` to bring useful commits from sibling branches into one
combined branch. Candidate branch work should use native parallel subagents
when available, while synthesis and final acceptance remain root-manager
decisions. The LLM judge runs after that evidence is collected.

---
name: adr-driven-development
description: Guide Situ development through target-state ADRs, subagent critique or implementation, explicit verification, and local commits. Use when adding features, changing architecture, updating tooling or policies, or continuing the ADR-by-ADR rebuild process.
---

# ADR-Driven Development

## Purpose

Use this workflow to develop Situ from source-of-truth ADRs rather than hidden
conversation context. Each change should make the active ADR set more capable of
rebuilding the same target state from scratch.

The loop is:

```text
write or update one ADR
  -> validate the ADR as target-state documentation
  -> hand that ADR to subagents with minimal context
  -> review critique or code changes
  -> refine ADR/code until the repo satisfies the ADR
  -> run focused and root checks
  -> commit locally
  -> continue with the next ADR
```

## Source Order

Treat `.agents/adrs/` as the source of truth.

Treat `.agents/adrs_reference/` as historical context only. Do not use it to
fill gaps in active ADRs unless an active ADR explicitly points there.

Do not rely on architecture docs, old plans, chat memory, or private rationale
as requirements. If a future implementer needs to know something, put it in an
active ADR.

## ADR Authoring

Create or update the ADR before implementation when the change affects product
behavior, package structure, public contracts, tooling, tests, evals, release,
or policy.

Use the next numeric ADR filename:

```text
.agents/adrs/NNNN-<category>-<short-title>.md
```

Allowed categories are defined by ADR 0000 and enforced by
`scripts/check_adrs.ts`.

Write ADRs as target-state decisions, not migration recipes. Prefer:

```text
The CLI exposes `situ tasks current`.
```

Avoid:

```text
Add `situ tasks current`.
Update the current implementation.
The previous placeholder is replaced.
```

Make each ADR self-contained enough that an implementer can read it and make
the correct change without knowing the conversation that produced it.

Every ADR should usually include:

- context: why this decision exists
- decision: the target state
- contract: public API, CLI shape, data model, behavior, or tooling rule
- tests/checks: concrete evidence expected
- boundaries: what this ADR explicitly does not add
- consequences: how this narrows future choices

## Subagent Loop

Use subagents when the current environment permits delegation and the user has
asked for the ADR/subagent process. If subagents are unavailable, continue
locally and record that limitation in the final summary.

Give subagents only the ADR they need plus generic repository instructions. Do
not tell them the expected answer, hidden rationale, or conclusions from prior
discussion.

Default subagent prompt for critique-only ADRs:

```text
Read `.agents/adrs/NNNN-...md` as the source-of-truth decision. Do not read
`.agents/docs` or architecture summaries. Do not modify files.

Critique whether the ADR is self-contained and implementable. Ask or answer
probing questions that are not explicitly spelled out in the ADR. Report any
missing requirement, ambiguity, hidden-context wording, or unnecessary concept.
```

Default subagent prompt for implementation ADRs:

```text
Read `.agents/adrs/NNNN-...md` as the source-of-truth decision. Do not read
`.agents/docs` or architecture summaries. Update the repository so code and
tests satisfy that ADR.

Your write ownership is limited to <paths>. You are not alone in the codebase;
do not revert unrelated edits, and adapt to the current state.

Run the most relevant focused checks you can. Report changed files, checks run,
and any remaining gaps.
```

If an ADR explicitly references earlier ADRs, allow the subagent to read those
named ADRs. Otherwise, keep the handoff focused on the one ADR.

Use explorers for critique, audits, and codebase questions. Use workers for
bounded implementation with clear write ownership. Split workers only when the
write scopes are disjoint.

## Main Agent Responsibilities

Do not wait passively if a subagent is running. Use the time to inspect
non-overlapping code, identify likely verification commands, or review related
contracts.

When a subagent returns:

1. Inspect `git status --short`.
2. Review the actual diff.
3. Compare the diff against the assigned ADR, not against memory.
4. Check for scope creep, hidden workflow engines, runtime concepts, or
   unrelated refactors.
5. Keep good changes, refine weak changes, and never revert unrelated user
   edits.
6. If the subagent misunderstood because the ADR was vague, fix the ADR and
   rerun critique or implementation as needed.

Do not accept passing tests as proof by itself. Tests are evidence only when
they cover the ADR requirement being claimed.

## Verification

Run focused checks first, then root checks.

Common focused checks:

```text
bun test <changed-test-file>
bun test <package-or-area>
cd <project-or-package> && mise run check
bun scripts/check_adrs.ts
bun x markdownlint-cli2 <changed-docs>
git diff --check
```

Run the root gate before committing any completed ADR slice:

```text
mise run check
```

Run coverage when the change affects tests, coverage policy, evals, core flows,
or when finishing a larger goal:

```text
mise run coverage
```

If a hook is missing or unavailable, do not treat that as success. Rely on the
explicit commands above and mention the hook limitation in the summary when it
matters.

## Commit Discipline

Commit locally after each ADR slice is actually complete.

Before committing:

```text
git status --short
git diff --check
```

Stage only relevant files. Use concise commit messages shaped like:

```text
docs: define <decision>
feat: implement <behavior>
test: cover <case>
chore: wire <tooling>
fix: enforce <contract>
```

Do not push unless the user explicitly asks.

## Completion Audit

Before declaring a large ADR-driven goal complete:

1. Restate the goal as concrete deliverables.
2. Build a checklist mapping each explicit requirement to evidence.
3. Inspect real evidence: files, diffs, command output, tests, coverage,
   subagent reports, and clean git state.
4. Run an ADR-only subagent audit when possible:

```text
Read active ADRs in `.agents/adrs/*.md` as the only source of truth. Do not
read `.agents/docs` or architecture summaries. Inspect the repository for
concrete mismatches, missing requirements, hidden-context wording, or
unnecessary concepts. Do not modify files. Report only actionable gaps.
```

Then:

- fix any concrete gap and commit it
- confirm the working tree is clean
- report the final checks and commits

Only mark a goal complete after the audit shows no required work remains.

## Failure Modes

If subagents ask questions that the ADR cannot answer, improve the ADR rather
than answering from memory.

If implementation reveals a better target state, update the ADR first, then
adjust code.

If an ADR describes steps instead of end state, rewrite it into target-state
language.

If tests pass but the ADR asks for untested behavior, add or update tests.

If a change starts introducing workers, schedulers, leases, provider sessions,
or hidden orchestration, stop and check the active ADRs. Situ prefers visible
records, CLI commands, notifications, comments, and human-like handoffs.

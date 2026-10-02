---
name: research-with-situ
description: Read prior research and record experiments, runs, evidence, or findings in a local Situ workspace. Use alongside the agent host's normal communication tools.
---

# Research with Situ

Situ keeps durable research context. Continue organizing, messaging, and delegating through the tools available in
your agent host. Situ records do not start jobs, reserve compute, or authorize external actions.

Use `pnpm situ health` from the Situ checkout to confirm the local service. `SITU_URL` defaults to
`http://127.0.0.1:4317`. Read [the API guide](../../../docs/api.md) for command examples and pagination.
Use `pnpm situ schema` for the current executable schema rather than reconstructing fields from memory.

## Contribute useful evidence

Begin with `pnpm situ context PROJECT_ID relevant terms`. Read full linked records, including negative results and
counterevidence, before treating the brief as a conclusion. Its excerpts are bounded and mechanically selected.
Inspect omission counts and shorten an empty keyword query. A known record ID also retrieves its research neighborhood.
A brief is a starting point for reading linked records.

An experiment can start as a title and a short description. Keep its distinguishing variable and comparison clear.
Use independent records for parallel alternatives. A `derived_from` link preserves the parent revision used.
Put source snapshots, input hashes, external run IDs, and commands in run metadata or artifact references as useful.
Keep artifacts in durable locations; Situ stores references without copying their bytes. Use `format: "table/v1"`
and a SHA-256 for small before/after or outcome tables that humans should inspect in the UI.

Record meaningful transitions and findings as you work. Share concise findings and record IDs through native agent
messaging when they help peers. Continue investigating, reproducing, or following counterevidence while the user's
task remains active. Finishing a report is not itself a research stopping condition. Respect the task's budget and scope.

Use findings for claims with scope and limitations. Link supporting and contradictory evidence explicitly.
Use notes for informal observations, human feedback, or proposed next steps. Keep work status separate from assessment.
Tags can express phases or research themes without imposing a universal pipeline.

For metrics, keep comparison conditions explicit in `cohort`. Distinguish seeds/runs and use a new cohort when the
dataset, grader, game version, or evaluation conditions change. Give unlike objectives distinct metric names.
Record same-step compute coordinates when update counts are not comparable. Qualitative research needs no invented scores.
Use the evaluation outcomes panel to select individual final runs and an exact metric/cohort. A shared experiment can
contain several methods; grouping all its runs into one average can hide the comparison it was designed to test.
Findings show comparisons from explicitly linked experiments. Lead with a short conclusion, then retain detailed
evidence in the expandable body. Optional immediate-parent labels describe that checkpoint only; follow saved
revision links to inspect earlier training ancestry.

## Safe concurrent writes

Submit JSON through `pnpm situ command FILE` (or stdin with `-`). Save the command's explicit requestId before sending.
Retry an uncertain write with identical content and the same ID. A new ID can duplicate an operation.
Read the latest revision before editing. On 409, inspect what changed and reconcile; do not blindly retry with a newer
revision. Arrays and metadata replace their previous values when supplied. Omitted patch fields remain unchanged.

Keep the project summary and key findings readable for a returning agent. Preserve original evidence when an
interpretation changes. Describe what is now believed, what remains uncertain, and which experiment would resolve it.

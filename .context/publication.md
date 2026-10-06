# Human accounts of research

Research agents own operational state: projects, topics, work, posts, reviews and jobs. Curators own a separate publication document. The publication is an explanation of the evidence, with explicit sources and uncertainty. It cannot grant research acceptance or change a work claim.

## Models

- **Page**: one overview or a focused research question. A sourced summary and a sequence of statements, figures, next tests and related-page links. Stable IDs survive edits and archiving.
- **Update**: a result, decision, contradiction, blocker or correction. Published updates are immutable; a correction links to the earlier update.
- **Figure**: a comparison, curve, scenario matrix, paired replay, annotated image, source timeline or evidence relationship view. Its sources and caption travel with it.
- **Source snapshot**: immutable project-scoped records and a journal watermark. References identify both snapshot and record. Uploaded assets have verified hashes; the snapshot pins their metadata and typed dataset.
- **Draft and release**: one shared draft per project with optimistic revision checks; one immutable release manifest containing the coherent set of pages, updates and figures. This keeps publication atomic without a separate transaction system for each block.

Capturing old project/topic briefs seeds an unpublished draft, never an accepted conclusion. Existing operational records remain in place. Curators can use `recordIds` to capture only needed sources when a project outgrows the bounded default capture. Earlier snapshots remain referenceable.

## Ownership and cadence

Give one or a few named sessions curator authority. Multiple curators can work on a project, but conflicting draft revisions must be reconciled. No hidden merge or last-writer-wins publication.

Material research changes coalesce into one open curation inbox item per curator and project. Presence heartbeats and publication edits do not create curation loops. Publishing resolves only changes covered by the release watermark. Newer evidence remains pending. The agent or harness checks `situ next`; this service does not invoke or wake a model.

A curator reads changes, checks decisive artifacts, states what changed and what remains uncertain, then chooses the smallest useful presentation. Routine activity does not need a feed item. Use a figure when it helps someone compare measurements, inspect behavior or understand a relationship. Use an update when understanding or the next action changed.

## Truth and freshness

A release pins sources and never silently rewrites itself. New observations do not mutate old charts. The UI keeps the account being read stable until the person opens the new account. Current job counts are a separate live signal. Changed cited records and pending research changes remain visible.

An accepted-review label requires an accepted research review that is still current at publication. The figure validator checks data compatibility and source existence; it cannot establish that a sentence is scientifically justified. That remains curator and reviewer work. All numerical results come from registered datasets. Missing values remain distinct from zero; intervals are shown only when supplied.

## Composition

Use one readable sequence per page. Overview → focused question → source is the main path. Timeline is an optional separate view; it is not a completion meter. Updates contain meaningful developments, not raw agent chatter. Operational screens live under Inspect.

`@json-render` renders a fixed catalog derived from the typed document. Agents do not submit React, HTML, D3 programs, remote embeds, URLs or arbitrary component trees. New figure types require a schema, validator, renderer and example together. Base UI owns select/tooltip interactions; visx scales position measured data. See [design.md](design.md) for visual constraints and [publishing guide](../docs/publishing.md) for commands.

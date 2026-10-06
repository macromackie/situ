# Implementation and verification

Situ's celld 0.6.1 rewrite keeps research coordination and curated human publications separate. The schema 1 → 2
migration adds publication and asset tables without replacing research records or workspace identity. Existing
runtime data must be backed up before migration; runtime paths and credentials are local operational state.

## Verification

`SITU_LAB=/path/to/macromackie-lab mise run check` runs type checking, unit tests, the production build and live integration.

- Tests cover ownership fencing, concurrent workers, exact retries, requests, independent review, focus backpressure,
  publication revisions, immutable updates, scoped sources, figure compatibility and schema migration.
- A mutation removing cohort compatibility was caught by the retained validation test.
- Real celld verification covers 30 sessions, publication commands, hashed R2 uploads, range reads, restart,
  exact retry, origin enforcement and backup/restore of releases and media.
- Actual Lab execution verifies source capture, shared admission, durable receipts, hashed evidence,
  coordinator cancellation and supervised agent exit.
- Storybook builds all seven figure types, page composition, controls and missing-media examples.
- Browser verification covers desktop and narrow layouts, scenario selection, source inspection and focus
  restoration, question navigation, replay playback, timelines and updates. New releases offer explicit refresh;
  service interruptions preserve the readable account.

The [publication reference](publication-example.jpg) uses synthetic observations and media.

## Integration boundaries

New research uses `situ run` around Lab's external runner. Use a direct experiment command inside it; a second
admission-owning command would acquire the same pool twice. Historical Lab outboxes are not translated into the new API.

Claude project skills live under `.claude/skills` and point to the canonical `.agents/skills` instructions.
A committed Lab checkout pins the Situ revision, installs dependencies and starts a co-located service.
Neither project includes credentials, old campaigns, local databases, game policies or replay bytes in its setup state.

Model attention still requires a harness or an agent checkpoint (`situ next`). Alarms and curator obligations queue
work; they do not launch or interrupt a model. Publication validation establishes structural consistency, source
existence and comparison compatibility. Curators and reviewers judge whether prose accurately explains the evidence.
See [publishing](../docs/publishing.md) and [operations](../docs/operations.md).

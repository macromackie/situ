---
name: situ-publication-models
message: Keep human accounts small, sourceable and independent of operational state.
---

# Publication vocabulary

Page, Update and Figure are presentation models. Their IDs are stable within a project. Publishing uses an immutable release manifest and optimistic draft/release revisions. An archive retains the page and its links.

A source reference identifies an immutable source snapshot, record and relationship. It cannot be a filesystem path, remote URL or executable selector. Observations and interpretations need sources; proposals remain visibly distinct. A review badge identifies an actual accepted research review, never a curator-defined acceptance flag.

Figures use the closed discriminated union. Numerical figures reference typed uploaded datasets with metric, unit, direction, evaluator, environment, cohort, series, scenarios, sample counts and optional intervals. Replay conditions and selected intervals are explicit. Curated relationship edges describe research relationships; their visual position must not imply causality or duration.

Unknown fields and arbitrary code are rejected. Add a new primitive only with validation, a renderer and a realistic example. Do not grow the model to mirror raw operational events.

Checks: protocol types; publication and dataset validation tests; Storybook figure examples.

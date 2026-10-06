---
name: situ-review
description: Independently inspect a Situ conclusion against its frozen prediction, evidence and policy, and record acceptance or a specific correction.
---

# Review evidence

Read pending candidates with `situ next`. Follow the full work snapshot and evidence files. Verify hashes with `situ artifact FILE`. A receipt alone proves execution, not the claimed effect. Check matching evaluation conditions, baselines, units, held-out data, negative cases and uncertainty. Reproduce the decisive case when its importance warrants it.

You cannot accept your own candidate or work you owned. Do not join a second identity to bypass that rule. For an independent experiment, propose validation work with the prediction you are checking and save its actual evidence.

Use `review.decide` with accepted, needs_evidence, needs_correction or operational_failure and a short rationale tied to inspected evidence. Acceptance means the scoped claim is supported by this evidence; it is not universal truth or permission to scale compute. A negative result can be an accepted conclusion.

A changed project policy invalidates the old review basis. Ask the author/coordinator to withdraw the pending candidate and submit a fresh one. Never silently reinterpret the original criterion. Use `review.challenge` for material contrary evidence against an accepted conclusion; keep the earlier decision and its scope available.

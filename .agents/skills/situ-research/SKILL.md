---
name: situ-research
description: Propose, run, checkpoint and hand off experiments in Situ, preserving predictions and recoverable evidence.
---

# Research in Situ

Read the project focus and nearby topics before starting. Prefer the smallest test that distinguishes two explanations. Consider a simpler baseline, positive control, counterfactual or independent seed before adding machinery. Use online research when it can change the next experiment; record what it changed instead of accumulating summaries.

Propose work with a prediction, test, falsifier, captured source reference, budget and next step. Use `situ work propose --file plan.json`; preserve the prediction before examining results. A coordinator admits the work. Claim it with `situ work start ID`. Validation work can proceed when the result-review queue has filled; use that purpose only for actual validation.

Run a real probe early. `situ run ID --lab LAB --cwd SOURCE --timeout SECONDS -- COMMAND` captures source, checks the current claim, registers a job, and uses Lab's local execution admission. Keep datasets and immutable checkpoints outside source captures. Use relative source paths so the command runs the snapshot. The execution timeout is a chosen resource budget; research can continue through further justified experiments.

After each useful result, write a checkpoint with observations, evidence, next step and why continued work is worthwhile. Inspect actual outputs, difficult cases and matched cohorts. A heartbeat never substitutes for a checkpoint. Revise a plan explicitly when evidence changes the question; keep the old prediction visible. Ask a peer to test a competing explanation when repeated progress notes have no new evidence.

Finish with result, negative, inconclusive or operational_failure. Attach hashed evidence; use `situ artifact FILE` to create references. Submit a separate review candidate for an interpretation worth carrying forward. Execution success and scientific success are different.

On interruption, inspect `situ show ID`, its jobs, checkpoint and open requests. `situ run-status DIRECTORY` reads Lab ownership. `situ run-recover DIRECTORY` reconciles locks and receipts without relaunching. Do not launch again while a job is active or unknown. A new claim generation fences the former owner from work updates. Late observations belong in posts. Before handoff, save exact paths, blockers and the next actionable step.

Use `situ brief PROJECT` to catch up on the published understanding, then check its freshness and the relevant source records before acting. A curator's explanation cannot replace a review decision or current work ownership. Upload useful typed datasets and short diagnostic clips with `situ asset upload`; attach the original evidence to work as usual. State scenario, seed, environment and evaluation conditions so a curator can make a meaningful comparison.

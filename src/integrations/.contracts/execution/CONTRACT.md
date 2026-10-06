---
name: situ-execution
message: Coordinate execution through Lab without duplicating its resource ownership or relaunching uncertain jobs.
---

# Execution

Situ registers the current work generation before launching. Each launch has a unique job ID, source snapshot and receipt directory. Source is copied and hashed; changes run from that snapshot. Keep data, checkpoints and environments separate, referenced by immutable paths and hashes. Refuse source symlinks and oversized captures instead of silently omitting required files.

Lab owns CPU admission, execution locks, timeouts, process cleanup and its final receipt. The timeout is an explicit per-execution resource budget, not a research deadline. Situ owns the research plan and reporting intent. The wrapper does not provide a security sandbox; commands must not write to another agent's mutable checkout through absolute paths.

Keep transport failure separate from execution outcome. Preserve pending progress commands and final evidence. An unknown outcome blocks another launch until Lab's ownership locks and receipt are reconciled. Recovery never executes the command again. Do not rewrite terminal receipts whose hashes have already been published.

The legacy Lab record reporter targets the archived Situ API. New work uses `situ run` with Lab's external runner. Native task commands can run inside it with their own reporting disabled; importing their internal metrics into new typed series is not part of this core.

Checks: real Lab live probe; orphaned-job and cancellation tests.

# Rewrite, 2026-10-06

Old source, product, full stopped-service data and CLI were archived under ~/situ-old-reference. SHA-256 verification covered 19,033 product files, 19,391 Factory files and 4,754 data files. The original product checkout is preserved separately as original-situ. No old data or Lab artifacts were deleted.

New source: ~/situ. Runtime: ~/.local/share/situ-v2. Old runtime remains ~/.local/share/situ.

## Verification

- Type checking and 11 workflow/recovery tests: ownership fencing, 30 independent workers, exact retries, request delivery, review independence, focus backpressure, topic boundaries and event continuation.
- Real celld 0.6.1: concurrent sessions, service restart, exact retry, CLI backup/restore, observer assets and same-origin enforcement.
- Actual Lab execution: source capture, shared admission, durable receipts, hashed evidence, coordinator cancellation reaching the command process, and supervised agent exit.
- Observer: populated synthetic project/topic/work pages checked on desktop and at 390px width. Synthetic data stays outside the fresh main workspace.

## Owned local resources

This implementation task owns the observer at http://127.0.0.1:4317, rooted at ~/.local/share/situ-v2. It remains running so Scott can inspect the new workspace. Stop with `situ stop`; inspect runtime/process.json for the matching process identity. Review at the next Situ task or when this preview is no longer needed. Temporary test services and fixtures are removed after verification. Shared package caches are retained.

## Cutover boundaries

The installed CLI points to ~/situ/dist/situ.mjs. Research execution uses the new `situ run` adapter around Lab's external runner. Old Lab native record reporting is deliberately not translated. Model attention still requires a harness or agent checkpoint (`situ next`); alarms queue obligations but do not launch model turns.

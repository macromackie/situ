---
title: Live interface
description: Make live research understandable without losing reading or editing context.
---

# Live interface

## Rules

- Treat WebSocket frames as hints. Recover through durable snapshot/journal reads.
- Keep one client cache and readable data while reconnecting. Show failures alongside retained content.
- Keep table order stable during background updates and let the reader select comparisons.
- Hold the originally opened revision throughout an edit. A live update cannot authorize overwriting it.
- Keep source details and raw metadata below summaries.
- Render user text as text. Allow only artifact URI schemes accepted by the shared schema.
- Load table artifacts only on request, with byte/schema limits, omitted credentials, and hash verification.
- Use semantic controls, visible focus, labeled charts, and numeric equivalents for chart values.

## Checks

Open an edit, change the record from another client, and verify conflict reporting preserves the draft.
Restart the service and verify that records/navigation recover. Inspect desktop and narrow layouts.

---
name: situ-delivery
message: Preserve the exact intended write across transport failure and workspace changes.
---

# Delivery

Save each write before transmission, including command ID, endpoint, workspace and session. A retry resends that payload; it does not refresh revisions, substitute another session or relaunch execution. Preserve both failed and delivered intents. Secrets and session files are private local files and are never printed as command results.

Each agent uses its own explicit session file. An interrupted join retains its credential and command identity and can be resumed. A supervisor heartbeats only while its owned child process exists and records departure when that process exits. Process liveness is not proof of useful progress or model attention. The bridge advertises checkpoint-pull delivery; it does not claim autonomous model wakeups.

Snapshots require a stopped service and include durable runtime, client receipts and runner records. Restore into a fresh directory and preserve workspace identity. Never clear a database as a repair shortcut.

Checks: live CLI, service restart, retry and snapshot tests.

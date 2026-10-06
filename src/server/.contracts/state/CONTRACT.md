---
name: situ-state
message: Keep shared research consistent and recoverable without equating liveness with progress.
---

# State and coordination

The Workspace Durable Object owns state. A command validates its schema, workspace, caller, role, revision and claim before changing state. Its mutations, journal entry, obligations and receipt commit in one SQLite transaction. Network calls and experiments stay outside that transaction. Reusing a command ID with different content or identity fails.

A work claim carries a generation and renewable lease. Heartbeats renew only unexpired claims. Expiration makes takeover possible; it does not terminate an experiment or make its conclusion false. A successor reconciles active or unknown jobs before relaunch. A stale owner can post observations but cannot modify a successor's work. Replacing a session transfers outstanding obligations without silently completing them.

Inbox reads do not resolve requests. Ordinary subscribed posts coalesce into digests. Requests, stop notices, and review obligations retain their identity. Schedules persist before alarms are armed; replay cannot duplicate an occurrence. A due check-in asks for evidence and a next step. It blocks the next execution commitment, not an already running job.

Finished work and accepted conclusions are separate. Reviews retain the exact work snapshot, prediction, evidence hashes and policy revision. The candidate author and work owner cannot review their own conclusion. Policy changes require a fresh candidate. Contradictory evidence preserves the old decision and marks it challenged.

The service is local and trusted. Role checks prevent accidental misuse; they do not isolate mutually hostile processes sharing an OS account. Browser reads are available on loopback, writes require credentials, and cross-origin requests fail.

Checks: workflow and recovery tests; live celld restart and snapshot restoration.

# Architecture

Situ is one TypeScript package with protocol, service, CLI, harness bridge, Lab adapter and observer UI folders. `src/server/domain` owns communication, work and evidence transitions. The nearest contracts describe the boundaries; additional packages are unnecessary until a second consumer needs independent release or runtime ownership.

celld 0.6.1 hosts a Worker and one SQLite Workspace Durable Object. Current entities are stored as versioned JSON documents indexed by project and kind. Sessions, subscriptions, inbox, schedules, journal and command receipts have separate SQL tables. The append-only journal supports catch-up; it is not a second source of truth or a requirement to replay history to read the database.

Every write enters POST /v1/commands. Protocol schemas are shared with the CLI and available at /v1/schema. Transactions are synchronous and bounded to local data. Credentials are resolved before entry and live session authority is rechecked inside the transaction. Sessions have private bearer tokens; runners have credentials restricted to their own job progress.

A single persisted alarm is armed for the next check-in, lease expiry, reflection or runner observation deadline. Startup catches up overdue schedules. Actual model attention happens when the harness or agent calls `situ next`. The built-in bridge supervises a child process; it cannot inject model turns into arbitrary closed harnesses. No S2 service, message broker, distributed scheduler or cloud provider is required.

The observer reads the same current state. Its project, topic and work pages show focus, branch ancestry, active work, job state, preserved predictions, checkpoints, evidence and reviews. Berkeley Mono, thin ruled panels, quiet blue/slate color, compact navigation and an inset page preserve the technical-sheet style.

## Deliberate limits

- Local trusted users, one workspace, one DO. This is not a multi-tenant authentication system.
- One reply level. Link to a new topic for a separate investigation.
- Coordination can admit 30 agents while Lab admits fewer CPU jobs.
- Review judgments remain agent/human work. Hashes identify artifacts; reviewers must inspect and reproduce them.
- The old Lab native reporting API is not emulated. Its pending writes remain attached to the old workspace.
- Evidence files remain local references; the browser copies their paths. A separately authorized artifact server may expose verified image/video URLs. No arbitrary local-file server is installed.
- No autonomous model launch, paid execution or leaderboard submission.

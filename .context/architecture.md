# Architecture

Situ is one TypeScript package with protocol, service, CLI, harness bridge, Lab adapter and web folders. `src/server/domain` owns communication, work and evidence transitions. `src/server/publication` owns the separate human account. No independently released packages are needed for the current local application.

celld 0.6.1 hosts a Worker, one SQLite Workspace Durable Object, and a local R2 evidence bucket. Operational entities remain versioned JSON documents indexed by project and kind. Sessions, subscriptions, inbox, schedules, journal and command receipts have separate tables. Publication drafts, immutable releases, source snapshots and registered assets have their own tables. Ordered migrations preserve the existing workspace and receipts.

State commands use POST /v1/commands. Their mutations, journal entries, obligations and receipts commit atomically. Protocol schemas are shared with the CLI and exposed at /v1/schema. Credentials are resolved before entry and authority is rechecked inside the transaction. Sessions have private bearer tokens; runners are restricted to their own job progress.

Artifact uploads use POST /v1/assets. The service bounds and hashes the bytes, validates their type and dataset schema, writes the content-addressed object, then registers it in SQLite. Retrying identical content and metadata returns the existing asset. A failed registration may leave an unreferenced object; no automatic collection deletes evidence. Reads are by registered asset ID, never arbitrary local path or remote URL. Byte-range responses support video seeking. Full stopped-runtime backups include SQLite and R2.

A single persisted alarm tracks check-ins, leases, reflections and runner observation deadlines. Startup catches up overdue schedules. The agent or harness calls `situ next` to turn an obligation into model attention. The foreground bridge supervises a child process; it cannot inject turns into arbitrary closed harnesses. No S2 service or distributed scheduler is required.

The main UI reads publication models and pinned evidence. Raw operations remain under Inspect. [Publication](publication.md) describes the data model and curation flow. [Design](design.md) defines the visual language.

## Deliberate limits

- Local trusted users, one workspace, one DO. Loopback reads are visible to the local user; this is not multi-tenant isolation.
- One reply level in research discussion. Link a new topic for a different investigation.
- Situ can coordinate 30 agents while Lab admits fewer CPU jobs.
- Review judgments remain agent/human work. A verified hash identifies bytes; it does not prove their scientific meaning or a video's declared conditions.
- A command/dataset is bounded to 1 MiB, a source capture to 8 MiB and a media asset to 32 MiB. Use selected source IDs and short diagnostic clips. The typed catalog also bounds composition size; these do not limit experiment duration.
- Old Lab native reporting is not translated. Its pending writes stay attached to its original workspace.
- No autonomous model launch, arbitrary agent code in the browser, paid execution or leaderboard submission.

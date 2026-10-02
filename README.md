# Situ

A local research workspace for humans and agents. Track questions, experiments, runs, findings, and evidence
without prescribing an agent hierarchy or research method. A live dashboard makes the shared record easy to follow.

## Run locally

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm build
mise exec -- pnpm start
```

Open <http://127.0.0.1:4317>. In another terminal, `mise exec -- pnpm demo` creates a synthetic example project.
The demo makes no claim about paintbot performance. Create a separate project for actual research.

`SITU_PORT` changes the server port. `SITU_DATA_DIR` changes the storage directory.
`SITU_URL` points CLI commands at another local instance. Defaults: port 4317 and `~/.local/share/situ`.
Stop with Ctrl-C. Rebuild and restart after source changes. The same data directory preserves research across
restarts and factory/product checkouts. Run only one server per data directory.

All records, saved revisions, and measurements are local in celld's `.celld/dev` below the data directory.
Artifact entries reference existing files or URLs; Situ does not copy or verify those bytes yet.
Stop the service before copying its complete data directory for a physical backup. Never use celld's `--clean` on research data.

The server binds to loopback and checks request host and browser origin. It is a trusted, single-user local app,
with no multi-user authentication or remote deployment mode. No Cloudflare account is involved.

## Agent interface

```sh
pnpm situ schema
pnpm situ command command.json
pnpm situ snapshot
pnpm situ context PROJECT_ID "observation history"
pnpm situ record RECORD_ID
pnpm situ changes 0 RECORD_ID
```

Commands require explicit `requestId` and `actor` fields. Retry uncertain writes with exactly the same command and ID.
Updates require the observed `revision`; a 409 means read and reconcile before submitting another command.
See [docs/api.md](docs/api.md) and the [research skill](.agents/skills/research-with-situ/SKILL.md).

## Development

Run `pnpm check` for types, formatting, persistence tests, and the production build.
This repository is a selected product export. Development context and concurrency evaluations remain in the Factory.

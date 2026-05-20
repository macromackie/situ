---
status: active
category: tooling
created: 2026-05-13
---

# 0006. Tooling: Bun, TypeScript, and Mise

## Context

Situ should have one obvious local command surface. Humans and local agents
should not need to remember different package-manager commands for the root,
projects, and packages.

Tooling should make the codebase easy to check mechanically before policy
review. The repo should prefer fast tools that agents can run often.

## Decision

Use Bun as the JavaScript runtime and package manager.

Use mise as the repository command surface. The root `mise.toml` is the most
important entry point and should be able to run all project and package checks.
Projects and packages must also have their own `mise.toml` files for local
commands when they contain code.

Use the TypeScript native preview package as the primary type checker so the
repo tracks the TypeScript 7 line:

```text
@typescript/native-preview -> tsgo
```

Use Oxlint and Oxfmt for TypeScript linting and formatting.

Use markdownlint, typos, actionlint, and fallow for meta-layer curation.

Oxlint is configured as a strict TypeScript lint gate. Correctness and
suspicious findings are errors. TypeScript hygiene, import hygiene, promise
hygiene, React hook correctness, and node-protocol conventions are explicit
rules in `.oxlintrc.json`; suppressions should be narrow and local to the file
class that needs them.

Fallow is the codebase intelligence tool for unused code, dependency hygiene,
duplication, complexity hotspots, and architecture drift. The default
non-mutating Fallow check in `mise run check` enforces the dead-code and
dependency graph gate. The repository also exposes changed-file audit, fix, and
baseline tasks so local agents can use the same tool for duplication,
complexity, and cleanup work without inventing separate commands.

Actionlint validates GitHub Actions workflow YAML. Because CI and release
automation are part of Situ's installability contract, workflow syntax is part
of the full local gate.

Use Bun's test runner for TypeScript tests.

Use Lefthook for local git hooks. Lefthook is a development dependency, and its
tracked config delegates to the same mise commands documented here.

The pre-commit hook runs the full non-mutating root gate with `mise run check`.
The pre-push hook has no Situ-specific gate; by the time code reaches push, the
local hook policy expects the complete check to have happened at commit time.

## Package Manager

The root `package.json` owns the Bun workspace:

```json
{
  "packageManager": "bun@1.3.14",
  "workspaces": [
    "projects/app",
    "projects/app/packages/*",
    "projects/evals",
    "projects/evals/packages/*",
    "projects/e2e-tests",
    "projects/e2e-tests/packages/*"
  ]
}
```

Use Bun workspace package references for internal packages:

```json
"@situ/common": "workspace:*"
```

Do not use `npm run` inside repository scripts. Scripts should call the tool
directly so they work through `bun run`, `mise run`, and package-local task
wrappers. For tools installed by mise instead of `devDependencies`, package
scripts may delegate to the matching `mise run` task so the pinned toolchain is
used consistently.

## Tool Versions And Sources

Pin tool versions in the files that install them:

| Tool                      | Source                           | Version                |
| ------------------------- | -------------------------------- | ---------------------- |
| Bun                       | `mise.toml` and `packageManager` | `1.3.14`               |
| TypeScript native preview | `devDependencies`                | `7.0.0-dev.20260513.1` |
| Bun types                 | `devDependencies`                | `1.3.14`               |
| Oxlint                    | `devDependencies`                | `1.64.0`               |
| Oxfmt                     | `devDependencies`                | `0.49.0`               |
| markdownlint-cli2         | `devDependencies`                | `0.22.1`               |
| fallow                    | `devDependencies`                | `2.73.0`               |
| Lefthook                  | `devDependencies`                | `2.1.6`                |
| typos-cli                 | `mise.toml`                      | `1.46.1`               |
| actionlint                | `mise.toml`                      | `1.7.12`               |

Do not install the npm package named `typos`; it is not the typo checker used
by this repo.

## Root Commands

The root command surface must include:

```text
mise run update
mise run check
mise run format
mise run format:check
mise run typecheck
mise run lint
mise run test
mise run markdownlint
mise run typos
mise run actionlint
mise run fallow
mise run fallow:audit
mise run fallow:fix
mise run fallow:baseline
```

`mise run check` is the default full local gate. It must be non-mutating and
run format check, lint, markdownlint, typos, actionlint, fallow, typecheck, and
tests.

`mise run update` installs dependencies and refreshes the lockfile with Bun. CI
and release checks should use a frozen install once CI exists.

Root commands may delegate to small scripts in `scripts/` when shell glue is
clearer than a long inline task. Scripts must stay thin and boring.

The root `tsconfig.json` must include every TypeScript source and test file in
the workspace so root `typecheck` covers all projects and packages.

## Command Contract

Root commands:

| Command           | Mutates files | Underlying command                                                           |
| ----------------- | ------------- | ---------------------------------------------------------------------------- |
| `update`          | yes           | `bun install`                                                                |
| `format`          | yes           | `bun x oxfmt . --write`                                                      |
| `format:check`    | no            | `bun x oxfmt . --check`                                                      |
| `lint`            | no            | `bun x oxlint . --deny-warnings --report-unused-disable-directives`          |
| `markdownlint`    | no            | `bun x markdownlint-cli2`                                                    |
| `typos`           | no            | `typos --force-exclude`                                                      |
| `actionlint`      | no            | `actionlint`                                                                 |
| `fallow`          | no            | `bun x fallow check --config fallow.config.json`                             |
| `fallow:audit`    | no            | `scripts/fallow-audit.sh` defaults to `--changed-since HEAD`                 |
| `fallow:fix`      | yes           | `bun x fallow fix --config fallow.config.json`                               |
| `fallow:baseline` | yes           | save Fallow baselines under `.fallow/`                                       |
| `typecheck`       | no            | `bun x tsgo --noEmit -p tsconfig.json`                                       |
| `test`            | no            | `bun test`                                                                   |
| `check`           | no            | format check, lint, markdownlint, typos, actionlint, fallow, typecheck, test |

Project and package commands:

| Command     | Mutates files | Underlying command                     |
| ----------- | ------------- | -------------------------------------- |
| `check`     | no            | `mise run typecheck && mise run test`  |
| `typecheck` | no            | `bun x tsgo --noEmit -p tsconfig.json` |
| `test`      | no            | `bun test`                             |

## Project And Package Commands

Each project and package with TypeScript code should expose local commands with
the same names:

```text
mise run check
mise run typecheck
mise run test
```

Root tasks must expose namespaced wrappers for every project and package
`check`, `typecheck`, and `test` command. The target mental model is:

```text
root:     mise run check
project:  mise run app:check
package:  mise run app:tasks:test
local:    cd projects/app/packages/tasks && mise run test
```

Namespacing should be predictable: `<project>:<package>:<task>` for packages
and `<project>:<task>` for projects.

Canonical project slugs are `app` and `evals`. Package task namespaces use the
package directory name. If two projects contain packages with the same name,
the project slug disambiguates them.

## Configuration Files

The repository should keep explicit config files for mechanical tools:

```text
mise.toml
package.json
bun.lock
tsconfig.json
tsconfig.base.json
.oxlintrc.json
.oxfmtrc.json
.markdownlint-cli2.jsonc
_typos.toml
fallow.config.json
lefthook.yml
```

Project and package `tsconfig.json` files should extend the root base config.

Meta tools should scan source, ADRs, READMEs, scripts, configs, and skills.
They should exclude `node_modules`, `dist`, `coverage`, lockfiles, generated
files, binary artifacts, and fixture corpora that are intentionally noisy.
They may include narrow suppressions for tool limitations, but those
suppressions should name the specific package or path involved.

## Consequences

Tooling choices belong in this ADR and the files it names. Feature ADRs should
not introduce new package managers, linters, formatters, or test runners.

If a tool cannot enforce a style decision cleanly, later policy ADRs may cover
the remaining convention.

Local git hooks are convenience checks, not the source of truth. A missing or
skipped hook does not replace `mise run check`; agents and CI should still run
the explicit gate before claiming a completed change.

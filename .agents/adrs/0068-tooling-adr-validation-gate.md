---
status: active
category: tooling
created: 2026-05-14
---

# 0068. Tooling: ADR Validation Gate

## Context

ADRs are Situ's source of truth for rebuildability. ADR 0000 defines the
active ADR filename shape, frontmatter fields, allowed categories, allowed
statuses, date format, and reference expectations.

Those rules should not rely only on review memory. They should be checked by a
small local tool that runs in the normal repository gate.

## Decision

Add a root ADR validation script and wire it into `mise run check`.

Expected files:

```text
scripts/check_adrs.ts
mise.toml
package.json
tsconfig.json
```

The script validates every Markdown file in the active ADR folder:

```text
.agents/adrs/*.md
```

It does not validate `.agents/adrs_reference/`.

The phrase "active ADR folder" refers to `.agents/adrs/`, not only ADRs whose
frontmatter status is `active`. Files with `status: deprecated` are validated
too because they remain part of the active decision-history folder.

## Script Contract

Run the validator with:

```text
bun scripts/check_adrs.ts
```

The script must use only Bun/Node standard APIs. Do not add an npm dependency
for frontmatter parsing.

On success, it prints one concise success line and exits `0`:

```text
ADR validation passed: <count> files
```

On failure, it prints one line per validation issue to stderr and exits nonzero.
Each issue line should include the ADR filename or repository path and a short
message.

## Validation Rules

For every ADR file in `.agents/adrs/`:

- filename matches `NNNN-<category>-<short-title>.md`
- `NNNN` is exactly four digits
- numbers are unique
- numbers are strictly increasing when filenames are sorted
- gaps between numbers are allowed
- `<category>` is one of the allowed ADR categories
- `<short-title>` matches `[a-z0-9]+(-[a-z0-9]+)*`
- file starts with YAML frontmatter delimited by `---`
- frontmatter contains exactly these fields:
  - `status`
  - `category`
  - `created`
- frontmatter contains no extra fields
- `status` is `active` or `deprecated`
- `category` matches the filename category
- `created` is a real calendar date in `YYYY-MM-DD` format
- first Markdown heading matches `# NNNN. <title>`
- heading number matches the filename number
- heading title is non-empty after trimming

The heading title does not need to match the filename short title. ADR headings
may include category labels such as `Tooling:` or punctuation that would not be
valid in filenames.

## Frontmatter Parser Contract

The validator supports the narrow frontmatter subset used by this project:

```yaml
---
status: active
category: tooling
created: 2026-05-14
---
```

Accepted frontmatter lines are `key: value` pairs only.

Rules:

- the file must begin with `---`
- the closing `---` must appear before Markdown body text
- blank lines are allowed inside frontmatter
- lines beginning with `#` are allowed as comments and ignored
- values may be unquoted plain strings only
- quoted values are invalid
- duplicate keys are invalid
- unknown keys are invalid
- keys may appear in any order
- leading and trailing whitespace around keys and values is trimmed
- CRLF and LF line endings are both accepted

Allowed categories are:

- `heuristic`
- `context`
- `structure`
- `tooling`
- `policy`
- `contract`
- `feature`

Reference validation:

- strip fenced code blocks before scanning references
- find textual references with the case-sensitive regex
  `\bADRs?\s+([0-9]{4})\b`
- each referenced number must exist as an ADR file in `.agents/adrs/`
- self-references are allowed

The validator intentionally does not understand ADR ranges such as
`ADRs 0001-0003`. If an ADR uses a range, it should also include individual
references when mechanical validation matters.

Target-state prose validation from ADR 0083:

- applies only to files with `status: active`
- strips fenced code blocks and inline code spans before scanning
- reports narrow branch-local wording that makes an ADR read like a branch
  migration note instead of target-state architecture
- does not attempt to classify all possible prose quality issues

## Gate Wiring

Add a root mise task:

```toml
[tasks."adrs:check"]
description = "Validate active ADR metadata"
run = "bun scripts/check_adrs.ts"
```

Add a root package script:

```json
"adrs:check": "bun scripts/check_adrs.ts"
```

Add `mise run adrs:check` to `mise run check` before Markdown linting.

The root TypeScript config should include the script in addition to existing
source includes so normal typechecking covers it:

```json
"include": ["projects/**/*.ts", "scripts/**/*.ts"]
```

## Boundaries

Do not add a separate ADR database, generated manifest, or long-running watcher.

Do not validate implementation state, test status, owner fields, or any
frontmatter beyond `status`, `category`, and `created`.

Branch-local prose validation is allowed because ADR 0083 makes target-state
wording part of the active ADR contract.

Do not validate `.agents/adrs_reference/`.

Do not require network access.

Do not make the script rewrite ADR files.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
mise run check
git diff --check
```

## Consequences

The active ADR set becomes mechanically checkable. Future agents get immediate
feedback when an ADR filename, frontmatter block, date, category, status, or
ADR reference stops matching the project convention.

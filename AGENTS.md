# Agent Instructions

- For development work, use the project-local skill at
  `.agents/skills/adr-driven-development/SKILL.md`.
- Read active ADRs in `.agents/adrs/` in filename order before architecture
  or implementation work.
- Treat `.agents/adrs/` as the source of current target decisions.
- Treat `.agents/adrs_reference/` as historical context only; it should not
  guide new implementation work unless an active ADR explicitly says so.
- New or updated active ADRs must follow the policy in
  `.agents/adrs/0000-policy-adrs.md`, including filename category and required
  YAML frontmatter.
- Do not use ADR frontmatter to track implementation progress. Put current
  branch gaps in implementation plans, issues, or task records.
- Use `mise run check` as the canonical full local gate. `scripts/check.sh` is
  only a compatibility wrapper for tooling that expects a shell script.

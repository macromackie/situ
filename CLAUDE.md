# Situ for Claude Code

Read [AGENTS.md](AGENTS.md) and `.agents/skills/situ/SKILL.md` before research work.
Read `docs/operations.md` for service lifecycle and `docs/publishing.md` for the human account.
Use `situ help` and `situ schema COMMAND` for the current API. Each agent needs its own session.
Check `situ next` at experiment boundaries; the service does not invoke or wake models.

Lab owns execution. Use `situ run` for direct commands through its external runner. Avoid nested Lab admission.
Keep the service local, state outside source, and credentials out of commits. Preserve uncertain jobs and pending intents.
For a Claude/Lab setup, use Lab's `docs/claude-research.md` and pinned setup script.

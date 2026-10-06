---
name: situ
description: Join a Situ research workspace, read due work and requests, and coordinate durable research through its CLI. Use when working on research tracked in Situ.
---

# Situ

Use the installed `situ` CLI. Read `situ help` and the relevant `situ schema COMMAND` before unfamiliar writes. The [workflow guide](../../../docs/agent-workflow.md) has a complete example.

Join the intended project with a distinct name. Export the returned SITU_SESSION path only in this agent's commands. Do not replace a shared session file or borrow another agent's identity. Join starts with worker authority; the owner or coordinator grants other roles explicitly.

Run `situ next` at the start, after an experiment, before the next expensive commitment, and when a check-in is due. Use `situ next --wait` when idle. Read and resolve or explicitly defer requests; reading them does not discharge them. Ordinary posts and mentions wait in the inbox and should not interrupt focused work. Do not send duplicate native harness messages merely because you posted to Situ.

Keep a foreground harness under `situ agent -- COMMAND` when appropriate. The wrapper reports that process's liveness; it does not prove progress or wake a model. Otherwise call `situ heartbeat` at natural checkpoints. A lease expiring does not delete work or authorize relaunching a possibly live job.

Choose the responsibility needed:

- [Research](../situ-research/SKILL.md): small grounded experiments and recovery.
- [Coordinate](../situ-coordinate/SKILL.md): focus, admission, replacement and reflection.
- [Review](../situ-review/SKILL.md): independent interpretation and replication.
- [Curate](../situ-curate/SKILL.md): a readable human overview with source links.

Situ records research and coordination. Lab executes experiments. The harness owns model invocation and its own permission boundaries. Use current authorization for compute and external actions; admission is not a new spending permission.

# A first research loop

Start the service and install the CLI as described in the README. The following files are examples; choose a fresh project ID for actual research.

## Establish focus

Create `project.json`:

```json
{
  "id": "navigation",
  "title": "Navigation policies",
  "goal": "Improve held-out navigation success without increasing inference cost",
  "focus": "Establish a reproducible baseline on three fixed scenarios"
}
```

```sh
situ project create --file project.json --admin
situ join navigation --name coordinator
```

Export the returned session file as SITU_SESSION. The owner grants the coordinator role with `session.grant`, using the returned session ID:

```json
{ "sessionId": "SESSION_ID", "roles": ["worker", "coordinator"] }
```

```sh
situ command session.grant --file grant.json --admin
situ command topic.create --file topic.json
```

`topic.json` contains `projectId`, `title`, and `brief`. A child topic may also specify `parentId`. Each worker, reviewer and curator joins separately. Grant reviewer and curator roles the same way. Do not share session files or run all workers as admin.

## Predict, then run

A worker reads `situ next` and proposes a plan:

```json
{
  "topicId": "TOPIC_ID",
  "title": "Measure a simple navigation baseline",
  "purpose": "experiment",
  "plan": {
    "question": "Which fixed scenarios fail most often?",
    "prediction": "Narrow passages account for most failures",
    "test": "Run the same baseline on 20 frozen seeds in each of three scenarios",
    "falsifier": "Failure rates are comparable across scenarios",
    "source": "Git commit plus captured local changes",
    "budget": "One local CPU run, at most 300 seconds",
    "next": "Run the baseline and inspect three failing trajectories"
  }
}
```

```sh
situ work propose --file plan.json
```

The coordinator uses `situ work admit WORK_ID --file admission.json`, with a short `reason`. The worker then claims and executes:

```sh
situ work start WORK_ID
situ run WORK_ID --lab /path/to/macromackie-lab --cwd /path/to/probe \
  --timeout 300 -- python probe.py
```

The runner captures source before launch, registers the claim generation, and calls `uv run --locked --project LAB lab exec`. Lab owns its shared CPU queue, locks, execution budget and cleanup. Situ stores the research and receipts. Use a direct experiment entry point inside this wrapper. Do not nest `lab exec`, native `lab run`, or an admission-owning batch dispatcher: the outer command already holds an admission slot. Native commands save local evidence separately; their historical outboxes require an explicit legacy endpoint. The wrapper's external receipt and logs report to the new workspace.

Read the output and recorded evidence. A checkpoint contains `observed`, `next`, `continueReason` and `evidence`. The CLI fills the current generation and plan revision after reading the work, then the server validates them atomically.

```sh
situ work checkpoint WORK_ID --file checkpoint.json
situ next
```

A checkpoint does not need to pretend progress: “the test could not start because the input is missing” is useful evidence of an operational blocker. Change the plan explicitly with `work.revise`; old predictions remain visible.

## Discuss without interrupting

```sh
situ subscribe TOPIC_ID
situ post TOPIC_ID --file observation.md
situ ask REVIEWER_SESSION_ID --topic TOPIC_ID --file request.md
situ inbox
```

A post goes to the topic; subscribed updates coalesce. A mention is an explicit `mentions` list on `post.create`, not parsed from quoted text. A request is actionable and stays open until answered, declined or deferred. Use `inbox.read`, `inbox.resolve` or `inbox.defer`; `situ schema` supplies exact fields. Replies use `post.create.replyTo` and are one level deep. Start a linked topic for a distinct investigation.

Workers check after a coherent code step, after an experiment, before the next expensive launch and when a check-in is due. Idle workers use `situ next --wait`. The service stores obligations but does not itself wake a model. A foreground harness can run under `situ agent -- COMMAND`; the child process's lifetime controls presence heartbeats. Stop notices are visible at checkpoints; the Lab wrapper checks them every 30 seconds.

## Finish and independently review

Finish input contains `outcome`, `summary`, and at least one evidence reference:

```sh
situ artifact /absolute/path/to/evaluation.json --name "Frozen evaluation"
situ work finish WORK_ID --file outcome.json
situ review submit --file candidate.json
```

A candidate contains `workId`, `expectedRevision`, `claim` and evidence already attached to the work. The reviewer reads the frozen snapshot, checks/reproduces its evidence, and decides:

```sh
situ review decide REVIEW_ID --file decision.json
```

Decision input contains `decision`, `rationale`, and the reviewer's evidence. Completion is not acceptance. Negative or inconclusive work remains valuable. A policy change requires withdrawing the pending candidate and submitting a new basis. New counterevidence can challenge an accepted conclusion.

## Organize 30 agents

Start with a few active topics. Allocate workers to implementations and small probes, reviewers to independent tests, and one or two curators to the human overview. A coordinator keeps focus and admits the next commitments. Roles can overlap except for self-review. Agents can join, leave or be replaced without deleting work.

The project defaults to 3 active topics, 30 active work items, 8 pending reviews, a 5-minute renewable ownership lease, 20-minute check-ins and 30-minute reflection reminders. These are configurable. The lease and reminders are not limits on research duration. Lab separately controls CPU concurrency. Pending reviews block new experiment commitments, while validation work can still start.

The coordinator's reflection should change something when warranted: continue a promising branch, simplify the baseline, try a counterfactual, seek an outside source, or stop a weak direction. Curators publish separate pages, figures and updates with pinned sources so humans can follow what changed and why. See [Publishing](publishing.md).

import { ValidationError } from "@situ/errors";

import type { SituCliInvocation } from "./types.js";

export const rootHelpText = `Usage: situ [global-options] <command>

Global options:
  --json             Print machine-readable JSON output for data commands.
  --db <path>        Use a specific SQLite database path.
  --database <path>  Use a specific SQLite database path.
  --help             Show this help text.
  --version          Print the Situ CLI version.

Commands:
  help      Show this help text.
  version   Print the Situ CLI version.
  doctor    Check local CLI configuration without mutating state.
  runbook   Print the operating runbook for autoresearch runs.
  self-update  Update situ to the latest release.
  serve     Start the local Situ HTTP server.
  artifacts  Manage artifact records.
  baselines  Manage baseline records.
  briefings  Manage live briefing records.
  comments  Manage comments attached to records.
  events    Manage event timeline records.
  experiments  Manage experiment records.
  live      Manage live presentation records.
  measurements  Manage measurement records.
  notifications  Manage notification inbox records.
  projects  Manage project records.
  reports  Manage report records.
  reviews  Manage review records.
  status    Summarize project and repository work status.
  tasks     Manage task records.
  verify    Verify project and repository completion evidence.
`;

const helpTextByPath = new Map<string, string>([
  ["", rootHelpText],
  [
    "help",
    `Usage: situ help [command] [subcommand]

Show CLI usage for the root command, a command group, or a subcommand.
`,
  ],
  [
    "version",
    `Usage: situ version

Print the Situ CLI version.
`,
  ],
  [
    "doctor",
    `Usage: situ doctor

Check local CLI configuration without mutating state.
`,
  ],
  [
    "runbook",
    `Usage: situ runbook

Print the operating runbook for autoresearch runs. Read-only: prints plain text,
ignores --json, and never opens the database.
`,
  ],
  [
    "self-update",
    `Usage: situ self-update [--check]

Update situ to the latest GitHub release by re-running the installer.
  --check   Report whether a newer release is available without installing it.

Respects SITU_RELEASE_REPO, SITU_INSTALL_HOME, and SITU_BIN_DIR.
`,
  ],
  [
    "serve",
    `Usage: situ serve [flags]

Flags:
  --host <hostname>
  --port <0-65535>
`,
  ],
  [
    "live",
    `Usage: situ live <subcommand>

Subcommands:
  attempts  Start or publish live run-map attempts.
  signals   Create live signal records.
  nodes     Create live run-map node records.
  edges     Create live run-map edge records.
  focus     Create live focus records.
  details   Create live node detail records.
  list      List live presentation records for a project.
`,
  ],
  [
    "live attempts",
    `Usage: situ live attempts <start|publish> [flags]
`,
  ],
  [
    "live attempts start",
    `Usage: situ live attempts start [flags]

Required flags:
  --project-id <project-id>
  --node-key <key>
  --kind <baseline|branch|verification|finding|blocker|decision|result>
  --title <title>
  --summary <summary>
  --tone <neutral|good|watch|blocked|done>
  --body <markdown>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --occurred-at <iso-timestamp>
  --refs-json <json-array>
  --experiment-id <experiment-id>
  --baseline-id <baseline-id>
  --measurement-id <measurement-id>
  --from-node-key <key>
  --edge-key <key>
  --edge-relation <led_to|depends_on|blocked_by|supersedes|verifies>
  --edge-tone <neutral|good|watch|blocked>
  --edge-visibility <visible|hidden>
  --focus-mode <overview|node|comparison|blocked>
  --focus-summary <summary>
  --related-node-keys-json <json-array>
  --visibility <visible|hidden>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live attempts publish",
    `Usage: situ live attempts publish [flags]

Required flags:
  --project-id <project-id>
  --node-key <key>
  --kind <baseline|branch|verification|finding|blocker|decision|result>
  --title <title>
  --summary <summary>
  --tone <neutral|good|watch|blocked|done>
  --body <markdown>
  --metric-label <label>
  --metric-value <number>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --metric-name <name>
  --metric-unit <unit>
  --metric-direction <higher_is_better|lower_is_better>
  --occurred-at <iso-timestamp>
  --refs-json <json-array>
  --experiment-id <experiment-id>
  --baseline-id <baseline-id>
  --measurement-id <measurement-id>
  --from-node-key <key>
  --edge-key <key>
  --edge-relation <led_to|depends_on|blocked_by|supersedes|verifies>
  --edge-tone <neutral|good|watch|blocked>
  --edge-visibility <visible|hidden>
  --focus-mode <overview|node|comparison|blocked>
  --focus-summary <summary>
  --related-node-keys-json <json-array>
  --visibility <visible|hidden>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live signals",
    `Usage: situ live signals set [flags]
`,
  ],
  [
    "live signals set",
    `Usage: situ live signals set [flags]

Required flags:
  --project-id <project-id>
  --slot <slot>
  --label <label>
  --value <value>
  --tone <neutral|good|watch|blocked|done>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --id <live-signal-id>
  --summary <summary>
  --refs-json <json-array>
  --visibility <visible|hidden>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live nodes",
    `Usage: situ live nodes set [flags]
`,
  ],
  [
    "live nodes set",
    `Usage: situ live nodes set [flags]

Required flags:
  --project-id <project-id>
  --node-key <key>
  --kind <baseline|branch|verification|finding|blocker|decision|result>
  --title <title>
  --summary <summary>
  --tone <neutral|good|watch|blocked|done>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --id <live-node-id>
  --occurred-at <iso-timestamp>
  --refs-json <json-array>
  --visibility <visible|hidden>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live edges",
    `Usage: situ live edges set [flags]
`,
  ],
  [
    "live edges set",
    `Usage: situ live edges set [flags]

Required flags:
  --project-id <project-id>
  --edge-key <key>
  --from-node-key <key>
  --to-node-key <key>
  --relation <led_to|depends_on|blocked_by|supersedes|verifies>
  --tone <neutral|good|watch|blocked>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --id <live-edge-id>
  --visibility <visible|hidden>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live focus",
    `Usage: situ live focus set [flags]
`,
  ],
  [
    "live focus set",
    `Usage: situ live focus set [flags]

Required flags:
  --project-id <project-id>
  --mode <overview|node|comparison|blocked>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --id <live-focus-id>
  --primary-node-key <key>
  --related-node-keys-json <json-array>
  --summary <summary>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live details",
    `Usage: situ live details set [flags]
`,
  ],
  [
    "live details set",
    `Usage: situ live details set [flags]

Required flags:
  --project-id <project-id>
  --node-key <key>
  --body <markdown>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --id <live-detail-id>
  --facts-json <json-array>
  --refs-json <json-array>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "live list",
    `Usage: situ live list [flags]

Required flags:
  --project-id <project-id>
`,
  ],
  [
    "briefings",
    `Usage: situ briefings <subcommand>

Subcommands:
  create   Create a live briefing record.
  list     List briefing records for a project.
  recent   List recent briefing records.
  get      Show a briefing record.
`,
  ],
  [
    "briefings create",
    `Usage: situ briefings create [flags]

Required flags:
  --project-id <project-id>
  --title <title>
  --stage <orienting|baselining|exploring|evaluating|synthesizing|finalizing|complete|blocked>
  --assessment <on_track|watch|blocked|complete>
  --headline <markdown>
  --authored-by-kind <human|local_agent|system>
  --authored-by-id <id>

Optional flags:
  --id <briefing-id>
  --block-json <json-object>
  --blocks-json <json-array>
  --evidence-refs-json <json-array>
  --authored-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "briefings list",
    `Usage: situ briefings list [flags]

Required flags:
  --project-id <project-id>
`,
  ],
  [
    "briefings recent",
    `Usage: situ briefings recent [flags]

Flags:
  --limit <positive-integer>
`,
  ],
  [
    "briefings get",
    `Usage: situ briefings get <briefing-id>
`,
  ],
  [
    "baselines",
    `Usage: situ baselines <subcommand>

Subcommands:
  create   Create a baseline record.
  list     List baseline records.
  get      Show a baseline record.
  move     Move a baseline to a status.
`,
  ],
  [
    "baselines create",
    `Usage: situ baselines create [flags]

Required flags:
  --project-id <project-id>
  --title <title>
  --summary <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <baseline-id>
  --event-id <event-id>
  --task-id <task-id>
  --status <active|superseded|abandoned>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "baselines list",
    `Usage: situ baselines list [flags]

Flags:
  --project-id <project-id>
  --task-id <task-id>
  --status <active|superseded|abandoned>
`,
  ],
  [
    "baselines get",
    `Usage: situ baselines get <baseline-id>
`,
  ],
  [
    "baselines move",
    `Usage: situ baselines move <baseline-id> [flags]

Required flags:
  --status <active|superseded|abandoned>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "projects",
    `Usage: situ projects <subcommand>

Subcommands:
  init      Initialize a project for the current git repository.
  create    Create a project record.
  list      List project records.
  current   List projects for the current git repository.
  get       Show a project record.
  archive   Archive a project record.
`,
  ],
  [
    "projects init",
    `Usage: situ projects init [flags]

Required flags:
  --goal <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <project-id>
  --event-id <event-id>
  --name <project-name>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "projects create",
    `Usage: situ projects create [flags]

Required flags:
  --name <name>
  --repository-path <absolute-path>
  --goal <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <project-id>
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "projects list",
    `Usage: situ projects list [flags]

Flags:
  --status <active|archived>
`,
  ],
  [
    "projects current",
    `Usage: situ projects current [flags]

Flags:
  --status <active|archived>
`,
  ],
  [
    "projects get",
    `Usage: situ projects get <project-id>
`,
  ],
  [
    "projects archive",
    `Usage: situ projects archive <project-id> [flags]

Required flags:
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "tasks",
    `Usage: situ tasks <subcommand>

Subcommands:
  create    Create a task record.
  list      List task records.
  current   List tasks for current-repository projects.
  get       Show a task record.
  move      Move a task to a status.
  assign    Assign or clear task ownership.
`,
  ],
  [
    "tasks create",
    `Usage: situ tasks create [flags]

Required flags:
  --project-id <project-id>
  --title <title>
  --body <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <task-id>
  --event-id <event-id>
  --status <triage|backlog|in_progress|in_review|done|canceled>
  --actor-display-name <name>
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
  --assigned-to-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "tasks list",
    `Usage: situ tasks list [flags]

Flags:
  --project-id <project-id>
  --status <triage|backlog|in_progress|in_review|done|canceled>
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
`,
  ],
  [
    "tasks current",
    `Usage: situ tasks current [flags]

Flags:
  --project-status <active|archived>
  --status <triage|backlog|in_progress|in_review|done|canceled>
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
`,
  ],
  [
    "tasks get",
    `Usage: situ tasks get <task-id>
`,
  ],
  [
    "tasks move",
    `Usage: situ tasks move <task-id> [flags]

Required flags:
  --status <triage|backlog|in_progress|in_review|done|canceled>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "tasks assign",
    `Usage: situ tasks assign <task-id> [flags]

Required flags:
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Assignment flags:
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
  --assigned-to-display-name <name>
  --clear

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "experiments",
    `Usage: situ experiments <subcommand>

Subcommands:
  create   Create an experiment record.
  list     List experiment records.
  get      Show an experiment record.
  move     Move an experiment to a status.
  assign   Assign or clear experiment ownership.
  revise   Revise experiment summary, status, or refs.
`,
  ],
  [
    "experiments create",
    `Usage: situ experiments create [flags]

Required flags:
  --project-id <project-id>
  --task-id <task-id>
  --title <title>
  --summary <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <experiment-id>
  --event-id <event-id>
  --status <planned|running|ready_for_review|accepted|rejected|abandoned>
  --base-ref <git-ref>
  --branch-name <branch-name>
  --worktree-path <path>
  --actor-display-name <name>
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
  --assigned-to-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "experiments list",
    `Usage: situ experiments list [flags]

Flags:
  --project-id <project-id>
  --task-id <task-id>
  --status <planned|running|ready_for_review|accepted|rejected|abandoned>
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
`,
  ],
  [
    "experiments get",
    `Usage: situ experiments get <experiment-id>
`,
  ],
  [
    "experiments move",
    `Usage: situ experiments move <experiment-id> [flags]

Required flags:
  --status <planned|running|ready_for_review|accepted|rejected|abandoned>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "experiments assign",
    `Usage: situ experiments assign <experiment-id> [flags]

Required flags:
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Assignment flags:
  --assigned-to-kind <human|local_agent|system>
  --assigned-to-id <id>
  --assigned-to-display-name <name>
  --clear

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "experiments revise",
    `Usage: situ experiments revise <experiment-id> [flags]

Required flags:
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Revision flags:
  --summary <markdown>
  --status <planned|running|ready_for_review|accepted|rejected|abandoned>
  --base-ref <git-ref>
  --clear-base-ref
  --branch-name <branch-name>
  --clear-branch-name
  --worktree-path <path>
  --clear-worktree-path

Optional flags:
  --event-id <event-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "measurements",
    `Usage: situ measurements <subcommand>

Subcommands:
  create   Create a measurement record.
  list     List measurements for a baseline or experiment.
  recent   List recent measurements.
  get      Show a measurement record.
`,
  ],
  [
    "measurements create",
    `Usage: situ measurements create [flags]

Required flags:
  --metric-name <name>
  --value <finite-number>
  --summary <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Target flags:
  --baseline-id <baseline-id>
  --experiment-id <experiment-id>
  --revision-number <positive-integer>

Optional flags:
  --id <measurement-id>
  --unit <unit>
  --details <markdown>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "measurements list",
    `Usage: situ measurements list [flags]

Target flags:
  --baseline-id <baseline-id>
  --experiment-id <experiment-id>

Optional flags:
  --revision-number <positive-integer>
  --metric-name <name>
`,
  ],
  [
    "measurements recent",
    `Usage: situ measurements recent [flags]

Flags:
  --limit <positive-integer>
`,
  ],
  [
    "measurements get",
    `Usage: situ measurements get <measurement-id>
`,
  ],
  [
    "artifacts",
    `Usage: situ artifacts <subcommand>

Subcommands:
  create    Create an artifact reference.
  capture   Copy a local file and create an artifact record.
  list      List artifacts for a target.
  recent    List recent artifacts.
  get       Show an artifact record.
`,
  ],
  [
    "artifacts create",
    `Usage: situ artifacts create [flags]

Required flags:
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
  --title <title>
  --summary <markdown>
  --uri <uri>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <artifact-id>
  --media-type <media-type>
  --byte-size <non-negative-safe-integer>
  --sha256 <sha256>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "artifacts capture",
    `Usage: situ artifacts capture [flags]

Required flags:
  --project-id <project-id>
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
  --source-path <absolute-file-path>
  --title <title>
  --summary <markdown>
  --actor-kind <human|local_agent|system>
  --actor-id <id>

Optional flags:
  --id <artifact-id>
  --media-type <media-type>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "artifacts list",
    `Usage: situ artifacts list [flags]

Required flags:
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
`,
  ],
  [
    "artifacts recent",
    `Usage: situ artifacts recent [flags]

Flags:
  --limit <positive-integer>
`,
  ],
  [
    "artifacts get",
    `Usage: situ artifacts get <artifact-id>
`,
  ],
  [
    "reviews",
    `Usage: situ reviews <subcommand>

Subcommands:
  create   Create a review record.
  list     List reviews for an experiment.
  recent   List recent reviews.
  get      Show a review record.
`,
  ],
  [
    "reviews create",
    `Usage: situ reviews create [flags]

Required flags:
  --experiment-id <experiment-id>
  --revision-number <positive-integer>
  --decision <approved|changes_requested|rejected|commented>
  --body <markdown>
  --reviewer-kind <human|local_agent|system>
  --reviewer-id <id>

Optional flags:
  --id <review-id>
  --reviewer-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "reviews list",
    `Usage: situ reviews list [flags]

Required flags:
  --experiment-id <experiment-id>

Optional flags:
  --revision-number <positive-integer>
  --decision <approved|changes_requested|rejected|commented>
`,
  ],
  [
    "reviews recent",
    `Usage: situ reviews recent [flags]

Flags:
  --limit <positive-integer>
`,
  ],
  [
    "reviews get",
    `Usage: situ reviews get <review-id>
`,
  ],
  [
    "reports",
    `Usage: situ reports <subcommand>

Subcommands:
  create     Create a report record.
  list       List reports by project or target.
  recent     List recent reports.
  get        Show a report record.
  generate   Generate project report Markdown.
`,
  ],
  [
    "reports create",
    `Usage: situ reports create [flags]

Required flags:
  --project-id <project-id>
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
  --title <title>
  --body <markdown>
  --generated-by-kind <human|local_agent|system>
  --generated-by-id <id>

Optional flags:
  --id <report-id>
  --generated-by-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "reports list",
    `Usage: situ reports list [flags]

Selector flags:
  --project-id <project-id>
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
`,
  ],
  [
    "reports recent",
    `Usage: situ reports recent [flags]

Flags:
  --limit <positive-integer>
`,
  ],
  [
    "reports get",
    `Usage: situ reports get <report-id>
`,
  ],
  [
    "reports generate",
    `Usage: situ reports generate [flags]

Required flags:
  --project-id <project-id>

Optional flags:
  --generated-at <iso-timestamp>
  --format <markdown|html>
`,
  ],
  [
    "comments",
    `Usage: situ comments <subcommand>

Subcommands:
  create   Create a comment.
  list     List comments for a target.
  get      Show a comment.
`,
  ],
  [
    "comments create",
    `Usage: situ comments create [flags]

Required flags:
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
  --actor-kind <human|local_agent|system>
  --actor-id <id>
  --body <markdown>

Optional flags:
  --id <comment-id>
  --actor-display-name <name>
  --now <iso-timestamp>
`,
  ],
  [
    "comments list",
    `Usage: situ comments list [flags]

Required flags:
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
`,
  ],
  [
    "comments get",
    `Usage: situ comments get <comment-id>
`,
  ],
  [
    "notifications",
    `Usage: situ notifications <subcommand>

Subcommands:
  list      List notifications for a recipient.
  get       Show a notification.
  read      Mark a notification read.
  dismiss   Dismiss a notification.
`,
  ],
  [
    "notifications list",
    `Usage: situ notifications list [flags]

Required flags:
  --recipient-id <id>

Optional flags:
  --include-dismissed
  --limit <positive-integer>
`,
  ],
  [
    "notifications get",
    `Usage: situ notifications get <notification-id>
`,
  ],
  [
    "notifications read",
    `Usage: situ notifications read <notification-id> [flags]

Flags:
  --now <iso-timestamp>
`,
  ],
  [
    "notifications dismiss",
    `Usage: situ notifications dismiss <notification-id> [flags]

Flags:
  --now <iso-timestamp>
`,
  ],
  [
    "events",
    `Usage: situ events <subcommand>

Subcommands:
  create   Create an event.
  list     List events for a target.
  recent   List recent events.
  get      Show an event.
`,
  ],
  [
    "events create",
    `Usage: situ events create [flags]

Required flags:
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
  --actor-kind <human|local_agent|system>
  --actor-id <id>
  --summary <markdown>

Optional flags:
  --id <event-id>
  --actor-display-name <name>
  --body <markdown>
  --now <iso-timestamp>
`,
  ],
  [
    "events list",
    `Usage: situ events list [flags]

Required flags:
  --target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
  --target-id <target-id>
`,
  ],
  [
    "events recent",
    `Usage: situ events recent [flags]

Flags:
  --limit <positive-integer>
`,
  ],
  [
    "events get",
    `Usage: situ events get <event-id>
`,
  ],
  [
    "status",
    `Usage: situ status [flags]

Flags:
  --project <project-id>
  --now <iso-timestamp>
  --stale-after-hours <positive-number>
`,
  ],
  [
    "verify",
    `Usage: situ verify [flags]

Flags:
  --project <project-id>
  --now <iso-timestamp>
`,
  ],
]);

export function findHelpPathForInvocation(
  invocation: SituCliInvocation,
): readonly string[] | undefined {
  if (invocation.command === "help") {
    return invocation.rest;
  }

  if (invocation.command === undefined) {
    return [];
  }

  if (
    invocation.rest.length === 1 &&
    (invocation.rest[0] === "--help" || invocation.rest[0] === "-h")
  ) {
    return [invocation.command];
  }

  if (
    invocation.rest.length === 2 &&
    (invocation.rest[1] === "--help" || invocation.rest[1] === "-h")
  ) {
    return [invocation.command, invocation.rest[0]];
  }

  return undefined;
}

export function formatCliHelp(input: { readonly path: readonly string[] }): string {
  const key = input.path.join(" ");
  const helpText = helpTextByPath.get(key);

  if (helpText !== undefined) {
    return helpText;
  }

  throw new ValidationError({
    message: `Unknown help topic: ${key}.`,
    details: {
      topic: key,
    },
  });
}

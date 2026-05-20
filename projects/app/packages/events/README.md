# events

Primitive package for append-only timeline records.

## Emission policy

Events are explicit product records. The events package stores caller-supplied
timeline records; automatic event emission is owned by the app action layer.

The app automatically creates one event for project creation, project archive,
task creation, task status movement, task assignment changes, experiment
creation, experiment status movement, experiment assignment changes, and
experiment revision.

Passive record actions do not create automatic events. This includes comments,
notifications, measurements, artifact references, local artifact file capture,
reviews, reports, event creation itself, read/list/get actions, Markdown-only
report generation, and Replicache pull.

Sync mutators follow the same split. Project, task, and experiment transition
mutators delegate to the app helpers that emit events; passive record mutators
do not add events; `events.create` persists exactly the supplied event.

# Publish a research account

A curator turns operational research into a readable, source-linked account. The service keeps that publication separate from projects, topics, work, discussion, reviews and jobs.

Use a named curator session. The owner/coordinator grants `curator` with `session.grant`; do not share administrator credentials. A curator without additional roles cannot modify research work or review decisions.

## A publishing pass

```sh
situ next
situ brief PROJECT
situ publication capture PROJECT --after WATERMARK > capture.json
situ publication show PROJECT --draft
situ schema publication.save
```

The capture contains `id`, `through`, saved `records`, research `changes`, and `draftRevision`. Use the current account's `freshness.through` as WATERMARK, or omit `--after` for the first pass. Changes are paginated; if `changes.hasMore`, read `/v1/publication/projects/PROJECT/changes?after=CURSOR` until caught up. Capture is a snapshot of current records, not an event-history reconstruction.

The first capture can import existing project/topic briefs into a draft. Nothing is automatically published. A large project can select sources with `situ publication capture PROJECT --file selection.json`, where the file contains `{"recordIds":["WORK_ID","ASSET_ID"],"after":123}`. The project record is always included. Old snapshots remain usable alongside a new capture.

Prepare `draft.json` using the returned snapshot ID and exact current revisions. This minimal input publishes one overview:

```json
{
  "projectId": "PROJECT",
  "expectedRevision": 0,
  "baseRelease": 0,
  "snapshotId": "SNAPSHOT_ID",
  "document": {
    "schemaVersion": 1,
    "pages": [
      {
        "id": "now",
        "template": "overview",
        "title": "Establish a matched baseline first",
        "summary": {
          "text": "We are measuring the same frozen scenarios before choosing a more complex policy.",
          "sources": [
            {
              "snapshotId": "SNAPSHOT_ID",
              "recordId": "PROJECT",
              "relationship": "context"
            }
          ]
        },
        "sections": [
          {
            "id": "next",
            "blocks": [
              {
                "id": "test",
                "kind": "next-test",
                "text": "Run the baseline and inspect three difficult trajectories.",
                "sources": [
                  {
                    "snapshotId": "SNAPSHOT_ID",
                    "recordId": "PROJECT",
                    "relationship": "context"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    "figures": [],
    "updates": []
  }
}
```

Substitute real IDs, `capture.draftRevision`, and the current release revision (zero before the first publication). Save and inspect:

```sh
situ publication save --file draft.json
situ publication validate PROJECT
# Browser: /#/projects/PROJECT?draft=1
situ publication publish PROJECT --expected-revision DRAFT_REVISION --expected-release RELEASE_REVISION
```

Validation prints actionable issue paths and exits nonzero when the draft is invalid. Publishing repeats those checks atomically. On a revision conflict, fetch the newer draft and reconcile it; do not blindly increment the expected revision and overwrite another curator's work. Exact retries use the existing command receipt mechanism.

The whole document is one release. Retain existing page IDs and published updates while editing. Archive a question with `situ publication archive PROJECT --page PAGE --reason TEXT --expected-revision DRAFT --expected-release RELEASE`; it remains readable. A correction is a new Update with `kind: "correction"` and `corrects: "EARLIER_UPDATE_ID"`. Published updates cannot be edited or dropped.

## Vocabulary

| Model           | Purpose                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Page            | One `overview` or `question`, sourced summary, ordered sections, optional archive                   |
| Statement block | Observation, interpretation or proposal; sources; optional accepted research review                 |
| Figure block    | Reference to one typed figure                                                                       |
| Next-test block | Concrete next discriminating experiment and its context                                             |
| Related block   | Links to focused question pages                                                                     |
| Update          | Meaningful result, decision, contradiction, blocker or correction; source references and event time |
| Figure          | Comparison, curve, matrix, replay, example, timeline or evidence relationships                      |

Use `situ schema publication.save` for the complete strict schema. `stories/fixtures.ts` is a complete synthetic account covering every figure. `scripts/seed-example.ts` performs actual uploads and publication against a disposable runtime.

## Data and media

`situ artifact FILE` still produces a local evidence reference for research work. `situ asset upload FILE` additionally copies a verified, supported artifact into Situ for browser use. Uploads do not attach themselves to work or confer research acceptance.

A numerical figure uses a JSON dataset:

```json
{
  "schema": "situ.dataset.v1",
  "metric": "Episode success",
  "unit": "fraction",
  "direction": "higher",
  "cohortId": "frozen-120",
  "evaluatorVersion": "eval-v2",
  "environmentVersion": "navigation-v1",
  "series": [
    {
      "id": "baseline",
      "label": "Baseline",
      "seed": "11",
      "values": [
        {
          "scenario": "Corridor",
          "step": 0,
          "value": 0.41,
          "n": 120,
          "lower": 0.33,
          "upper": 0.5
        }
      ]
    }
  ]
}
```

```sh
situ asset upload observations.json --project PROJECT --name "Frozen evaluation"
situ asset upload decision.png --project PROJECT
situ asset upload rollout.webm --project PROJECT --file replay.json
```

`replay.json` supplies metadata, for example:

```json
{
  "replay": {
    "policy": "baseline-v1",
    "scenario": "Corridor",
    "seed": "11",
    "environmentVersion": "navigation-v1",
    "duration": 12.5
  }
}
```

Capture again after uploading, then reference each asset ID from a source snapshot. A comparison also names its baseline series; an optional `scenario` chooses the initial view. Compared datasets must share metric, units, direction, cohort, environment and evaluator. Every scenario/step identifies one observation; steps increase within each scenario. Use `null` for missing values; zero is a measured value. Intervals need both bounds. Curves require explicit steps. A replay declares selected start/end times and `matched` or `illustrative` alignment; matched clips require the same scenario, seed and environment.

Allowed media: JSON datasets, PNG, JPEG, WebP, MP4 and WebM. Limits: 1 MiB per dataset, 32 MiB per uploaded artifact. Export short diagnostic clips. The server checks hashes and file signatures; it does not transcode video or verify the declared duration/experimental conditions. Use browser-compatible codecs. A failed upload prints `situ asset retry UPLOAD_ID`; retain the original bytes until delivery is confirmed.

The browser reads `/v1/assets/ASSET_ID` with byte-range support. No arbitrary file paths or remote embeds are accepted. Missing media retains the caption and source link. Backups preserve registered objects and old sources; there is no automatic evidence deletion.

## Catch-up and freshness

```sh
situ brief PROJECT
situ brief PROJECT --since 3
situ publication show PROJECT --revision 3
```

A brief includes the release, current page summaries, pinned sources and research changes since publication. `--since` adds published developments since that release. These accounts are useful for orientation; act on current operational ownership, claims and review state.

The main UI preserves the account someone is reading when a newer release appears, then offers an explicit refresh. Live job counts are separate. Changes to cited sources show a warning. A challenged review remains visible in old history but cannot be reused as current acceptance in a new publication.

Material research changes queue one coalesced curator obligation. Heartbeats do not. Publication clears only changes through its captured watermark. The harness or agent must check its inbox; Situ does not automatically launch or interrupt a model.

import {
  DomainError,
  type Change,
  type Command,
  type Project,
  type ResearchRecord,
  type Sample,
  type Snapshot,
} from "../../core/src/index";

type Row = Record<string, unknown>;
export type Query = (
  statement: string,
  ...bindings: (string | number | null)[]
) => Row[];
export type Transaction = <T>(work: () => T) => T;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export class ResearchStore {
  constructor(
    private query: Query,
    private transaction: Transaction,
  ) {
    query(
      "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, doc TEXT NOT NULL)",
    );
    query(
      "CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, doc TEXT NOT NULL)",
    );
    query("CREATE INDEX IF NOT EXISTS records_project ON records(project_id)");
    query(
      "CREATE TABLE IF NOT EXISTS samples (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, metric TEXT NOT NULL, cohort TEXT NOT NULL, step REAL NOT NULL, doc TEXT NOT NULL, UNIQUE(record_id, metric, cohort, step))",
    );
    query(
      "CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, record_id TEXT, doc TEXT NOT NULL)",
    );
    query(
      "CREATE INDEX IF NOT EXISTS changes_record ON changes(record_id, seq)",
    );
  }

  snapshot(): Snapshot {
    return {
      cursor: this.cursor(),
      projects: this.query("SELECT doc FROM projects ORDER BY rowid").map(
        (row) => JSON.parse(String(row.doc)),
      ),
      records: this.query("SELECT doc FROM records ORDER BY rowid").map((row) =>
        JSON.parse(String(row.doc)),
      ),
      samples: this.query(
        "SELECT id, doc FROM samples ORDER BY id DESC LIMIT 5000",
      )
        .reverse()
        .map((row) => ({ ...JSON.parse(String(row.doc)), id: Number(row.id) })),
      sampleCount: Number(this.query("SELECT COUNT(*) AS n FROM samples")[0].n),
    };
  }

  cursor() {
    return Number(
      this.query("SELECT COALESCE(MAX(seq), 0) AS n FROM changes")[0].n,
    );
  }

  changes(after: number, recordId?: string) {
    let rows: Row[];
    if (recordId)
      rows = this.query(
        "SELECT seq, doc FROM changes WHERE seq > ? AND record_id = ? ORDER BY seq LIMIT 100",
        after,
        recordId,
      );
    else
      rows = this.query(
        "SELECT seq, doc FROM changes WHERE seq > ? ORDER BY seq LIMIT 100",
        after,
      );
    return rows.map(
      (row) =>
        ({ ...JSON.parse(String(row.doc)), cursor: Number(row.seq) }) as Change,
    );
  }

  samples(recordId: string, after: number) {
    return this.query(
      "SELECT id, doc FROM samples WHERE record_id = ? AND id > ? ORDER BY id LIMIT 1000",
      recordId,
      after,
    ).map(
      (row) =>
        ({ ...JSON.parse(String(row.doc)), id: Number(row.id) }) as Sample,
    );
  }

  record(id: string, revision?: number): ResearchRecord {
    if (revision !== undefined) {
      const historical = this.query(
        "SELECT doc FROM changes WHERE record_id = ? AND json_extract(doc, '$.record.revision') = ? LIMIT 1",
        id,
        revision,
      )[0];
      if (!historical)
        throw new DomainError(
          404,
          `Record ${id} revision ${revision} does not exist`,
        );
      return JSON.parse(String(historical.doc)).record;
    }
    const row = this.query("SELECT doc FROM records WHERE id = ?", id)[0];
    if (!row) throw new DomainError(404, `Record ${id} does not exist`);
    return JSON.parse(String(row.doc));
  }

  apply(command: Command): Change {
    return this.transaction(() => {
      const fingerprint = canonical(command);
      const previous = this.query(
        "SELECT seq, fingerprint, doc FROM changes WHERE request_id = ?",
        command.requestId,
      )[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new DomainError(
            409,
            "Request ID was already used for another command",
          );
        return {
          ...JSON.parse(String(previous.doc)),
          cursor: Number(previous.seq),
        };
      }
      const at = new Date().toISOString();
      const change: Omit<Change, "cursor"> = {
        type: command.type,
        actor: command.actor,
        requestId: command.requestId,
        at,
      };
      if (command.type === "project.create") {
        if (
          this.query("SELECT id FROM projects WHERE id = ?", command.project.id)
            .length
        )
          throw new DomainError(409, "Project ID already exists");
        const project: Project = { ...command.project, createdAt: at };
        this.query(
          "INSERT INTO projects(id, doc) VALUES (?, ?)",
          project.id,
          JSON.stringify(project),
        );
        change.project = project;
      } else if (command.type === "record.create") {
        if (
          !this.query(
            "SELECT id FROM projects WHERE id = ?",
            command.record.projectId,
          ).length
        )
          throw new DomainError(404, "Project does not exist");
        if (
          this.query("SELECT id FROM records WHERE id = ?", command.record.id)
            .length
        )
          throw new DomainError(409, "Record ID already exists");
        const record: ResearchRecord = {
          ...command.record,
          links: command.record.links.map((link) => ({ ...link })),
          revision: 1,
          actor: command.actor,
          createdAt: at,
          updatedAt: at,
        };
        this.validateLinks(record);
        this.query(
          "INSERT INTO records(id, project_id, doc) VALUES (?, ?, ?)",
          record.id,
          record.projectId,
          JSON.stringify(record),
        );
        change.record = record;
      } else if (command.type === "record.update") {
        const previousRecord = this.record(command.id);
        if (previousRecord.revision !== command.revision)
          throw new DomainError(
            409,
            `Revision conflict: current revision is ${previousRecord.revision}. Read and reconcile before retrying.`,
          );
        const record = {
          ...previousRecord,
          ...command.patch,
          revision: previousRecord.revision + 1,
          updatedAt: at,
          actor: command.actor,
        };
        record.links = record.links.map((link) => ({ ...link }));
        this.validateLinks(record);
        this.query(
          "UPDATE records SET doc = ? WHERE id = ?",
          JSON.stringify(record),
          record.id,
        );
        change.record = record;
      } else {
        change.samples = command.samples.map((input) => {
          this.record(input.recordId);
          const existing = this.query(
            "SELECT doc FROM samples WHERE record_id = ? AND metric = ? AND cohort = ? LIMIT 1",
            input.recordId,
            input.metric,
            input.cohort,
          )[0];
          if (existing) {
            const sample: Sample = JSON.parse(String(existing.doc));
            if (
              sample.unit !== input.unit ||
              sample.direction !== input.direction
            )
              throw new DomainError(
                409,
                "Metric unit and direction must stay consistent within a series",
              );
          }
          if (
            this.query(
              "SELECT id FROM samples WHERE record_id = ? AND metric = ? AND cohort = ? AND step = ?",
              input.recordId,
              input.metric,
              input.cohort,
              input.step,
            ).length
          )
            throw new DomainError(
              409,
              "A measurement already exists at this step. Use a new run or cohort for a new observation.",
            );
          const sample = { ...input, createdAt: at };
          const row = this.query(
            "INSERT INTO samples(record_id, metric, cohort, step, doc) VALUES (?, ?, ?, ?, ?) RETURNING id",
            input.recordId,
            input.metric,
            input.cohort,
            input.step,
            JSON.stringify(sample),
          )[0];
          return { ...sample, id: Number(row.id) };
        });
      }
      const row = this.query(
        "INSERT INTO changes(request_id, fingerprint, record_id, doc) VALUES (?, ?, ?, ?) RETURNING seq",
        command.requestId,
        fingerprint,
        change.record?.id ?? null,
        JSON.stringify(change),
      )[0];
      return { ...change, cursor: Number(row.seq) };
    });
  }

  private validateLinks(record: ResearchRecord) {
    for (const link of record.links) {
      if (link.target === record.id)
        throw new DomainError(422, "A record cannot link to itself");
      const target = this.record(link.target);
      if (target.projectId !== record.projectId)
        throw new DomainError(422, "Links must stay within a project");
      if (link.revision !== undefined) this.record(link.target, link.revision);
      if (link.relation === "derived_from" && link.revision === undefined)
        link.revision = target.revision;
      if (link.relation !== "derived_from") continue;
      const pending = [target];
      const visited = new Set<string>();
      while (pending.length) {
        const ancestor = pending.pop()!;
        if (visited.has(ancestor.id)) continue;
        visited.add(ancestor.id);
        for (const parent of ancestor.links.filter(
          (item) => item.relation === "derived_from",
        )) {
          if (parent.target === record.id)
            throw new DomainError(
              422,
              "Derivation would create an ancestry cycle",
            );
          pending.push(this.record(parent.target));
        }
      }
    }
  }
}

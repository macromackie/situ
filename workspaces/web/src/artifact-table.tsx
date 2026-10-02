import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import {
  tableArtifactSchema,
  type ResearchRecord,
  type TableArtifact,
} from "../../core/src/index";
import { styles as s } from "./styles";
import { Card } from "./ui";

type Artifact = ResearchRecord["artifacts"][number];

function displayCell(value: string | number | boolean | null | undefined) {
  if (typeof value === "number")
    return value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  return String(value ?? "");
}

async function loadTable(artifact: Artifact) {
  if (!artifact.sha256)
    throw new Error("A SHA-256 is required to preview evidence.");
  const response = await fetch(artifact.uri, {
    credentials: "omit",
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error(`Artifact request failed (${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2 * 1024 * 1024)
        throw new Error("Table preview is limited to 2 MiB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== artifact.sha256)
    throw new Error("Artifact bytes differ from the recorded SHA-256.");
  return tableArtifactSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export function ArtifactTable({ artifact }: { artifact: Artifact }) {
  const [table, setTable] = useState<TableArtifact | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered =
    table?.rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value).toLowerCase().includes(query.toLowerCase()),
      ),
    ) ?? [];
  async function load() {
    setLoading(true);
    setError("");
    try {
      setTable(await loadTable(artifact));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  }
  return (
    <section {...stylex.props(s.section)}>
      <Card
        title={table?.title ?? "Examples"}
        aside={
          <button {...stylex.props(s.button)} disabled={loading} onClick={load}>
            {loading ? "Loading…" : table ? "Reload" : "Load verified table"}
          </button>
        }
      >
        {error && <p {...stylex.props(s.error)}>{error}</p>}
        {table ? (
          <>
            <div {...stylex.props(s.toolbar)}>
              <input
                {...stylex.props(s.input, s.search)}
                aria-label="Filter examples"
                placeholder="Filter examples…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
              <span {...stylex.props(s.muted)}>
                {filtered.length} rows · SHA-256 verified
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice(page * 10, page * 10 + 10)
                    .map((row, index) => (
                      <tr key={index}>
                        {table.columns.map((column) => (
                          <td
                            key={column}
                            {...stylex.props(s.mono)}
                            title={String(row[column] ?? "")}
                          >
                            <div
                              style={{
                                maxWidth: 360,
                                overflowX: "auto",
                                whiteSpace: "pre",
                              }}
                            >
                              {displayCell(row[column])}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div {...stylex.props(s.toolbar)}>
              <button
                {...stylex.props(s.button)}
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of{" "}
                {Math.max(1, Math.ceil(filtered.length / 10))}
              </span>
              <button
                {...stylex.props(s.button)}
                disabled={(page + 1) * 10 >= filtered.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <p {...stylex.props(s.cardBody, s.muted)}>
            Load the attached table to inspect individual observations. Its
            recorded hash is checked before display.
          </p>
        )}
      </Card>
    </section>
  );
}

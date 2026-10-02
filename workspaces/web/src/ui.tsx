import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { kinds, states, type ResearchRecord } from "../../core/src/index";
import { command } from "./state";
import { styles as s } from "./styles";

export function Badge({ state }: { state: string }) {
  return (
    <span
      {...stylex.props(
        s.badge,
        ["active", "running"].includes(state) && s.active,
        ["done", "completed", "gate passed"].includes(state) && s.done,
        ["paused", "interrupted", "failed", "gate failed"].includes(state) &&
          s.paused,
      )}
    >
      {state}
    </span>
  );
}
export function RecordLink({
  record,
  children,
}: {
  record: ResearchRecord;
  children?: ReactNode;
}) {
  return (
    <Link
      {...stylex.props(s.link)}
      to="/projects/$projectId/records/$recordId"
      params={{ projectId: record.projectId, recordId: record.id }}
    >
      {children ?? record.title}
    </Link>
  );
}
export function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section {...stylex.props(s.card)}>
      <header {...stylex.props(s.cardHead)}>
        <h2 {...stylex.props(s.cardTitle)}>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
export function time(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Editor({
  projectId,
  record: initialRecord,
  related,
  onClose,
  onSaved,
}: {
  projectId?: string;
  record?: ResearchRecord;
  related?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const record = useRef(initialRecord).current;
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const entityId = useRef(crypto.randomUUID());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title"));
    const body = String(data.get("body"));
    const actor = String(data.get("actor"));
    const patch = {
      title,
      body,
      state: String(data.get("state")),
      assessment: String(data.get("assessment") ?? ""),
      tags: String(data.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    let payload: object;
    if (!projectId)
      payload = {
        type: "project.create",
        project: { id: entityId.current, title, description: body },
      };
    else if (record)
      payload = {
        type: "record.update",
        id: record.id,
        revision: record.revision,
        patch,
      };
    else
      payload = {
        type: "record.create",
        record: {
          id: entityId.current,
          projectId,
          kind: String(data.get("kind")),
          ...patch,
          links: related ? [{ target: related, relation: "related" }] : [],
        },
      };
    try {
      const result = await command({
        ...payload,
        requestId: requestId.current,
        actor,
      });
      onSaved?.(result.record?.id ?? result.project!.id);
      onClose();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} {...stylex.props(s.dialog)} onCancel={onClose}>
      <h2 {...stylex.props(s.title)}>
        {record ? "Edit record" : projectId ? "New record" : "New project"}
      </h2>
      <form
        {...stylex.props(s.form)}
        onSubmit={submit}
        onChange={() => {
          requestId.current = crypto.randomUUID();
        }}
      >
        {error && (
          <div role="alert" {...stylex.props(s.error)}>
            {error}
          </div>
        )}
        <label {...stylex.props(s.label)}>
          Title
          <input
            autoFocus
            required
            maxLength={200}
            name="title"
            defaultValue={record?.title}
            {...stylex.props(s.input)}
          />
        </label>
        {projectId && (
          <div {...stylex.props(s.row)}>
            {!record && (
              <label {...stylex.props(s.label)}>
                Kind
                <select
                  name="kind"
                  defaultValue={related ? "note" : "experiment"}
                  {...stylex.props(s.input)}
                >
                  {kinds.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
              </label>
            )}
            <label {...stylex.props(s.label)}>
              Status
              <select
                name="state"
                defaultValue={record?.state ?? "open"}
                {...stylex.props(s.input)}
              >
                {states.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label {...stylex.props(s.label)}>
              Assessment
              <input
                name="assessment"
                placeholder="Optional, e.g. mixed evidence"
                defaultValue={record?.assessment}
                {...stylex.props(s.input)}
              />
            </label>
          </div>
        )}
        <label {...stylex.props(s.label)}>
          {projectId ? "Notes" : "Research goal"}
          <textarea
            name="body"
            defaultValue={record?.body}
            {...stylex.props(s.input, s.textArea)}
          />
        </label>
        {projectId && (
          <label {...stylex.props(s.label)}>
            Tags
            <input
              name="tags"
              placeholder="Comma separated"
              defaultValue={record?.tags.join(", ")}
              {...stylex.props(s.input)}
            />
          </label>
        )}
        <label {...stylex.props(s.label)}>
          Author
          <input
            name="actor"
            required
            defaultValue="human"
            {...stylex.props(s.input)}
          />
        </label>
        <div {...stylex.props(s.row)}>
          <button
            type="submit"
            disabled={busy}
            {...stylex.props(s.button, s.primary)}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} {...stylex.props(s.button)}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

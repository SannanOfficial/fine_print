"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useSyncExternalStore, type ReactNode } from "react";
import { Redline, RedlineLegend } from "@/components/Redline.tsx";
import { MANUAL_REASONS } from "@/core/platforms.ts";
import { describeStats } from "@/lib/format.ts";
import {
  addDocument,
  addEvent,
  addPlatform,
  deleteDocument,
  deleteEvent,
  deletePlatform,
  recordVersion,
  updateDocument,
  updatePlatform,
  type DocumentState,
  type DocumentValues,
  type EventState,
  type PlatformState,
  type PlatformValues,
  type RecordValues,
  type SimpleState,
} from "./actions.ts";

function Message({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "form-ok" : "form-error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

/* ---------- Platforms ---------- */

export function PlatformForm({ slug, initial }: { slug?: string; initial: PlatformValues }) {
  const [state, action, pending] = useActionState<PlatformState, FormData>(
    slug ? updatePlatform.bind(null, slug) : addPlatform,
    null,
  );
  const v = state?.values ?? initial;
  return (
    <form action={action} className="form" key={state?.key}>
      {!slug && (
        <Field
          id="slug"
          label="Short name"
          hint={
            <>
              Used in the address, for example fineprint…/<b>simplepractice</b>. Lowercase letters, numbers and
              hyphens. It can&rsquo;t be changed later.
            </>
          }
        >
          <input id="slug" name="slug" defaultValue={v.slug} required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="slug-hint" />
        </Field>
      )}
      <Field id="name" label="Name">
        <input id="name" name="name" defaultValue={v.name} required maxLength={80} />
      </Field>
      <Field id="kind" label="What it is" hint="Shown under the name, for example “Electronic health records (EHR)”.">
        <input id="kind" name="kind" defaultValue={v.kind} required maxLength={120} aria-describedby="kind-hint" />
      </Field>
      <Field id="website" label="Official site">
        <input id="website" name="website" type="url" defaultValue={v.website} required placeholder="https://" />
      </Field>
      <Message state={state} />
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Saving…" : slug ? "Save changes" : "Add platform"}
      </button>
    </form>
  );
}

/* ---------- Documents ---------- */

export function DocumentForm({
  platformSlug,
  documentSlug,
  initial,
}: {
  platformSlug: string;
  documentSlug?: string;
  initial: DocumentValues;
}) {
  const [state, action, pending] = useActionState<DocumentState, FormData>(
    documentSlug ? updateDocument.bind(null, platformSlug, documentSlug) : addDocument.bind(null, platformSlug),
    null,
  );
  const v = state?.values ?? initial;
  const [mode, setMode] = useState(v.mode || "auto");
  const [preset, setPreset] = useState(v.manualPreset || "blocked");

  return (
    <form action={action} className="form" key={state?.key}>
      {!documentSlug && (
        <Field id="doc-slug" label="Short name" hint="Used in the address, for example “terms-of-service”. It can’t be changed later.">
          <input id="doc-slug" name="slug" defaultValue={v.slug} required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="doc-slug-hint" />
        </Field>
      )}
      <Field id="title" label="Title">
        <input id="title" name="title" defaultValue={v.title} required maxLength={120} placeholder="Terms of Service" />
      </Field>
      <Field id="audience" label="Who it applies to">
        <select id="audience" name="audience" defaultValue={v.audience || "providers"}>
          <option value="providers">Providers</option>
          <option value="clients">Clients</option>
          <option value="everyone">Everyone</option>
        </select>
      </Field>
      <Field id="url" label="Public address" hint="Leave empty if it isn’t published anywhere (for example, only sent by email).">
        <input id="url" name="url" type="url" defaultValue={v.url} placeholder="https://" aria-describedby="url-hint" />
      </Field>

      <fieldset>
        <legend>How it is captured</legend>
        <div className="choices">
          <label className="check">
            <input type="radio" name="mode" value="auto" checked={mode === "auto"} onChange={() => setMode("auto")} />
            Automatically, twice a day
          </label>
          <label className="check">
            <input type="radio" name="mode" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} />
            By hand, here in the admin
          </label>
        </div>
        {mode === "manual" && (
          <Field id="manualPreset" label="Reason shown to readers">
            <select id="manualPreset" name="manualPreset" value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="blocked">{MANUAL_REASONS.blocked}</option>
              <option value="browser">{MANUAL_REASONS.browser}</option>
              <option value="custom">Something else…</option>
            </select>
          </Field>
        )}
        {mode === "manual" && preset === "custom" && (
          <Field id="manualCustom" label="Your reason">
            <input id="manualCustom" name="manualCustom" defaultValue={v.manualCustom} maxLength={200} />
          </Field>
        )}
      </fieldset>

      <details className="advanced">
        <summary>Where the text is on the page</summary>
        <Field
          id="selectors"
          label="Read the text from"
          hint="CSS selectors, one per line, tried in order. The first that matches is used. “main” and “article” fit most sites."
        >
          <textarea id="selectors" name="selectors" rows={3} defaultValue={v.selectors || "main\narticle\nbody"} aria-describedby="selectors-hint" />
        </Field>
        <Field id="remove" label="Leave out" hint="Optional. Selectors for parts inside it to skip, such as “nav” or “footer”, one per line.">
          <textarea id="remove" name="remove" rows={2} defaultValue={v.remove} aria-describedby="remove-hint" />
        </Field>
        <Field id="redirectHosts" label="Other sites it may redirect to" hint="Optional. Host names, one per line.">
          <textarea id="redirectHosts" name="redirectHosts" rows={2} defaultValue={v.redirectHosts} aria-describedby="redirectHosts-hint" />
        </Field>
        <label className="check">
          <input type="checkbox" name="source" value="zendesk-api" defaultChecked={v.source === "zendesk-api"} />
          This is a Zendesk help-centre article: read it through the help centre&rsquo;s public article API
        </label>
      </details>

      <Message state={state} />
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Saving…" : documentSlug ? "Save settings" : "Add document"}
      </button>
    </form>
  );
}

/* ---------- Deleting ---------- */

export function DeleteForm({
  platformSlug,
  documentSlug,
  hint,
}: {
  platformSlug: string;
  documentSlug?: string;
  hint: string;
}) {
  const [state, action, pending] = useActionState<SimpleState, FormData>(
    documentSlug ? deleteDocument.bind(null, platformSlug, documentSlug) : deletePlatform.bind(null, platformSlug),
    null,
  );
  const word = documentSlug ?? platformSlug;
  return (
    <form action={action} className="form danger">
      <p className="hint">{hint}</p>
      <Field id="confirm" label={`Type “${word}” to confirm`}>
        <input id="confirm" name="confirm" autoComplete="off" />
      </Field>
      <Message state={state} />
      <button type="submit" className="button button-danger" disabled={pending}>
        {pending ? "Deleting…" : documentSlug ? "Delete document" : "Delete platform"}
      </button>
    </form>
  );
}

/* ---------- Reported events ---------- */

export function EventForm({ platformSlug }: { platformSlug: string }) {
  const [state, action, pending] = useActionState<EventState, FormData>(addEvent.bind(null, platformSlug), null);
  const v = state?.values ?? { date: "", precision: "day", title: "", body: "", sources: "" };
  return (
    <form action={action} className="form" key={state?.key}>
      <p className="hint">
        Something reported about this company&rsquo;s terms that isn&rsquo;t a document&rsquo;s text: a contract sent
        privately, a new fee, a rollout paused. It appears on the public timeline and in the PDF. State only what the
        sources report, and cite them.
      </p>
      <div className="field-row">
        <Field id="event-date" label="Date it happened">
          <input id="event-date" name="date" type="date" defaultValue={v.date} required />
        </Field>
        <Field id="event-precision" label="How exact">
          <select id="event-precision" name="precision" defaultValue={v.precision}>
            <option value="day">That day</option>
            <option value="month">Only the month is known</option>
          </select>
        </Field>
      </div>
      <Field id="event-title" label="Title">
        <input id="event-title" name="title" defaultValue={v.title} maxLength={200} required />
      </Field>
      <Field id="event-body" label="What happened" hint="Plain text. Leave a blank line between paragraphs.">
        <textarea id="event-body" name="body" rows={5} defaultValue={v.body} maxLength={4000} aria-describedby="event-body-hint" required />
      </Field>
      <Field id="event-sources" label="Sources" hint="One per line: Label | https://address">
        <textarea id="event-sources" name="sources" rows={3} defaultValue={v.sources} aria-describedby="event-sources-hint" required />
      </Field>
      <Message state={state} />
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Adding…" : "Add to the timeline"}
      </button>
    </form>
  );
}

export function DeleteEvent({ platformSlug, id }: { platformSlug: string; id: string }) {
  const [state, action, pending] = useActionState<SimpleState, FormData>(deleteEvent.bind(null, platformSlug, id), null);
  if (state?.ok) return <Message state={state} />;
  return (
    <form action={action} className="form-inline delete-event">
      <label className="visually-hidden" htmlFor={`confirm-${id}`}>
        Type delete to remove this event
      </label>
      <input id={`confirm-${id}`} name="confirm" placeholder="type “delete”" autoComplete="off" size={12} />
      <button type="submit" className="link-button" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </button>
      <Message state={state} />
    </form>
  );
}

/* ---------- Recording a version ---------- */

const noSubscribe = () => () => {};

/** Today's date where the editor is, as YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RecordForm({
  platformSlug,
  documentSlug,
  hasUrl,
  initial,
  fromSubmission,
  returnTo,
}: {
  platformSlug: string;
  documentSlug: string;
  hasUrl: boolean;
  initial: RecordValues;
  fromSubmission: string | null;
  /** Where to go after recording: back to the "Add a record" page, or the document's page. */
  returnTo?: "record-page";
}) {
  const [state, action, pending] = useActionState(recordVersion.bind(null, platformSlug, documentSlug), null);
  const v = state?.values ?? initial;
  const preview = state?.preview;
  // Editing the text after a preview means the preview no longer matches it.
  const [editedAfter, setEditedAfter] = useState<number | null>(null);
  const stale = editedAfter !== null && editedAfter === state?.key;
  // The server doesn't know the editor's time zone, so the limit is set in the browser.
  const today = useSyncExternalStore(noSubscribe, localToday, () => undefined);
  // Which button was pressed, so only that one says it's working.
  const [intent, setIntent] = useState("");
  const label = (name: string, idle: string, busy: string) => (pending && intent === name ? busy : idle);

  return (
    <form action={action} className="form" key={state?.key}>
      <input type="hidden" name="fetchedHash" value={v.fetchedHash} />
      <input type="hidden" name="submissionId" value={v.submissionId} />
      <input type="hidden" name="basedOn" value={v.basedOn} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {fromSubmission && (
        <p className="note">
          Starting from submission <b>{fromSubmission}</b>. Remove anything that could identify the sender before you
          record it. Recording marks the submission &ldquo;Added to the record&rdquo;.
        </p>
      )}

      <fieldset>
        <legend>1. Get the text</legend>
        {hasUrl && (
          <div className="form-actions">
            <button type="submit" name="intent" value="fetch" className="button" disabled={pending} formNoValidate onClick={() => setIntent("fetch")}>
              {label("fetch", "Fetch from the public page", "Fetching… (up to 30 seconds)")}
            </button>
          </div>
        )}
        <Field id="page" label={hasUrl ? "Or take it from a saved page" : "Take it from a saved page"} hint="In your browser: Save page as… → “Webpage, HTML only”.">
          <input id="page" name="page" type="file" accept=".html,.htm,text/html" aria-describedby="page-hint" />
        </Field>
        <button type="submit" name="intent" value="extract" className="button" disabled={pending} formNoValidate onClick={() => setIntent("extract")}>
          {label("extract", "Take text from saved page", "Reading the page…")}
        </button>
      </fieldset>

      <Field id="text" label="2. Check the text of the new version" hint="Or paste it here. Plain text or Markdown; separate paragraphs with a blank line.">
        <textarea
          id="text"
          name="text"
          rows={16}
          defaultValue={v.text}
          aria-describedby="text-hint"
          className="mono-input"
          onChange={() => setEditedAfter(state?.key ?? 0)}
        />
      </Field>
      <div className="field-row">
        <Field id="sourceUrl" label="Where it was published" hint="Leave empty if it was never public, for example an email.">
          <input id="sourceUrl" name="sourceUrl" type="url" defaultValue={v.sourceUrl} placeholder="https://" aria-describedby="sourceUrl-hint" />
        </Field>
        <Field id="datedOn" label="Date on the document" hint="Optional. The date printed on it, or the date of the email it came in.">
          <input
            id="datedOn"
            name="datedOn"
            type="date"
            defaultValue={v.datedOn}
            min="1990-01-01"
            max={today}
            aria-describedby="datedOn-hint"
          />
        </Field>
      </div>

      <Message state={state} />
      {preview && (
        <div className="record-preview">
          <p className="label">
            {preview.stats ? describeStats(preview.stats) : "First copy"} · {preview.chars.toLocaleString("en-US")} characters
          </p>
          {preview.entries.length > 0 && (
            <>
              <RedlineLegend />
              <div className="sheet">
                <Redline entries={preview.entries} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="form-actions">
        <button type="submit" name="intent" value="preview" className="button" disabled={pending} onClick={() => setIntent("preview")}>
          {label("preview", "3. Preview the changes", "Comparing…")}
        </button>
        <button
          type="submit"
          name="intent"
          value="record"
          className="button button-primary"
          disabled={pending || !preview || stale}
          onClick={() => setIntent("record")}
        >
          {label("record", "4. Record this version", "Recording…")}
        </button>
      </div>
      {(!preview || stale) && (
        <p className="hint">
          {stale ? "You changed the text, so preview it again before recording." : "Preview first. Recording adds the version to the public record for good."}
        </p>
      )}
    </form>
  );
}

/* ---------- From a submission ---------- */

export function ChooseDocument({
  submissionId,
  options,
  selected,
  label = "Which document is it a version of?",
  button = "Continue",
}: {
  /** From a submission: opens the document's page with the submitted text. Otherwise opens the "Add a record" page. */
  submissionId?: string;
  options: { value: string; label: string }[];
  selected?: string;
  label?: string;
  button?: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(selected ?? options[0]?.value ?? "");
  if (options.length === 0) return <p className="empty">Add the document under Platforms first.</p>;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!choice) return;
        router.push(submissionId ? `/admin/platforms/${choice}?from=${submissionId}` : `/admin/record?doc=${choice}`);
      }}
    >
      <Field id="target" label={label} hint="If it isn’t listed, add it under Platforms first.">
        <select id="target" value={choice} onChange={(e) => setChoice(e.target.value)} aria-describedby="target-hint">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className="button">
        {button}
      </button>
    </form>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { STATUS_LABELS, type SubmissionStatus } from "@/core/records.ts";
import Link from "next/link";
import { deleteSubmission, login, markContacted, redraftSummary, saveSummary, updateSubmission, type FormState } from "./actions.ts";

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "form-ok" : "form-error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

/** Uses the address bar (?next=), so render it inside <Suspense>. */
export function LoginForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action, pending] = useActionState(login, null, `/admin/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return (
    <form action={action} className="form form-narrow" key={state?.key}>
      <input type="hidden" name="next" value={next} />
      <Message state={state} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" defaultValue={state?.values?.email} required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/**
 * `version` is when the submission was last changed (ms). A reply from this
 * form newer than that is shown with what was sent; a change made elsewhere
 * since (such as "Mark as contacted") resets the form to the saved values.
 */
export function SubmissionEditor({ id, status, notes, version }: { id: string; status: SubmissionStatus; notes: string; version: number }) {
  const [state, action, pending] = useActionState(updateSubmission.bind(null, id), null);
  const current = state?.key !== undefined && state.key >= version ? state : null;
  const v = current?.values ?? { status, notes };
  return (
    <form action={action} className="form" key={current?.key ?? version}>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={v.status}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="notes">Notes for editors</label>
        <p className="hint" id="notes-hint">
          Private. For example, when you contacted the sender and what they confirmed.
        </p>
        <textarea id="notes" name="notes" rows={5} defaultValue={v.notes} aria-describedby="notes-hint" />
      </div>
      <Message state={current} />
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function DeleteSubmission({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteSubmission.bind(null, id), null);
  return (
    <form action={action} className="form danger">
      <p className="hint">
        Deletes the submission and its files for good, for example when the sender asks. This cannot be undone.
      </p>
      <div className="field">
        <label htmlFor="confirm">Type “delete” to confirm</label>
        <input id="confirm" name="confirm" autoComplete="off" />
      </div>
      <Message state={state} />
      <button type="submit" className="button button-danger" disabled={pending}>
        {pending ? "Deleting…" : "Delete submission"}
      </button>
    </form>
  );
}

/** Stays on the page after it's used, so its confirmation can be read. */
export function MarkContacted({ id, isNew }: { id: string; isNew: boolean }) {
  const [state, action, pending] = useActionState(markContacted.bind(null, id), null);
  if (!isNew) return state ? <Message state={state} /> : null;
  return (
    <form action={action} className="form-inline">
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Mark as contacted"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function SummaryEditor({
  id,
  headline,
  points,
  nextHref,
}: {
  id: string;
  headline: string;
  points: string[];
  /** The next change awaiting review, shown after a save so the editor can keep going. */
  nextHref: string | null;
}) {
  const [state, action, pending] = useActionState(saveSummary.bind(null, id), null);
  const v = state?.values ?? { headline, points: points.join("\n") };
  const [intent, setIntent] = useState("");
  return (
    <form action={action} className="form" key={state?.key}>
      <div className="field">
        <label htmlFor="headline">Headline</label>
        <p className="hint" id="headline-hint">
          One sentence naming the most consequential change.
        </p>
        <textarea id="headline" name="headline" rows={2} defaultValue={v.headline} maxLength={300} aria-describedby="headline-hint" />
      </div>
      <div className="field">
        <label htmlFor="points">Points</label>
        <p className="hint" id="points-hint">
          One per line, most important first. Up to 8. Quote exact wording where it matters.
        </p>
        <textarea id="points" name="points" rows={8} defaultValue={v.points} aria-describedby="points-hint" />
      </div>
      <Message state={state} />
      {state?.ok && nextHref && (
        <p className="note">
          <Link href={nextHref}>Next change to review →</Link>
        </p>
      )}
      <div className="form-actions">
        <button type="submit" name="intent" value="publish" className="button button-primary" disabled={pending} onClick={() => setIntent("publish")}>
          {pending && intent === "publish" ? "Publishing…" : "Publish as reviewed"}
        </button>
        <button type="submit" name="intent" value="hide" className="button" disabled={pending} onClick={() => setIntent("hide")}>
          {pending && intent === "hide" ? "Hiding…" : "Hide summary"}
        </button>
      </div>
    </form>
  );
}

export function RedraftSummary({ id, hasSummary }: { id: string; hasSummary: boolean }) {
  const [state, action, pending] = useActionState(redraftSummary.bind(null, id), null);
  return (
    <form action={action} className="form">
      {hasSummary ? (
        <label className="check">
          <input type="checkbox" name="confirm" value="yes" /> Replace the current summary with a new AI draft
        </label>
      ) : (
        <input type="hidden" name="confirm" value="yes" />
      )}
      <Message state={state} />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Asking the AI… (up to a minute)" : "Write a new AI draft"}
      </button>
    </form>
  );
}

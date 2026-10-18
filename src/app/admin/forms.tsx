"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
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
  const [state, action, pending] = useActionState(login, null);
  const next = useSearchParams().get("next") ?? "";
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

export function SubmissionEditor({ id, status, notes }: { id: string; status: SubmissionStatus; notes: string }) {
  const [state, action, pending] = useActionState(updateSubmission.bind(null, id), null);
  // Show what was just saved (or rejected), not the values the page first loaded with.
  const v = state?.values ?? { status, notes };
  return (
    <form action={action} className="form" key={state?.key}>
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
      <Message state={state} />
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

export function MarkContacted({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markContacted.bind(null, id), null);
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
        <button type="submit" name="intent" value="publish" className="button button-primary" disabled={pending}>
          {pending ? "Saving…" : "Publish as reviewed"}
        </button>
        <button type="submit" name="intent" value="hide" className="button" disabled={pending}>
          {pending ? "Saving…" : "Hide summary"}
        </button>
      </div>
    </form>
  );
}

export function RedraftSummary({ id, hasSummary }: { id: string; hasSummary: boolean }) {
  const [state, action, pending] = useActionState(redraftSummary.bind(null, id), null);
  return (
    <form action={action} className="form">
      <label className="check">
        <input type="checkbox" name="confirm" value="yes" />{" "}
        {hasSummary ? "Replace the current summary with a new AI draft" : "Write an AI draft"}
      </label>
      <Message state={state} />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Asking the AI… (up to a minute)" : "Write a new AI draft"}
      </button>
    </form>
  );
}

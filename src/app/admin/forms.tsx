"use client";

import { useActionState } from "react";
import { STATUS_LABELS, type SubmissionStatus } from "@/core/records.ts";
import { deleteSubmission, login, saveSummary, updateSubmission, type FormState } from "./actions.ts";

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "form-ok" : "form-error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="form form-narrow">
      <Message state={state} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
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
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status}>
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
        <textarea id="notes" name="notes" rows={5} defaultValue={notes} aria-describedby="notes-hint" />
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
        Delete submission
      </button>
    </form>
  );
}

export function SummaryEditor({ id, headline, points }: { id: string; headline: string; points: string[] }) {
  const [state, action, pending] = useActionState(saveSummary.bind(null, id), null);
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="headline">Headline</label>
        <p className="hint" id="headline-hint">
          One sentence naming the most consequential change.
        </p>
        <textarea id="headline" name="headline" rows={2} defaultValue={headline} maxLength={300} aria-describedby="headline-hint" />
      </div>
      <div className="field">
        <label htmlFor="points">Points</label>
        <p className="hint" id="points-hint">
          One per line, most important first. Up to 8. Quote exact wording where it matters.
        </p>
        <textarea id="points" name="points" rows={8} defaultValue={points.join("\n")} aria-describedby="points-hint" />
      </div>
      <Message state={state} />
      <div className="form-actions">
        <button type="submit" name="intent" value="publish" className="button button-primary" disabled={pending}>
          Publish as reviewed
        </button>
        <button type="submit" name="intent" value="hide" className="button" disabled={pending}>
          Hide summary
        </button>
      </div>
    </form>
  );
}

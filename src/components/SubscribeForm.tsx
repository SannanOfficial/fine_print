"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { subscribe } from "@/app/newsletter/actions.ts";

/** The address typed in this tab, reused as the default on other platforms' forms. */
const STORAGE_KEY = "fineprint:newsletter-email";

function remembered(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return ""; // storage blocked or unavailable
  }
}

function remember(email: string) {
  try {
    if (email) sessionStorage.setItem(STORAGE_KEY, email);
  } catch {
    // Not saved; the form still works.
  }
}

/**
 * `page` is the address of the page the form is on, so a browser without
 * JavaScript gets its answer there. `platformSlug` can be EVERY_PLATFORM, with
 * its own `label`.
 */
export function SubscribeForm({
  platformSlug,
  platformName,
  page,
  label,
  className,
}: {
  platformSlug: string;
  platformName?: string;
  page: string;
  label?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(subscribe.bind(null, platformSlug), null, page);
  const [email, setEmail] = useState("");
  const id = useId();

  // Remember an address only once the server has accepted it, so a typo isn't carried to other forms.
  useEffect(() => {
    if (state?.ok && state.email) remember(state.email);
  }, [state]);

  // Read after mounting: sessionStorage doesn't exist on the server.
  useEffect(() => {
    const saved = remembered();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
    if (saved) setEmail((current) => current || saved);
  }, []);

  return (
    <form action={action} className={className ? `subscribe ${className}` : "subscribe"}>
      <label htmlFor={`${id}-email`} className="subscribe-label">
        {label ?? `Get an email when ${platformName} changes its terms`}
      </label>
      <p className="hint" id={`${id}-hint`}>
        Free. One email on Mondays, only in weeks with a change. Unsubscribe from any email.
      </p>
      <div className="subscribe-row">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={state ? `${id}-hint ${id}-message` : `${id}-hint`}
          aria-invalid={state && !state.ok ? true : undefined}
        />
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Sending…" : "Get updates"}
        </button>
      </div>
      <div className="trap" aria-hidden="true">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state && (
        <p id={`${id}-message`} className={state.ok ? "form-ok" : "form-error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </form>
  );
}

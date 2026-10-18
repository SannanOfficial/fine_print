"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmSubscription, savePreferences, unsubscribeAll, type LinkState } from "./actions.ts";

function Message({ state }: { state: LinkState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "form-ok" : "form-error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmSubscription.bind(null, token), null, `/newsletter/confirm?t=${encodeURIComponent(token)}`);
  if (state?.ok) {
    return (
      <>
        <Message state={state} />
        {state.manageUrl && (
          <p className="note">
            <Link href={state.manageUrl}>Choose other platforms or unsubscribe</Link>. The same link is in every email.
          </p>
        )}
      </>
    );
  }
  return (
    <form action={action} className="form">
      <Message state={state} />
      {state && !state.ok && (
        <p className="note">
          <Link href="/#platforms">See all platforms</Link>
        </p>
      )}
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Confirming…" : "Confirm subscription"}
      </button>
    </form>
  );
}

export function PreferencesForm({
  token,
  platforms,
  chosen,
}: {
  token: string;
  platforms: { slug: string; name: string; kind: string }[];
  chosen: string[];
}) {
  const page = `/newsletter/manage?t=${encodeURIComponent(token)}`; // so a browser without JavaScript gets its answer here
  const [state, action, pending] = useActionState(savePreferences.bind(null, token), null, page);
  // Unsubscribing goes to a page that says so (see manage/page.tsx); only a failure comes back here.
  const [leftState, leave, leaving] = useActionState(unsubscribeAll.bind(null, token), null, page);
  if (platforms.length === 0) {
    return (
      <>
        <p className="note">
          Nothing is being tracked right now, so there is nothing to choose. Your address is kept and you&rsquo;ll hear
          as soon as a platform you follow changes its terms.
        </p>
        <form action={leave} className="form">
          <button type="submit" className="button button-danger" disabled={leaving}>
            {leaving ? "Unsubscribing…" : "Unsubscribe and delete my address"}
          </button>
        </form>
      </>
    );
  }
  return (
    <>
      <form action={action} className="form">
        <fieldset>
          <legend>Platforms you get Monday emails about</legend>
          <p className="hint">Untick every platform and save to unsubscribe and delete your address.</p>
          <div className="choices">
            {platforms.map((p) => (
              <label key={p.slug} className="check">
                <input type="checkbox" name="platform" value={p.slug} defaultChecked={chosen.includes(p.slug)} />
                <span>
                  {p.name} <span className="index-kind">· {p.kind}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Message state={state} />
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <form action={leave} className="form">
        <p className="hint">Stops every email and deletes your address from Fine Print.</p>
        <Message state={leftState} />
        <button type="submit" className="button button-danger" disabled={leaving}>
          {leaving ? "Unsubscribing…" : "Unsubscribe from everything"}
        </button>
      </form>
    </>
  );
}

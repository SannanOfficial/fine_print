"use client";

import { useActionState, type ReactNode } from "react";
import { SHOWN_VIA } from "@/core/records.ts";
import { submitAgreement } from "./actions.ts";
import { LIMITS, type SubmitState, type SubmitValues } from "./limits.ts";

const EMPTY: SubmitValues = {
  platform: "",
  platformOther: "",
  documentName: "",
  receivedOn: "",
  shownVia: "",
  text: "",
  name: "",
  email: "",
  phone: "",
  profession: "",
  prefers: "email",
  noPatientInfo: false,
  contactOk: false,
};

function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field" data-invalid={error ? "" : undefined}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function Check({ id, error, children }: { id: string; error?: string; children: ReactNode }) {
  return (
    <div className="field" data-invalid={error ? "" : undefined}>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** aria attributes that tie an input to its hint and error. */
const describe = (id: string, error?: string, hint = false) => ({
  id,
  name: id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined,
});

export function SubmitForm({ platforms }: { platforms: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitAgreement, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="receipt" role="status">
        <p className="receipt-label">Received</p>
        <p className="receipt-ref">{state.reference}</p>
        <p>
          Thank you. Keep this reference. We will contact you at <strong>{state.email}</strong> to confirm the details
          before anything is published, usually within a week. Nothing you sent is public.
        </p>
        <p>If you need to withdraw your submission, reply to our message or quote the reference above.</p>
      </div>
    );
  }

  const v = state.status === "error" ? state.values : EMPTY;
  const e = state.status === "error" ? state.errors : {};

  return (
    <form action={action} className="form" key={state.status === "error" ? state.key : "new"}>
      {state.status === "error" && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}

      <fieldset>
        <legend>What you were shown</legend>

        <Field id="platform" label="Platform" error={e.platform}>
          <select {...describe("platform", e.platform)} defaultValue={v.platform} required>
            <option value="" disabled>
              Choose…
            </option>
            {platforms.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
            <option value="other">Another platform</option>
          </select>
        </Field>

        <Field id="platformOther" label="If another platform, which one?" optional error={e.platformOther}>
          <input {...describe("platformOther", e.platformOther)} defaultValue={v.platformOther} maxLength={LIMITS.short} />
        </Field>

        <Field
          id="documentName"
          label="What was it?"
          hint="For example: “Updated provider agreement, effective November 1” or “New fee schedule”."
          error={e.documentName}
        >
          <input
            {...describe("documentName", e.documentName, true)}
            defaultValue={v.documentName}
            maxLength={LIMITS.medium}
            required
          />
        </Field>

        <div className="field-row">
          <Field id="receivedOn" label="When did you receive it?" optional error={e.receivedOn}>
            <input {...describe("receivedOn", e.receivedOn)} type="date" defaultValue={v.receivedOn} />
          </Field>
          <Field id="shownVia" label="How was it shown to you?" error={e.shownVia}>
            <select {...describe("shownVia", e.shownVia)} defaultValue={v.shownVia} required>
              <option value="" disabled>
                Choose…
              </option>
              {Object.entries(SHOWN_VIA).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          id="text"
          label="The text"
          hint="Paste the agreement or email here, or attach files below. Include the whole thing if you can."
          error={e.text}
        >
          <textarea {...describe("text", e.text, true)} defaultValue={v.text} rows={10} maxLength={LIMITS.text} />
        </Field>

        <Field
          id="files"
          label="Files"
          optional
          hint="Up to 3 files, 8 MB in total: PDF, screenshots (PNG, JPEG, WebP), or a saved email (.eml, .txt)."
          error={e.files}
        >
          <input
            {...describe("files", e.files, true)}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,application/pdf,image/png,image/jpeg,image/webp,text/plain,message/rfc822"
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>How we can reach you</legend>
        <p className="hint">
          Only Fine Print&rsquo;s editors can see these details. We use them once, to confirm the submission with you,
          and never publish them or share them with the platform.
        </p>

        <div className="field-row">
          <Field id="name" label="Your name" error={e.name}>
            <input {...describe("name", e.name)} defaultValue={v.name} autoComplete="name" maxLength={LIMITS.short} required />
          </Field>
          <Field id="profession" label="Profession or license" optional error={e.profession}>
            <input
              {...describe("profession", e.profession)}
              defaultValue={v.profession}
              placeholder="e.g. LCSW, MD, RN, PT"
              maxLength={LIMITS.short}
            />
          </Field>
        </div>
        <div className="field-row">
          <Field id="email" label="Email" error={e.email}>
            <input
              {...describe("email", e.email)}
              type="email"
              defaultValue={v.email}
              autoComplete="email"
              maxLength={254}
              required
            />
          </Field>
          <Field id="phone" label="Phone" optional error={e.phone}>
            <input {...describe("phone", e.phone)} type="tel" defaultValue={v.phone} autoComplete="tel" maxLength={40} />
          </Field>
        </div>

        <div className="field">
          <span className="field-label" id="prefers-label">
            Best way to reach you
          </span>
          <div className="choices" role="radiogroup" aria-labelledby="prefers-label">
            <label>
              <input type="radio" name="prefers" value="email" defaultChecked={v.prefers === "email"} /> Email
            </label>
            <label>
              <input type="radio" name="prefers" value="phone" defaultChecked={v.prefers === "phone"} /> Phone
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Before you send</legend>
        <Check error={e.noPatientInfo} id="noPatientInfo">
          <label className="check">
            <input
              type="checkbox"
              name="noPatientInfo"
              defaultChecked={v.noPatientInfo}
              required
              aria-invalid={e.noPatientInfo ? true : undefined}
              aria-describedby={e.noPatientInfo ? "noPatientInfo-error" : undefined}
            />
            <span>
              I have removed any patient names or other patient information. (Agreements rarely contain any, but
              screenshots of an inbox sometimes do.)
            </span>
          </label>
        </Check>
        <Check error={e.contactOk} id="contactOk">
          <label className="check">
            <input
              type="checkbox"
              name="contactOk"
              defaultChecked={v.contactOk}
              required
              aria-invalid={e.contactOk ? true : undefined}
              aria-describedby={e.contactOk ? "contactOk-error" : undefined}
            />
            <span>Fine Print may contact me to confirm this submission.</span>
          </label>
        </Check>
      </fieldset>

      {/* Left empty by people; filled in by spam bots. */}
      <div className="trap" aria-hidden="true">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "Sending…" : "Send privately"}
      </button>
    </form>
  );
}

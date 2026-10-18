import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentAdmin } from "@/lib/auth.ts";
import { LoginForm } from "../forms.tsx";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="admin-title">Sign in</h1>
      <p className="note">For Fine Print editors. Accounts are created by the maintainer.</p>
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}

/** Someone already signed in goes straight to the dashboard. */
async function SignedInRedirect() {
  if (await currentAdmin()) redirect("/admin");
  return null;
}

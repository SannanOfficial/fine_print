import Link from "next/link";
import type { Admin } from "@/lib/auth.ts";
import { logout } from "./actions.ts";

export function AdminBar({ admin }: { admin: Admin }) {
  return (
    <div className="admin-bar">
      <nav aria-label="Admin">
        <Link href="/admin">Editor&rsquo;s desk</Link>
        <Link href="/admin/record">Add a record</Link>
        <Link href="/admin/platforms">Platforms</Link>
        <Link href="/">View site</Link>
      </nav>
      <form action={logout}>
        {admin.name} ·{" "}
        <button type="submit" className="link-button">
          Sign out
        </button>
      </form>
    </div>
  );
}

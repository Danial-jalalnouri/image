"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MeResponse =
  | { ok: true; access: boolean; role: "admin" | "member"; email: string; fullName: string | null }
  | { ok: false; error: string; code: string };

/**
 * Header link to /admin, rendered only for users with role = 'admin'
 * in the database (checked via /api/me, re-verified server-side there).
 */
export function AdminNavLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/me");
        const payload = (await response.json()) as MeResponse;
        setIsAdmin(payload.ok && payload.role === "admin");
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-indigo-300 transition hover:border-indigo-400/50 hover:text-indigo-200"
    >
      Admin
    </Link>
  );
}

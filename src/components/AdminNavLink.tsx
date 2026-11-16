"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type MeResponse =
  | { ok: true; access: boolean; role: "admin" | "member"; email: string; fullName: string | null }
  | { ok: false; error: string; code: string };

/** Single-flight /api/me check shared by every admin-only link on the page. */
let meCheck: Promise<boolean> | null = null;

function checkIsAdmin(): Promise<boolean> {
  if (!meCheck) {
    meCheck = (async () => {
      try {
        const response = await fetch("/api/me");
        const payload = (await response.json()) as MeResponse;
        return payload.ok && payload.role === "admin";
      } catch {
        return false;
      }
    })();
  }
  return meCheck;
}

/**
 * Link rendered only for users with role = 'admin' in the database (checked
 * via /api/me, re-verified server-side there). Defaults to the header Admin
 * button; pass href/className/children for other admin-only destinations,
 * e.g. the docs page in the footer.
 */
export function AdminNavLink({
  href = "/admin",
  className = "rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-indigo-300 transition hover:border-indigo-400/50 hover:text-indigo-200",
  children = "Admin",
}: {
  href?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void checkIsAdmin().then(setIsAdmin);
  }, []);

  if (!isAdmin) return null;

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

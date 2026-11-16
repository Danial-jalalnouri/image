import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getUser } from "@/lib/db";

/**
 * The internal docs page lives in /public with a dotted filename, so it never
 * matches the catch-all matcher below — it needs this explicit entry to be
 * protected at all.
 */
const isDocsPage = createRouteMatcher(["/how-it-works.html"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isDocsPage(request)) return;

  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    // Not signed in: bounce to sign-in and return straight here afterwards.
    return redirectToSignIn({ returnBackUrl: request.nextUrl.pathname });
  }

  // Admin status always comes from the database, exactly like the /api/admin/*
  // guards — never from the session alone.
  let isAdmin = false;
  try {
    const user = await getUser(userId);
    isAdmin = user?.role === "admin";
  } catch (error) {
    // Fail closed: an unreadable database must not expose the docs page.
    console.error("[proxy] Could not verify the user's role:", error);
  }
  if (!isAdmin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
});

export const config = {
  matcher: [
    "/how-it-works.html",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

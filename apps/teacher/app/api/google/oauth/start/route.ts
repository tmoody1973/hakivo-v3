import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  loadGoogleOAuthCredsFromEnv,
} from "@hakivo/packet/integrations/google-classroom";
import { randomBytes } from "node:crypto";

/**
 * GET /api/google/oauth/start
 *
 * Kicks off the Google Classroom OAuth flow. The user must be signed
 * into Clerk — that's how we know which Hakivo teacher to bind the
 * resulting refresh token to. We stash a nonce in an httpOnly cookie
 * and pass the same nonce as the OAuth state param so the callback can
 * defend against CSRF.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", baseUrl()));
  }

  const creds = loadGoogleOAuthCredsFromEnv();
  const nonce = randomBytes(24).toString("hex");
  const state = `${nonce}.${userId}`;

  const authorizeUrl = buildAuthorizeUrl(creds, state);
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("hakivo_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google/oauth",
  });
  return res;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

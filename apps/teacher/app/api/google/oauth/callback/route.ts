import { auth } from "@clerk/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@hakivo/db";
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCodeForTokens,
  fetchUserEmail,
  loadGoogleOAuthCredsFromEnv,
} from "@hakivo/packet/integrations/google-classroom";

/**
 * GET /api/google/oauth/callback?code=...&state=...
 *
 * OAuth redirect target. Validates the state param against the nonce
 * cookie set in /start, exchanges the auth code for tokens, looks up
 * the teacher by Clerk userId, persists the refresh token + Google
 * email, then redirects to /teacher/settings/classroom for course
 * selection.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return errorRedirect(`google_${error}`);
  }
  if (!code || !state) {
    return errorRedirect("missing_code_or_state");
  }

  const cookieNonce = request.cookies.get("hakivo_oauth_nonce")?.value;
  const [stateNonce, stateUserId] = state.split(".");
  if (!cookieNonce || !stateNonce || cookieNonce !== stateNonce) {
    return errorRedirect("nonce_mismatch");
  }

  const { userId, getToken } = await auth();
  if (!userId || userId !== stateUserId) {
    return errorRedirect("unauthenticated");
  }

  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) return errorRedirect("no_convex_token");

  const teacher = await fetchQuery(
    api.teachers.getMe,
    {},
    { token: convexToken },
  );
  if (!teacher) return errorRedirect("not_onboarded");

  try {
    const creds = loadGoogleOAuthCredsFromEnv();
    const tokens = await exchangeCodeForTokens(creds, code);
    const profile = await fetchUserEmail(tokens.accessToken);

    await fetchMutation(api.teachers.setClassroomTokens, {
      teacherId: teacher._id,
      refreshToken: tokens.refreshToken,
      googleEmail: profile.email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[oauth-callback]", message);
    return errorRedirect(`exchange_failed:${encodeURIComponent(message.slice(0, 80))}`);
  }

  const res = NextResponse.redirect(
    new URL("/teacher/settings/classroom?connected=1", baseUrl()),
  );
  res.cookies.delete("hakivo_oauth_nonce");
  return res;
}

function errorRedirect(reason: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/teacher/settings/classroom?error=${reason}`, baseUrl()),
  );
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

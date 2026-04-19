/**
 * Direct REST client for Google Classroom + Google OAuth token exchange.
 *
 * No `googleapis` SDK — that package bundles to ~200MB which Trigger.dev
 * has to ship into every dev/prod worker. Classroom API is plain JSON
 * over HTTPS, so a thin fetch wrapper costs nothing.
 *
 * OAuth flow expectations:
 *   - Web app type, NOT installed app
 *   - access_type=offline + prompt=consent on first auth so Google
 *     issues a refresh_token (otherwise refresh_token is omitted on
 *     subsequent auths and we'd be stuck)
 *   - Scopes: classroom.courses.readonly, classroom.announcements,
 *     classroom.profile.emails
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLASSROOM_BASE = "https://classroom.googleapis.com/v1";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.announcements",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  "openid",
  "email",
] as const;

export type GoogleOAuthCreds = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

export type ClassroomCourse = {
  readonly id: string;
  readonly name: string;
  readonly section?: string;
  readonly courseState: string;
  readonly enrollmentCode?: string;
  readonly alternateLink: string;
};

export type ClassroomAnnouncement = {
  readonly id: string;
  readonly alternateLink: string;
  readonly courseId: string;
  readonly text: string;
};

/**
 * Build the URL the user is redirected to to start the OAuth flow.
 * `state` should be a CSRF-resistant nonce + the teacherId so the
 * callback can resume the session.
 */
export function buildAuthorizeUrl(
  creds: GoogleOAuthCreds,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: CLASSROOM_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange the auth code from the OAuth callback for tokens. Returns
 * both access + refresh tokens — the refresh token is what we persist.
 */
export async function exchangeCodeForTokens(
  creds: GoogleOAuthCreds,
  code: string,
): Promise<{
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSec: number;
  readonly idToken?: string;
}> {
  const body = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `Google token exchange ${res.status}: ${detail.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as {
    readonly access_token?: string;
    readonly refresh_token?: string;
    readonly expires_in?: number;
    readonly id_token?: string;
  };
  if (!json.access_token) throw new Error("No access_token in token response");
  if (!json.refresh_token) {
    throw new Error(
      "No refresh_token — user must re-consent. Did you set prompt=consent?",
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSec: json.expires_in ?? 3600,
    ...(json.id_token !== undefined && { idToken: json.id_token }),
  };
}

/**
 * Use a stored refresh token to get a fresh access token. Called from
 * the push task — we never persist access tokens.
 */
export async function refreshAccessToken(
  creds: GoogleOAuthCreds,
  refreshToken: string,
): Promise<{ readonly accessToken: string; readonly expiresInSec: number }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `Google token refresh ${res.status}: ${detail.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as {
    readonly access_token?: string;
    readonly expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("No access_token in refresh response");
  }
  return {
    accessToken: json.access_token,
    expiresInSec: json.expires_in ?? 3600,
  };
}

export async function fetchUserEmail(
  accessToken: string,
): Promise<{ readonly email: string }> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { readonly email?: string };
  if (!json.email) throw new Error("No email in userinfo response");
  return { email: json.email };
}

/**
 * List the teacher's ACTIVE courses. Used to populate the course-picker
 * dropdown after OAuth completes. Filters to courses the user owns or
 * teaches (not student enrollments).
 */
export async function listCourses(
  accessToken: string,
): Promise<ReadonlyArray<ClassroomCourse>> {
  const params = new URLSearchParams({
    teacherId: "me",
    courseStates: "ACTIVE",
    pageSize: "50",
  });
  const res = await fetch(`${CLASSROOM_BASE}/courses?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Classroom listCourses ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    readonly courses?: ReadonlyArray<ClassroomCourse>;
  };
  return json.courses ?? [];
}

/**
 * Post an announcement to a course's stream. Materials accept any
 * URL, so we just pass the packet's pdfUrl. Body text gets the brief
 * headline + a link to the audio if available.
 */
export async function createAnnouncement(
  accessToken: string,
  args: {
    readonly courseId: string;
    readonly text: string;
    readonly materials?: ReadonlyArray<{
      readonly link: { readonly url: string; readonly title?: string };
    }>;
  },
): Promise<ClassroomAnnouncement> {
  const res = await fetch(
    `${CLASSROOM_BASE}/courses/${args.courseId}/announcements`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: args.text,
        ...(args.materials && { materials: args.materials }),
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `Classroom createAnnouncement ${res.status}: ${detail.slice(0, 500)}`,
    );
  }
  return (await res.json()) as ClassroomAnnouncement;
}

export function loadGoogleOAuthCredsFromEnv(): GoogleOAuthCreds {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !redirectUri && "GOOGLE_REDIRECT_URI",
  ].filter((s): s is string => Boolean(s));
  if (missing.length > 0) {
    throw new Error(`Google OAuth env missing: ${missing.join(", ")}`);
  }
  return { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri! };
}

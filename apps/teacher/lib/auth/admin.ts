import "server-only";

/**
 * Parse ADMIN_USER_IDS from env. Comma-separated Clerk user ids.
 * Returns a Set for O(1) membership check. Empty by default.
 *
 * Example:
 *   ADMIN_USER_IDS=user_3CXNfZDcXJIsUGazBMgck1JB9Yi,user_...
 *
 * Before v3.0 production, replace with Clerk Organization roles or
 * WorkOS admin groups. For beta, env-var allowlist is enough.
 */
export function getAdminUserIds(): ReadonlySet<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export function isAdmin(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) return false;
  return getAdminUserIds().has(clerkUserId);
}

/**
 * Convex auth config — identity is delegated to Clerk via JWT.
 *
 * `CLERK_JWT_ISSUER_DOMAIN` is set on the Convex deployment (not in local
 * .env.local) via `bunx convex env set`. Any Convex query/mutation that
 * calls `ctx.auth.getUserIdentity()` will verify the incoming JWT against
 * this issuer.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "",
      applicationID: "convex",
    },
  ],
};

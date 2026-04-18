/**
 * Convex auth config — delegates identity verification to Clerk via JWT.
 * `CLERK_JWT_ISSUER_DOMAIN` is set in the Convex dashboard env once Clerk
 * is provisioned. Until then, unauthenticated queries return null identity.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "",
      applicationID: "convex",
    },
  ],
};

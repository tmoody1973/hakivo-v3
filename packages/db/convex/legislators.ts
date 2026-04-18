import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Legislator data-access layer.
 *
 * upsertBatch is called by the ingest-legislators-weekly Trigger.dev task.
 * Same trust-boundary caveat as bills.upsertBatch — week-2 will gate it
 * behind a Convex httpAction + bearer token.
 */

const legislatorRecord = v.object({
  orgId: v.string(),
  bioguideId: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  fullName: v.string(),
  state: v.string(),
  chamber: v.union(v.literal("house"), v.literal("senate")),
  district: v.union(v.number(), v.null()),
  party: v.string(),
  termStart: v.string(),
  termEnd: v.string(),
  officialUrl: v.optional(v.string()),
  phone: v.optional(v.string()),
  office: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  wikipediaSlug: v.optional(v.string()),
  twitter: v.optional(v.string()),
  youtube: v.optional(v.string()),
  facebook: v.optional(v.string()),
  instagram: v.optional(v.string()),
});

export const upsertBatch = mutation({
  args: { legislators: v.array(legislatorRecord) },
  handler: async (ctx, { legislators }) => {
    let inserted = 0;
    let updated = 0;
    for (const leg of legislators) {
      const existing = await ctx.db
        .query("legislators")
        .withIndex("by_bioguideId", (q) => q.eq("bioguideId", leg.bioguideId))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, leg);
        updated += 1;
      } else {
        await ctx.db.insert("legislators", leg);
        inserted += 1;
      }
    }
    return { inserted, updated, total: legislators.length };
  },
});

export const listByState = query({
  args: {
    state: v.string(),
    chamber: v.optional(v.union(v.literal("house"), v.literal("senate"))),
  },
  handler: async (ctx, { state, chamber }) => {
    if (chamber) {
      return await ctx.db
        .query("legislators")
        .withIndex("by_state_chamber", (q) =>
          q.eq("state", state).eq("chamber", chamber),
        )
        .collect();
    }
    return await ctx.db
      .query("legislators")
      .withIndex("by_state_chamber", (q) => q.eq("state", state))
      .collect();
  },
});

export const getByBioguideId = query({
  args: { bioguideId: v.string() },
  handler: async (ctx, { bioguideId }) => {
    return await ctx.db
      .query("legislators")
      .withIndex("by_bioguideId", (q) => q.eq("bioguideId", bioguideId))
      .first();
  },
});

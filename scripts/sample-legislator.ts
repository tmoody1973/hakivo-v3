#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const wiLeg = await convex.query(api.legislators.listByState, {
  state: "WI",
  chamber: "senate",
});

for (const l of wiLeg) {
  console.log(
    JSON.stringify(
      {
        name: l.fullName,
        party: l.party,
        state: l.state,
        chamber: l.chamber,
        district: l.district,
        photoUrl: l.photoUrl,
        officialUrl: l.officialUrl,
        twitter: l.twitter ?? null,
        youtube: l.youtube ?? null,
        facebook: l.facebook ?? null,
        instagram: l.instagram ?? null,
        wikipediaSlug: l.wikipediaSlug ?? null,
      },
      null,
      2,
    ),
  );
}

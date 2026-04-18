#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const [id, orgId] = process.argv.slice(2);
if (!id || !orgId)
  throw new Error("usage: repoint-teacher.ts <teacherId> <orgId>");

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const result = await convex.mutation(api.teachers.repointOrg, {
  id: id as never,
  orgId,
});
console.log("Repointed:", result);

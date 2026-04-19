#!/usr/bin/env bun
/**
 * Fire fetch-policy-news with comma-separated tags.
 *   bun run scripts/fire-fetch-news.ts "broadband,voting rights,AI policy"
 *
 * Useful for sanity-checking that Perplexity returns useful content
 * for your interests before wiring into the personal-packet generator.
 */
import { tasks } from "@trigger.dev/sdk";
import type { fetchPolicyNews } from "@hakivo/packet/tasks";

const raw = process.argv[2];
if (!raw) {
  throw new Error('usage: fire-fetch-news.ts "tag1,tag2,tag3"');
}
const tags = raw
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const handle = await tasks.trigger<typeof fetchPolicyNews>(
  "fetch-policy-news",
  { tags, recency: "week", maxItemsPerTag: 3 },
);
console.log("Triggered run:", handle.id);
console.log("Tags:", tags);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);

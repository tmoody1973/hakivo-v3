#!/usr/bin/env bun
import { tasks } from "@trigger.dev/sdk";
import type { generatePacket } from "@hakivo/packet/tasks";

const [teacherId, packetDate] = process.argv.slice(2);
if (!teacherId) throw new Error("usage: <teacherId> [YYYY-MM-DD]");

const handle = await tasks.trigger<typeof generatePacket>("generate-packet", {
  teacherId: teacherId as never,
  ...(packetDate !== undefined && { packetDate }),
});

console.log("Run:", handle.id);

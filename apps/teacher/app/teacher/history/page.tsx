import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { PacketHistory } from "../_components/packet-history";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ teacherId?: string }>;
}) {
  const { teacherId: override } = await searchParams;
  const { getToken } = await auth();

  const teacher = override
    ? await fetchQuery(api.teachers.getById, {
        id: override as Id<"teachers">,
      })
    : await (async () => {
        const token = await getToken({ template: "convex" });
        if (!token) return null;
        return fetchQuery(api.teachers.getMe, {}, { token });
      })();

  if (!teacher) redirect("/teacher/onboarding");

  const packets = await fetchQuery(api.packets.listByTeacher, {
    teacherId: teacher._id,
    limit: 100,
  });

  return <PacketHistory packets={packets} />;
}

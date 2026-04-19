import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { FeaturedPacket } from "./_components/featured-packet";
import { PacketHistory } from "./_components/packet-history";
import { StatusRail } from "./_components/status-rail";
import { GeneratingBanner } from "./_components/generating-banner";

type SearchParams = Promise<{
  teacherId?: string;
  packetRun?: string;
}>;

export default async function TeacherHome({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { teacherId: override, packetRun } = await searchParams;
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
    limit: 10,
  });

  const featured = packets[0] ?? null;

  return (
    <div className="space-y-6">
      {packetRun && <GeneratingBanner runId={packetRun} />}
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <FeaturedPacket packet={featured} />
          <PacketHistory packets={packets} />
        </div>
        <StatusRail teacher={teacher} packet={featured} />
      </div>
    </div>
  );
}

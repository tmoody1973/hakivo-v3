import { auth } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { CreateForm } from "./create-form";

const DAILY_QUOTA = 5;

export default async function CreatePacketPage() {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) redirect("/sign-in");

  const teacher = await fetchQuery(api.teachers.getMe, {}, { token });
  if (!teacher) redirect("/teacher/onboarding");

  const today = new Date().toISOString().slice(0, 10);
  const requestsToday = await fetchQuery(
    api.packets.countTeacherRequestsToday,
    { teacherId: teacher._id, date: today },
    { token },
  );

  return (
    <section className="max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        CREATE A PACKET
      </p>
      <h1 className="mt-4 font-serif text-3xl leading-tight">
        Build a custom brief.
      </h1>
      <p className="mt-3 text-ink-muted">
        Override your default topic, pre-seed specific bills, or adjust reading
        level. Same pipeline as your daily packet — just parametrized by you.
        Quota: 5 custom packets per day.
      </p>

      <CreateForm
        quotaUsed={requestsToday}
        quotaMax={DAILY_QUOTA}
        defaultDate={today}
      />
    </section>
  );
}

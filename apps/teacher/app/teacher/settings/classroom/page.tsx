import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@hakivo/db";
import { redirect } from "next/navigation";
import { ClassroomConnectForm } from "./classroom-connect-form";

/**
 * /teacher/settings/classroom
 *
 * Connect / disconnect Google Classroom and pick the default course
 * packets push to. The "Connect" button opens /api/google/oauth/start
 * which kicks off the OAuth flow; the callback returns here with
 * ?connected=1 (or ?error=...) so the user sees feedback inline.
 */

export default async function ClassroomSettingsPage(props: {
  searchParams: Promise<{
    connected?: string;
    error?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) redirect("/sign-in");

  const teacher = await fetchQuery(api.teachers.getMe, {}, { token });
  if (!teacher) redirect("/teacher/onboarding");

  return (
    <section className="max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        SETTINGS · GOOGLE CLASSROOM
      </p>
      <h1 className="mt-4 font-serif text-3xl leading-tight">
        Push packets to your classroom.
      </h1>
      <p className="mt-3 text-ink-muted">
        Connect your Google account and pick a course. After that, every
        packet email gets a "Push to Google Classroom" button — one click
        and the brief, discussion questions, audio briefing, and PDF
        handout land in your class stream.
      </p>

      {sp.connected && (
        <div className="mt-4 rounded border border-accent bg-accent/5 px-3 py-2 text-sm text-ink">
          Connected as <strong>{teacher.classroomGoogleEmail}</strong>. Pick a
          default course below.
        </div>
      )}
      {sp.error && (
        <div className="mt-4 rounded border border-rule bg-cream px-3 py-2 text-sm text-ink-muted">
          OAuth error: <code>{sp.error}</code>. Try connecting again.
        </div>
      )}

      <ClassroomConnectForm
        teacherId={teacher._id}
        connected={teacher.classroomConnected}
        googleEmail={teacher.classroomGoogleEmail ?? null}
        currentCourseId={teacher.classroomCourseId ?? null}
        currentCourseName={teacher.classroomCourseName ?? null}
      />
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@hakivo/db";
import { useRouter } from "next/navigation";

type Course = {
  readonly id: string;
  readonly name: string;
  readonly section?: string;
  readonly courseState: string;
};

export function ClassroomConnectForm(props: {
  readonly teacherId: Id<"teachers">;
  readonly connected: boolean;
  readonly googleEmail: string | null;
  readonly currentCourseId: string | null;
  readonly currentCourseName: string | null;
}) {
  const router = useRouter();
  const setCourse = useMutation(api.teachers.setClassroomCourse);
  const disconnect = useMutation(api.teachers.disconnectClassroom);

  const [courses, setCourses] = useState<ReadonlyArray<Course> | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(
    props.currentCourseId,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.connected) return;
    setLoadingCourses(true);
    fetch("/api/google/courses")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { courses: ReadonlyArray<Course> }) => {
        setCourses(data.courses);
        setCoursesError(null);
      })
      .catch((err) => {
        setCoursesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoadingCourses(false));
  }, [props.connected]);

  if (!props.connected) {
    return (
      <div className="mt-6">
        <a
          href="/api/google/oauth/start"
          className="inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-ink/90"
        >
          Connect Google Classroom
        </a>
        <p className="mt-3 text-xs text-ink-muted">
          You'll be redirected to Google to grant Hakivo permission to read
          your courses and post announcements. We never read student data.
        </p>
      </div>
    );
  }

  const onSave = async () => {
    if (!pendingCourseId || !courses) return;
    const course = courses.find((c) => c.id === pendingCourseId);
    if (!course) return;
    setSaving(true);
    try {
      await setCourse({
        teacherId: props.teacherId,
        courseId: course.id,
        courseName: course.name,
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect Google Classroom? Future packets won't push.")) {
      return;
    }
    await disconnect({ teacherId: props.teacherId });
    router.refresh();
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded border border-rule bg-cream px-4 py-3 text-sm">
        Connected as <strong>{props.googleEmail}</strong>
        <button
          type="button"
          onClick={onDisconnect}
          className="ml-3 text-xs text-ink-muted underline hover:text-ink"
        >
          Disconnect
        </button>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold tracking-wider text-ink-muted">
          DEFAULT COURSE
        </label>
        {loadingCourses && (
          <p className="text-sm text-ink-muted">Loading your courses…</p>
        )}
        {coursesError && (
          <p className="text-sm text-ink-muted">
            Couldn't load courses: <code>{coursesError}</code>
          </p>
        )}
        {courses && courses.length === 0 && (
          <p className="text-sm text-ink-muted">
            No active courses found in your Classroom account.
          </p>
        )}
        {courses && courses.length > 0 && (
          <select
            value={pendingCourseId ?? ""}
            onChange={(e) => setPendingCourseId(e.target.value)}
            className="w-full rounded border border-rule bg-white px-3 py-2 text-sm"
          >
            <option value="">— pick a course —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` · ${c.section}` : ""}
              </option>
            ))}
          </select>
        )}
        {props.currentCourseName && pendingCourseId === props.currentCourseId && (
          <p className="mt-1 text-xs text-ink-muted">
            Currently saved: {props.currentCourseName}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={
          saving ||
          !pendingCourseId ||
          pendingCourseId === props.currentCourseId
        }
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save default course"}
      </button>
    </div>
  );
}

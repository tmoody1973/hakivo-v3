"use server";

import { auth } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchMutation } from "convex/nextjs";
import { revalidatePath } from "next/cache";

type SettingsState = { error: string } | { ok: true } | null;

const GRADE_OPTIONS = ["9", "10", "11", "12"] as const;

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return { error: "Sign-in required." };

  const name = (formData.get("name") as string | null)?.trim();
  const school = (formData.get("school") as string | null)?.trim();
  const state = (formData.get("state") as string | null)?.trim();
  const gradesTaught = GRADE_OPTIONS.filter(
    (g) => formData.get(`grade_${g}`) === "on",
  );
  const coursesRaw = (formData.get("courses") as string | null) ?? "";
  const courses = coursesRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const currentUnit = (formData.get("currentUnit") as string | null)?.trim();
  const targetReadingLevel = (
    formData.get("targetReadingLevel") as string | null
  )?.trim();
  const timezone = (formData.get("timezone") as string | null)?.trim();

  await fetchMutation(
    api.teachers.updateMe,
    {
      ...(name ? { name } : {}),
      ...(school ? { school } : {}),
      ...(state ? { state } : {}),
      ...(gradesTaught.length > 0 ? { gradesTaught } : {}),
      ...(courses.length > 0 ? { courses } : {}),
      ...(currentUnit !== undefined
        ? { currentUnit: currentUnit || null }
        : {}),
      ...(targetReadingLevel ? { targetReadingLevel } : {}),
      ...(timezone ? { timezone } : {}),
    },
    { token },
  );

  revalidatePath("/teacher");
  revalidatePath("/teacher/settings");
  return { ok: true };
}

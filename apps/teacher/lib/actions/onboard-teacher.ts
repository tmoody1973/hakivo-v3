"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchMutation } from "convex/nextjs";
import { redirect } from "next/navigation";

type OnboardState = { error: string } | null;

const GRADE_OPTIONS = ["9", "10", "11", "12"] as const;

export async function onboardTeacher(
  _prev: OnboardState,
  formData: FormData,
): Promise<OnboardState> {
  const { userId, orgId, getToken } = await auth();
  if (!userId) return { error: "You must be signed in to onboard." };

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return { error: "No email on your Clerk account." };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const school = (formData.get("school") as string | null)?.trim() || undefined;
  const state = (formData.get("state") as string | null)?.trim() || undefined;
  const gradesTaught = GRADE_OPTIONS.filter(
    (g) => formData.get(`grade_${g}`) === "on",
  );
  const courses = (formData.get("courses") as string | null)
    ?.split(",")
    .map((c) => c.trim())
    .filter(Boolean) ?? [];
  const currentUnit =
    (formData.get("currentUnit") as string | null)?.trim() || null;
  const targetReadingLevel =
    (formData.get("targetReadingLevel") as string | null)?.trim() || undefined;
  const timezone = (formData.get("timezone") as string | null) || "UTC";

  if (!name) return { error: "Name is required." };

  const token = await getToken({ template: "convex" });
  if (!token) {
    return {
      error:
        "Missing Clerk JWT template 'convex'. Create it in the Clerk dashboard → JWT Templates.",
    };
  }

  await fetchMutation(
    api.teachers.create,
    {
      orgId: orgId ?? userId,
      role: "teacher",
      email,
      name,
      ...(school !== undefined && { school }),
      ...(state !== undefined && { state }),
      gradesTaught,
      courses,
      currentUnit,
      ...(targetReadingLevel !== undefined && { targetReadingLevel }),
      timezone,
    },
    { token },
  );

  redirect("/teacher");
}

import { currentUser } from "@clerk/nextjs/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await currentUser();
  const defaultName =
    user?.fullName ?? [user?.firstName, user?.lastName].filter(Boolean).join(" ") ?? "";

  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-ink">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        HAKIVO · ONBOARDING
      </p>
      <h1 className="mt-6 font-serif text-4xl leading-tight">
        Set your classroom.
      </h1>
      <p className="mt-4 text-ink-muted">
        Tell us where you teach so your daily packet is aligned to the right
        standards, reading level, and time zone. You can change any of this
        later from Settings.
      </p>
      <OnboardingForm defaultName={defaultName} />
    </main>
  );
}

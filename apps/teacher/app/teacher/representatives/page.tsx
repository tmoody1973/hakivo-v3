import { auth } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { LookupForm } from "./lookup-form";

export default async function RepresentativesPage() {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  let defaultAddress = "";
  if (token) {
    const me = await fetchQuery(api.teachers.getMe, {}, { token });
    if (me?.school) defaultAddress = me.school;
  }

  return (
    <section className="max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        REPRESENTATIVES
      </p>
      <h1 className="mt-4 font-serif text-3xl leading-tight">Find your reps.</h1>
      <p className="mt-3 text-ink-muted">
        Geocodio resolves your address to your congressional district. We pull
        your senators (state-wide) and house representative (district) from the
        535-member roster, with photos, contact info, and social handles.
      </p>

      <div className="mt-8">
        <LookupForm defaultAddress={defaultAddress} />
      </div>
    </section>
  );
}

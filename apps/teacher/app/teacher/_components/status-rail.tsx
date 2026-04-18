import type { Doc } from "@hakivo/db";

const UNIT_LABELS: Record<string, string> = {
  unit_1: "Unit 1. Foundations of American Democracy",
  unit_2: "Unit 2. Interactions Among Branches",
  unit_3: "Unit 3. Civil Liberties & Civil Rights",
  unit_4: "Unit 4. American Political Ideologies",
  unit_5: "Unit 5. Political Participation",
};

function nextFiveAmLocal(timezone: string): string {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return tomorrow.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    });
  } catch {
    return "5:00 AM";
  }
}

export function StatusRail({
  teacher,
  packet,
}: {
  teacher: Doc<"teachers">;
  packet: Doc<"packets"> | null;
}) {
  const unitLabel = teacher.currentUnit
    ? UNIT_LABELS[teacher.currentUnit] ?? teacher.currentUnit
    : "Not teaching AP Gov";

  const standardsCount = packet
    ? packet.standardsAlignment.c3Dimensions.length +
      (packet.standardsAlignment.apCedUnits?.length ?? 0) +
      packet.standardsAlignment.stateStandards.length
    : 0;

  return (
    <aside
      aria-label="Status"
      className="space-y-6 rounded-lg border border-rule bg-white/40 p-6 text-sm"
    >
      <h2 className="font-semibold tracking-[0.14em] text-ink-muted uppercase text-xs">
        Status
      </h2>

      <dl className="space-y-5 text-ink">
        <div>
          <dt className="text-xs text-ink-muted">Next packet</dt>
          <dd className="mt-1 font-serif text-xl">
            {nextFiveAmLocal(teacher.timezone)}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-ink-muted">Current CED unit</dt>
          <dd className="mt-1">{unitLabel}</dd>
        </div>

        <div>
          <dt className="text-xs text-ink-muted">Standards coverage</dt>
          <dd className="mt-1">
            {packet
              ? `${standardsCount} references`
              : "Arrives with first packet"}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-ink-muted">Classroom</dt>
          <dd className="mt-1">
            {teacher.classroomConnected ? "Connected" : "Not connected"}
          </dd>
        </div>
      </dl>
    </aside>
  );
}

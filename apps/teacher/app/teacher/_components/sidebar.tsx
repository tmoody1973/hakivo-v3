import Link from "next/link";

type NavItem = {
  label: string;
  href: string;
  badge?: string;
};

const NAV: readonly NavItem[] = [
  { label: "Today's Packet", href: "/teacher" },
  { label: "Create packet", href: "/teacher/create" },
  { label: "History", href: "/teacher/history" },
  { label: "Hakivo Studio", href: "/teacher/studio", badge: "coming" },
  { label: "Settings", href: "/teacher/settings" },
];

export function Sidebar({ activeHref }: { activeHref: string }) {
  return (
    <nav
      aria-label="Teacher"
      className="flex flex-col gap-1 border-r border-rule px-2 py-6 text-sm md:px-4 md:py-10"
    >
      {NAV.map((item) => {
        const isActive = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors ${
              isActive
                ? "bg-white text-ink"
                : "text-ink-muted hover:bg-white/60 hover:text-ink"
            }`}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="ml-2 rounded bg-rule px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

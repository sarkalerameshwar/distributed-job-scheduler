import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { useRealtime } from "../hooks/useRealtime";
import { ThemeToggle } from "../components/ThemeToggle";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/organizations", label: "Organizations" },
  { to: "/projects", label: "Projects" },
  { to: "/queues", label: "Queues" },
  { to: "/jobs", label: "Jobs" },
  { to: "/schedules", label: "Schedules" },
  { to: "/dlq", label: "DLQ" },
  { to: "/workers", label: "Workers" },
];

export function AppLayout() {
  const { user, memberships, logout } = useAuth();
  const { status: live } = useRealtime();

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-screen-2xl px-5 sm:px-8">
          <div className="flex h-12 items-center justify-between gap-3">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-[11px] font-extrabold tracking-tight text-canvas">
                DJS
              </span>
              <span className="text-sm font-semibold text-ink">Job Scheduler</span>
            </Link>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <ThemeToggle />
              {user ? (
                <>
                  <div
                    className={`hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold sm:inline-flex ${
                      live === "connected"
                        ? "bg-signal-ok/10 text-signal-ok"
                        : live === "error"
                          ? "bg-signal-danger/10 text-signal-danger"
                          : "bg-canvas text-steel"
                    }`}
                    title="Realtime connection"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        live === "connected"
                          ? "animate-pulse-dot bg-signal-ok"
                          : live === "error"
                            ? "bg-signal-danger"
                            : "bg-steel"
                      }`}
                    />
                    {live === "connected" ? "Live" : live === "error" ? "Offline" : "Connecting"}
                  </div>
                  <div className="hidden border-l border-line pl-3 text-right md:block">
                    <p className="text-[13px] font-semibold leading-tight text-ink">{user.name}</p>
                    <p className="text-[11px] text-steel">
                      {memberships[0] ? `${memberships[0].slug} · ${memberships[0].role}` : user.email}
                    </p>
                  </div>
                  <button type="button" onClick={() => void logout()} className="btn-ghost !py-1.5 !text-xs">
                    Sign out
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {user ? (
            <nav
              className="flex flex-wrap gap-1 overflow-x-hidden border-t border-line py-2"
              aria-label="Primary"
            >
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                      isActive ? "bg-canvas text-ink" : "text-steel hover:bg-canvas hover:text-ink"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl animate-rise px-5 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}

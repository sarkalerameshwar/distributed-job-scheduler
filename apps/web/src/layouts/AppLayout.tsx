import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { useRealtime } from "../hooks/useRealtime";

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
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex shrink-0 items-baseline gap-3">
            <span className="font-mono text-sm tracking-widest text-cyan-400">DJS</span>
            <span className="hidden text-sm font-medium text-slate-200 sm:inline">Job Scheduler</span>
          </Link>
          {user ? (
            <nav className="flex max-w-full flex-1 gap-1 overflow-x-auto text-sm text-slate-400">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-colors ${
                      isActive ? "bg-slate-900 text-cyan-300" : "hover:text-cyan-300"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm text-slate-200">{user.name}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {memberships[0] ? `${memberships[0].slug} · ${memberships[0].role}` : user.email}
                  </p>
                </div>
                <span
                  className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] sm:inline-flex ${
                    live === "connected"
                      ? "border-emerald-900/70 text-emerald-300"
                      : live === "error"
                        ? "border-rose-900/70 text-rose-300"
                        : "border-slate-700 text-slate-500"
                  }`}
                  title="Socket.IO live updates"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      live === "connected"
                        ? "bg-emerald-400"
                        : live === "error"
                          ? "bg-rose-400"
                          : "bg-slate-500"
                    }`}
                  />
                  {live === "connected" ? "live" : live === "error" ? "offline" : "…"}
                </span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  Sign out
                </button>
              </>
            ) : null}
            <span className="rounded-full border border-cyan-900/80 bg-cyan-950/40 px-3 py-1 font-mono text-xs text-cyan-300">
              Phase 18
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

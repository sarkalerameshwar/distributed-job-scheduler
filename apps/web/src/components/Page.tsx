import type { ReactNode } from "react";
import { ApiRequestError } from "../services/api";

export function Header(props: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">{props.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{props.subtitle}</p>
    </div>
  );
}

export function ResourceList(props: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  if (props.loading) {
    return <div className="rounded-xl border border-slate-800 p-6 text-sm text-slate-400">Loading…</div>;
  }
  if (props.error) {
    const message = props.error instanceof ApiRequestError ? props.error.message : "Request failed";
    return <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-6 text-sm text-rose-300">{message}</div>;
  }
  if (props.empty) {
    return <div className="rounded-xl border border-slate-800 p-6 text-sm text-slate-500">{props.emptyText}</div>;
  }
  return <>{props.children}</>;
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ACTIVE" ||
    status === "COMPLETED" ||
    status === "ONLINE" ||
    status === "QUEUED" ||
    status === "RESOLVED" ||
    status === "RETRIED"
      ? "border-emerald-800 text-emerald-300"
      : status === "PAUSED" ||
          status === "SCHEDULED" ||
          status === "RETRYING" ||
          status === "RUNNING" ||
          status === "CLAIMED" ||
          status === "DRAINING" ||
          status === "STARTING"
        ? "border-amber-800 text-amber-300"
        : status === "FAILED" ||
            status === "DLQ" ||
            status === "DISABLED" ||
            status === "CANCELLED" ||
            status === "DISCARDED" ||
            status === "OFFLINE" ||
            status === "TIMEOUT"
          ? "border-rose-800 text-rose-300"
          : "border-slate-700 text-slate-400";
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase ${tone}`}>{status}</span>
  );
}

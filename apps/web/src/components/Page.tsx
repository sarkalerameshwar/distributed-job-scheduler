import type { ReactNode } from "react";
import { ApiRequestError } from "../services/api";

export function Header(props: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{props.title}</h1>
        {props.subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-steel">{props.subtitle}</p>
        ) : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
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
    return <div className="panel px-5 py-8 text-sm text-steel">Loading…</div>;
  }
  if (props.error) {
    const message = props.error instanceof ApiRequestError ? props.error.message : "Request failed";
    return (
      <div className="rounded-xl border border-signal-danger/20 bg-signal-danger/5 px-5 py-6 text-sm text-signal-danger">
        {message}
      </div>
    );
  }
  if (props.empty) {
    return <div className="panel px-5 py-8 text-sm text-steel">{props.emptyText}</div>;
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
      ? "bg-signal-ok/10 text-signal-ok ring-signal-ok/15"
      : status === "PAUSED" ||
          status === "SCHEDULED" ||
          status === "RETRYING" ||
          status === "RUNNING" ||
          status === "CLAIMED" ||
          status === "DRAINING" ||
          status === "STARTING"
        ? "bg-signal-warn/10 text-signal-warn ring-signal-warn/15"
        : status === "FAILED" ||
            status === "DLQ" ||
            status === "DISABLED" ||
            status === "CANCELLED" ||
            status === "DISCARDED" ||
            status === "OFFLINE" ||
            status === "TIMEOUT"
          ? "bg-signal-danger/10 text-signal-danger ring-signal-danger/15"
          : "bg-canvas text-steel ring-line";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${tone}`}>
      {status}
    </span>
  );
}

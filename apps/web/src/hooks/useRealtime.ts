import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import type { RealtimeEvent } from "@djs/shared-types";
import { getAccessToken } from "../services/api";
import { useAuth } from "../stores/auth";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "error";

/**
 * Connects to the API Socket.IO `/realtime` namespace and invalidates React Query
 * caches when job/queue/DLQ/worker events arrive.
 */
export function useRealtime(): { status: RealtimeStatus } {
  const { user, memberships, ready } = useAuth();
  const orgId = memberships[0]?.organizationId;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("idle");

  useEffect(() => {
    if (!ready || !user) {
      setStatus("idle");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    const socket: Socket = io("/realtime", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
    });

    const invalidateOrg = () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["queues"] });
      void queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["dlq"] });
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    };

    socket.on("connect", () => {
      setStatus("connecting");
    });

    // Server emits this only after JWT auth sets client.data.user.
    socket.on("realtime.ready", () => {
      setStatus("connected");
      if (orgId) {
        socket.emit("subscribe.org", { organizationId: orgId }, () => undefined);
      }
    });

    socket.on("disconnect", () => setStatus("connecting"));
    socket.on("connect_error", () => setStatus("error"));
    socket.on("realtime.error", () => setStatus("error"));

    socket.on("job.updated", (event: RealtimeEvent) => {
      invalidateOrg();
      const jobId = event.payload.jobId;
      if (typeof jobId === "string") {
        void queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      }
    });
    socket.on("queue.updated", invalidateOrg);
    socket.on("dlq.updated", invalidateOrg);
    socket.on("dashboard.refresh", invalidateOrg);
    socket.on("worker.updated", () => {
      void queryClient.invalidateQueries({ queryKey: ["workers"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [ready, user, orgId, queryClient]);

  return { status };
}

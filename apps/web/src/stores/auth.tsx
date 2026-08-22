import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MembershipView, PublicUser } from "../types/auth";
import {
  clearSession,
  loginRequest,
  logoutRequest,
  meRequest,
  persistSession,
  refreshRequest,
  registerRequest,
  getStoredRefreshToken,
} from "../services/auth";
import { getAccessToken } from "../services/api";

type AuthState = {
  ready: boolean;
  user: PublicUser | null;
  memberships: MembershipView[];
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [memberships, setMemberships] = useState<MembershipView[]>([]);

  useEffect(() => {
    const token = getStoredRefreshToken();
    if (!token) {
      setReady(true);
      return;
    }
    refreshRequest(token)
      .then(async (payload) => {
        persistSession(payload);
        const me = await meRequest();
        setUser(me.user);
        setMemberships(me.memberships);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      memberships,
      login: async (email, password) => {
        persistAndSet(await loginRequest(email, password), setUser, setMemberships);
      },
      register: async (input) => {
        persistAndSet(await registerRequest(input), setUser, setMemberships);
      },
      logout: async () => {
        try {
          if (getAccessToken()) {
            await logoutRequest(getStoredRefreshToken());
          }
        } finally {
          clearSession();
          setUser(null);
          setMemberships([]);
        }
      },
    }),
    [ready, user, memberships],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function persistAndSet(
  payload: Awaited<ReturnType<typeof loginRequest>>,
  setUser: (user: PublicUser) => void,
  setMemberships: (m: MembershipView[]) => void,
): void {
  persistSession(payload);
  setUser(payload.user);
  setMemberships(payload.memberships ?? []);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { setStoredToken, getStoredToken, apiUrl } from "@/lib/api";

/** The authenticated user loaded from the JWT. */
export type AuthUser = { id: string; email: string };

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** Resolves with requires2fa when the account needs an authenticator code; call again with the code. */
  signIn: (email: string, password: string, code?: string) => Promise<{ requires2fa: boolean }>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) {
      setLoading(false);
      return;
    }
    fetch(apiUrl("/api/auth/me"), { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => {
        if (!r.ok) throw new Error("unauthorized");
        return r.json() as Promise<{ id: string; email: string }>;
      })
      .then((u) => setUser({ id: u.id, email: u.email }))
      .catch(() => setStoredToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string, code?: string) => {
    const r = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, code: code?.trim() || undefined }),
    });
    if (!r.ok) {
      let msg = await r.text();
      try {
        const j = JSON.parse(msg) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* use raw */
      }
      throw new Error(msg || "Sign-in failed");
    }
    const data = (await r.json()) as { token?: string; user?: AuthUser; requires_2fa?: boolean };
    if (data.requires_2fa || !data.token || !data.user) return { requires2fa: true };
    setStoredToken(data.token);
    setUser(data.user);
    return { requires2fa: false };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const r = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!r.ok) {
      let msg = await r.text();
      try {
        const j = JSON.parse(msg) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* use raw */
      }
      throw new Error(msg || "Registration failed");
    }
    const data = (await r.json()) as { token: string; user: AuthUser };
    setStoredToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    setStoredToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

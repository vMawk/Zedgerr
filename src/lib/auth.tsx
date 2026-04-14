import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { setStoredToken, getStoredToken } from "@/lib/api";

/** Ingelogde gebruiker uit D1 (`users`), via JWT — geen lokale SQLite-file. */
export type AuthUser = { id: string; email: string };

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
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
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => {
        if (!r.ok) throw new Error("unauthorized");
        return r.json() as Promise<{ id: string; email: string }>;
      })
      .then((u) => setUser({ id: u.id, email: u.email }))
      .catch(() => setStoredToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await fetch("/api/auth/login", {
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
      throw new Error(msg || "Inloggen mislukt");
    }
    const data = (await r.json()) as { token: string; user: AuthUser };
    setStoredToken(data.token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const r = await fetch("/api/auth/register", {
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
      throw new Error(msg || "Registreren mislukt");
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

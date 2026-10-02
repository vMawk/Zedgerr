import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { getPortalToken, portalFetchMe, portalLogin, setPortalToken, type PortalCompany } from "@/lib/portal-api";

interface PortalContextType {
  company: PortalCompany | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<PortalCompany | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getPortalToken();
    if (!t) {
      setLoading(false);
      return;
    }
    portalFetchMe()
      .then((r) => setCompany({ id: r.id, name: r.name }))
      .catch(() => setPortalToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await portalLogin(email, password);
    setPortalToken(data.token);
    setCompany(data.company);
  }, []);

  const signOut = useCallback(() => {
    setPortalToken(null);
    setCompany(null);
  }, []);

  return (
    <PortalContext.Provider value={{ company, loading, signIn, signOut }}>{children}</PortalContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalProvider");
  return ctx;
}

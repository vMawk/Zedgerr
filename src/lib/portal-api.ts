import { apiUrl } from "@/lib/api";

const PORTAL_TOKEN_KEY = "client_flow_portal_jwt";

export function getPortalToken(): string | null {
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string | null): void {
  if (token) localStorage.setItem(PORTAL_TOKEN_KEY, token);
  else localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export function portalApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return apiUrl(`/api${p}`);
}

export type PortalCompany = { id: string; name: string };

export type PortalDashboard = {
  totalHours: number;
  timeEntries: { id: string; date: string; hours: number; description: string | null }[];
  invoices: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;
    status: string;
    subtotal: number;
    btw_percentage: number;
    btw_amount: number;
    total: number;
    notes: string | null;
  }[];
};

export async function portalLogin(email: string, password: string): Promise<{ token: string; company: PortalCompany }> {
  const r = await fetch(portalApiUrl("/portal/login"), {
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
  return r.json() as Promise<{ token: string; company: PortalCompany }>;
}

export async function portalFetchDashboard(): Promise<PortalDashboard> {
  const t = getPortalToken();
  if (!t) throw new Error("Niet ingelogd");
  const r = await fetch(portalApiUrl("/portal/dashboard"), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) {
    setPortalToken(null);
    throw new Error("Sessie verlopen. Log opnieuw in.");
  }
  if (!r.ok) throw new Error((await r.text()) || "Fout bij laden");
  return r.json() as Promise<PortalDashboard>;
}

export async function portalFetchMe(): Promise<{ id: string; name: string; portal_email: string }> {
  const t = getPortalToken();
  if (!t) throw new Error("Niet ingelogd");
  const r = await fetch(portalApiUrl("/portal/me"), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) {
    setPortalToken(null);
    throw new Error("Sessie verlopen");
  }
  if (!r.ok) throw new Error((await r.text()) || "Fout");
  return r.json() as Promise<{ id: string; name: string; portal_email: string }>;
}

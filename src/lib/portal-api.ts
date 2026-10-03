import { apiUrl } from "@/lib/api";
import type { BusinessSettings, Company, Invoice, InvoiceLine } from "@/lib/db-types";

const PORTAL_TOKEN_KEY = "zedgerr_portal_token";
const LEGACY_PORTAL_TOKEN_KEY = "client_flow_portal_jwt";

export function getPortalToken(): string | null {
  const legacy = localStorage.getItem(LEGACY_PORTAL_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(PORTAL_TOKEN_KEY, legacy);
    localStorage.removeItem(LEGACY_PORTAL_TOKEN_KEY);
  }
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
  currency: string;
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
    throw new Error(msg || "Sign-in failed");
  }
  return r.json() as Promise<{ token: string; company: PortalCompany }>;
}

export async function portalFetchDashboard(): Promise<PortalDashboard> {
  const t = getPortalToken();
  if (!t) throw new Error("Not signed in");
  const r = await fetch(portalApiUrl("/portal/dashboard"), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) {
    setPortalToken(null);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!r.ok) throw new Error((await r.text()) || "Failed to load");
  return r.json() as Promise<PortalDashboard>;
}

export async function portalChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const t = getPortalToken();
  if (!t) throw new Error("Not signed in");
  const r = await fetch(portalApiUrl("/portal/password"), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (r.status === 401) {
    setPortalToken(null);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!r.ok) {
    let msg = await r.text();
    try {
      const j = JSON.parse(msg) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* use raw */
    }
    throw new Error(msg || "Could not change password");
  }
}

export async function portalFetchMe(): Promise<{ id: string; name: string; portal_email: string }> {
  const t = getPortalToken();
  if (!t) throw new Error("Not signed in");
  const r = await fetch(portalApiUrl("/portal/me"), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) {
    setPortalToken(null);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!r.ok) throw new Error((await r.text()) || "Request failed");
  return r.json() as Promise<{ id: string; name: string; portal_email: string }>;
}

export async function portalFetchInvoicePdfData(invoiceId: string): Promise<{
  invoice: Invoice;
  lines: InvoiceLine[];
  company: Company | null;
  settings: BusinessSettings | null;
}> {
  const t = getPortalToken();
  if (!t) throw new Error("Not signed in");
  const r = await fetch(portalApiUrl(`/portal/invoices/${encodeURIComponent(invoiceId)}/pdf-data`), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) {
    setPortalToken(null);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!r.ok) throw new Error((await r.text()) || "Request failed");
  return r.json() as Promise<{
    invoice: Invoice;
    lines: InvoiceLine[];
    company: Company | null;
    settings: BusinessSettings | null;
  }>;
}

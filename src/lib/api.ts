import type { BusinessSettings, Company, Invoice, InvoiceLine, Quote, TimeEntry } from "@/lib/db-types";

const TOKEN_KEY = "client_flow_jwt";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function headersJson(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getStoredToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: headersJson(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    setStoredToken(null);
    throw new Error("Sessie verlopen of niet ingelogd. Log opnieuw in.");
  }
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export type DashboardStats = {
  companies: number;
  hoursThisMonth: number;
  openInvoices: number;
  revenue: number;
};

export const api = {
  getDashboardStats: () => req<DashboardStats>("GET", "/dashboard/stats"),

  getCompanies: () => req<Company[]>("GET", "/companies"),
  createCompany: (body: Partial<Company> & { name: string }) => req<Company>("POST", "/companies", body),
  updateCompany: (id: string, body: Partial<Company>) => req<Company>("PATCH", `/companies/${id}`, body),
  deleteCompany: (id: string) => req<void>("DELETE", `/companies/${id}`),
  getCompany: (id: string) => req<Company>("GET", `/companies/${id}`),

  getTimeEntries: (q?: { company_id?: string; invoiced?: boolean }) => {
    const p = new URLSearchParams();
    if (q?.company_id) p.set("company_id", q.company_id);
    if (q?.invoiced !== undefined) p.set("invoiced", String(q.invoiced));
    const qs = p.toString();
    return req<(TimeEntry & { companies: Company | null })[]>("GET", `/time-entries${qs ? `?${qs}` : ""}`);
  },
  createTimeEntry: (body: Record<string, unknown>) => req<TimeEntry>("POST", "/time-entries", body),
  updateTimeEntry: (id: string, body: Record<string, unknown>) => req<TimeEntry>("PATCH", `/time-entries/${id}`, body),
  deleteTimeEntry: (id: string) => req<void>("DELETE", `/time-entries/${id}`),
  markTimeEntriesInvoiced: (body: { ids: string[]; invoice_id: string }) =>
    req<{ ok: boolean }>("POST", "/time-entries/mark-invoiced", body),

  getReportTimeEntries: (from: string, to: string, companyId: string) => {
    const p = new URLSearchParams({ from, to, company_id: companyId });
    return req<
      {
        hours: number;
        hourly_rate: number | null;
        company_name: string | null;
        default_hourly_rate: number | null;
      }[]
    >("GET", `/reports/time-entries?${p}`);
  },

  getBusinessSettings: () => req<BusinessSettings | null>("GET", "/business-settings"),
  putBusinessSettings: (body: Record<string, unknown>) => req<BusinessSettings>("PUT", "/business-settings", body),

  getInvoices: () => req<(Invoice & { companies: { name: string | null } | null })[]>("GET", "/invoices"),
  createInvoice: (body: Record<string, unknown>) => req<Invoice>("POST", "/invoices", body),
  deleteInvoice: (id: string) => req<void>("DELETE", `/invoices/${id}`),
  getInvoiceLines: (invoiceId: string) => req<InvoiceLine[]>("GET", `/invoice-lines?invoice_id=${encodeURIComponent(invoiceId)}`),
  createInvoiceLinesBatch: (lines: Record<string, unknown>[]) =>
    req<{ ok: boolean }>("POST", "/invoice-lines/batch", { lines }),

  getQuotes: () => req<(Quote & { companies: { name: string | null } | null })[]>("GET", "/quotes"),
  createQuote: (body: Record<string, unknown>) => req<Quote>("POST", "/quotes", body),
  createQuoteLinesBatch: (lines: Record<string, unknown>[]) =>
    req<{ ok: boolean }>("POST", "/quote-lines/batch", { lines }),
};

import type {
  BusinessSettings,
  Company,
  DailyNote,
  Invoice,
  InvoiceLine,
  Quote,
  QuoteLine,
  Service,
  TimeEntry,
} from "@/lib/db-types";

/**
 * Worker-API (D1 + auth). Leeg = zelfde origin (`npm run dev` → Vite proxy naar Wrangler).
 * Cloudflare Pages: zet `VITE_API_ORIGIN=https://api.gibby.it` (Worker-route staat in wrangler.toml).
 */
export function apiOrigin(): string {
  const v = import.meta.env.VITE_API_ORIGIN as string | undefined;
  if (v && typeof v === "string" && v.trim()) return v.trim().replace(/\/$/, "");
  return "";
}

export function apiUrl(path: string): string {
  const o = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return o ? `${o}${p}` : p;
}

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
  const r = await fetch(apiUrl(`/api${path}`), {
    method,
    headers: headersJson(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    setStoredToken(null);
    throw new Error("Sessie verlopen of niet ingelogd. Log opnieuw in.");
  }
  if (!r.ok) {
    const text = await r.text();
    let msg = text || r.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* plain text */
    }
    throw new Error(msg);
  }
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
  getCompanyPortal: (id: string) => req<{ hasPortal: boolean; email: string | null }>("GET", `/companies/${id}/portal`),
  putCompanyPortal: (id: string, body: { email: string; password?: string }) => req<{ ok: boolean }>("PUT", `/companies/${id}/portal`, body),
  deleteCompanyPortal: (id: string) => req<void>("DELETE", `/companies/${id}/portal`),

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

  getDailyNote: (date: string) => req<DailyNote>("GET", `/notes/daily?date=${encodeURIComponent(date)}`),
  putDailyNote: (date: string, content: string) => req<DailyNote>("PUT", "/notes/daily", { date, content }),

  getBusinessSettings: () => req<BusinessSettings | null>("GET", "/business-settings"),
  putBusinessSettings: (body: Record<string, unknown>) => req<BusinessSettings>("PUT", "/business-settings", body),

  getInvoices: () => req<(Invoice & { companies: { name: string | null } | null })[]>("GET", "/invoices"),
  invoicesExistForMonth: (month: string) => req<{ exists: boolean }>("GET", `/invoices/exists?month=${encodeURIComponent(month)}`),
  invoicesToSend: (month: string) =>
    req<{ count: number; invoices: { id: string; invoice_number: string; total: number; company_name: string | null }[] }>(
      "GET",
      `/invoices/to-send?month=${encodeURIComponent(month)}`,
    ),
  createInvoice: (body: Record<string, unknown>) => req<Invoice>("POST", "/invoices", body),
  splitInvoice: (id: string, body?: { parts?: number; interval_days?: number; first_due_date?: string }) =>
    req<{ ok: boolean; created_invoice_ids: string[] }>("POST", `/invoices/${id}/split`, body ?? {}),
  updateInvoice: (
    id: string,
    body: {
      invoice_number?: string;
      invoice_date?: string;
      due_date?: string | null;
      status?: string;
      notes?: string | null;
      invoice_type?: "business" | "private";
      subtotal?: number;
      btw_percentage?: number;
      btw_amount?: number;
      total?: number;
    },
  ) => req<Invoice>("PATCH", `/invoices/${id}`, body),
  deleteInvoice: (id: string) => req<void>("DELETE", `/invoices/${id}`),
  getInvoiceLines: (invoiceId: string) => req<InvoiceLine[]>("GET", `/invoice-lines?invoice_id=${encodeURIComponent(invoiceId)}`),
  createInvoiceLinesBatch: (lines: Record<string, unknown>[]) =>
    req<{ ok: boolean }>("POST", "/invoice-lines/batch", { lines }),

  getServices: () => req<Service[]>("GET", "/services"),
  createService: (body: { name: string; amount: number }) => req<Service>("POST", "/services", body),
  updateService: (id: string, body: { name: string; amount: number }) => req<Service>("PATCH", `/services/${id}`, body),
  deleteService: (id: string) => req<void>("DELETE", `/services/${id}`),

  getQuotes: () => req<(Quote & { companies: { name: string | null } | null })[]>("GET", "/quotes"),
  createQuote: (body: Record<string, unknown>) => req<Quote>("POST", "/quotes", body),
  updateQuote: (
    id: string,
    body: { quote_number?: string; quote_date?: string; valid_until?: string | null; status?: string; notes?: string | null },
  ) => req<Quote>("PATCH", `/quotes/${id}`, body),
  deleteQuote: (id: string) => req<void>("DELETE", `/quotes/${id}`),
  getQuoteLines: (quoteId: string) => req<QuoteLine[]>("GET", `/quote-lines?quote_id=${encodeURIComponent(quoteId)}`),
  createQuoteLinesBatch: (lines: Record<string, unknown>[]) =>
    req<{ ok: boolean }>("POST", "/quote-lines/batch", { lines }),
};

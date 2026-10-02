import type {
  Attachment,
  BankTransaction,
  BusinessSettings,
  Company,
  CompanyProduct,
  DailyNote,
  Expense,
  Invoice,
  InvoiceType,
  InvoiceLine,
  Lead,
  MileageEntry,
  Quote,
  QuoteLine,
  Service,
  Subscription,
  SubscriptionPayment,
  TimeEntry,
} from "@/lib/db-types";

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

const TOKEN_KEY = "zedgerr_token";
const LEGACY_TOKEN_KEY = "client_flow_jwt";

export function getStoredToken(): string | null {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
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
    throw new Error("Session expired. Please sign in again.");
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

/**
 * Generic fetch helper for endpoints not covered by the `api` object.
 * Supports JSON bodies and FormData. Automatically adds Authorization header.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData && options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(apiUrl(path), {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
  });
  if (r.status === 401) {
    setStoredToken(null);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!r.ok) {
    const text = await r.text();
    let msg = text || r.statusText;
    try { const j = JSON.parse(text) as { error?: string }; if (j?.error) msg = j.error; } catch { /**/ }
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
  changePassword: (body: { current_password: string; new_password: string }) =>
    req<{ ok: boolean }>("PATCH", "/auth/password", body),

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
  improveGrammar: (text: string) => req<{ text: string }>("POST", "/ai/improve-grammar", { text }),

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
  getDailyNoteDates: () => req<string[]>("GET", "/notes/dates"),
  putDailyNote: (date: string, content: string) => req<DailyNote>("PUT", "/notes/daily", { date, content }),

  getBusinessSettings: () => req<BusinessSettings | null>("GET", "/business-settings"),
  putBusinessSettings: (body: Record<string, unknown>) => req<BusinessSettings>("PUT", "/business-settings", body),
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<{ ok: boolean }>("/api/business-settings/logo", { method: "POST", body: form });
  },
  deleteLogo: () => apiRequest<{ ok: boolean }>("/api/business-settings/logo", { method: "DELETE" }),
  getLogoBlob: async (): Promise<Blob | null> => {
    const token = getStoredToken();
    const r = await fetch(apiUrl("/api/business-settings/logo"), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return r.ok ? r.blob() : null;
  },
  getSmtpSettings: () => req<{ host: string; port: number; secure: number; username: string; from_name: string; from_email: string; base_url: string }>("GET", "/smtp-settings"),
  saveSmtpSettings: (body: { host: string; port: number; secure: number; username: string; password: string; from_name: string; from_email: string; base_url: string }) =>
    req<{ ok: boolean }>("PUT", "/smtp-settings", body),
  testSmtp: () => req<{ ok: boolean }>("POST", "/smtp-settings/test"),

  getInvoices: () => req<(Invoice & { companies: { name: string | null; contact_person: string | null } | null })[]>("GET", "/invoices"),
  invoicesExistForMonth: (month: string) => req<{ exists: boolean }>("GET", `/invoices/exists?month=${encodeURIComponent(month)}`),
  invoicesToSend: (month: string) =>
    req<{ count: number; invoices: { id: string; invoice_number: string; total: number; company_name: string | null }[] }>(
      "GET",
      `/invoices/to-send?month=${encodeURIComponent(month)}`,
    ),
  createInvoiceLine: (body: { invoice_id: string; description: string; date?: string | null; amount: number }) =>
    req<InvoiceLine>("POST", "/invoice-lines", body),
  deleteInvoiceLine: (id: string) => req<void>("DELETE", `/invoice-lines/${id}`),
  createInvoice: (body: Record<string, unknown>) => req<Invoice>("POST", "/invoices", body),
  createInvoiceFromQuote: (quoteId: string) => req<Invoice>("POST", `/quotes/${quoteId}/invoice`),
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
      invoice_type?: InvoiceType;
      payment_method?: "overboeking" | "contant";
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

  getQuotes: () => req<(Quote & { companies: { name: string | null; contact_person: string | null } | null })[]>("GET", "/quotes"),
  createQuote: (body: Record<string, unknown>) => req<Quote>("POST", "/quotes", body),
  updateQuote: (
    id: string,
    body: { quote_number?: string; quote_date?: string; valid_until?: string | null; status?: string; notes?: string | null },
  ) => req<Quote>("PATCH", `/quotes/${id}`, body),
  deleteQuote: (id: string) => req<void>("DELETE", `/quotes/${id}`),
  getQuoteLines: (quoteId: string) => req<QuoteLine[]>("GET", `/quote-lines?quote_id=${encodeURIComponent(quoteId)}`),
  createQuoteLinesBatch: (lines: Record<string, unknown>[]) =>
    req<{ ok: boolean }>("POST", "/quote-lines/batch", { lines }),

  getSubscriptions: () => req<Subscription[]>("GET", "/subscriptions"),
  createSubscription: (body: Partial<Subscription> & { name: string }) => req<Subscription>("POST", "/subscriptions", body),
  updateSubscription: (id: string, body: Partial<Subscription>) => req<Subscription>("PATCH", `/subscriptions/${id}`, body),
  deleteSubscription: (id: string) => req<void>("DELETE", `/subscriptions/${id}`),
  getSubscriptionPayments: (subscriptionId: string) =>
    req<SubscriptionPayment[]>("GET", `/subscriptions/${subscriptionId}/payments`),
  toggleSubscriptionPayment: (subscriptionId: string, periodDate: string) =>
    req<SubscriptionPayment>("POST", `/subscriptions/${subscriptionId}/payments/toggle`, { period_date: periodDate }),

  getCompanyProducts: (companyId: string) => req<CompanyProduct[]>("GET", `/companies/${companyId}/products`),
  createCompanyProduct: (companyId: string, body: Partial<CompanyProduct> & { name: string; sale_price: number }) =>
    req<CompanyProduct>("POST", `/companies/${companyId}/products`, body),
  updateCompanyProduct: (companyId: string, productId: string, body: Partial<CompanyProduct> & { name: string; sale_price: number }) =>
    req<CompanyProduct>("PATCH", `/companies/${companyId}/products/${productId}`, body),
  deleteCompanyProduct: (companyId: string, productId: string) =>
    req<void>("DELETE", `/companies/${companyId}/products/${productId}`),

  getLeads: () => req<Lead[]>("GET", "/leads"),
  createLead: (body: Partial<Lead> & { company_name: string }) => req<Lead>("POST", "/leads", body),
  updateLead: (id: string, body: Partial<Lead>) => req<Lead>("PATCH", `/leads/${id}`, body),
  deleteLead: (id: string) => req<void>("DELETE", `/leads/${id}`),

  getExpenses: (q?: { from?: string; to?: string; category?: string }) => {
    const p = new URLSearchParams();
    if (q?.from) p.set("from", q.from);
    if (q?.to) p.set("to", q.to);
    if (q?.category) p.set("category", q.category);
    const qs = p.toString();
    return req<Expense[]>("GET", `/expenses${qs ? `?${qs}` : ""}`);
  },
  createExpense: (body: Record<string, unknown>) => req<Expense>("POST", "/expenses", body),
  updateExpense: (id: string, body: Record<string, unknown>) => req<Expense>("PATCH", `/expenses/${id}`, body),
  deleteExpense: (id: string) => req<void>("DELETE", `/expenses/${id}`),

  getTaxReport: (from: string, to: string) => {
    const p = new URLSearchParams({ from, to });
    return req<{
      verkoop_omzet: number;
      verkoop_btw: number;
      inkoop_excl: number;
      inkoop_btw: number;
      saldo_btw: number;
    }>("GET", `/reports/btw?${p}`);
  },

  getProfitReport: (year: number) =>
    req<{
      omzet: number;
      inkoop_kosten: number;
      abonnement_kosten: number;
      km_kosten: number;
      totaal_kosten: number;
      winst: number;
    }>("GET", `/reports/profit?year=${year}`),

  createCreditNote: (invoiceId: string) => req<Invoice>("POST", `/invoices/${invoiceId}/credit-note`),

  getMileageEntries: (q?: { from?: string; to?: string }) => {
    const p = new URLSearchParams();
    if (q?.from) p.set("from", q.from);
    if (q?.to) p.set("to", q.to);
    const qs = p.toString();
    return req<MileageEntry[]>("GET", `/mileage${qs ? `?${qs}` : ""}`);
  },
  createMileageEntry: (body: Record<string, unknown>) => req<MileageEntry>("POST", "/mileage", body),
  updateMileageEntry: (id: string, body: Record<string, unknown>) => req<MileageEntry>("PATCH", `/mileage/${id}`, body),
  deleteMileageEntry: (id: string) => req<void>("DELETE", `/mileage/${id}`),

  getAttachments: (entityType: string, entityId: string) => {
    const p = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
    return req<Attachment[]>("GET", `/attachments?${p}`);
  },
  uploadAttachment: (entityType: string, entityId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("entity_type", entityType);
    form.append("entity_id", entityId);
    const token = getStoredToken();
    return fetch(apiUrl("/api/attachments/upload"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (r) => {
      if (!r.ok) {
        const t = await r.text();
        let msg = t || r.statusText;
        try { const j = JSON.parse(t) as { error?: string }; if (j?.error) msg = j.error; } catch { /* noop */ }
        throw new Error(msg);
      }
      return r.json() as Promise<Attachment>;
    });
  },
  downloadAttachmentUrl: (id: string) => apiUrl(`/api/attachments/${id}/download`),
  deleteAttachment: (id: string) => req<void>("DELETE", `/attachments/${id}`),

  getBankTransactions: (q?: { from?: string; to?: string }) => {
    const p = new URLSearchParams();
    if (q?.from) p.set("from", q.from);
    if (q?.to) p.set("to", q.to);
    const qs = p.toString();
    return req<BankTransaction[]>("GET", `/bank-transactions${qs ? `?${qs}` : ""}`);
  },
  getBankBalance: () => req<{ saldo: number }>("GET", "/bank-balance"),
  createBankTransaction: (body: Record<string, unknown>) => req<BankTransaction>("POST", "/bank-transactions", body),
  updateBankTransaction: (id: string, body: Record<string, unknown>) =>
    req<BankTransaction>("PATCH", `/bank-transactions/${id}`, body),
  deleteBankTransaction: (id: string) => req<void>("DELETE", `/bank-transactions/${id}`),
};

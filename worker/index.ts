/// <reference types="@cloudflare/workers-types" />

import { Hono } from "hono";
import { cors } from "hono/cors";
import { hashPassword, verifyPassword } from "./auth-crypto";
import { signUserToken, verifyUserToken } from "./jwt";
import { seedInvoice2026IfNeeded } from "./seed-d1";

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ASSETS?: Fetcher;
  /** Extra accounts na de eerste gebruiker: zet op "true" in wrangler.toml. Anders alleen eerste account (lege `users`). */
  ALLOW_REGISTRATION?: string;
};

type Variables = { userId: string; email?: string };

function rowInvoiced(r: Record<string, unknown>) {
  return { ...r, invoiced: Boolean(r.invoiced) };
}

const publicApiPaths = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/registration-status"]);

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

api.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

api.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (publicApiPaths.has(path)) return next();
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verifyUserToken(c.env.JWT_SECRET, auth.slice(7));
    c.set("userId", payload.sub);
    c.set("email", payload.email);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

// --- Auth ---
api.get("/api/auth/registration-status", async (c) => {
  const countRow = await c.env.DB.prepare("SELECT COUNT(*) as c FROM users").first<{ c: number }>();
  const count = countRow?.c ?? 0;
  if (count === 0) {
    return c.json({ canRegister: true, reason: "first_user" });
  }
  if (c.env.ALLOW_REGISTRATION === "true") {
    return c.json({ canRegister: true, reason: "open_registration" });
  }
  return c.json({
    canRegister: false,
    reason: "registration_disabled",
    message: "Registratie is uitgeschakeld.",
  });
});

api.post("/api/auth/register", async (c) => {
  const secret = c.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return c.json({ error: "Server misconfigured: JWT_SECRET required (min 16 chars)" }, 500);
  }
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const emailRaw = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!emailRaw || !emailRaw.includes("@")) return c.json({ error: "Invalid email" }, 400);
  if (password.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);

  const countRow = await c.env.DB.prepare("SELECT COUNT(*) as c FROM users").first<{ c: number }>();
  const count = countRow?.c ?? 0;

  if (count > 0 && c.env.ALLOW_REGISTRATION !== "true") {
    return c.json({ error: "Registration is disabled" }, 403);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(emailRaw).first();
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await c.env.DB.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").bind(id, emailRaw, hash).run();

  if (count === 0) {
    try {
      await seedInvoice2026IfNeeded(c.env.DB, id);
    } catch (e) {
      console.error("seedInvoice2026IfNeeded:", e);
    }
  }

  const token = await signUserToken(secret, id, emailRaw);
  return c.json({ token, user: { id, email: emailRaw } });
});

api.post("/api/auth/login", async (c) => {
  const secret = c.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return c.json({ error: "Server misconfigured: JWT_SECRET required (min 16 chars)" }, 500);
  }
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const emailRaw = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const row = await c.env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind(emailRaw).first<{
    id: string;
    email: string;
    password_hash: string;
  }>();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const token = await signUserToken(secret, row.id, row.email);
  return c.json({ token, user: { id: row.id, email: row.email } });
});

api.get("/api/auth/me", async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare("SELECT id, email, created_at FROM users WHERE id = ?").bind(userId).first<{
    id: string;
    email: string;
    created_at: string;
  }>();
  if (!row) return c.json({ error: "User not found" }, 404);
  return c.json(row);
});

// --- Dashboard ---
api.get("/api/dashboard/stats", async (c) => {
  const userId = c.get("userId");
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const companies = await c.env.DB.prepare("SELECT COUNT(*) as c FROM companies WHERE user_id = ?").bind(userId).first<{ c: number }>();
  const hoursRows = await c.env.DB
    .prepare("SELECT hours FROM time_entries WHERE user_id = ? AND date >= ?")
    .bind(userId, firstOfMonth)
    .all<{ hours: number }>();
  const hoursThisMonth = (hoursRows.results ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const openInv = await c.env.DB
    .prepare("SELECT total FROM invoices WHERE user_id = ? AND status IN ('concept', 'verzonden')")
    .bind(userId)
    .all<{ total: number }>();
  const paidInv = await c.env.DB.prepare("SELECT total FROM invoices WHERE user_id = ? AND status = 'betaald'").bind(userId).all<{ total: number }>();
  return c.json({
    companies: companies?.c ?? 0,
    hoursThisMonth,
    openInvoices: (openInv.results ?? []).length,
    revenue: (paidInv.results ?? []).reduce((s, e) => s + Number(e.total), 0),
  });
});

// --- Companies ---
api.get("/api/companies", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare("SELECT * FROM companies WHERE user_id = ? ORDER BY name").bind(userId).all();
  return c.json(results ?? []);
});

api.post("/api/companies", async (c) => {
  const userId = c.get("userId");
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO companies (id, user_id, name, contact_person, email, phone, street, postal_code, city, country, kvk_number, btw_number, default_hourly_rate, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      req.name,
      req.contact_person ?? null,
      req.email ?? null,
      req.phone ?? null,
      req.street ?? null,
      req.postal_code ?? null,
      req.city ?? null,
      req.country ?? "Nederland",
      req.kvk_number ?? null,
      req.btw_number ?? null,
      req.default_hourly_rate ?? null,
      req.notes ?? null,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/companies/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `UPDATE companies SET
        name = ?, contact_person = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, country = ?,
        kvk_number = ?, btw_number = ?, default_hourly_rate = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      req.name,
      req.contact_person ?? null,
      req.email ?? null,
      req.phone ?? null,
      req.street ?? null,
      req.postal_code ?? null,
      req.city ?? null,
      req.country ?? null,
      req.kvk_number ?? null,
      req.btw_number ?? null,
      req.default_hourly_rate ?? null,
      req.notes ?? null,
      now,
      id,
      userId,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/companies/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.text("", 204);
});

api.get("/api/companies/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

// --- Time entries ---
api.get("/api/time-entries", async (c) => {
  const userId = c.get("userId");
  const companyId = c.req.query("company_id");
  const invoiced = c.req.query("invoiced");
  let sql = `SELECT te.* FROM time_entries te WHERE te.user_id = ?`;
  const params: unknown[] = [userId];
  if (companyId) {
    sql += " AND te.company_id = ?";
    params.push(companyId);
  }
  if (invoiced !== undefined && invoiced !== "") {
    const inv = invoiced === "true" || invoiced === "1";
    sql += " AND te.invoiced = ?";
    params.push(inv ? 1 : 0);
  }
  sql += " ORDER BY te.date DESC";
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
  const rows = results ?? [];
  const mapped = await Promise.all(
    rows.map(async (te) => {
      const cid = te.company_id as string | undefined;
      const cRow = cid
        ? await c.env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(cid).first<Record<string, unknown>>()
        : undefined;
      return { ...rowInvoiced(te), companies: cRow ?? null };
    }),
  );
  return c.json(mapped);
});

api.post("/api/time-entries", async (c) => {
  const userId = c.get("userId");
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO time_entries (id, user_id, company_id, date, hours, description, hourly_rate, invoiced, invoice_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    )
    .bind(
      id,
      userId,
      req.company_id,
      req.date,
      req.hours,
      req.description ?? null,
      req.hourly_rate ?? null,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM time_entries WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json(row);
});

api.patch("/api/time-entries/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `UPDATE time_entries SET company_id = ?, date = ?, hours = ?, description = ?, hourly_rate = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(req.company_id, req.date, req.hours, req.description ?? null, req.hourly_rate ?? null, now, id, userId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM time_entries WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json(rowInvoiced(row!));
});

api.delete("/api/time-entries/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM time_entries WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.text("", 204);
});

api.post("/api/time-entries/mark-invoiced", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ ids: string[]; invoice_id: string }>();
  const { ids, invoice_id } = body;
  const now = new Date().toISOString();
  const stmts = ids.map((tid) =>
    c.env.DB
      .prepare("UPDATE time_entries SET invoiced = 1, invoice_id = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(invoice_id, now, tid, userId),
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// --- Reports ---
api.get("/api/reports/time-entries", async (c) => {
  const userId = c.get("userId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const companyId = c.req.query("company_id");
  if (!from || !to) return c.json({ error: "from and to required" }, 400);
  let sql = `
    SELECT te.hours, te.hourly_rate, c.name as company_name, c.default_hourly_rate
    FROM time_entries te
    LEFT JOIN companies c ON c.id = te.company_id
    WHERE te.user_id = ? AND te.date >= ? AND te.date <= ?
  `;
  const params: unknown[] = [userId, from, to];
  if (companyId && companyId !== "all") {
    sql += " AND te.company_id = ?";
    params.push(companyId);
  }
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results ?? []);
});

// --- Business settings ---
api.get("/api/business-settings", async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE user_id = ?").bind(userId).first();
  return c.json(row ?? null);
});

api.put("/api/business-settings", async (c) => {
  const userId = c.get("userId");
  const req = await c.req.json<Record<string, unknown>>();
  const existing = await c.env.DB.prepare("SELECT id FROM business_settings WHERE user_id = ?").bind(userId).first<{ id: string }>();
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB
      .prepare(
        `UPDATE business_settings SET
          company_name = ?, contact_person = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, country = ?,
          kvk_number = ?, btw_number = ?, iban = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        req.company_name ?? null,
        req.contact_person ?? null,
        req.email ?? null,
        req.phone ?? null,
        req.street ?? null,
        req.postal_code ?? null,
        req.city ?? null,
        req.country ?? null,
        req.kvk_number ?? null,
        req.btw_number ?? null,
        req.iban ?? null,
        now,
        existing.id,
      )
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE id = ?").bind(existing.id).first();
    return c.json(row);
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO business_settings (id, user_id, company_name, contact_person, email, phone, street, postal_code, city, country, kvk_number, btw_number, iban, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      req.company_name ?? null,
      req.contact_person ?? null,
      req.email ?? null,
      req.phone ?? null,
      req.street ?? null,
      req.postal_code ?? null,
      req.city ?? null,
      req.country ?? "Nederland",
      req.kvk_number ?? null,
      req.btw_number ?? null,
      req.iban ?? null,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE id = ?").bind(id).first();
  return c.json(row);
});

// --- Invoices ---
api.get("/api/invoices", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB
    .prepare(
      `SELECT i.*, c.name as company_name FROM invoices i
       LEFT JOIN companies c ON c.id = i.company_id
       WHERE i.user_id = ?
       ORDER BY i.created_at DESC`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  const mapped = (results ?? []).map((r) => {
    const company_name = r.company_name;
    const { company_name: _cn, ...inv } = r;
    return { ...inv, companies: { name: company_name } };
  });
  return c.json(mapped);
});

api.post("/api/invoices", async (c) => {
  const userId = c.get("userId");
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const invoice_date = (req.invoice_date as string) || today;
  const status = (req.status as string) || "concept";
  const advance = req.advance_payment != null ? Number(req.advance_payment) : 0;
  await c.env.DB
    .prepare(
      `INSERT INTO invoices (id, user_id, company_id, invoice_number, invoice_date, due_date, status, subtotal, btw_percentage, btw_amount, total, advance_payment, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      req.company_id,
      req.invoice_number,
      invoice_date,
      req.due_date ?? null,
      status,
      req.subtotal,
      req.btw_percentage,
      req.btw_amount,
      req.total,
      advance,
      req.notes ?? null,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/invoices/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE time_entries SET invoiced = 0, invoice_id = NULL, updated_at = ? WHERE invoice_id = ? AND user_id = ?").bind(now, id, userId),
    c.env.DB.prepare("DELETE FROM invoices WHERE id = ? AND user_id = ?").bind(id, userId),
  ]);
  return c.text("", 204);
});

api.get("/api/invoice-lines", async (c) => {
  const invoiceId = c.req.query("invoice_id");
  if (!invoiceId) return c.json({ error: "invoice_id required" }, 400);
  const { results } = await c.env.DB.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY date").bind(invoiceId).all();
  return c.json(results ?? []);
});

api.post("/api/invoice-lines/batch", async (c) => {
  const body = await c.req.json<{ lines: Record<string, unknown>[] }>();
  const lines = body.lines;
  const stmts = lines.map((l) =>
    c.env.DB
      .prepare(
        `INSERT INTO invoice_lines (id, invoice_id, time_entry_id, description, date, hours, hourly_rate, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        crypto.randomUUID(),
        l.invoice_id,
        l.time_entry_id ?? null,
        l.description,
        l.date ?? null,
        l.hours ?? null,
        l.hourly_rate ?? null,
        l.amount,
      ),
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// --- Quotes ---
api.get("/api/quotes", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB
    .prepare(
      `SELECT q.*, c.name as company_name FROM quotes q
       LEFT JOIN companies c ON c.id = q.company_id
       WHERE q.user_id = ?
       ORDER BY q.created_at DESC`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  const mapped = (results ?? []).map((r) => {
    const company_name = r.company_name;
    const { company_name: _cn, ...q } = r;
    return { ...q, companies: { name: company_name } };
  });
  return c.json(mapped);
});

api.post("/api/quotes", async (c) => {
  const userId = c.get("userId");
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO quotes (id, user_id, company_id, quote_number, quote_date, valid_until, status, subtotal, btw_percentage, btw_amount, total, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'concept', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      req.company_id,
      req.quote_number,
      today,
      req.valid_until ?? null,
      req.subtotal,
      req.btw_percentage,
      req.btw_amount,
      req.total,
      req.notes ?? null,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM quotes WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.post("/api/quote-lines/batch", async (c) => {
  const body = await c.req.json<{ lines: Record<string, unknown>[] }>();
  const lines = body.lines;
  const stmts = lines.map((l) =>
    c.env.DB
      .prepare(
        `INSERT INTO quote_lines (id, quote_id, description, hours, hourly_rate, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(crypto.randomUUID(), l.quote_id, l.description, l.hours ?? null, l.hourly_rate ?? null, l.amount),
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// --- Deploy: static SPA + API ---
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return api.fetch(request, env, ctx);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Build the SPA first (npm run build) and deploy with [assets] in wrangler.toml.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};

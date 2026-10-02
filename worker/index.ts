/// <reference types="@cloudflare/workers-types" />

import { Hono } from "hono";
import { cors } from "hono/cors";
import { hashPassword, verifyPassword } from "./auth-crypto.js";
import { signPortalToken, signUserToken, verifyPortalToken, verifyUserToken } from "./jwt.js";
import { seedInvoice2026IfNeeded } from "./seed-d1.js";

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  AI: Ai;
  ASSETS?: Fetcher;
  FILES: R2Bucket;
  /** Extra accounts na de eerste gebruiker: zet op "true" in wrangler.toml. Anders alleen eerste account (lege `users`). */
  ALLOW_REGISTRATION?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

type Variables = { userId?: string; portalCompanyId?: string; email?: string };

function rowInvoiced(r: Record<string, unknown>) {
  return { ...r, invoiced: Boolean(r.invoiced) };
}

function rowTimeEntry(r: Record<string, unknown>) {
  return { ...rowInvoiced(r) };
}

function toMoney(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 100) / 100;
}

function parseSubscriptionTags(value: unknown): string[] {
  if (!value) return [];
  const raw = String(value);
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function serializeSubscriptionTags(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const tags = value
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!tags.length) return null;
  return Array.from(new Set(tags)).join(",");
}

function rowSubscription(r: Record<string, unknown>) {
  return {
    ...r,
    tags: parseSubscriptionTags(r.tags),
  };
}

const publicApiPaths = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/registration-status",
  "/api/portal/login",
]);

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
  const token = auth.slice(7);
  const secret = c.env.JWT_SECRET;

  if (path.startsWith("/api/portal/")) {
    try {
      const p = await verifyPortalToken(secret, token);
      c.set("portalCompanyId", p.companyId);
      if (p.email) c.set("email", p.email);
      await next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
    return;
  }

  try {
    const payload = await verifyUserToken(secret, token);
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
  const userId = c.get("userId")!;
  const row = await c.env.DB.prepare("SELECT id, email, created_at FROM users WHERE id = ?").bind(userId).first<{
    id: string;
    email: string;
    created_at: string;
  }>();
  if (!row) return c.json({ error: "User not found" }, 404);
  return c.json(row);
});

api.patch("/api/auth/password", async (c) => {
  const userId = c.get("userId")!;
  let body: { current_password?: string; new_password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const currentPassword = body.current_password ?? "";
  const newPassword = body.new_password ?? "";
  if (!currentPassword || !newPassword) {
    return c.json({ error: "Huidig en nieuw wachtwoord zijn verplicht" }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: "Nieuw wachtwoord moet minimaal 6 tekens zijn" }, 400);
  }

  const user = await c.env.DB
    .prepare("SELECT id, password_hash FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; password_hash: string }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return c.json({ error: "Huidig wachtwoord is onjuist" }, 400);
  }

  const nextHash = await hashPassword(newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(nextHash, userId).run();
  return c.json({ ok: true });
});

// --- Klantenportaal (ingelogd als bedrijf: uren + facturen) ---
api.post("/api/portal/login", async (c) => {
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
  if (!password) return c.json({ error: "Invalid password" }, 400);

  const row = await c.env.DB
    .prepare(
      `SELECT p.company_id, p.password_hash, c.name AS company_name
       FROM company_portal_users p
       JOIN companies c ON c.id = p.company_id
       WHERE p.email = ?`,
    )
    .bind(emailRaw)
    .first<{ company_id: string; password_hash: string; company_name: string }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const token = await signPortalToken(secret, row.company_id, emailRaw);
  return c.json({ token, company: { id: row.company_id, name: row.company_name } });
});

api.get("/api/portal/me", async (c) => {
  const companyId = c.get("portalCompanyId")!;
  const row = await c.env.DB
    .prepare(
      `SELECT c.id, c.name, p.email AS portal_email
       FROM companies c
       JOIN company_portal_users p ON p.company_id = c.id
       WHERE c.id = ?`,
    )
    .bind(companyId)
    .first<{ id: string; name: string; portal_email: string }>();
  if (!row) return c.json({ error: "Bedrijf niet gevonden" }, 404);
  return c.json(row);
});

api.patch("/api/portal/password", async (c) => {
  const companyId = c.get("portalCompanyId")!;
  let body: { current_password?: string; new_password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag" }, 400);
  }
  const current = body.current_password ?? "";
  const newPass = body.new_password ?? "";
  if (!current || !newPass) {
    return c.json({ error: "Huidig en nieuw wachtwoord zijn verplicht" }, 400);
  }
  if (newPass.length < 6) {
    return c.json({ error: "Nieuw wachtwoord moet minimaal 6 tekens zijn" }, 400);
  }

  const row = await c.env.DB
    .prepare("SELECT password_hash FROM company_portal_users WHERE company_id = ?")
    .bind(companyId)
    .first<{ password_hash: string }>();
  if (!row) return c.json({ error: "Portaalaccount niet gevonden" }, 404);
  if (!(await verifyPassword(current, row.password_hash))) {
    return c.json({ error: "Huidig wachtwoord is onjuist" }, 400);
  }

  const hash = await hashPassword(newPass);
  await c.env.DB.prepare("UPDATE company_portal_users SET password_hash = ? WHERE company_id = ?").bind(hash, companyId).run();
  return c.json({ ok: true });
});

api.get("/api/portal/dashboard", async (c) => {
  const companyId = c.get("portalCompanyId")!;

  const hoursRow = await c.env.DB
    .prepare("SELECT COALESCE(SUM(hours), 0) AS h FROM time_entries WHERE company_id = ?")
    .bind(companyId)
    .first<{ h: number }>();
  const te = await c.env.DB
    .prepare(
      `SELECT id, date, hours, description
       FROM time_entries
       WHERE company_id = ?
       ORDER BY date DESC, created_at DESC
       LIMIT 2000`,
    )
    .bind(companyId)
    .all<{
      id: string;
      date: string;
      hours: number;
      description: string | null;
    }>();

  const inv = await c.env.DB
    .prepare(
      `SELECT
        id,
        invoice_number,
        CASE
          WHEN split_from_invoice_id IS NOT NULL AND due_date IS NOT NULL THEN date(due_date, '-30 day')
          ELSE invoice_date
        END AS invoice_date,
        due_date,
        status,
        subtotal,
        btw_percentage,
        btw_amount,
        total,
        notes
       FROM invoices
       WHERE company_id = ?
       ORDER BY invoice_date DESC, created_at DESC`,
    )
    .bind(companyId)
    .all<Record<string, unknown>>();

  return c.json({
    totalHours: Number(hoursRow?.h ?? 0),
    timeEntries: (te.results ?? []).map((row) => ({
      id: row.id,
      date: row.date,
      hours: row.hours,
      description: row.description,
    })),
    invoices: inv.results ?? [],
  });
});

api.get("/api/portal/invoices/:id/pdf-data", async (c) => {
  const companyId = c.get("portalCompanyId")!;
  const { id } = c.req.param();

  const invoice = await c.env.DB
    .prepare(
      `SELECT * FROM invoices
       WHERE id = ? AND company_id = ?`,
    )
    .bind(id, companyId)
    .first<Record<string, unknown>>();
  if (!invoice) return c.json({ error: "Factuur niet gevonden" }, 404);

  const { results: lines } = await c.env.DB
    .prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY date")
    .bind(id)
    .all<Record<string, unknown>>();

  const company = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(companyId).first<Record<string, unknown>>();
  const owner = await c.env.DB.prepare("SELECT user_id FROM companies WHERE id = ?").bind(companyId).first<{ user_id: string }>();
  const settings = owner?.user_id
    ? await c.env.DB.prepare("SELECT * FROM business_settings WHERE user_id = ?").bind(owner.user_id).first<Record<string, unknown>>()
    : null;

  return c.json({ invoice, lines: lines ?? [], company: company ?? null, settings });
});

// --- Dashboard ---
api.get("/api/dashboard/stats", async (c) => {
  const userId = c.get("userId")!;
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
  const userId = c.get("userId")!;
  const { results } = await c.env.DB
    .prepare(
      `SELECT c.*,
        (SELECT 1 FROM company_portal_users p WHERE p.company_id = c.id LIMIT 1) AS has_portal
       FROM companies c WHERE c.user_id = ? ORDER BY c.name NULLS LAST`,
    )
    .bind(userId)
    .all();
  const out = (results ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return { ...x, has_portal: Boolean(x.has_portal) };
  });
  return c.json(out);
});

api.post("/api/companies", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const advanceBalance = Math.max(0, toMoney(req.advance_balance, 0));
  await c.env.DB
    .prepare(
      `INSERT INTO companies (id, user_id, name, contact_person, email, phone, street, postal_code, city, country, kvk_number, btw_number, default_hourly_rate, notes, advance_balance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      req.name ?? null,
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
      advanceBalance,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/companies/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  const existing = await c.env.DB
    .prepare("SELECT id, advance_balance FROM companies WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; advance_balance: number }>();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const advanceBalance = req.advance_balance === undefined
    ? Math.max(0, toMoney(existing.advance_balance, 0))
    : Math.max(0, toMoney(req.advance_balance, 0));
  await c.env.DB
    .prepare(
      `UPDATE companies SET
        name = ?, contact_person = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, country = ?,
        kvk_number = ?, btw_number = ?, default_hourly_rate = ?, notes = ?, advance_balance = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      req.name ?? null,
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
      advanceBalance,
      now,
      id,
      userId,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/companies/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

api.get("/api/companies/:id/portal", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const owns = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!owns) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT email FROM company_portal_users WHERE company_id = ?").bind(id).first<{ email: string }>();
  return c.json({ hasPortal: Boolean(row), email: row?.email ?? null });
});

api.put("/api/companies/:id/portal", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const owns = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!owns) return c.json({ error: "Not found" }, 404);
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const emailRaw = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!emailRaw || !emailRaw.includes("@")) return c.json({ error: "Invalid email" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM company_portal_users WHERE company_id = ?").bind(id).first<{ id: string }>();

  if (existing) {
    if (password.length >= 6) {
      const hash = await hashPassword(password);
      await c.env.DB
        .prepare("UPDATE company_portal_users SET email = ?, password_hash = ? WHERE company_id = ?")
        .bind(emailRaw, hash, id)
        .run();
    } else {
      await c.env.DB.prepare("UPDATE company_portal_users SET email = ? WHERE company_id = ?").bind(emailRaw, id).run();
    }
  } else {
    if (password.length < 6) return c.json({ error: "Password must be at least 6 characters for new portal access" }, 400);
    const hash = await hashPassword(password);
    const pid = crypto.randomUUID();
    await c.env.DB
      .prepare("INSERT INTO company_portal_users (id, company_id, email, password_hash) VALUES (?, ?, ?, ?)")
      .bind(pid, id, emailRaw, hash)
      .run();
  }
  return c.json({ ok: true });
});

api.delete("/api/companies/:id/portal", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const owns = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!owns) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM company_portal_users WHERE company_id = ?").bind(id).run();
  return c.body(null, 204);
});

api.get("/api/companies/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

// --- Company products ---
api.get("/api/companies/:id/products", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const owns = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!owns) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT * FROM company_products WHERE company_id = ? ORDER BY name")
    .bind(id)
    .all();
  return c.json(results ?? []);
});

api.post("/api/companies/:id/products", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const owns = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!owns) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  const productId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare("INSERT INTO company_products (id, user_id, company_id, name, sale_price, cost_price, serial_number, url, internal_notes, price_includes_vat, vat_percentage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(productId, userId, id, req.name, req.sale_price, req.cost_price ?? null, req.serial_number ?? null, req.url ?? null, req.internal_notes ?? null, req.price_includes_vat ? 1 : 0, req.vat_percentage ?? 21, now, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM company_products WHERE id = ?").bind(productId).first();
  return c.json(row);
});

api.patch("/api/companies/:id/products/:productId", async (c) => {
  const userId = c.get("userId")!;
  const { id, productId } = c.req.param();
  const existing = await c.env.DB
    .prepare("SELECT id FROM company_products WHERE id = ? AND company_id = ? AND user_id = ?")
    .bind(productId, id, userId)
    .first();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare("UPDATE company_products SET name = ?, sale_price = ?, cost_price = ?, serial_number = ?, url = ?, internal_notes = ?, price_includes_vat = ?, vat_percentage = ?, updated_at = ? WHERE id = ?")
    .bind(req.name, req.sale_price, req.cost_price ?? null, req.serial_number ?? null, req.url ?? null, req.internal_notes ?? null, req.price_includes_vat ? 1 : 0, req.vat_percentage ?? 21, now, productId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM company_products WHERE id = ?").bind(productId).first();
  return c.json(row);
});

api.delete("/api/companies/:id/products/:productId", async (c) => {
  const userId = c.get("userId")!;
  const { id, productId } = c.req.param();
  await c.env.DB
    .prepare("DELETE FROM company_products WHERE id = ? AND company_id = ? AND user_id = ?")
    .bind(productId, id, userId)
    .run();
  return c.body(null, 204);
});

// --- Time entries ---
api.get("/api/time-entries", async (c) => {
  const userId = c.get("userId")!;
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
      return { ...rowTimeEntry(te), companies: cRow ?? null };
    }),
  );
  return c.json(mapped);
});

api.post("/api/time-entries", async (c) => {
  const userId = c.get("userId")!;
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
  return c.json(rowTimeEntry(row!));
});

api.patch("/api/time-entries/:id", async (c) => {
  const userId = c.get("userId")!;
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
  return c.json(rowTimeEntry(row!));
});

api.delete("/api/time-entries/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM time_entries WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// --- AI writing helper ---
api.post("/api/ai/improve-grammar", async (c) => {
  let body: { text?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const text = String(body.text ?? "").trim();
  if (!text) return c.json({ error: "Tekst is verplicht" }, 400);
  if (text.length > 3000) return c.json({ error: "Tekst is te lang (max 3000 tekens)" }, 400);

  const prompt = [
    "Verbeter de grammatica en spelling van deze Nederlandse tekst.",
    "Zet de tekst mooi en professioneel neer voor urenregistratie van uitgevoerde werkzaamheden.",
    "Behoud de exacte inhoud en details van wat er is gedaan.",
    "Maak de formulering helder en zakelijk, zonder nieuwe informatie toe te voegen.",
    "Geef uitsluitend de verbeterde tekst terug, zonder uitleg of opsommingstekens.",
    "",
    text,
  ].join("\n");

  const result = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content:
          "Je bent een redacteur voor Nederlandse urenregistraties. Verbeter grammatica en formulering, houd de tekst professioneel en zakelijk, en wijzig de inhoud niet.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 500,
    temperature: 0.1,
  });

  const improved = typeof result === "object" && result && "response" in result ? String(result.response ?? "").trim() : "";
  if (!improved) return c.json({ error: "AI gaf geen bruikbaar antwoord" }, 502);
  return c.json({ text: improved });
});

api.post("/api/time-entries/mark-invoiced", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ ids: string[]; invoice_id: string }>();
  const { ids, invoice_id } = body;
  const now = new Date().toISOString();
  const stmts = ids.map((tid) =>
    c.env.DB
      .prepare(
        "UPDATE time_entries SET invoiced = 1, invoice_id = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .bind(invoice_id, now, tid, userId),
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// --- Reports ---
api.get("/api/reports/time-entries", async (c) => {
  const userId = c.get("userId")!;
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

// --- Daily notes ---
api.get("/api/notes/daily", async (c) => {
  const userId = c.get("userId")!;
  const date = c.req.query("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date required (YYYY-MM-DD)" }, 400);
  const row = await c.env.DB
    .prepare("SELECT id, note_date, content, updated_at FROM daily_notes WHERE user_id = ? AND note_date = ?")
    .bind(userId, date)
    .first<{ id: string; note_date: string; content: string; updated_at: string }>();
  return c.json(row ?? { note_date: date, content: "", updated_at: null });
});

api.get("/api/notes/dates", async (c) => {
  const userId = c.get("userId")!;
  const { results } = await c.env.DB
    .prepare(
      `SELECT note_date
       FROM daily_notes
       WHERE user_id = ? AND TRIM(COALESCE(content, '')) <> ''
       ORDER BY note_date ASC`,
    )
    .bind(userId)
    .all<{ note_date: string }>();
  return c.json((results ?? []).map((r) => r.note_date));
});

api.put("/api/notes/daily", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const date = String(req.date ?? "");
  const content = String(req.content ?? "");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date required (YYYY-MM-DD)" }, 400);
  const now = new Date().toISOString();
  const existing = await c.env.DB
    .prepare("SELECT id FROM daily_notes WHERE user_id = ? AND note_date = ?")
    .bind(userId, date)
    .first<{ id: string }>();
  if (existing) {
    await c.env.DB.prepare("UPDATE daily_notes SET content = ?, updated_at = ? WHERE id = ?").bind(content, now, existing.id).run();
  } else {
    await c.env.DB
      .prepare("INSERT INTO daily_notes (id, user_id, note_date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, date, content, now, now)
      .run();
  }
  const row = await c.env.DB
    .prepare("SELECT id, note_date, content, updated_at FROM daily_notes WHERE user_id = ? AND note_date = ?")
    .bind(userId, date)
    .first();
  return c.json(row);
});

// --- Business settings ---
api.get("/api/business-settings", async (c) => {
  const userId = c.get("userId")!;
  const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE user_id = ?").bind(userId).first();
  return c.json(row ?? null);
});

api.put("/api/business-settings", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const existing = await c.env.DB.prepare("SELECT id FROM business_settings WHERE user_id = ?").bind(userId).first<{ id: string }>();
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB
      .prepare(
        `UPDATE business_settings SET
          company_name = ?, contact_person = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, country = ?,
          kvk_number = ?, btw_number = ?, iban = ?,
          private_name = ?, private_street = ?, private_postal_code = ?, private_city = ?, private_country = ?,
          updated_at = ?
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
        req.private_name ?? null,
        req.private_street ?? null,
        req.private_postal_code ?? null,
        req.private_city ?? null,
        req.private_country ?? null,
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
      `INSERT INTO business_settings (
        id, user_id,
        company_name, contact_person, email, phone, street, postal_code, city, country, kvk_number, btw_number, iban,
        private_name, private_street, private_postal_code, private_city, private_country,
        created_at, updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      req.private_name ?? null,
      req.private_street ?? null,
      req.private_postal_code ?? null,
      req.private_city ?? null,
      req.private_country ?? null,
      now,
      now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE id = ?").bind(id).first();
  return c.json(row);
});

// --- Invoices ---
api.get("/api/invoices", async (c) => {
  const userId = c.get("userId")!;
  const { results } = await c.env.DB
    .prepare(
      `SELECT i.*, c.name as company_name, c.contact_person as company_contact_person FROM invoices i
       LEFT JOIN companies c ON c.id = i.company_id
       WHERE i.user_id = ?
       ORDER BY i.created_at DESC`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  const mapped = (results ?? []).map((r) => {
    const company_name = r.company_name;
    const company_contact_person = r.company_contact_person;
    const { company_name: _cn, company_contact_person: _ccp, ...inv } = r;
    return { ...inv, companies: { name: company_name, contact_person: company_contact_person } };
  });
  return c.json(mapped);
});

api.get("/api/invoices/exists", async (c) => {
  const userId = c.get("userId")!;
  const month = c.req.query("month"); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "month required (YYYY-MM)" }, 400);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const row = await c.env.DB
    .prepare("SELECT 1 as x FROM invoices WHERE user_id = ? AND invoice_date >= ? AND invoice_date <= ? LIMIT 1")
    .bind(userId, from, to)
    .first<{ x: number }>();
  return c.json({ exists: Boolean(row) });
});

api.get("/api/invoices/to-send", async (c) => {
  const userId = c.get("userId")!;
  const month = c.req.query("month"); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "month required (YYYY-MM)" }, 400);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const { results } = await c.env.DB
    .prepare(
      `SELECT i.id, i.invoice_number, i.total, c.name as company_name
       FROM invoices i
       LEFT JOIN companies c ON c.id = i.company_id
       WHERE i.user_id = ? AND i.status = 'concept' AND i.invoice_date >= ? AND i.invoice_date <= ?
       ORDER BY i.invoice_date DESC, i.created_at DESC
       LIMIT 25`,
    )
    .bind(userId, from, to)
    .all<Record<string, unknown>>();
  const list = (results ?? []).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    total: r.total,
    company_name: r.company_name ?? null,
  }));
  return c.json({ count: list.length, invoices: list });
});

api.post("/api/invoices", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const invoice_date = (req.invoice_date as string) || today;
  const status = (req.status as string) || "concept";
  const advance = req.advance_payment != null ? Number(req.advance_payment) : 0;
  const advanceLabelRaw = String(req.advance_label ?? "krediet").toLowerCase();
  const advanceLabel = advanceLabelRaw === "voorschot" ? "voorschot" : "krediet";
  const invoiceType = (req.invoice_type as string) === "private" ? "private" : "business";
  const btwPct = invoiceType === "private" ? 0 : Number(req.btw_percentage);
  const subtotal = toMoney(req.subtotal);
  const btwAmount = invoiceType === "private" ? 0 : Number(req.btw_amount);
  const total = invoiceType === "private" ? subtotal : toMoney(req.total);
  const company = await c.env.DB
    .prepare("SELECT id, advance_balance FROM companies WHERE id = ? AND user_id = ?")
    .bind(req.company_id, userId)
    .first<{ id: string; advance_balance: number }>();
  if (!company) return c.json({ error: "Bedrijf niet gevonden" }, 404);

  const companyAdvanceBalance = Math.max(0, toMoney(company.advance_balance, 0));
  const requestedAdvance = Math.max(0, toMoney(advance, 0));
  const appliedAdvance = Math.min(requestedAdvance, total, companyAdvanceBalance);
  const updatedAdvanceBalance = toMoney(companyAdvanceBalance - appliedAdvance, 0);

  if (requestedAdvance > companyAdvanceBalance + 0.0001) {
    return c.json({ error: "Krediet hoger dan beschikbaar klantkrediet" }, 400);
  }
  if (requestedAdvance > total + 0.0001) {
    return c.json({ error: "Krediet hoger dan factuurtotaal" }, 400);
  }

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO invoices (id, user_id, company_id, invoice_number, invoice_date, due_date, status, subtotal, btw_percentage, btw_amount, total, advance_payment, advance_label, notes, invoice_type, payment_method, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        req.company_id,
        req.invoice_number,
        invoice_date,
        req.due_date ?? null,
        status,
        subtotal,
        btwPct,
        btwAmount,
        total,
        appliedAdvance,
        advanceLabel,
        req.notes ?? null,
        invoiceType,
        (req.payment_method as string) === "contant" ? "contant" : "overboeking",
        now,
        now,
      ),
    c.env.DB
      .prepare("UPDATE companies SET advance_balance = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(updatedAdvanceBalance, now, req.company_id, userId),
  ]);
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/invoices/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();

  const existing = await c.env.DB
    .prepare("SELECT id, invoice_type, subtotal, btw_percentage, btw_amount, total FROM invoices WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{
      id: string;
      invoice_type: string;
      subtotal: number;
      btw_percentage: number;
      btw_amount: number;
      total: number;
    }>();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const nextType = (req.invoice_type as string) ? (((req.invoice_type as string) === "private") ? "private" : "business") : (existing.invoice_type || "business");
  const nextSubtotal = req.subtotal != null ? Number(req.subtotal) : Number(existing.subtotal);
  const nextBtwPct = nextType === "private" ? 0 : (req.btw_percentage != null ? Number(req.btw_percentage) : Number(existing.btw_percentage));
  const nextBtwAmt = nextType === "private" ? 0 : (req.btw_amount != null ? Number(req.btw_amount) : Number(existing.btw_amount));
  const nextTotal = nextType === "private" ? nextSubtotal : (req.total != null ? Number(req.total) : Number(existing.total));

  await c.env.DB
    .prepare(
      `UPDATE invoices SET
        invoice_number = COALESCE(?, invoice_number),
        invoice_date = COALESCE(?, invoice_date),
        due_date = COALESCE(?, due_date),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        subtotal = ?,
        btw_percentage = ?,
        btw_amount = ?,
        total = ?,
        invoice_type = ?,
        payment_method = COALESCE(?, payment_method),
        updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      req.invoice_number ?? null,
      req.invoice_date ?? null,
      req.due_date ?? null,
      req.status ?? null,
      req.notes ?? null,
      nextSubtotal,
      nextBtwPct,
      nextBtwAmt,
      nextTotal,
      nextType,
      req.payment_method != null ? ((req.payment_method as string) === "contant" ? "contant" : "overboeking") : null,
      now,
      id,
      userId,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ?").bind(id, userId).first();
  return c.json(row);
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function splitEqual(total: number, parts: number): number[] {
  const base = Math.floor((total / parts) * 100) / 100;
  const out = Array.from({ length: parts }, () => base);
  const sum = out.reduce((a, b) => a + b, 0);
  const diff = round2(total - sum);
  out[out.length - 1] = round2(out[out.length - 1]! + diff);
  return out;
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

async function nextInvoiceNumberForYear(db: D1Database, userId: string, year: number, offset: number): Promise<string> {
  const prefix = `F${year}-`;
  const row = await db
    .prepare("SELECT COUNT(*) as c FROM invoices WHERE user_id = ? AND invoice_number LIKE ?")
    .bind(userId, `${prefix}%`)
    .first<{ c: number }>();
  const n = (row?.c ?? 0) + 1 + offset;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

api.post("/api/invoices/:id/split", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const body = await c.req.json<{ parts?: number; interval_days?: number; first_due_date?: string }>();
  const parts = Number(body.parts ?? 3);
  const intervalDays = Number(body.interval_days ?? 30);
  const firstDue = body.first_due_date;

  if (!Number.isInteger(parts) || parts < 2 || parts > 12) return c.json({ error: "parts must be 2..12" }, 400);
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) return c.json({ error: "interval_days must be 1..365" }, 400);
  if (firstDue && !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return c.json({ error: "first_due_date must be YYYY-MM-DD" }, 400);

  const invoice = await c.env.DB
    .prepare(
      "SELECT id, company_id, invoice_number, invoice_date, due_date, status, subtotal, btw_percentage, total, notes, invoice_type, advance_label FROM invoices WHERE id = ? AND user_id = ?",
    )
    .bind(id, userId)
    .first<{
      id: string;
      company_id: string;
      invoice_number: string;
      invoice_date: string;
      due_date: string | null;
      status: string;
      subtotal: number;
      btw_percentage: number;
      total: number;
      notes: string | null;
      invoice_type: string;
      advance_label: string | null;
    }>();
  if (!invoice) return c.json({ error: "Not found" }, 404);

  const splitAdvanceLabel = String(invoice.advance_label ?? "krediet").toLowerCase() === "voorschot" ? "voorschot" : "krediet";

  const already = await c.env.DB.prepare("SELECT 1 FROM invoices WHERE split_from_invoice_id = ? LIMIT 1").bind(id).first();
  if (already) return c.json({ error: "Invoice already split" }, 409);

  const origLine = await c.env.DB
    .prepare("SELECT description FROM invoice_lines WHERE invoice_id = ? ORDER BY created_at LIMIT 1")
    .bind(id)
    .first<{ description: string }>();
  const origDesc = (origLine?.description ?? "").trim() || `Factuur ${invoice.invoice_number}`;

  const today = new Date().toISOString().split("T")[0]!;
  const invDate = invoice.invoice_date || today;
  // Vervaldatum termijnen: standaard 30 dagen na factuurdatum, en daarna telkens +30 dagen.
  const baseDue = firstDue ?? addDaysIso(invDate, intervalDays);
  const isPrivate = invoice.invoice_type === "private";
  const subtotalParts = splitEqual(Number(invoice.subtotal), parts);
  const year = new Date().getFullYear();
  const now = new Date().toISOString();

  const createdIds: string[] = [];
  const stmts: ReturnType<D1Database["prepare"]>[] = [];
  for (let i = 0; i < parts; i++) {
    const termInvoiceDate = addDaysIso(invDate, intervalDays * i);
    const sub = subtotalParts[i]!;
    const btwPct = isPrivate ? 0 : Number(invoice.btw_percentage);
    const btwAmt = isPrivate ? 0 : round2(sub * (btwPct / 100));
    const tot = isPrivate ? sub : round2(sub + btwAmt);
    const due = firstDue ? addDaysIso(baseDue, intervalDays * i) : addDaysIso(termInvoiceDate, intervalDays);
    const newId = crypto.randomUUID();
    const newNr = await nextInvoiceNumberForYear(c.env.DB, userId, year, i);
    const termNote = `Termijn ${i + 1}/${parts} (gesplitst vanaf ${invoice.invoice_number})`;
    const termDesc = `${origDesc} — termijn ${i + 1}/${parts}`;
    const newNotes = [invoice.notes, termNote].filter(Boolean).join("\n");

    stmts.push(
      c.env.DB
        .prepare(
          `INSERT INTO invoices (
            id, user_id, company_id, invoice_number, invoice_date, due_date, status,
            subtotal, btw_percentage, btw_amount, total, advance_payment, advance_label, notes, invoice_type, split_from_invoice_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'concept', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(newId, userId, invoice.company_id, newNr, termInvoiceDate, due, sub, btwPct, btwAmt, tot, splitAdvanceLabel, newNotes, isPrivate ? "private" : "business", id, now, now),
    );
    stmts.push(
      c.env.DB
        .prepare(
          `INSERT INTO invoice_lines (
            id, invoice_id, time_entry_id, description, date, hours, hourly_rate, amount, created_at
          ) VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?, datetime('now'))`,
        )
        .bind(crypto.randomUUID(), newId, termDesc, termInvoiceDate, sub),
    );
    createdIds.push(newId);
  }

  stmts.push(
    c.env.DB
      .prepare("UPDATE invoices SET status = 'vervallen', notes = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind([invoice.notes, `Gesplitst in ${parts} termijnen op ${today}.`].filter(Boolean).join("\n"), now, id, userId),
  );

  await c.env.DB.batch(stmts);
  return c.json({ ok: true, created_invoice_ids: createdIds });
});

api.delete("/api/invoices/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const now = new Date().toISOString();
  const invoice = await c.env.DB
    .prepare("SELECT id, company_id, advance_payment FROM invoices WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; company_id: string; advance_payment: number }>();
  if (!invoice) return c.json({ error: "Not found" }, 404);
  const restoreAdvance = Math.max(0, toMoney(invoice.advance_payment, 0));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE time_entries SET invoiced = 0, invoice_id = NULL, updated_at = ? WHERE invoice_id = ? AND user_id = ?").bind(now, id, userId),
    c.env.DB
      .prepare("UPDATE companies SET advance_balance = ROUND(COALESCE(advance_balance, 0) + ?, 2), updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(restoreAdvance, now, invoice.company_id, userId),
    c.env.DB.prepare("DELETE FROM invoices WHERE id = ? AND user_id = ?").bind(id, userId),
  ]);
  return c.body(null, 204);
});

api.get("/api/invoice-lines", async (c) => {
  const invoiceId = c.req.query("invoice_id");
  if (!invoiceId) return c.json({ error: "invoice_id required" }, 400);
  const { results } = await c.env.DB.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY date").bind(invoiceId).all();
  return c.json(results ?? []);
});

// --- Diensten ---
api.get("/api/services", async (c) => {
  const userId = c.get("userId")!;
  const { results } = await c.env.DB.prepare("SELECT * FROM services WHERE user_id = ? ORDER BY name").bind(userId).all();
  return c.json(results ?? []);
});

api.post("/api/services", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare("INSERT INTO services (id, user_id, name, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, userId, req.name, req.amount, now, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM services WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/services/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare("UPDATE services SET name = ?, amount = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(req.name, req.amount, now, id, userId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM services WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

api.delete("/api/services/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM services WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

api.post("/api/invoice-lines", async (c) => {
  const userId = c.get("userId")!;
  const l = await c.req.json<Record<string, unknown>>();
  const invoiceId = l.invoice_id as string;
  const owns = await c.env.DB.prepare("SELECT id, btw_percentage, invoice_type FROM invoices WHERE id = ? AND user_id = ?").bind(invoiceId, userId).first<{ id: string; btw_percentage: number; invoice_type: string }>();
  if (!owns) return c.json({ error: "Not found" }, 404);
  const now = new Date().toISOString();
  const lineId = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO invoice_lines (id, invoice_id, time_entry_id, description, date, hours, hourly_rate, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))")
    .bind(lineId, invoiceId, null, l.description, l.date ?? null, null, null, l.amount)
    .run();
  const linesRow = await c.env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM invoice_lines WHERE invoice_id = ?").bind(invoiceId).first<{ s: number }>();
  const newSubtotal = Math.round((linesRow?.s ?? 0) * 100) / 100;
  const isPrivate = owns.invoice_type === "private";
  const newBtw = isPrivate ? 0 : Math.round(newSubtotal * Number(owns.btw_percentage)) / 100;
  const newTotal = Math.round((newSubtotal + newBtw) * 100) / 100;
  await c.env.DB.prepare("UPDATE invoices SET subtotal = ?, btw_amount = ?, total = ?, updated_at = ? WHERE id = ?").bind(newSubtotal, newBtw, newTotal, now, invoiceId).run();
  const row = await c.env.DB.prepare("SELECT * FROM invoice_lines WHERE id = ?").bind(lineId).first();
  return c.json(row);
});

api.delete("/api/invoice-lines/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const line = await c.env.DB.prepare("SELECT il.invoice_id FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id WHERE il.id = ? AND i.user_id = ?").bind(id, userId).first<{ invoice_id: string }>();
  if (!line) return c.body(null, 204);
  const invoiceId = line.invoice_id;
  const inv = await c.env.DB.prepare("SELECT btw_percentage, invoice_type FROM invoices WHERE id = ?").bind(invoiceId).first<{ btw_percentage: number; invoice_type: string }>();
  await c.env.DB.prepare("DELETE FROM invoice_lines WHERE id = ?").bind(id).run();
  if (inv) {
    const now = new Date().toISOString();
    const linesRow = await c.env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM invoice_lines WHERE invoice_id = ?").bind(invoiceId).first<{ s: number }>();
    const newSubtotal = Math.round((linesRow?.s ?? 0) * 100) / 100;
    const isPrivate = inv.invoice_type === "private";
    const newBtw = isPrivate ? 0 : Math.round(newSubtotal * Number(inv.btw_percentage)) / 100;
    const newTotal = Math.round((newSubtotal + newBtw) * 100) / 100;
    await c.env.DB.prepare("UPDATE invoices SET subtotal = ?, btw_amount = ?, total = ?, updated_at = ? WHERE id = ?").bind(newSubtotal, newBtw, newTotal, now, invoiceId).run();
  }
  return c.body(null, 204);
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
  const userId = c.get("userId")!;
  const { results } = await c.env.DB
    .prepare(
      `SELECT q.*, c.name as company_name, c.contact_person as company_contact_person FROM quotes q
       LEFT JOIN companies c ON c.id = q.company_id
       WHERE q.user_id = ?
       ORDER BY q.created_at DESC`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  const mapped = (results ?? []).map((r) => {
    const company_name = r.company_name;
    const company_contact_person = r.company_contact_person;
    const { company_name: _cn, company_contact_person: _ccp, ...q } = r;
    return { ...q, companies: { name: company_name, contact_person: company_contact_person } };
  });
  return c.json(mapped);
});

api.post("/api/quotes", async (c) => {
  const userId = c.get("userId")!;
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

api.patch("/api/quotes/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();

  const existing = await c.env.DB.prepare("SELECT id FROM quotes WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return c.json({ error: "Not found" }, 404);

  await c.env.DB
    .prepare(
      `UPDATE quotes SET
        quote_number = COALESCE(?, quote_number),
        quote_date = COALESCE(?, quote_date),
        valid_until = COALESCE(?, valid_until),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(req.quote_number ?? null, req.quote_date ?? null, req.valid_until ?? null, req.status ?? null, req.notes ?? null, now, id, userId)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM quotes WHERE id = ? AND user_id = ?").bind(id, userId).first();
  return c.json(row);
});

api.post("/api/quotes/:id/invoice", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const quote = await c.env.DB
    .prepare(
      "SELECT id, company_id, quote_number, quote_date, subtotal, btw_percentage, btw_amount, total, notes FROM quotes WHERE id = ? AND user_id = ?",
    )
    .bind(id, userId)
    .first<{
      id: string;
      company_id: string;
      quote_number: string;
      quote_date: string;
      subtotal: number;
      btw_percentage: number;
      btw_amount: number;
      total: number;
      notes: string | null;
    }>();
  if (!quote) return c.json({ error: "Offerte niet gevonden" }, 404);

  const company = await c.env.DB
    .prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?")
    .bind(quote.company_id, userId)
    .first<{ id: string }>();
  if (!company) return c.json({ error: "Bedrijf niet gevonden" }, 404);

  const { results: quoteLines } = await c.env.DB
    .prepare("SELECT description, hours, hourly_rate, amount FROM quote_lines WHERE quote_id = ? ORDER BY created_at")
    .bind(id)
    .all<{ description: string; hours: number | null; hourly_rate: number | null; amount: number }>();

  const today = new Date().toISOString().split("T")[0]!;
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const invoiceId = crypto.randomUUID();
  const invoiceNumber = await nextInvoiceNumberForYear(c.env.DB, userId, year, 0);
  const dueDate = addDaysIso(today, 30);
  const subtotal = toMoney(quote.subtotal);
  const btwPct = Number(quote.btw_percentage);
  const btwAmount = toMoney(quote.btw_amount);
  const total = toMoney(quote.total);
  const baseNote = `Gebaseerd op offerte ${quote.quote_number}`;
  const notes = quote.notes ? `${quote.notes}\n\n${baseNote}` : baseNote;
  const lineDate = quote.quote_date || today;

  const stmts: D1PreparedStatement[] = [
    c.env.DB
      .prepare(
        `INSERT INTO invoices (id, user_id, company_id, invoice_number, invoice_date, due_date, status, subtotal, btw_percentage, btw_amount, total, advance_payment, advance_label, notes, invoice_type, payment_method, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'concept', ?, ?, ?, ?, 0, 'krediet', ?, 'business', 'overboeking', ?, ?)`,
      )
      .bind(invoiceId, userId, quote.company_id, invoiceNumber, today, dueDate, subtotal, btwPct, btwAmount, total, notes, now, now),
  ];

  for (const line of quoteLines ?? []) {
    stmts.push(
      c.env.DB
        .prepare(
          `INSERT INTO invoice_lines (id, invoice_id, time_entry_id, description, date, hours, hourly_rate, amount, created_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(crypto.randomUUID(), invoiceId, line.description, lineDate, line.hours ?? null, line.hourly_rate ?? null, line.amount),
    );
  }

  await c.env.DB.batch(stmts);
  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(invoiceId).first();
  return c.json(row);
});

api.delete("/api/quotes/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM quotes WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

api.get("/api/quote-lines", async (c) => {
  const quoteId = c.req.query("quote_id");
  if (!quoteId) return c.json({ error: "quote_id required" }, 400);
  const { results } = await c.env.DB.prepare("SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY created_at").bind(quoteId).all();
  return c.json(results ?? []);
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

// --- Subscriptions ---
api.get("/api/subscriptions", async (c) => {
  const userId = c.get("userId")!;
  const { results } = await c.env.DB.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY name").bind(userId).all();
  return c.json((results ?? []).map((r) => rowSubscription(r as Record<string, unknown>)));
});

api.post("/api/subscriptions", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO subscriptions (id, user_id, name, category, contract_number, amount, billing_cycle, payment_method, contract_end_date, next_payment_date, notes, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, userId, req.name, req.category ?? "prive", req.contract_number ?? null,
      req.amount ?? 0, req.billing_cycle ?? "maandelijks", req.payment_method ?? null,
      req.contract_end_date ?? null, req.next_payment_date ?? null, req.notes ?? null, serializeSubscriptionTags(req.tags), now, now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).first();
  return c.json(row ? rowSubscription(row as Record<string, unknown>) : null);
});

api.patch("/api/subscriptions/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();

  const existing = await c.env.DB.prepare("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ["name", "category", "contract_number", "amount", "billing_cycle", "payment_method", "contract_end_date", "next_payment_date", "notes"]) {
    if (key in req) {
      fields.push(`${key} = ?`);
      values.push(req[key] ?? null);
    }
  }
  if ("tags" in req) {
    fields.push("tags = ?");
    values.push(serializeSubscriptionTags(req.tags));
  }
  fields.push("updated_at = ?");
  values.push(now);
  values.push(id, userId);

  await c.env.DB.prepare(`UPDATE subscriptions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  const row = await c.env.DB.prepare("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(rowSubscription(row as Record<string, unknown>));
});

api.delete("/api/subscriptions/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM subscription_payments WHERE subscription_id = ? AND user_id = ?").bind(id, userId).run();
  await c.env.DB.prepare("DELETE FROM subscriptions WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

api.get("/api/subscriptions/:id/payments", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const sub = await c.env.DB.prepare("SELECT id FROM subscriptions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!sub) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT * FROM subscription_payments WHERE subscription_id = ? AND user_id = ? ORDER BY period_date DESC")
    .bind(id, userId)
    .all();
  return c.json((results ?? []).map((r) => ({ ...r, paid: Boolean(r.paid) })));
});

api.post("/api/subscriptions/:id/payments/toggle", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const body = await c.req.json<{ period_date: string }>();
  const periodDate = body.period_date;

  const sub = await c.env.DB
    .prepare("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; amount: number }>();
  if (!sub) return c.json({ error: "Not found" }, 404);

  const existing = await c.env.DB
    .prepare("SELECT * FROM subscription_payments WHERE subscription_id = ? AND period_date = ?")
    .bind(id, periodDate)
    .first<{ id: string; paid: number }>();

  const now = new Date().toISOString();

  if (existing) {
    const newPaid = existing.paid ? 0 : 1;
    await c.env.DB
      .prepare("UPDATE subscription_payments SET paid = ?, paid_at = ? WHERE id = ?")
      .bind(newPaid, newPaid ? now : null, existing.id)
      .run();
  } else {
    const newId = crypto.randomUUID();
    await c.env.DB
      .prepare("INSERT INTO subscription_payments (id, subscription_id, user_id, period_date, amount, paid, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(newId, id, userId, periodDate, sub.amount, now, now)
      .run();
  }

  const row = await c.env.DB
    .prepare("SELECT * FROM subscription_payments WHERE subscription_id = ? AND period_date = ?")
    .bind(id, periodDate)
    .first();
  return c.json({ ...row, paid: Boolean(row?.paid) });
});

// --- Leads ---
api.get("/api/leads", async (c) => {
  const userId = c.get("userId")!;
  const { results } = await c.env.DB
    .prepare("SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all();
  return c.json(results ?? []);
});

api.post("/api/leads", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  if (!req.company_name) return c.json({ error: "company_name is verplicht" }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO leads (id, user_id, company_name, contact_name, email, phone, website, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, userId, req.company_name, req.contact_name ?? null, req.email ?? null,
      req.phone ?? null, req.website ?? null, req.status ?? "new", req.notes ?? null, now, now,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/leads/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  const existing = await c.env.DB.prepare("SELECT id FROM leads WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ["company_name", "contact_name", "email", "phone", "website", "status", "notes"]) {
    if (key in req) {
      fields.push(`${key} = ?`);
      values.push(req[key] ?? null);
    }
  }
  fields.push("updated_at = ?");
  values.push(now, id, userId);
  await c.env.DB.prepare(`UPDATE leads SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  const row = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

api.delete("/api/leads/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM leads WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// --- Creditnota ---
api.post("/api/invoices/:id/credit-note", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();

  const existing = await c.env.DB
    .prepare("SELECT id FROM invoices WHERE credit_note_for_id = ? AND user_id = ? LIMIT 1")
    .bind(id, userId).first();
  if (existing) return c.json({ error: "Er bestaat al een creditnota voor deze factuur" }, 409);

  const invoice = await c.env.DB
    .prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{
      id: string; company_id: string; invoice_number: string; invoice_date: string;
      subtotal: number; btw_percentage: number; btw_amount: number; total: number;
      invoice_type: string; is_credit_note: number;
    }>();
  if (!invoice) return c.json({ error: "Not found" }, 404);
  if (invoice.is_credit_note) return c.json({ error: "Kan geen creditnota maken van een creditnota" }, 400);

  const year = new Date().getFullYear();
  const countRow = await c.env.DB
    .prepare("SELECT COUNT(*) as c FROM invoices WHERE user_id = ? AND invoice_number LIKE ?")
    .bind(userId, `CN${year}-%`).first<{ c: number }>();
  const cnNumber = `CN${year}-${String((countRow?.c ?? 0) + 1).padStart(4, "0")}`;

  const newId = crypto.randomUUID();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const sub = -Math.abs(Number(invoice.subtotal));
  const btwAmt = -Math.abs(Number(invoice.btw_amount));
  const tot = -Math.abs(Number(invoice.total));

  await c.env.DB.prepare(
    `INSERT INTO invoices (id, user_id, company_id, invoice_number, invoice_date, due_date, status,
      subtotal, btw_percentage, btw_amount, total, advance_payment, advance_label, notes, invoice_type,
      payment_method, is_credit_note, credit_note_for_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'concept', ?, ?, ?, ?, 0, 'krediet', ?, ?, 'overboeking', 1, ?, ?, ?)`,
  ).bind(newId, userId, invoice.company_id, cnNumber, today, sub, invoice.btw_percentage, btwAmt, tot,
    `Creditnota voor factuur ${invoice.invoice_number}`, invoice.invoice_type, id, now, now).run();

  const { results: lines } = await c.env.DB
    .prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY created_at")
    .bind(id).all<{ description: string; date: string | null; hours: number | null; hourly_rate: number | null; amount: number }>();

  if (lines?.length) {
    const stmts = lines.map((l) =>
      c.env.DB.prepare(
        `INSERT INTO invoice_lines (id, invoice_id, time_entry_id, description, date, hours, hourly_rate, amount, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(crypto.randomUUID(), newId, l.description, l.date ?? null, l.hours ?? null, l.hourly_rate ?? null, -Math.abs(Number(l.amount))),
    );
    await c.env.DB.batch(stmts);
  }

  const row = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(newId).first<Record<string, unknown>>();
  return c.json({ ...row, is_credit_note: Boolean(row?.is_credit_note) });
});

// --- Expenses ---
api.get("/api/expenses", async (c) => {
  const userId = c.get("userId")!;
  const from = c.req.query("from");
  const to = c.req.query("to");
  const category = c.req.query("category");
  let sql = "SELECT * FROM expenses WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (from) { sql += " AND date >= ?"; params.push(from); }
  if (to) { sql += " AND date <= ?"; params.push(to); }
  if (category && category !== "all") { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY date DESC, created_at DESC";
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results ?? []);
});

api.post("/api/expenses", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const id = typeof req.id === "string" && req.id ? req.id : crypto.randomUUID();
  const now = new Date().toISOString();
  const vatPct = Number(req.vat_percentage ?? 21);
  const exclVat = toMoney(req.amount_excl_vat);
  const vatAmt = req.vat_amount != null ? toMoney(req.vat_amount) : toMoney(exclVat * vatPct / 100);
  const inclVat = req.amount_incl_vat != null ? toMoney(req.amount_incl_vat) : toMoney(exclVat + vatAmt);
  await c.env.DB
    .prepare(
      `INSERT INTO expenses (id, user_id, date, supplier, description, category, amount_excl_vat, vat_percentage, vat_amount, amount_incl_vat, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, req.date, req.supplier ?? null, req.description, req.category ?? "overig", exclVat, vatPct, vatAmt, inclVat, req.notes ?? null, now, now)
    .run();
  const bankDesc = req.supplier ? `${req.supplier} - ${req.description}` : req.description;
  const bankId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO bank_transactions (id, user_id, date, description, amount, type, notes, expense_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(bankId, userId, req.date, bankDesc, -inclVat, "uitgave", null, id, now).run();
  const row = await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/expenses/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT id FROM expenses WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  const vatPct = Number(req.vat_percentage ?? 21);
  const exclVat = toMoney(req.amount_excl_vat);
  const vatAmt = req.vat_amount != null ? toMoney(req.vat_amount) : toMoney(exclVat * vatPct / 100);
  const inclVat = req.amount_incl_vat != null ? toMoney(req.amount_incl_vat) : toMoney(exclVat + vatAmt);
  await c.env.DB
    .prepare(
      `UPDATE expenses SET date = ?, supplier = ?, description = ?, category = ?, amount_excl_vat = ?, vat_percentage = ?, vat_amount = ?, amount_incl_vat = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(req.date, req.supplier ?? null, req.description, req.category ?? "overig", exclVat, vatPct, vatAmt, inclVat, req.notes ?? null, now, id, userId)
    .run();
  const bankDesc = req.supplier ? `${req.supplier} - ${req.description}` : req.description;
  await c.env.DB.prepare(
    `UPDATE bank_transactions SET date = ?, description = ?, amount = ?, type = ? WHERE expense_id = ? AND user_id = ?`,
  ).bind(req.date, bankDesc, -inclVat, "uitgave", id, userId).run();
  const row = await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/expenses/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM bank_transactions WHERE expense_id = ? AND user_id = ?").bind(id, userId).run();
  await c.env.DB.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// --- BTW rapport ---
api.get("/api/reports/btw", async (c) => {
  const userId = c.get("userId")!;
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) return c.json({ error: "from and to required" }, 400);

  const invRow = await c.env.DB
    .prepare(
      `SELECT COALESCE(SUM(subtotal), 0) AS omzet, COALESCE(SUM(btw_amount), 0) AS btw
       FROM invoices
       WHERE user_id = ? AND invoice_date >= ? AND invoice_date <= ?
         AND status IN ('verzonden', 'betaald')`,
    )
    .bind(userId, from, to)
    .first<{ omzet: number; btw: number }>();

  const expRow = await c.env.DB
    .prepare(
      `SELECT COALESCE(SUM(amount_excl_vat), 0) AS excl, COALESCE(SUM(vat_amount), 0) AS btw
       FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?`,
    )
    .bind(userId, from, to)
    .first<{ excl: number; btw: number }>();

  const verkoopOmzet = toMoney(invRow?.omzet ?? 0);
  const verkoopBtw = toMoney(invRow?.btw ?? 0);
  const inkoopExcl = toMoney(expRow?.excl ?? 0);
  const inkoopBtw = toMoney(expRow?.btw ?? 0);

  return c.json({
    verkoop_omzet: verkoopOmzet,
    verkoop_btw: verkoopBtw,
    inkoop_excl: inkoopExcl,
    inkoop_btw: inkoopBtw,
    saldo_btw: toMoney(verkoopBtw - inkoopBtw),
  });
});

// --- Winst & verlies rapport ---
api.get("/api/reports/profit", async (c) => {
  const userId = c.get("userId")!;
  const yearParam = c.req.query("year");
  if (!yearParam || !/^\d{4}$/.test(yearParam)) return c.json({ error: "year required (YYYY)" }, 400);
  const from = `${yearParam}-01-01`;
  const to = `${yearParam}-12-31`;

  const [invRow, expRow, subRow, kmRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(subtotal), 0) AS omzet FROM invoices
       WHERE user_id = ? AND invoice_date >= ? AND invoice_date <= ? AND status = 'betaald' AND is_credit_note = 0`,
    ).bind(userId, from, to).first<{ omzet: number }>(),

    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_excl_vat), 0) AS kosten FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ?`,
    ).bind(userId, from, to).first<{ kosten: number }>(),

    c.env.DB.prepare(
      `SELECT COALESCE(SUM(sp.amount), 0) AS kosten
       FROM subscription_payments sp
       JOIN subscriptions s ON s.id = sp.subscription_id
       WHERE sp.user_id = ? AND sp.paid = 1
         AND sp.period_date >= ? AND sp.period_date <= ?
         AND s.category = 'zakelijk'`,
    ).bind(userId, from, to).first<{ kosten: number }>(),

    c.env.DB.prepare(
      `SELECT COALESCE(SUM(distance_km * 0.23), 0) AS kosten FROM mileage_entries
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_private = 0`,
    ).bind(userId, from, to).first<{ kosten: number }>(),
  ]);

  const omzet = toMoney(invRow?.omzet ?? 0);
  const inkoopKosten = toMoney(expRow?.kosten ?? 0);
  const abonnementKosten = toMoney(subRow?.kosten ?? 0);
  const kmKosten = toMoney(kmRow?.kosten ?? 0);
  const totaalKosten = toMoney(inkoopKosten + abonnementKosten + kmKosten);

  return c.json({
    omzet,
    inkoop_kosten: inkoopKosten,
    abonnement_kosten: abonnementKosten,
    km_kosten: kmKosten,
    totaal_kosten: totaalKosten,
    winst: toMoney(omzet - totaalKosten),
  });
});

// --- Kilometerregistratie ---
api.get("/api/mileage", async (c) => {
  const userId = c.get("userId")!;
  const from = c.req.query("from");
  const to = c.req.query("to");
  let sql = "SELECT * FROM mileage_entries WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (from) { sql += " AND date >= ?"; params.push(from); }
  if (to) { sql += " AND date <= ?"; params.push(to); }
  sql += " ORDER BY date DESC, created_at DESC";
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results ?? []);
});

api.post("/api/mileage", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  if (!req.date || !req.purpose) return c.json({ error: "date en purpose zijn verplicht" }, 400);
  const odoStart = req.odometer_start != null ? Number(req.odometer_start) : null;
  const odoEnd   = req.odometer_end   != null ? Number(req.odometer_end)   : null;
  const distKm = (odoStart != null && odoEnd != null)
    ? Math.max(0, odoEnd - odoStart)
    : (req.distance_km != null ? Number(req.distance_km) : 0);
  const isPrivate = req.is_private ? 1 : 0;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO mileage_entries (id, user_id, date, from_location, to_location, odometer_start, odometer_end, distance_km, purpose, is_private, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, req.date, req.from_location ?? null, req.to_location ?? null, odoStart, odoEnd, distKm, req.purpose, isPrivate, req.notes ?? null, now, now).run();
  const row = await c.env.DB.prepare("SELECT * FROM mileage_entries WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/mileage/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const exists = await c.env.DB.prepare("SELECT id FROM mileage_entries WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!exists) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  const odoStart = req.odometer_start != null ? Number(req.odometer_start) : null;
  const odoEnd   = req.odometer_end   != null ? Number(req.odometer_end)   : null;
  const distKm = (odoStart != null && odoEnd != null)
    ? Math.max(0, odoEnd - odoStart)
    : (req.distance_km != null ? Number(req.distance_km) : 0);
  const isPrivate = req.is_private ? 1 : 0;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE mileage_entries SET date = ?, from_location = ?, to_location = ?, odometer_start = ?, odometer_end = ?, distance_km = ?, purpose = ?, is_private = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).bind(req.date, req.from_location ?? null, req.to_location ?? null, odoStart, odoEnd, distKm, req.purpose, isPrivate, req.notes ?? null, now, id, userId).run();
  const row = await c.env.DB.prepare("SELECT * FROM mileage_entries WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/mileage/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM mileage_entries WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// --- Bankrekening ---
api.get("/api/bank-transactions", async (c) => {
  const userId = c.get("userId")!;
  const { from, to } = c.req.query();
  let sql = "SELECT * FROM bank_transactions WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (from) { sql += " AND date >= ?"; params.push(from); }
  if (to)   { sql += " AND date <= ?"; params.push(to); }
  sql += " ORDER BY date DESC, created_at DESC";
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(rows.results);
});

api.get("/api/bank-balance", async (c) => {
  const userId = c.get("userId")!;
  const row = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS saldo FROM bank_transactions WHERE user_id = ?",
  ).bind(userId).first<{ saldo: number }>();
  return c.json({ saldo: row?.saldo ?? 0 });
});

api.post("/api/bank-transactions", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  if (!req.date || !req.description || req.amount == null) return c.json({ error: "date, description en amount zijn verplicht" }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO bank_transactions (id, user_id, date, description, amount, type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, req.date, req.description, Number(req.amount), req.type ?? "overig", req.notes ?? null, now).run();
  const row = await c.env.DB.prepare("SELECT * FROM bank_transactions WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.patch("/api/bank-transactions/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const exists = await c.env.DB.prepare("SELECT id FROM bank_transactions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!exists) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    `UPDATE bank_transactions SET date = ?, description = ?, amount = ?, type = ?, notes = ? WHERE id = ? AND user_id = ?`,
  ).bind(req.date, req.description, Number(req.amount), req.type ?? "overig", req.notes ?? null, id, userId).run();
  const row = await c.env.DB.prepare("SELECT * FROM bank_transactions WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/bank-transactions/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM bank_transactions WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// --- Bijlagen (R2) ---
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf",
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

api.post("/api/attachments/upload", async (c) => {
  const userId = c.get("userId")!;
  const formData = await c.req.formData();
  const file = formData.get("file");
  const entityType = formData.get("entity_type");
  const entityId = formData.get("entity_id");

  if (!(file instanceof File)) return c.json({ error: "Geen bestand meegegeven" }, 400);
  if (!entityType || typeof entityType !== "string") return c.json({ error: "entity_type verplicht" }, 400);
  if (!entityId || typeof entityId !== "string") return c.json({ error: "entity_id verplicht" }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return c.json({ error: "Bestandstype niet toegestaan. Gebruik JPEG, PNG, GIF, WebP, HEIC of PDF." }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: "Bestand te groot (max 10 MB)" }, 400);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const id = crypto.randomUUID();
  const r2Key = `${userId}/${entityType}/${entityId}/${id}.${ext}`;

  await c.env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { userId, entityType, entityId, originalFilename: file.name },
  });

  const now = new Date().toISOString();
  await c.env.DB
    .prepare(`INSERT INTO attachments (id, user_id, entity_type, entity_id, filename, content_type, r2_key, size_bytes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, entityType, entityId, file.name, file.type, r2Key, file.size, now)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first();
  return c.json(row, 201);
});

api.get("/api/attachments", async (c) => {
  const userId = c.get("userId")!;
  const entityType = c.req.query("entity_type");
  const entityId = c.req.query("entity_id");
  if (!entityType || !entityId) return c.json({ error: "entity_type en entity_id verplicht" }, 400);
  const rows = await c.env.DB
    .prepare("SELECT * FROM attachments WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at ASC")
    .bind(userId, entityType, entityId)
    .all();
  return c.json(rows.results ?? []);
});

api.get("/api/attachments/:id/download", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const row = await c.env.DB
    .prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ r2_key: string; filename: string; content_type: string | null }>();
  if (!row) return c.json({ error: "Niet gevonden" }, 404);

  const obj = await c.env.FILES.get(row.r2_key);
  if (!obj) return c.json({ error: "Bestand niet gevonden in opslag" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", row.content_type ?? "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(row.filename)}"`);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(obj.body, { headers });
});

api.delete("/api/attachments/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const row = await c.env.DB
    .prepare("SELECT r2_key FROM attachments WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: "Niet gevonden" }, 404);
  await c.env.FILES.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM attachments WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

/** D1-fouten (o.a. ontbrekende tabellen) anders als kale "Internal Server Error" zonder JSON. */
api.onError((err, c) => {
  console.error(err);
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("no such table")) {
    return c.json(
      {
        error:
          "Database niet klaar: D1-migraties ontbreken. Voer uit: npm run db:migrate:remote (productie) of npm run db:migrate:local (lokaal).",
      },
      503,
    );
  }
  return c.json({ error: "Serverfout" }, 500);
});

// --- Telegram notification helper ---
async function sendTelegramMessage(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
  });
}

type UpcomingPaymentRow = {
  name: string;
  amount: number;
  next_payment_date: string;
  payment_method: string | null;
  category: string;
};

async function getUpcomingPayments(env: Env): Promise<UpcomingPaymentRow[]> {
  const today = new Date();
  const in2days = new Date(today);
  in2days.setDate(in2days.getDate() + 2);
  const targetDate = in2days.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const { results } = await env.DB
    .prepare("SELECT * FROM subscriptions WHERE next_payment_date IS NOT NULL AND next_payment_date BETWEEN ? AND ?")
    .bind(todayStr, targetDate)
    .all<UpcomingPaymentRow>();

  return results ?? [];
}

function buildUpcomingPaymentsMessage(results: UpcomingPaymentRow[]): string {
  const lines = results.map((s) => {
    const method = s.payment_method ?? "onbekend";
    const cat = s.category === "zakelijk" ? "Zakelijk" : "Privé";
    const date = new Date(s.next_payment_date).toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
    return `• <b>${s.name}</b> — €${Number(s.amount).toFixed(2)} (${method}) — ${date} [${cat}]`;
  });

  const total = results.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    `💰 <b>Komende betalingen</b>\n\n` +
    lines.join("\n") +
    `\n\n<b>Totaal: €${total.toFixed(2)}</b>\n\nZorg dat je saldo/creditcard op orde is!`
  );
}

async function checkUpcomingPayments(env: Env): Promise<number> {
  const results = await getUpcomingPayments(env);
  if (results.length === 0) return 0;
  await sendTelegramMessage(env, buildUpcomingPaymentsMessage(results));
  return results.length;
}

api.post("/api/telegram/test", async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_CHAT_ID) {
    return c.json(
      { error: "Telegram is niet geconfigureerd. Voeg TELEGRAM_BOT_TOKEN en TELEGRAM_CHAT_ID toe." },
      400,
    );
  }
  const email = c.get("email") ?? "onbekend";
  const now = new Date().toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
  const text =
    `🧪 <b>Telegram testbericht</b>\n` +
    `Verzonden vanuit de app-instellingen.\n` +
    `Gebruiker: <code>${email}</code>\n` +
    `Tijd: ${now}`;
  await sendTelegramMessage(c.env, text);
  return c.json({ ok: true });
});

api.post("/api/telegram/test-upcoming-payments", async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_CHAT_ID) {
    return c.json(
      { error: "Telegram is niet geconfigureerd. Voeg TELEGRAM_BOT_TOKEN en TELEGRAM_CHAT_ID toe." },
      400,
    );
  }

  const results = await getUpcomingPayments(c.env);
  if (results.length === 0) {
    await sendTelegramMessage(
      c.env,
      "💰 <b>Komende betalingen</b>\n\nGeen betalingen gepland in de komende 2 dagen.",
    );
    return c.json({ ok: true, count: 0 });
  }

  await sendTelegramMessage(c.env, buildUpcomingPaymentsMessage(results));
  return c.json({ ok: true, count: results.length });
});

// Exported for Node.js server (server/index.ts uses this directly with adapter bindings)
export { api };

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
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const now = new Date();
    const nlParts = new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .reduce<Record<string, string>>((acc, p) => {
        if (p.type === "hour" || p.type === "minute") acc[p.type] = p.value;
        return acc;
      }, {});
    const nlTime = `${nlParts.hour ?? "00"}:${nlParts.minute ?? "00"}`;
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    // Bestaande dagelijkse run om 08:00 UTC behouden.
    if (utcHour === 8 && utcMinute === 0) {
      await checkUpcomingPayments(env);
      return;
    }

    // Extra run exact om 10:23 Nederlandse tijd (DST-safe).
    if (nlTime === "10:23") {
      await checkUpcomingPayments(env);
    }
  },
};

import type { AppEnv, D1PreparedStatement } from "./types.js";
import { generateTotpSecret, verifyTotp, otpauthUrl, generateRecoveryCodes, hashRecoveryCode } from "./totp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { hashPassword, verifyPassword } from "./auth-crypto.js";
import { signPortalToken, signUserToken, verifyPortalToken, verifyUserToken } from "./jwt.js";

export type Env = AppEnv;

type Variables = {
  userId?: string;       // org isolation key (= org_id = owner's user_id)
  ownUserId?: string;    // actual logged-in user id (for audit logs, invites)
  orgRole?: string;      // role of the logged-in user in the org
  portalCompanyId?: string;
  email?: string;
};

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

async function logAudit(
  db: Env["DB"],
  userId: string,
  entityType: string,
  entityId: string,
  action: "create" | "update" | "delete",
  oldData: unknown,
  newData: unknown,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO audit_log (id, user_id, entity_type, entity_id, action, old_data, new_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      entityType,
      entityId,
      action,
      oldData != null ? JSON.stringify(oldData) : null,
      newData != null ? JSON.stringify(newData) : null,
      now,
    )
    .run();
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
  "/api/org/invite/info",
  "/api/org/invite/accept",
]);

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

api.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (c.req.url.startsWith("https://")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});

// The frontend is served from the same origin; cross-origin access is opt-in.
api.use("/api/*", async (c, next) => {
  const origin = c.env.CORS_ORIGIN;
  if (!origin) return next();
  return cors({
    origin: origin.split(",").map((o) => o.trim()),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })(c, next);
});

const RATE_LIMITED_PATHS = new Set([
  "/api/auth/login", "/api/auth/register", "/api/portal/login", "/api/org/invite/accept",
  "/api/auth/2fa/enable", "/api/auth/2fa/disable", "/api/auth/2fa/recovery-codes",
]);
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

api.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (c.req.method !== "POST" || !RATE_LIMITED_PATHS.has(path)) return next();

  const body = await c.req.json<{ email?: unknown }>().catch(() => ({} as { email?: unknown }));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const key = `${path}|${c.env.CLIENT_IP ?? "unknown"}|${email}`;
  const now = Date.now();

  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  }
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= RATE_LIMIT_MAX) {
    c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: "Too many attempts. Please try again in a few minutes." }, 429);
  }

  await next();

  if (c.res.status >= 400) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    current.count += 1;
    attempts.set(key, current);
  } else {
    attempts.delete(key);
  }
});

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
    // org_id is the isolation key for all data queries.
    // For single-user accounts: org_id = user_id (owner's id).
    // For team members: org_id = owner's user_id (their org).
    // Backward compat: old tokens without org_id fall back to sub.
    const orgId = (payload.org_id as string | undefined) ?? payload.sub;
    c.set("userId", orgId);        // used by all existing WHERE user_id = ? queries
    c.set("ownUserId", payload.sub);
    c.set("orgRole", (payload.org_role as string | undefined) ?? "owner");
    c.set("email", payload.email);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

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
    message: "Registration is disabled. Ask the administrator for an invitation.",
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
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

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

  try {
    await seedDefaultChartOfAccounts(c.env.DB, id);
  } catch (e) {
    console.error("seedDefaultChartOfAccounts:", e);
  }

  // Create org with id = user id (backward compat: org_id = user_id for owners)
  const now = new Date().toISOString();
  const orgName = emailRaw.split("@")[0]!;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO organizations (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, orgName, id, now, now),
    c.env.DB.prepare("INSERT OR IGNORE INTO organization_members (id, org_id, user_id, role, joined_at) VALUES (?, ?, ?, 'owner', ?)")
      .bind(crypto.randomUUID(), id, id, now),
  ]);

  const token = await signUserToken(secret, id, emailRaw, id, "owner");
  return c.json({ token, user: { id, email: emailRaw, org_id: id, org_role: "owner" } });
});

api.post("/api/auth/login", async (c) => {
  const secret = c.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return c.json({ error: "Server misconfigured: JWT_SECRET required (min 16 chars)" }, 500);
  }
  let body: { email?: string; password?: string; code?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const emailRaw = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const row = await c.env.DB
    .prepare("SELECT id, email, password_hash, totp_enabled FROM users WHERE email = ?")
    .bind(emailRaw)
    .first<{ id: string; email: string; password_hash: string; totp_enabled: number }>();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (row.totp_enabled) {
    if (!body.code) return c.json({ requires_2fa: true });
    if (!(await consumeSecondFactor(c.env.DB, row.id, body.code))) {
      return c.json({ error: "Invalid authentication code", requires_2fa: true }, 401);
    }
  }

  // Look up org membership: primary org is the one they own, else first member
  const member = await c.env.DB
    .prepare("SELECT org_id, role FROM organization_members WHERE user_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, joined_at ASC LIMIT 1")
    .bind(row.id)
    .first<{ org_id: string; role: string }>();
  // Backward compat: no org yet (old user), so org_id = user_id
  const orgId   = member?.org_id  ?? row.id;
  const orgRole = member?.role     ?? "owner";

  const token = await signUserToken(secret, row.id, row.email, orgId, orgRole as "owner" | "admin" | "member" | "viewer");
  return c.json({ token, user: { id: row.id, email: row.email, org_id: orgId, org_role: orgRole } });
});

async function consumeSecondFactor(db: Env["DB"], userId: string, code: string): Promise<boolean> {
  const user = await db
    .prepare("SELECT totp_secret, totp_last_step, totp_recovery_codes FROM users WHERE id = ?")
    .bind(userId)
    .first<{ totp_secret: string | null; totp_last_step: number | null; totp_recovery_codes: string | null }>();
  if (!user?.totp_secret) return false;

  const step = await verifyTotp(user.totp_secret, code);
  if (step !== null) {
    if (user.totp_last_step !== null && step <= user.totp_last_step) return false;
    await db.prepare("UPDATE users SET totp_last_step = ? WHERE id = ?").bind(step, userId).run();
    return true;
  }

  const hashes: string[] = user.totp_recovery_codes ? JSON.parse(user.totp_recovery_codes) : [];
  const hash = await hashRecoveryCode(code);
  if (!hashes.includes(hash)) return false;
  await db
    .prepare("UPDATE users SET totp_recovery_codes = ? WHERE id = ?")
    .bind(JSON.stringify(hashes.filter((h) => h !== hash)), userId)
    .run();
  return true;
}

async function issueRecoveryCodes(db: Env["DB"], userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map(hashRecoveryCode));
  await db.prepare("UPDATE users SET totp_recovery_codes = ? WHERE id = ?").bind(JSON.stringify(hashes), userId).run();
  return codes;
}

api.get("/api/auth/2fa", async (c) => {
  const userId = c.get("ownUserId") ?? c.get("userId")!;
  const row = await c.env.DB
    .prepare("SELECT totp_enabled, totp_recovery_codes FROM users WHERE id = ?")
    .bind(userId)
    .first<{ totp_enabled: number; totp_recovery_codes: string | null }>();
  const remaining = row?.totp_recovery_codes ? (JSON.parse(row.totp_recovery_codes) as string[]).length : 0;
  return c.json({ enabled: Boolean(row?.totp_enabled), recovery_codes_remaining: remaining });
});

api.post("/api/auth/2fa/setup", async (c) => {
  const userId = c.get("ownUserId") ?? c.get("userId")!;
  const user = await c.env.DB
    .prepare("SELECT email, totp_enabled FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; totp_enabled: number }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  if (user.totp_enabled) return c.json({ error: "Two-factor authentication is already enabled" }, 400);

  const secret = generateTotpSecret();
  await c.env.DB.prepare("UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?").bind(secret, userId).run();
  return c.json({ secret, otpauth_url: otpauthUrl("Zedgerr", user.email, secret) });
});

api.post("/api/auth/2fa/enable", async (c) => {
  const userId = c.get("ownUserId") ?? c.get("userId")!;
  const { code } = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
  const user = await c.env.DB
    .prepare("SELECT totp_secret, totp_enabled FROM users WHERE id = ?")
    .bind(userId)
    .first<{ totp_secret: string | null; totp_enabled: number }>();
  if (!user?.totp_secret) return c.json({ error: "Start the setup first" }, 400);
  if (user.totp_enabled) return c.json({ error: "Two-factor authentication is already enabled" }, 400);

  const step = code ? await verifyTotp(user.totp_secret, code) : null;
  if (step === null) return c.json({ error: "That code is not valid. Check the time on your phone and try again." }, 400);

  await c.env.DB.prepare("UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?").bind(step, userId).run();
  const recoveryCodes = await issueRecoveryCodes(c.env.DB, userId);
  return c.json({ enabled: true, recovery_codes: recoveryCodes });
});

api.post("/api/auth/2fa/disable", async (c) => {
  const userId = c.get("ownUserId") ?? c.get("userId")!;
  const body = await c.req.json<{ password?: string; code?: string }>().catch(() => ({} as { password?: string; code?: string }));
  const user = await c.env.DB
    .prepare("SELECT password_hash, totp_enabled FROM users WHERE id = ?")
    .bind(userId)
    .first<{ password_hash: string; totp_enabled: number }>();
  if (!user?.totp_enabled) return c.json({ error: "Two-factor authentication is not enabled" }, 400);
  if (!body.password || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: "Password is incorrect" }, 400);
  }
  if (!body.code || !(await consumeSecondFactor(c.env.DB, userId, body.code))) {
    return c.json({ error: "Invalid authentication code" }, 400);
  }
  await c.env.DB
    .prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, totp_recovery_codes = NULL WHERE id = ?")
    .bind(userId)
    .run();
  return c.json({ enabled: false });
});

api.post("/api/auth/2fa/recovery-codes", async (c) => {
  const userId = c.get("ownUserId") ?? c.get("userId")!;
  const { code } = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
  if (!code || !(await consumeSecondFactor(c.env.DB, userId, code))) {
    return c.json({ error: "Invalid authentication code" }, 400);
  }
  return c.json({ recovery_codes: await issueRecoveryCodes(c.env.DB, userId) });
});

api.get("/api/auth/me", async (c) => {
  const ownUserId = c.get("ownUserId") ?? c.get("userId")!;
  const orgId = c.get("userId")!;
  const row = await c.env.DB.prepare("SELECT id, email, created_at FROM users WHERE id = ?").bind(ownUserId).first<{
    id: string; email: string; created_at: string;
  }>();
  if (!row) return c.json({ error: "User not found" }, 404);
  const org = await c.env.DB.prepare("SELECT id, name, plan FROM organizations WHERE id = ?").bind(orgId).first<{ id: string; name: string; plan: string }>();
  return c.json({ ...row, org_id: orgId, org_role: c.get("orgRole"), org });
});

api.patch("/api/auth/password", async (c) => {
  const userId = c.get("ownUserId") ?? c.get("userId")!;
  let body: { current_password?: string; new_password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const currentPassword = body.current_password ?? "";
  const newPassword = body.new_password ?? "";
  if (!currentPassword || !newPassword) {
    return c.json({ error: "Current and new password are required" }, 400);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "New password must be at least 8 characters" }, 400);
  }

  const user = await c.env.DB
    .prepare("SELECT id, password_hash FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; password_hash: string }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return c.json({ error: "Current password is incorrect" }, 400);
  }

  const nextHash = await hashPassword(newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(nextHash, userId).run();
  return c.json({ ok: true });
});

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
  if (!row) return c.json({ error: "Company not found" }, 404);
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
    return c.json({ error: "Current and new password are required" }, 400);
  }
  if (newPass.length < 8) {
    return c.json({ error: "New password must be at least 8 characters" }, 400);
  }

  const row = await c.env.DB
    .prepare("SELECT password_hash FROM company_portal_users WHERE company_id = ?")
    .bind(companyId)
    .first<{ password_hash: string }>();
  if (!row) return c.json({ error: "Portal account not found" }, 404);
  if (!(await verifyPassword(current, row.password_hash))) {
    return c.json({ error: "Current password is incorrect" }, 400);
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

  const settings = await c.env.DB
    .prepare("SELECT bs.currency FROM business_settings bs JOIN companies co ON co.user_id = bs.user_id WHERE co.id = ?")
    .bind(companyId)
    .first<{ currency: string | null }>();

  return c.json({
    currency: settings?.currency ?? "EUR",
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
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

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
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters for new portal access" }, 400);
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
    .bind(productId, userId, id, req.name, req.sale_price, req.cost_price ?? null, req.serial_number ?? null, req.url ?? null, req.internal_notes ?? null, req.price_includes_vat ? 1 : 0, req.vat_percentage ?? 0, now, now)
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
    .bind(req.name, req.sale_price, req.cost_price ?? null, req.serial_number ?? null, req.url ?? null, req.internal_notes ?? null, req.price_includes_vat ? 1 : 0, req.vat_percentage ?? 0, now, productId)
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

api.post("/api/ai/improve-grammar", async (c) => {
  let body: { text?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const text = String(body.text ?? "").trim();
  if (!text) return c.json({ error: "Text is required" }, 400);
  if (text.length > 3000) return c.json({ error: "Text is too long (max 3000 characters)" }, 400);

  const prompt = [
    "Improve the grammar and spelling of this text. Reply in the same language as the text.",
    "Make it read clearly and professionally as a description of work done, for a timesheet.",
    "Keep the exact content and details of what was done.",
    "Use clear, businesslike wording and do not add new information.",
    "Return only the improved text, without explanation or bullet points.",
    "",
    text,
  ].join("\n");

  const result = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content:
          "You edit timesheet entries. Improve grammar and wording, keep the text professional and businesslike, keep the original language, and do not change the content.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 500,
    temperature: 0.1,
  });

  const improved = typeof result === "object" && result && "response" in result ? String(result.response ?? "").trim() : "";
  if (!improved) return c.json({ error: "The AI did not return a usable answer" }, 502);
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

api.get("/api/business-settings", async (c) => {
  const userId = c.get("userId")!;
  const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE user_id = ?").bind(userId).first();
  return c.json(row ?? null);
});

const BUSINESS_SETTINGS_FIELDS = [
  "company_name", "contact_person", "email", "phone", "street", "postal_code", "city", "country",
  "kvk_number", "btw_number", "iban",
  "private_name", "private_street", "private_postal_code", "private_city", "private_country",
  "tax_name", "default_tax_rate", "currency", "country_code", "mileage_rate", "distance_unit",
] as const;

const BUSINESS_SETTINGS_DEFAULTS: Partial<Record<(typeof BUSINESS_SETTINGS_FIELDS)[number], unknown>> = {
  tax_name: "VAT", default_tax_rate: 0, currency: "EUR", mileage_rate: 0, distance_unit: "km",
};

api.put("/api/business-settings", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const existing = await c.env.DB.prepare("SELECT * FROM business_settings WHERE user_id = ?").bind(userId).first<Record<string, unknown>>();
  const now = new Date().toISOString();

  // Only fields present in the request change; omitted fields keep their stored value.
  const values = BUSINESS_SETTINGS_FIELDS.map(
    (f) => (f in req ? req[f] : existing?.[f]) ?? BUSINESS_SETTINGS_DEFAULTS[f] ?? null,
  );

  if (existing) {
    const sets = BUSINESS_SETTINGS_FIELDS.map((f) => `${f} = ?`).join(", ");
    await c.env.DB
      .prepare(`UPDATE business_settings SET ${sets}, updated_at = ? WHERE id = ?`)
      .bind(...values, now, existing.id)
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE id = ?").bind(existing.id).first();
    return c.json(row);
  }

  const id = crypto.randomUUID();
  const cols = BUSINESS_SETTINGS_FIELDS.join(", ");
  const marks = BUSINESS_SETTINGS_FIELDS.map(() => "?").join(", ");
  await c.env.DB
    .prepare(`INSERT INTO business_settings (id, user_id, ${cols}, created_at, updated_at) VALUES (?, ?, ${marks}, ?, ?)`)
    .bind(id, userId, ...values, now, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM business_settings WHERE id = ?").bind(id).first();
  return c.json(row);
});

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

api.post("/api/business-settings/logo", async (c) => {
  const userId = c.get("userId")!;
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "No file provided" }, 400);
  const ext = LOGO_TYPES[file.type];
  if (!ext) return c.json({ error: "Use a PNG or JPEG image" }, 400);
  if (file.size > LOGO_MAX_BYTES) return c.json({ error: "Logo must be 2 MB or smaller" }, 400);

  const existing = await c.env.DB
    .prepare("SELECT id, logo_url FROM business_settings WHERE user_id = ?")
    .bind(userId)
    .first<{ id: string; logo_url: string | null }>();

  const key = `${userId}/branding/logo-${crypto.randomUUID()}.${ext}`;
  await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB.prepare("UPDATE business_settings SET logo_url = ?, updated_at = ? WHERE id = ?").bind(key, now, existing.id).run();
    if (existing.logo_url) await c.env.FILES.delete(existing.logo_url).catch(() => {});
  } else {
    await c.env.DB
      .prepare("INSERT INTO business_settings (id, user_id, logo_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, key, now, now)
      .run();
  }
  return c.json({ ok: true });
});

api.get("/api/business-settings/logo", async (c) => {
  const userId = c.get("userId")!;
  const row = await c.env.DB
    .prepare("SELECT logo_url FROM business_settings WHERE user_id = ?")
    .bind(userId)
    .first<{ logo_url: string | null }>();
  if (!row?.logo_url) return c.json({ error: "No logo" }, 404);
  const obj = await c.env.FILES.get(row.logo_url);
  if (!obj) return c.json({ error: "No logo" }, 404);
  const type = row.logo_url.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(obj.body, { headers: { "Content-Type": type, "Cache-Control": "private, no-cache" } });
});

api.delete("/api/business-settings/logo", async (c) => {
  const userId = c.get("userId")!;
  const row = await c.env.DB
    .prepare("SELECT id, logo_url FROM business_settings WHERE user_id = ?")
    .bind(userId)
    .first<{ id: string; logo_url: string | null }>();
  if (row?.logo_url) {
    await c.env.DB.prepare("UPDATE business_settings SET logo_url = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
    await c.env.FILES.delete(row.logo_url).catch(() => {});
  }
  return c.json({ ok: true });
});

type InvoiceType = "business" | "private" | "reverse_charge";

function normalizeInvoiceType(value: unknown): InvoiceType {
  return value === "private" || value === "reverse_charge" ? value : "business";
}

// Private (consumer, tax exempt) and EU reverse-charge invoices never carry tax.
function isTaxFreeType(value: unknown): boolean {
  return normalizeInvoiceType(value) !== "business";
}

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
  const invoiceType = normalizeInvoiceType(req.invoice_type);
  const btwPct = isTaxFreeType(invoiceType) ? 0 : Number(req.btw_percentage);
  const subtotal = toMoney(req.subtotal);
  const btwAmount = isTaxFreeType(invoiceType) ? 0 : Number(req.btw_amount);
  const total = isTaxFreeType(invoiceType) ? subtotal : toMoney(req.total);
  const company = await c.env.DB
    .prepare("SELECT id, advance_balance FROM companies WHERE id = ? AND user_id = ?")
    .bind(req.company_id, userId)
    .first<{ id: string; advance_balance: number }>();
  if (!company) return c.json({ error: "Company not found" }, 404);

  const companyAdvanceBalance = Math.max(0, toMoney(company.advance_balance, 0));
  const requestedAdvance = Math.max(0, toMoney(advance, 0));
  const appliedAdvance = Math.min(requestedAdvance, total, companyAdvanceBalance);
  const updatedAdvanceBalance = toMoney(companyAdvanceBalance - appliedAdvance, 0);

  if (requestedAdvance > companyAdvanceBalance + 0.0001) {
    return c.json({ error: "Credit exceeds the client's available credit" }, 400);
  }
  if (requestedAdvance > total + 0.0001) {
    return c.json({ error: "Credit exceeds the invoice total" }, 400);
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
  await logAudit(c.env.DB, userId, "invoice", id, "create", null, row);
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

  const nextType = req.invoice_type ? normalizeInvoiceType(req.invoice_type) : normalizeInvoiceType(existing.invoice_type);
  const nextSubtotal = req.subtotal != null ? Number(req.subtotal) : Number(existing.subtotal);
  const nextBtwPct = isTaxFreeType(nextType) ? 0 : (req.btw_percentage != null ? Number(req.btw_percentage) : Number(existing.btw_percentage));
  const nextBtwAmt = isTaxFreeType(nextType) ? 0 : (req.btw_amount != null ? Number(req.btw_amount) : Number(existing.btw_amount));
  const nextTotal = isTaxFreeType(nextType) ? nextSubtotal : (req.total != null ? Number(req.total) : Number(existing.total));

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
  await logAudit(c.env.DB, userId, "invoice", id, "update", existing, row);
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

async function nextInvoiceNumberForYear(db: Env["DB"], userId: string, year: number, offset: number): Promise<string> {
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
  const origDesc = (origLine?.description ?? "").trim() || `Invoice ${invoice.invoice_number}`;

  const today = new Date().toISOString().split("T")[0]!;
  const invDate = invoice.invoice_date || today;
  // Instalment due dates default to 30 days after the invoice date, then every 30 days.
  const baseDue = firstDue ?? addDaysIso(invDate, intervalDays);
  const taxFree = isTaxFreeType(invoice.invoice_type);
  const subtotalParts = splitEqual(Number(invoice.subtotal), parts);
  const year = new Date().getFullYear();
  const now = new Date().toISOString();

  const createdIds: string[] = [];
  const stmts: ReturnType<Env["DB"]["prepare"]>[] = [];
  for (let i = 0; i < parts; i++) {
    const termInvoiceDate = addDaysIso(invDate, intervalDays * i);
    const sub = subtotalParts[i]!;
    const btwPct = taxFree ? 0 : Number(invoice.btw_percentage);
    const btwAmt = taxFree ? 0 : round2(sub * (btwPct / 100));
    const tot = taxFree ? sub : round2(sub + btwAmt);
    const due = firstDue ? addDaysIso(baseDue, intervalDays * i) : addDaysIso(termInvoiceDate, intervalDays);
    const newId = crypto.randomUUID();
    const newNr = await nextInvoiceNumberForYear(c.env.DB, userId, year, i);
    const termNote = `Termijn ${i + 1}/${parts} (gesplitst vanaf ${invoice.invoice_number})`;
    const termDesc = `${origDesc} (instalment ${i + 1}/${parts})`;
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
        .bind(newId, userId, invoice.company_id, newNr, termInvoiceDate, due, sub, btwPct, btwAmt, tot, splitAdvanceLabel, newNotes, normalizeInvoiceType(invoice.invoice_type), id, now, now),
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
      .bind([invoice.notes, `Split into ${parts} instalments on ${today}.`].filter(Boolean).join("\n"), now, id, userId),
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
  await logAudit(c.env.DB, userId, "invoice", id, "delete", invoice, null);
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
  const taxFree = isTaxFreeType(owns.invoice_type);
  const newBtw = taxFree ? 0 : Math.round(newSubtotal * Number(owns.btw_percentage)) / 100;
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
    const taxFree = isTaxFreeType(inv.invoice_type);
    const newBtw = taxFree ? 0 : Math.round(newSubtotal * Number(inv.btw_percentage)) / 100;
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
  if (!quote) return c.json({ error: "Quote not found" }, 404);

  const company = await c.env.DB
    .prepare("SELECT id FROM companies WHERE id = ? AND user_id = ?")
    .bind(quote.company_id, userId)
    .first<{ id: string }>();
  if (!company) return c.json({ error: "Company not found" }, 404);

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
  const baseNote = `Based on quote ${quote.quote_number}`;
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
  return c.json((results ?? []).map((r) => { const p = r as Record<string, unknown>; return { ...p, paid: Boolean(p.paid) }; }));
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
  const r = row as Record<string, unknown> | null;
  return c.json(r ? { ...r, paid: Boolean(r.paid) } : null);
});

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
  if (!req.company_name) return c.json({ error: "company_name is required" }, 400);
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

api.post("/api/invoices/:id/credit-note", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();

  const existing = await c.env.DB
    .prepare("SELECT id FROM invoices WHERE credit_note_for_id = ? AND user_id = ? LIMIT 1")
    .bind(id, userId).first();
  if (existing) return c.json({ error: "A credit note already exists for this invoice" }, 409);

  const invoice = await c.env.DB
    .prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{
      id: string; company_id: string; invoice_number: string; invoice_date: string;
      subtotal: number; btw_percentage: number; btw_amount: number; total: number;
      invoice_type: string; is_credit_note: number;
    }>();
  if (!invoice) return c.json({ error: "Not found" }, 404);
  if (invoice.is_credit_note) return c.json({ error: "Cannot create a credit note for a credit note" }, 400);

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
    `Credit note for invoice ${invoice.invoice_number}`, invoice.invoice_type, id, now, now).run();

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
  const vatPct = Number(req.vat_percentage ?? 0);
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
  await logAudit(c.env.DB, userId, "expense", id, "create", null, row);
  return c.json(row);
});

api.patch("/api/expenses/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  const now = new Date().toISOString();
  const vatPct = Number(req.vat_percentage ?? 0);
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
  await logAudit(c.env.DB, userId, "expense", id, "update", existing, row);
  return c.json(row);
});

api.delete("/api/expenses/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ? AND user_id = ?").bind(id, userId).first();
  await logAudit(c.env.DB, userId, "expense", id, "delete", existing, null);
  await c.env.DB.prepare("DELETE FROM bank_transactions WHERE expense_id = ? AND user_id = ?").bind(id, userId).run();
  await c.env.DB.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

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
      `SELECT COALESCE(SUM(m.distance_km), 0) * COALESCE((SELECT mileage_rate FROM business_settings WHERE user_id = ?), 0) AS kosten
       FROM mileage_entries m
       WHERE m.user_id = ? AND m.date >= ? AND m.date <= ? AND m.is_private = 0`,
    ).bind(userId, userId, from, to).first<{ kosten: number }>(),
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
  if (!req.date || !req.purpose) return c.json({ error: "date and purpose are required" }, 400);
  const odoStart = req.odometer_start != null ? Number(req.odometer_start) : null;
  const odoEnd   = req.odometer_end   != null ? Number(req.odometer_end)   : null;
  const distKm = (odoStart != null && odoEnd != null)
    ? Math.max(0, odoEnd - odoStart)
    : (req.distance_km != null ? Number(req.distance_km) : 0);
  const taxFree = req.is_private ? 1 : 0;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO mileage_entries (id, user_id, date, from_location, to_location, odometer_start, odometer_end, distance_km, purpose, is_private, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, req.date, req.from_location ?? null, req.to_location ?? null, odoStart, odoEnd, distKm, req.purpose, taxFree, req.notes ?? null, now, now).run();
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
  const taxFree = req.is_private ? 1 : 0;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE mileage_entries SET date = ?, from_location = ?, to_location = ?, odometer_start = ?, odometer_end = ?, distance_km = ?, purpose = ?, is_private = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).bind(req.date, req.from_location ?? null, req.to_location ?? null, odoStart, odoEnd, distKm, req.purpose, taxFree, req.notes ?? null, now, id, userId).run();
  const row = await c.env.DB.prepare("SELECT * FROM mileage_entries WHERE id = ?").bind(id).first();
  return c.json(row);
});

api.delete("/api/mileage/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM mileage_entries WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

api.get("/api/audit-log", async (c) => {
  const userId = c.get("userId")!;
  const { entity_type, entity_id, limit: limitStr } = c.req.query();
  const limit = Math.min(parseInt(limitStr ?? "100", 10), 500);
  let sql = "SELECT * FROM audit_log WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (entity_type) { sql += " AND entity_type = ?"; params.push(entity_type); }
  if (entity_id)   { sql += " AND entity_id = ?";   params.push(entity_id); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results ?? []);
});

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
  if (!req.date || !req.description || req.amount == null) return c.json({ error: "date, description and amount are required" }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO bank_transactions (id, user_id, date, description, amount, type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, req.date, req.description, Number(req.amount), req.type ?? "overig", req.notes ?? null, now).run();
  const row = await c.env.DB.prepare("SELECT * FROM bank_transactions WHERE id = ?").bind(id).first();
  await logAudit(c.env.DB, userId, "bank_transaction", id, "create", null, row);
  return c.json(row);
});

api.patch("/api/bank-transactions/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT * FROM bank_transactions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const req = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    `UPDATE bank_transactions SET date = ?, description = ?, amount = ?, type = ?, notes = ? WHERE id = ? AND user_id = ?`,
  ).bind(req.date, req.description, Number(req.amount), req.type ?? "overig", req.notes ?? null, id, userId).run();
  const row = await c.env.DB.prepare("SELECT * FROM bank_transactions WHERE id = ?").bind(id).first();
  await logAudit(c.env.DB, userId, "bank_transaction", id, "update", existing, row);
  return c.json(row);
});

api.delete("/api/bank-transactions/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT * FROM bank_transactions WHERE id = ? AND user_id = ?").bind(id, userId).first();
  await logAudit(c.env.DB, userId, "bank_transaction", id, "delete", existing, null);
  await c.env.DB.prepare("DELETE FROM bank_transactions WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

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

  if (!(file instanceof File)) return c.json({ error: "No file provided" }, 400);
  if (!entityType || typeof entityType !== "string") return c.json({ error: "entity_type is required" }, 400);
  if (!entityId || typeof entityId !== "string") return c.json({ error: "entity_id is required" }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return c.json({ error: "File type not allowed. Use JPEG, PNG, GIF, WebP, HEIC or PDF." }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: "File too large (max 10 MB)" }, 400);

  if (!/^[a-z_]{1,32}$/.test(entityType) || !/^[A-Za-z0-9-]{1,64}$/.test(entityId)) {
    return c.json({ error: "Invalid entity_type or entity_id" }, 400);
  }

  const rawExt = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : "bin";
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
  if (!entityType || !entityId) return c.json({ error: "entity_type en entity_id is required" }, 400);
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
  if (!row) return c.json({ error: "Not found" }, 404);

  const obj = await c.env.FILES.get(row.r2_key);
  if (!obj) return c.json({ error: "File not found in storage" }, 404);

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
  if (!row) return c.json({ error: "Not found" }, 404);
  await c.env.FILES.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM attachments WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});


const DEFAULT_ACCOUNTS: Array<{
  number: string;
  name: string;
  type: "assets" | "liabilities" | "equity" | "revenue" | "expenses";
  description?: string;
}> = [
  // Assets
  { number: "1000", name: "Cash", type: "assets" },
  { number: "1100", name: "Bank", type: "assets" },
  { number: "1200", name: "Savings account", type: "assets" },
  { number: "1300", name: "Accounts receivable", type: "assets", description: "Owed by clients" },
  { number: "1400", name: "Tax receivable", type: "assets", description: "Input tax" },
  { number: "1500", name: "Other receivables", type: "assets" },
  // Liabilities
  { number: "4000", name: "Accounts payable", type: "liabilities" },
  { number: "4800", name: "Tax payable", type: "liabilities", description: "Output tax owed" },
  { number: "4900", name: "Other liabilities", type: "liabilities" },
  // Equity
  { number: "2000", name: "Owner's equity", type: "equity" },
  { number: "2100", name: "Owner withdrawals", type: "equity" },
  { number: "2200", name: "Owner contributions", type: "equity" },
  { number: "2900", name: "Current year earnings", type: "equity" },
  // Revenue
  { number: "8000", name: "Service revenue", type: "revenue" },
  { number: "8100", name: "Product revenue", type: "revenue" },
  { number: "8900", name: "Other income", type: "revenue" },
  // Expenses
  { number: "9000", name: "Cost of goods sold", type: "expenses" },
  { number: "9100", name: "Staff costs", type: "expenses" },
  { number: "9200", name: "Rent and premises", type: "expenses" },
  { number: "9300", name: "Travel and transport", type: "expenses" },
  { number: "9400", name: "Marketing and advertising", type: "expenses" },
  { number: "9500", name: "IT and software", type: "expenses" },
  { number: "9600", name: "Office costs", type: "expenses" },
  { number: "9700", name: "Phone and internet", type: "expenses" },
  { number: "9800", name: "Bank and finance charges", type: "expenses" },
  { number: "9900", name: "Other business expenses", type: "expenses" },
];

async function seedDefaultChartOfAccounts(db: Env["DB"], userId: string): Promise<void> {
  const existing = await db
    .prepare("SELECT COUNT(*) as c FROM chart_of_accounts WHERE user_id = ?")
    .bind(userId)
    .first<{ c: number }>();
  if ((existing?.c ?? 0) > 0) return;
  const now = new Date().toISOString();
  const stmts = DEFAULT_ACCOUNTS.map((a) =>
    db
      .prepare(
        `INSERT INTO chart_of_accounts (id, user_id, account_number, name, account_type, is_system, description, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userId, a.number, a.name, a.type, a.description ?? null, now),
  );
  await db.batch(stmts);
}

function periodStartEnd(year: number, period: number, type: "month" | "quarter"): { starts_on: string; ends_on: string } {
  if (type === "month") {
    const start = new Date(Date.UTC(year, period - 1, 1));
    const end = new Date(Date.UTC(year, period, 0));
    return {
      starts_on: start.toISOString().split("T")[0]!,
      ends_on: end.toISOString().split("T")[0]!,
    };
  }
  const startMonth = (period - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    starts_on: start.toISOString().split("T")[0]!,
    ends_on: end.toISOString().split("T")[0]!,
  };
}

async function getOrCreatePeriod(db: Env["DB"], userId: string, date: string): Promise<string> {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const existing = await db
    .prepare("SELECT id FROM accounting_periods WHERE user_id = ? AND year = ? AND period = ? AND period_type = 'month'")
    .bind(userId, year, month)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const { starts_on, ends_on } = periodStartEnd(year, month, "month");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO accounting_periods (id, user_id, year, period, period_type, status, starts_on, ends_on, created_at)
       VALUES (?, ?, ?, ?, 'month', 'open', ?, ?, ?)`,
    )
    .bind(id, userId, year, month, starts_on, ends_on, now)
    .run();
  return id;
}

async function createJournalEntry(
  db: Env["DB"],
  userId: string,
  date: string,
  description: string,
  reference: string | null,
  referenceType: string | null,
  lines: Array<{ accountNumber: string; debitCents: number; creditCents: number; description?: string }>,
): Promise<string | null> {
  // Resolve account ids
  const accountIds: Map<string, string> = new Map();
  for (const line of lines) {
    const row = await db
      .prepare("SELECT id FROM chart_of_accounts WHERE user_id = ? AND account_number = ? AND active = 1")
      .bind(userId, line.accountNumber)
      .first<{ id: string }>();
    if (!row) return null;
    accountIds.set(line.accountNumber, row.id);
  }

  const periodId = await getOrCreatePeriod(db, userId, date);
  const entryId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO journal_entries (id, user_id, period_id, entry_date, description, reference, reference_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(entryId, userId, periodId, date, description, reference, referenceType, now)
    .run();

  const lineStmts = lines.map((line) =>
    db
      .prepare(
        `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit_cents, credit_cents, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        entryId,
        accountIds.get(line.accountNumber)!,
        line.debitCents,
        line.creditCents,
        line.description ?? null,
        now,
      ),
  );
  await db.batch(lineStmts);
  return entryId;
}

// Chart of accounts
api.get("/api/accounts", async (c) => {
  const userId = c.get("userId")!;
  const { results } = await c.env.DB
    .prepare("SELECT * FROM chart_of_accounts WHERE user_id = ? ORDER BY account_number")
    .bind(userId)
    .all();
  return c.json(results ?? []);
});

api.post("/api/accounts", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  if (!req.account_number || !req.name || !req.account_type) return c.json({ error: "account_number, name and account_type are required" }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(`INSERT INTO chart_of_accounts (id, user_id, account_number, name, account_type, parent_id, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, req.account_number, req.name, req.account_type, req.parent_id ?? null, req.description ?? null, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM chart_of_accounts WHERE id = ?").bind(id).first();
  return c.json(row, 201);
});

api.patch("/api/accounts/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  await c.env.DB
    .prepare(`UPDATE chart_of_accounts SET name = COALESCE(?, name), description = COALESCE(?, description), active = COALESCE(?, active) WHERE id = ? AND user_id = ?`)
    .bind(req.name ?? null, req.description ?? null, req.active ?? null, id, userId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM chart_of_accounts WHERE id = ? AND user_id = ?").bind(id, userId).first();
  return c.json(row);
});

api.delete("/api/accounts/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const acct = await c.env.DB.prepare("SELECT is_system FROM chart_of_accounts WHERE id = ? AND user_id = ?").bind(id, userId).first<{ is_system: number }>();
  if (!acct) return c.json({ error: "Not found" }, 404);
  if (acct.is_system) return c.json({ error: "System accounts cannot be deleted" }, 400);
  await c.env.DB.prepare("DELETE FROM chart_of_accounts WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// Accounting periods
api.get("/api/periods", async (c) => {
  const userId = c.get("userId")!;
  const { year } = c.req.query();
  let sql = "SELECT * FROM accounting_periods WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (year) { sql += " AND year = ?"; params.push(Number(year)); }
  sql += " ORDER BY year DESC, period DESC";
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results ?? []);
});

api.post("/api/periods", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const year = Number(req.year);
  const period = Number(req.period);
  const type = (req.period_type as string) === "quarter" ? "quarter" : "month";
  if (!year || !period) return c.json({ error: "year and period are required" }, 400);
  const { starts_on, ends_on } = periodStartEnd(year, period, type);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(`INSERT OR IGNORE INTO accounting_periods (id, user_id, year, period, period_type, status, starts_on, ends_on, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
    .bind(id, userId, year, period, type, starts_on, ends_on, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM accounting_periods WHERE user_id = ? AND year = ? AND period = ? AND period_type = ?").bind(userId, year, period, type).first();
  return c.json(row, 201);
});

api.patch("/api/periods/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<Record<string, unknown>>();
  if (!["open", "locked"].includes(req.status as string)) return c.json({ error: "status must be 'open' or 'locked'" }, 400);
  await c.env.DB.prepare("UPDATE accounting_periods SET status = ? WHERE id = ? AND user_id = ?").bind(req.status, id, userId).run();
  const row = await c.env.DB.prepare("SELECT * FROM accounting_periods WHERE id = ? AND user_id = ?").bind(id, userId).first();
  return c.json(row);
});

// Journal entries
api.get("/api/journal-entries", async (c) => {
  const userId = c.get("userId")!;
  const { from, to, period_id, reference, limit: limitStr } = c.req.query();
  const limit = Math.min(parseInt(limitStr ?? "100", 10), 500);
  let sql = "SELECT * FROM journal_entries WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (from)      { sql += " AND entry_date >= ?"; params.push(from); }
  if (to)        { sql += " AND entry_date <= ?"; params.push(to); }
  if (period_id) { sql += " AND period_id = ?";   params.push(period_id); }
  if (reference) { sql += " AND reference = ?";   params.push(reference); }
  sql += " ORDER BY entry_date DESC, created_at DESC LIMIT ?";
  params.push(limit);
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results ?? []);
});

api.get("/api/journal-entries/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const entry = await c.env.DB.prepare("SELECT * FROM journal_entries WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!entry) return c.json({ error: "Not found" }, 404);
  const { results: lines } = await c.env.DB
    .prepare(`SELECT l.*, a.account_number, a.name as account_name, a.account_type
              FROM journal_entry_lines l
              JOIN chart_of_accounts a ON a.id = l.account_id
              WHERE l.journal_entry_id = ? ORDER BY l.created_at`)
    .bind(id)
    .all();
  return c.json({ ...entry, lines: lines ?? [] });
});

api.post("/api/journal-entries", async (c) => {
  const userId = c.get("userId")!;
  const req = await c.req.json<Record<string, unknown>>();
  const lines = req.lines as Array<{ account_number: string; debit_cents: number; credit_cents: number; description?: string }>;
  if (!req.entry_date || !req.description || !Array.isArray(lines) || lines.length < 2) {
    return c.json({ error: "entry_date, description and at least 2 lines are required" }, 400);
  }
  const totalDebit  = lines.reduce((s, l) => s + (l.debit_cents  ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit_cents ?? 0), 0);
  if (totalDebit !== totalCredit) {
    return c.json({ error: `Journal entry does not balance: debit ${totalDebit}, credit ${totalCredit} (in cents)` }, 400);
  }
  const entryId = await createJournalEntry(
    c.env.DB, userId,
    req.entry_date as string,
    req.description as string,
    (req.reference as string) ?? null,
    (req.reference_type as string) ?? null,
    lines.map((l) => ({ accountNumber: l.account_number, debitCents: l.debit_cents, creditCents: l.credit_cents, description: l.description })),
  );
  if (!entryId) return c.json({ error: "One or more account numbers not found" }, 400);
  return c.json({ id: entryId }, 201);
});

api.delete("/api/journal-entries/:id", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM journal_entries WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.body(null, 204);
});

// Trial balance
api.get("/api/trial-balance", async (c) => {
  const userId = c.get("userId")!;
  const { from, to } = c.req.query();
  let dateFilter = "";
  const params: unknown[] = [userId];
  if (from || to) {
    const conditions: string[] = [];
    if (from) { conditions.push("je.entry_date >= ?"); params.push(from); }
    if (to)   { conditions.push("je.entry_date <= ?"); params.push(to); }
    dateFilter = " AND " + conditions.join(" AND ");
  }
  const { results } = await c.env.DB
    .prepare(`
      SELECT
        a.account_number,
        a.name,
        a.account_type,
        COALESCE(SUM(l.debit_cents),  0) AS total_debit_cents,
        COALESCE(SUM(l.credit_cents), 0) AS total_credit_cents,
        COALESCE(SUM(l.debit_cents),  0) - COALESCE(SUM(l.credit_cents), 0) AS balance_cents
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je    ON je.id = l.journal_entry_id${dateFilter}
      WHERE a.user_id = ? AND a.active = 1
      GROUP BY a.id
      ORDER BY a.account_number
    `)
    .bind(...params, userId)
    .all();
  return c.json(results ?? []);
});


// CSV import (ING, Rabobank, ABN AMRO and generic formats)
function parseAmount(raw: string): number {
  // Handle European decimal notation: 1.234,56 becomes 1234.56
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function detectAndParseCSV(text: string): Array<{
  date: string; description: string; amount: number; type: "inkomst" | "uitgave";
}> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const header = lines[0]!.toLowerCase();
  const rows: Array<{ date: string; description: string; amount: number; type: "inkomst" | "uitgave" }> = [];

  // ING: "Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"
  if (header.includes("af bij") || header.includes("naam / omschrijving")) {
    for (const line of lines.slice(1)) {
      const cols = line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
      if (cols.length < 7) continue;
      const dateRaw = cols[0]!;       // YYYYMMDD
      const desc = cols[1] ?? "";
      const afBij = cols[5]!.toLowerCase();
      const amtRaw = cols[6]!;
      const amount = Math.abs(parseAmount(amtRaw));
      const type: "inkomst" | "uitgave" = afBij === "bij" ? "inkomst" : "uitgave";
      const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
      rows.push({ date, description: desc, amount: afBij === "af" ? -amount : amount, type });
    }
    return rows;
  }

  // Rabobank: "IBAN/BBAN";"Munt";"BIC";"Volgnr";"Datum";"Rentedatum";"Bedrag";"Saldo na trn";"Tegenpartij IBAN";"Tegenpartij naam";"Initierende partij";"BIC tegenpartij";"Code";"Batch ID";"Transactiereferentie";"Machtigingskenmerk";"Incassant ID";"Betalingskenmerk";"Omschrijving-1";"Omschrijving-2";"Omschrijving-3"
  if (header.includes("volgnr") || header.includes("rentedatum")) {
    for (const line of lines.slice(1)) {
      const cols = line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
      if (cols.length < 7) continue;
      const date = cols[4]!;  // YYYY-MM-DD
      const amtRaw = cols[6]!;
      const amount = parseAmount(amtRaw);
      const counterparty = cols[9] ?? "";
      const desc = [cols[18], cols[19], cols[20]].filter(Boolean).join(" ").trim() || counterparty;
      rows.push({ date, description: desc, amount, type: amount >= 0 ? "inkomst" : "uitgave" });
    }
    return rows;
  }

  // ABN AMRO: "Accountnumber"\t"Currency"\t"Date"\t"Balance Before"\t"Balance After"\t"Interest Date"\t"Amount"\t"Description"
  if (header.includes("accountnumber") || (header.includes("amount") && header.includes("description"))) {
    const sep = header.includes("\t") ? "\t" : ",";
    for (const line of lines.slice(1)) {
      const cols = line.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
      if (cols.length < 8) continue;
      const date = cols[2]!;
      const amtRaw = cols[6]!;
      const amount = parseAmount(amtRaw);
      const desc = cols[7] ?? "";
      rows.push({ date, description: desc, amount, type: amount >= 0 ? "inkomst" : "uitgave" });
    }
    return rows;
  }

  // Generic CSV fallback: date, description, amount
  const sep = header.includes(";") ? ";" : ",";
  for (const line of lines.slice(1)) {
    const cols = line.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 3) continue;
    const date = cols[0]!;
    const desc = cols[1]!;
    const amount = parseAmount(cols[2]!);
    rows.push({ date, description: desc, amount, type: amount >= 0 ? "inkomst" : "uitgave" });
  }
  return rows;
}

api.post("/api/bank-transactions/import-csv", async (c) => {
  const userId = c.get("userId")!;
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "No file provided (field: file)" }, 400);

  const text = await file.text();
  const parsed = detectAndParseCSV(text);
  if (!parsed.length) return c.json({ error: "No valid transactions found in the CSV file" }, 400);

  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const row of parsed) {
    const amount = Math.abs(row.amount);
    // Skip duplicates (same date + description + amount already exists)
    const exists = await c.env.DB
      .prepare("SELECT id FROM bank_transactions WHERE user_id = ? AND date = ? AND description = ? AND amount = ?")
      .bind(userId, row.date, row.description, amount)
      .first();
    if (exists) { skipped++; continue; }

    await c.env.DB
      .prepare(`INSERT INTO bank_transactions (id, user_id, date, description, amount, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, row.date, row.description, amount, row.type, now)
      .run();
    imported++;
  }

  return c.json({ imported, skipped, total: parsed.length });
});

// Reconciliation endpoints
api.post("/api/bank-transactions/:id/reconcile", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const req = await c.req.json<{ type: string; ref_id?: string }>();

  const txn = await c.env.DB
    .prepare("SELECT id FROM bank_transactions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first();
  if (!txn) return c.json({ error: "Not found" }, 404);

  const now = new Date().toISOString();
  await c.env.DB
    .prepare(`UPDATE bank_transactions SET reconciled = 1, reconciled_at = ?, reconciled_type = ?, reconciled_ref_id = ? WHERE id = ? AND user_id = ?`)
    .bind(now, req.type ?? "manual", req.ref_id ?? null, id, userId)
    .run();

  return c.json({ ok: true });
});

api.post("/api/bank-transactions/:id/unreconcile", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  await c.env.DB
    .prepare("UPDATE bank_transactions SET reconciled = 0, reconciled_at = NULL, reconciled_type = NULL, reconciled_ref_id = NULL WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return c.json({ ok: true });
});

// Auto-match suggestions
api.get("/api/bank-transactions/:id/suggestions", async (c) => {
  const userId = c.get("userId")!;
  const { id } = c.req.param();
  const txn = await c.env.DB
    .prepare("SELECT * FROM bank_transactions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ amount: number; type: string; date: string }>();
  if (!txn) return c.json({ error: "Not found" }, 404);

  const amount = txn.amount;
  // Match within 1 cent and 30 days
  const dateParsed = new Date(txn.date);
  const fromDate = new Date(dateParsed.getTime() - 30 * 86400_000).toISOString().split("T")[0]!;
  const toDate   = new Date(dateParsed.getTime() + 30 * 86400_000).toISOString().split("T")[0]!;

  const suggestions: unknown[] = [];

  if (txn.type === "inkomst") {
    const { results: invoices } = await c.env.DB
      .prepare(`SELECT id, invoice_number, total, status FROM invoices
                WHERE user_id = ? AND ABS(total - ?) < 0.02 AND status NOT IN ('betaald', 'vervallen')
                  AND (invoice_date BETWEEN ? AND ? OR due_date BETWEEN ? AND ?) LIMIT 5`)
      .bind(userId, amount, fromDate, toDate, fromDate, toDate)
      .all();
    if (invoices?.length) suggestions.push(...(invoices as Record<string, unknown>[]).map((i) => ({ ...i, match_type: "invoice" })));
  } else {
    const { results: expenses } = await c.env.DB
      .prepare(`SELECT id, description, amount_incl_vat FROM expenses
                WHERE user_id = ? AND ABS(amount_incl_vat - ?) < 0.02
                  AND expense_date BETWEEN ? AND ? LIMIT 5`)
      .bind(userId, amount, fromDate, toDate)
      .all();
    if (expenses?.length) suggestions.push(...(expenses as Record<string, unknown>[]).map((e) => ({ ...e, match_type: "expense" })));
  }

  return c.json(suggestions);
});


// Profit and loss
api.get("/api/reports/pnl", async (c) => {
  const userId = c.get("userId")!;
  const { from, to, year } = c.req.query();

  let fromDate = from;
  let toDate = to;
  if (year && !fromDate) {
    fromDate = `${year}-01-01`;
    toDate   = `${year}-12-31`;
  }

  const dateFilter = (fromDate && toDate)
    ? " AND je.entry_date BETWEEN ? AND ?"
    : fromDate
      ? " AND je.entry_date >= ?"
      : "";
  const dateParams: unknown[] = fromDate && toDate ? [fromDate, toDate] : fromDate ? [fromDate] : [];

  // Revenue & expenses via journal entries
  const { results: journalRows } = await c.env.DB
    .prepare(`
      SELECT
        a.account_type,
        a.account_number,
        a.name,
        COALESCE(SUM(l.credit_cents), 0) - COALESCE(SUM(l.debit_cents), 0) AS net_cents
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je    ON je.id = l.journal_entry_id${dateFilter}
      WHERE a.user_id = ? AND a.account_type IN ('revenue','expenses') AND a.active = 1
      GROUP BY a.id
      ORDER BY a.account_number
    `)
    .bind(...dateParams, userId)
    .all<{ account_type: string; account_number: string; name: string; net_cents: number }>();

  const revenue  = (journalRows ?? []).filter((r) => r.account_type === "revenue");
  const expenses = (journalRows ?? []).filter((r) => r.account_type === "expenses");

  const totalRevenue  = revenue.reduce((s, r)  => s + r.net_cents, 0);
  const totalExpenses = expenses.reduce((s, r) => s + Math.abs(r.net_cents), 0);
  const netProfit     = totalRevenue - totalExpenses;

  // Fallback: use invoices/expenses directly when no journal entries exist
  let fallback = false;
  if (!journalRows?.length) {
    fallback = true;
    const invParams: unknown[] = [userId];
    let invWhere = "";
    if (fromDate) { invWhere += " AND invoice_date >= ?"; invParams.push(fromDate); }
    if (toDate)   { invWhere += " AND invoice_date <= ?"; invParams.push(toDate); }
    const { results: invRows } = await c.env.DB
      .prepare(`SELECT COALESCE(SUM(total_cents), CAST(ROUND(SUM(total)*100) AS INTEGER)) AS total_cents FROM invoices WHERE user_id = ? AND status IN ('verzonden','betaald')${invWhere}`)
      .bind(...invParams)
      .all<{ total_cents: number }>();

    const expParams: unknown[] = [userId];
    let expWhere = "";
    if (fromDate) { expWhere += " AND expense_date >= ?"; expParams.push(fromDate); }
    if (toDate)   { expWhere += " AND expense_date <= ?"; expParams.push(toDate); }
    const { results: expRows } = await c.env.DB
      .prepare(`SELECT COALESCE(SUM(amount_incl_vat_cents), CAST(ROUND(SUM(amount_incl_vat)*100) AS INTEGER)) AS total_cents FROM expenses WHERE user_id = ?${expWhere}`)
      .bind(...expParams)
      .all<{ total_cents: number }>();

    return c.json({
      fallback: true,
      period: { from: fromDate, to: toDate },
      revenue: { total_cents: invRows?.[0]?.total_cents ?? 0, lines: [] },
      expenses: { total_cents: expRows?.[0]?.total_cents ?? 0, lines: [] },
      net_profit_cents: (invRows?.[0]?.total_cents ?? 0) - (expRows?.[0]?.total_cents ?? 0),
    });
  }

  return c.json({
    fallback,
    period: { from: fromDate, to: toDate },
    revenue:  { total_cents: totalRevenue,  lines: revenue  },
    expenses: { total_cents: totalExpenses, lines: expenses.map((e) => ({ ...e, net_cents: Math.abs(e.net_cents) })) },
    net_profit_cents: netProfit,
  });
});

// Balance sheet
api.get("/api/reports/balance-sheet", async (c) => {
  const userId = c.get("userId")!;
  const { as_of } = c.req.query();
  const asOf = as_of ?? new Date().toISOString().split("T")[0]!;

  const { results } = await c.env.DB
    .prepare(`
      SELECT
        a.account_type,
        a.account_number,
        a.name,
        COALESCE(SUM(l.debit_cents), 0)  AS total_debit_cents,
        COALESCE(SUM(l.credit_cents), 0) AS total_credit_cents
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries je    ON je.id = l.journal_entry_id AND je.entry_date <= ?
      WHERE a.user_id = ? AND a.account_type IN ('assets','liabilities','equity') AND a.active = 1
      GROUP BY a.id
      ORDER BY a.account_number
    `)
    .bind(asOf, userId)
    .all<{ account_type: string; account_number: string; name: string; total_debit_cents: number; total_credit_cents: number }>();

  const rows = results ?? [];
  const assets      = rows.filter((r) => r.account_type === "assets").map((r) => ({ ...r, balance_cents: r.total_debit_cents - r.total_credit_cents }));
  const liabilities = rows.filter((r) => r.account_type === "liabilities").map((r) => ({ ...r, balance_cents: r.total_credit_cents - r.total_debit_cents }));
  const equity      = rows.filter((r) => r.account_type === "equity").map((r) => ({ ...r, balance_cents: r.total_credit_cents - r.total_debit_cents }));

  const totalAssets      = assets.reduce((s, r) => s + r.balance_cents, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance_cents, 0);
  const totalEquity      = equity.reduce((s, r) => s + r.balance_cents, 0);

  return c.json({
    as_of: asOf,
    assets:      { total_cents: totalAssets,      lines: assets },
    liabilities: { total_cents: totalLiabilities, lines: liabilities },
    equity:      { total_cents: totalEquity,       lines: equity },
    balanced: totalAssets === totalLiabilities + totalEquity,
  });
});

// Tax return summary
api.get("/api/reports/vat", async (c) => {
  const userId = c.get("userId")!;
  const { year, quarter } = c.req.query();

  const y = parseInt(year ?? String(new Date().getFullYear()), 10);
  const q = quarter ? parseInt(quarter, 10) : null;

  let fromDate: string;
  let toDate: string;
  if (q) {
    const startMonth = (q - 1) * 3 + 1;
    fromDate = `${y}-${String(startMonth).padStart(2, "0")}-01`;
    const endMonth = q * 3;
    const lastDay = new Date(y, endMonth, 0).getDate();
    toDate = `${y}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  } else {
    fromDate = `${y}-01-01`;
    toDate   = `${y}-12-31`;
  }

  const { results: invoiceVat } = await c.env.DB
    .prepare(`
      SELECT
        btw_percentage,
        COALESCE(SUM(subtotal_cents), CAST(ROUND(SUM(subtotal)*100) AS INTEGER))    AS subtotal_cents,
        COALESCE(SUM(btw_amount_cents), CAST(ROUND(SUM(btw_amount)*100) AS INTEGER)) AS btw_cents
      FROM invoices
      WHERE user_id = ? AND status IN ('verzonden','betaald')
        AND invoice_date BETWEEN ? AND ?
      GROUP BY btw_percentage
    `)
    .bind(userId, fromDate, toDate)
    .all<{ btw_percentage: number; subtotal_cents: number; btw_cents: number }>();

  const { results: expenseVat } = await c.env.DB
    .prepare(`
      SELECT
        vat_rate,
        COALESCE(SUM(amount_excl_vat_cents), CAST(ROUND(SUM(amount_excl_vat)*100) AS INTEGER)) AS excl_cents,
        COALESCE(SUM(vat_amount_cents), CAST(ROUND(SUM(vat_amount)*100) AS INTEGER))           AS vat_cents
      FROM expenses
      WHERE user_id = ? AND expense_date BETWEEN ? AND ?
      GROUP BY vat_rate
    `)
    .bind(userId, fromDate, toDate)
    .all<{ vat_rate: number; excl_cents: number; vat_cents: number }>();

  const vatCharged  = (invoiceVat ?? []).reduce((s, r) => s + r.btw_cents, 0);
  const vatRecovery = (expenseVat ?? []).reduce((s, r) => s + r.vat_cents, 0);

  return c.json({
    period: { from: fromDate, to: toDate, year: y, quarter: q },
    vat_charged_cents:  vatCharged,
    vat_recovery_cents: vatRecovery,
    vat_payable_cents:  vatCharged - vatRecovery,
    invoice_lines: invoiceVat ?? [],
    expense_lines: expenseVat ?? [],
  });
});


// Org info + members
api.get("/api/org", async (c) => {
  const orgId = c.get("userId")!;
  const org = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(orgId).first();
  if (!org) return c.json({ error: "Organization not found" }, 404);
  const { results: members } = await c.env.DB
    .prepare(`SELECT m.id, m.user_id, m.role, m.joined_at, u.email
              FROM organization_members m
              JOIN users u ON u.id = m.user_id
              WHERE m.org_id = ? ORDER BY m.joined_at`)
    .bind(orgId)
    .all();
  const { results: pendingInvites } = await c.env.DB
    .prepare("SELECT id, email, role, expires_at, created_at FROM org_invites WHERE org_id = ? AND accepted_at IS NULL AND expires_at > datetime('now') ORDER BY created_at DESC")
    .bind(orgId)
    .all();
  return c.json({ ...org, members: members ?? [], pending_invites: pendingInvites ?? [] });
});

api.patch("/api/org", async (c) => {
  const orgId   = c.get("userId")!;
  const orgRole = c.get("orgRole") ?? "member";
  if (!["owner", "admin"].includes(orgRole)) return c.json({ error: "Access denied" }, 403);
  const req = await c.req.json<{ name?: string; plan?: string }>();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare("UPDATE organizations SET name = COALESCE(?, name), plan = COALESCE(?, plan), updated_at = ? WHERE id = ?")
    .bind(req.name ?? null, req.plan ?? null, now, orgId)
    .run();
  return c.json(await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(orgId).first());
});

// Invite member
api.post("/api/org/invite", async (c) => {
  const orgId      = c.get("userId")!;
  const ownUserId  = c.get("ownUserId") ?? orgId;
  const orgRole    = c.get("orgRole") ?? "member";
  if (!["owner", "admin"].includes(orgRole)) return c.json({ error: "Access denied" }, 403);

  const req = await c.req.json<{ email?: string; role?: string }>();
  const email = (req.email ?? "").trim().toLowerCase();
  if (!email) return c.json({ error: "Email is required" }, 400);
  const role = (["admin", "member", "viewer"].includes(req.role ?? "") ? req.role : "member") as string;

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();

  // Cancel any existing open invite for the same email+org
  await c.env.DB
    .prepare("DELETE FROM org_invites WHERE org_id = ? AND email = ? AND accepted_at IS NULL")
    .bind(orgId, email)
    .run();

  await c.env.DB
    .prepare("INSERT INTO org_invites (id, org_id, email, role, token, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), orgId, email, role, token, ownUserId, expiresAt, now)
    .run();

  const org = await c.env.DB.prepare("SELECT name FROM organizations WHERE id = ?").bind(orgId).first<{ name: string }>();
  // Prefer the business name the owner filled in over the auto-generated org name
  const biz = await c.env.DB.prepare("SELECT company_name FROM business_settings WHERE user_id = ? LIMIT 1").bind(orgId).first<{ company_name: string | null }>();
  const displayName = biz?.company_name?.trim() || org?.name || "Zedgerr";

  // Send invite email if SMTP is configured
  const smtp = await c.env.DB
    .prepare("SELECT * FROM smtp_settings WHERE user_id = ? LIMIT 1")
    .bind(orgId)
    .first<{ host: string; port: number; secure: number; username: string; password: string; from_name: string; from_email: string; base_url: string }>();

  let emailSent = false;
  if (smtp?.host && smtp?.from_email && smtp?.base_url) {
    try {
      const { createTransport } = await import("nodemailer");
      const transport = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure === 1,
        auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
      });
      const baseUrl = smtp.base_url.replace(/\/$/, "");
      const baseUrlNorm = /^https?:\/\//i.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
      const inviteUrl = `${baseUrlNorm}/invite?token=${token}`;
      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
      const expiryDate = new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      await transport.sendMail({
        from: smtp.from_name ? `"${smtp.from_name}" <${smtp.from_email}>` : smtp.from_email,
        to: email,
        subject: `You've been invited to ${displayName}`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:#004030;padding:28px 32px;">
    <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">${displayName}</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111;">You've been invited</p>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">You've been invited to join <strong>${displayName}</strong> as a <strong>${roleLabel}</strong>.</p>
    <a href="${inviteUrl}" style="display:inline-block;background:#004030;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">Accept invitation</a>
    <p style="margin:24px 0 0;font-size:13px;color:#888;">Or copy this link into your browser:<br><span style="color:#004030;word-break:break-all;">${inviteUrl}</span></p>
    <p style="margin:20px 0 0;font-size:13px;color:#aaa;border-top:1px solid #f0f0f0;padding-top:16px;">This invitation expires on ${expiryDate}. If you didn't expect this, you can ignore this email.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
      });
      emailSent = true;
    } catch {
      // Email failed — invite token is still valid, caller can share it manually
    }
  }

  return c.json({ invite_token: token, email, role, expires_at: expiresAt, org_name: org?.name, email_sent: emailSent });
});

// Accept invite (new or existing user)
api.get("/api/org/invite/info", async (c) => {
  const { token } = c.req.query();
  if (!token) return c.json({ error: "Token is required" }, 400);
  const invite = await c.env.DB
    .prepare(`SELECT i.email, i.role, i.expires_at, o.name as org_name
              FROM org_invites i JOIN organizations o ON o.id = i.org_id
              WHERE i.token = ? AND i.accepted_at IS NULL AND i.expires_at > datetime('now')`)
    .bind(token)
    .first<{ email: string; role: string; expires_at: string; org_name: string }>();
  if (!invite) return c.json({ error: "Invitation not found or expired" }, 404);
  return c.json(invite);
});

api.post("/api/org/invite/accept", async (c) => {
  const secret = c.env.JWT_SECRET;
  const req = await c.req.json<{ token?: string; email?: string; password?: string; name?: string }>();
  const inviteToken = req.token ?? "";
  if (!inviteToken) return c.json({ error: "Token is required" }, 400);

  const invite = await c.env.DB
    .prepare("SELECT * FROM org_invites WHERE token = ? AND accepted_at IS NULL AND expires_at > datetime('now')")
    .bind(inviteToken)
    .first<{ id: string; org_id: string; email: string; role: string; invited_by: string }>();
  if (!invite) return c.json({ error: "Invitation not found or expired" }, 404);

  const email   = (req.email ?? invite.email).trim().toLowerCase();
  const password = req.password ?? "";
  const now = new Date().toISOString();

  // Check if user exists already
  let userId: string;
  const existingUser = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Register new user
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    const hash = await hashPassword(password);
    userId = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(userId, email, hash, now)
      .run();
  }

  // Add to org (or update role if already member)
  const alreadyMember = await c.env.DB
    .prepare("SELECT id FROM organization_members WHERE org_id = ? AND user_id = ?")
    .bind(invite.org_id, userId)
    .first();
  if (!alreadyMember) {
    await c.env.DB
      .prepare("INSERT INTO organization_members (id, org_id, user_id, role, invited_by, joined_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), invite.org_id, userId, invite.role, invite.invited_by, now)
      .run();
  }

  // Mark invite as accepted
  await c.env.DB
    .prepare("UPDATE org_invites SET accepted_at = ? WHERE id = ?")
    .bind(now, invite.id)
    .run();

  const token = await signUserToken(secret, userId, email, invite.org_id, invite.role as "owner" | "admin" | "member" | "viewer");
  return c.json({ token, user: { id: userId, email, org_id: invite.org_id, org_role: invite.role } });
});

// Remove member
api.delete("/api/org/members/:memberId", async (c) => {
  const orgId   = c.get("userId")!;
  const orgRole = c.get("orgRole") ?? "member";
  if (!["owner", "admin"].includes(orgRole)) return c.json({ error: "Access denied" }, 403);
  const { memberId } = c.req.param();
  // Cannot remove org owner
  const m = await c.env.DB
    .prepare("SELECT role FROM organization_members WHERE id = ? AND org_id = ?")
    .bind(memberId, orgId)
    .first<{ role: string }>();
  if (!m) return c.json({ error: "Member not found" }, 404);
  if (m.role === "owner") return c.json({ error: "The owner cannot be removed" }, 400);
  await c.env.DB.prepare("DELETE FROM organization_members WHERE id = ? AND org_id = ?").bind(memberId, orgId).run();
  return c.body(null, 204);
});

// Update member role
api.patch("/api/org/members/:memberId", async (c) => {
  const orgId   = c.get("userId")!;
  const orgRole = c.get("orgRole") ?? "member";
  if (orgRole !== "owner") return c.json({ error: "Only the owner can change roles" }, 403);
  const { memberId } = c.req.param();
  const req = await c.req.json<{ role?: string }>();
  if (!["admin", "member", "viewer"].includes(req.role ?? "")) return c.json({ error: "Ongeldige rol" }, 400);
  await c.env.DB
    .prepare("UPDATE organization_members SET role = ? WHERE id = ? AND org_id = ?")
    .bind(req.role, memberId, orgId)
    .run();
  return c.json({ ok: true });
});

// Cancel invite
api.delete("/api/org/invites/:inviteId", async (c) => {
  const orgId   = c.get("userId")!;
  const orgRole = c.get("orgRole") ?? "member";
  if (!["owner", "admin"].includes(orgRole)) return c.json({ error: "Access denied" }, 403);
  const { inviteId } = c.req.param();
  await c.env.DB.prepare("DELETE FROM org_invites WHERE id = ? AND org_id = ?").bind(inviteId, orgId).run();
  return c.body(null, 204);
});

// Switch org (for users in multiple orgs)
api.post("/api/org/switch", async (c) => {
  const secret     = c.env.JWT_SECRET;
  const ownUserId  = c.get("ownUserId") ?? c.get("userId")!;
  const email      = c.get("email") ?? "";
  const req        = await c.req.json<{ org_id?: string }>();
  const targetOrgId = req.org_id;
  if (!targetOrgId) return c.json({ error: "org_id is required" }, 400);

  const member = await c.env.DB
    .prepare("SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?")
    .bind(targetOrgId, ownUserId)
    .first<{ role: string }>();
  if (!member) return c.json({ error: "No access to this organization" }, 403);

  const token = await signUserToken(secret, ownUserId, email, targetOrgId, member.role as "owner" | "admin" | "member" | "viewer");
  return c.json({ token, org_id: targetOrgId, org_role: member.role });
});

// List my orgs
api.get("/api/org/mine", async (c) => {
  const ownUserId = c.get("ownUserId") ?? c.get("userId")!;
  const { results } = await c.env.DB
    .prepare(`SELECT o.id, o.name, o.plan, m.role
              FROM organization_members m
              JOIN organizations o ON o.id = m.org_id
              WHERE m.user_id = ? ORDER BY m.joined_at`)
    .bind(ownUserId)
    .all();
  return c.json(results ?? []);
});

/** Global error handler — returns a JSON body so clients don't receive a bare 500 text response. */
api.onError((err, c) => {
  console.error(err);
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("no such table")) {
    return c.json(
      {
        error:
          "Database not ready: migrations have not been applied. Restart the server so it can run them.",
      },
      503,
    );
  }
  return c.json({ error: "Internal server error" }, 500);
});

// ── SMTP settings ─────────────────────────────────────────────────────────────

api.get("/api/smtp-settings", async (c) => {
  const userId = c.get("userId")!;
  const row = await c.env.DB
    .prepare("SELECT host, port, secure, username, from_name, from_email, base_url FROM smtp_settings WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first<{ host: string; port: number; secure: number; username: string; from_name: string; from_email: string; base_url: string }>();
  return c.json(row ?? { host: "", port: 587, secure: 0, username: "", from_name: "", from_email: "", base_url: "" });
});

api.put("/api/smtp-settings", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ host?: string; port?: number; secure?: number; username?: string; password?: string; from_name?: string; from_email?: string; base_url?: string }>();

  const existing = await c.env.DB.prepare("SELECT id FROM smtp_settings WHERE user_id = ?").bind(userId).first<{ id: string }>();
  if (existing) {
    // Update, but only overwrite password if a non-empty value is provided
    const setPassword = body.password !== undefined && body.password !== "" ? ", password = ?" : "";
    const params: unknown[] = [
      body.host ?? "", body.port ?? 587, body.secure ?? 0, body.username ?? "",
      body.from_name ?? "", body.from_email ?? "", body.base_url ?? "",
    ];
    if (setPassword) params.push(body.password);
    params.push(userId);
    await c.env.DB
      .prepare(`UPDATE smtp_settings SET host=?, port=?, secure=?, username=?, from_name=?, from_email=?, base_url=?${setPassword}, updated_at=datetime('now') WHERE user_id=?`)
      .bind(...params)
      .run();
  } else {
    await c.env.DB
      .prepare("INSERT INTO smtp_settings (id, user_id, host, port, secure, username, password, from_name, from_email, base_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, body.host ?? "", body.port ?? 587, body.secure ?? 0, body.username ?? "", body.password ?? "", body.from_name ?? "", body.from_email ?? "", body.base_url ?? "")
      .run();
  }
  return c.json({ ok: true });
});

api.post("/api/smtp-settings/test", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ to?: string }>().catch(() => ({} as { to?: string }));
  const to = (body.to ?? "").trim() || (c.get("email") ?? "");
  if (!to) return c.json({ error: "Recipient email is required" }, 400);
  const smtp = await c.env.DB
    .prepare("SELECT * FROM smtp_settings WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first<{ host: string; port: number; secure: number; username: string; password: string; from_name: string; from_email: string }>();
  if (!smtp?.host || !smtp?.from_email) return c.json({ error: "SMTP is not configured" }, 400);

  try {
    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure === 1,
      auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
    });
    await transport.sendMail({
      from: smtp.from_name ? `"${smtp.from_name}" <${smtp.from_email}>` : smtp.from_email,
      to,
      subject: "Zedgerr SMTP test",
      html: "<p>Your SMTP configuration is working. Team invites will be sent via this address.</p>",
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

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
    const method = s.payment_method ?? "unknown";
    const cat = s.category === "zakelijk" ? "Business" : "Personal";
    const date = new Date(s.next_payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    return `• <b>${s.name}</b>, €${Number(s.amount).toFixed(2)} (${method}), ${date} [${cat}]`;
  });

  const total = results.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    `💰 <b>Upcoming payments</b>\n\n` +
    lines.join("\n") +
    `\n\n<b>Total: €${total.toFixed(2)}</b>\n\nMake sure your account has enough balance.`
  );
}

async function checkUpcomingPayments(env: Env): Promise<number> {
  const results = await getUpcomingPayments(env);
  return results.length;
}

export { api };

export async function runScheduledTasks(env: Env): Promise<void> {
  await checkUpcomingPayments(env);
}
